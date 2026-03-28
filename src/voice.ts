import fs, { mkdirSync } from 'fs';
import https from 'https';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

// ── Upload directory ────────────────────────────────────────────────────────

export const UPLOADS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'workspace',
  'uploads',
);

mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Make an HTTPS request and return the response body as a Buffer.
 */
function httpsRequest(
  url: string,
  options: https.RequestOptions,
  body?: Buffer | string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode && res.statusCode >= 400) {
          reject(
            new Error(
              `HTTP ${res.statusCode}: ${buf.toString('utf-8').slice(0, 500)}`,
            ),
          );
          return;
        }
        resolve(buf);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Convenience wrapper for HTTPS GET that returns a Buffer.
 */
function httpsGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Follow a single redirect if present
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        https.get(res.headers.location, (res2) => {
          const chunks: Buffer[] = [];
          res2.on('data', (chunk: Buffer) => chunks.push(chunk));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
          res2.on('error', reject);
        }).on('error', reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode && res.statusCode >= 400) {
          reject(
            new Error(
              `HTTP ${res.statusCode}: ${buf.toString('utf-8').slice(0, 500)}`,
            ),
          );
          return;
        }
        resolve(buf);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── STT: Groq Whisper ───────────────────────────────────────────────────────

/**
 * Download a Telegram file to a local temp path and return the path.
 * Uses the Telegram Bot API file download endpoint.
 */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
  destDir: string,
): Promise<string> {
  mkdirSync(destDir, { recursive: true });

  // Step 1: Get the file path from Telegram
  const infoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const infoBuffer = await httpsGet(infoUrl);
  const info = JSON.parse(infoBuffer.toString('utf-8')) as {
    ok: boolean;
    result?: { file_path?: string };
  };

  if (!info.ok || !info.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${infoBuffer.toString('utf-8').slice(0, 300)}`);
  }

  // Step 2: Download the actual file
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${info.result.file_path}`;
  const fileBuffer = await httpsGet(downloadUrl);

  // Step 3: Save locally
  // Telegram sends voice as .oga — Groq requires .ogg. Rename transparently.
  const rawExt = path.extname(info.result.file_path) || '.ogg';
  const ext = rawExt === '.oga' ? '.ogg' : rawExt;
  const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
  const localPath = path.join(destDir, filename);
  fs.writeFileSync(localPath, fileBuffer);

  return localPath;
}

/**
 * Transcribe an audio file using Groq's Whisper API.
 * Supports .ogg, .mp3, .wav, .m4a.
 */
export async function transcribeAudio(filePath: string): Promise<string> {
  const env = readEnvFile(['GROQ_API_KEY']);
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set in .env');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const boundary = `----FormBoundary${crypto.randomBytes(16).toString('hex')}`;

  // Build multipart/form-data body manually
  const parts: Buffer[] = [];

  // File field
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: audio/ogg\r\n\r\n`,
    ),
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from('\r\n'));

  // Model field
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper-large-v3\r\n`,
    ),
  );

  // Response format field
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
        `json\r\n`,
    ),
  );

  // Closing boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const responseBuffer = await httpsRequest(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
    },
    body,
  );

  const response = JSON.parse(responseBuffer.toString('utf-8')) as {
    text?: string;
  };

  return response.text ?? '';
}

// ── TTS: Groq Orpheus ───────────────────────────────────────────────────────

const GROQ_TTS_MODEL = 'canopylabs/orpheus-v1-english';
const GROQ_TTS_VOICE = 'daniel';
const GROQ_TTS_MAX_CHARS = 200;
const WAV_HEADER_SIZE = 44;

/**
 * Split text into chunks that fit within Groq's 200-char limit.
 * Splits on sentence boundaries, then commas, then spaces.
 */
export function chunkTextForTTS(text: string, maxLen: number = GROQ_TTS_MAX_CHARS): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    const segment = remaining.slice(0, maxLen);
    let splitAt = -1;

    for (const sep of ['. ', '! ', '? ', '.\n', '!\n', '?\n']) {
      const idx = segment.lastIndexOf(sep);
      if (idx > maxLen / 2) {
        splitAt = idx + sep.length;
        break;
      }
    }

    if (splitAt === -1) {
      const commaIdx = segment.lastIndexOf(', ');
      if (commaIdx > maxLen / 2) splitAt = commaIdx + 2;
    }

    if (splitAt === -1) {
      const spaceIdx = segment.lastIndexOf(' ');
      if (spaceIdx > maxLen / 2) splitAt = spaceIdx + 1;
    }

    if (splitAt === -1) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Concatenate multiple WAV buffers into one.
 * Assumes all WAVs share the same format (sample rate, channels, bit depth).
 */
function concatenateWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error('No audio buffers to concatenate');
  if (buffers.length === 1) return buffers[0];

  const pcmChunks = buffers.map(buf => buf.subarray(WAV_HEADER_SIZE));
  const totalPcmSize = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  const header = Buffer.from(buffers[0].subarray(0, WAV_HEADER_SIZE));
  header.writeUInt32LE(totalPcmSize + 36, 4);  // RIFF chunk size
  header.writeUInt32LE(totalPcmSize, 40);       // data sub-chunk size

  return Buffer.concat([header, ...pcmChunks]);
}

/**
 * Convert WAV buffer to OGG Opus via ffmpeg (required for Telegram voice messages).
 */
function wavToOgg(wavBuffer: Buffer): Buffer {
  const id = `tts_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tmpWav = path.join(UPLOADS_DIR, `${id}.wav`);
  const tmpOgg = path.join(UPLOADS_DIR, `${id}.ogg`);

  try {
    fs.writeFileSync(tmpWav, wavBuffer);
    execFileSync('ffmpeg', [
      '-i', tmpWav,
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-y',
      tmpOgg,
    ], { timeout: 15000, stdio: 'pipe' });
    return fs.readFileSync(tmpOgg);
  } finally {
    if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
    if (fs.existsSync(tmpOgg)) fs.unlinkSync(tmpOgg);
  }
}

/**
 * Convert text to speech using Groq Orpheus.
 * Chunks long text, runs parallel API calls, concatenates WAV, converts to OGG.
 */
async function synthesizeSpeechGroq(text: string): Promise<Buffer> {
  const env = readEnvFile(['GROQ_API_KEY']);
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set in .env');

  const chunks = chunkTextForTTS(text);
  logger.info({ chunks: chunks.length, totalChars: text.length }, 'Groq TTS: synthesizing');

  const wavBuffers = await Promise.all(
    chunks.map(async (chunk) => {
      const payload = JSON.stringify({
        model: GROQ_TTS_MODEL,
        input: chunk,
        voice: GROQ_TTS_VOICE,
        response_format: 'wav',
      });

      return httpsRequest(
        'https://api.groq.com/openai/v1/audio/speech',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload).toString(),
          },
        },
        payload,
      );
    }),
  );

  const combinedWav = concatenateWavBuffers(wavBuffers);
  return wavToOgg(combinedWav);
}

// ── TTS: ElevenLabs (fallback) ──────────────────────────────────────────────

async function synthesizeSpeechElevenLabs(text: string): Promise<Buffer> {
  const env = readEnvFile(['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID']);
  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId = env.ELEVENLABS_VOICE_ID;

  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID not set');

  const payload = JSON.stringify({
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });

  return httpsRequest(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'Content-Length': Buffer.byteLength(payload).toString(),
      },
    },
    payload,
  );
}

// ── TTS cascade ─────────────────────────────────────────────────────────────

/**
 * Convert text to speech using the first available provider.
 * Cascade: Groq Orpheus -> ElevenLabs
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const env = readEnvFile([
    'GROQ_API_KEY',
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_VOICE_ID',
  ]);

  if (env.GROQ_API_KEY) {
    try {
      return await synthesizeSpeechGroq(text);
    } catch (err) {
      logger.warn({ err }, 'Groq TTS failed, trying fallback');
    }
  }

  if (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID) {
    return synthesizeSpeechElevenLabs(text);
  }

  throw new Error('No TTS provider configured. Set GROQ_API_KEY or ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in .env');
}

// ── Capabilities check ──────────────────────────────────────────────────────

/**
 * Check whether voice mode is available (all required env vars are set).
 */
export function voiceCapabilities(): { stt: boolean; tts: boolean } {
  const env = readEnvFile([
    'GROQ_API_KEY',
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_VOICE_ID',
  ]);

  return {
    stt: !!env.GROQ_API_KEY,
    tts: !!(
      env.GROQ_API_KEY ||
      (env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID)
    ),
  };
}
