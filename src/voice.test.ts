import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { voiceCapabilities, chunkTextForTTS, UPLOADS_DIR } from './voice.js';
import { readEnvFile } from './env.js';

const mockReadEnvFile = vi.mocked(readEnvFile);

describe('voiceCapabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { stt: false, tts: false } when no env vars set', () => {
    mockReadEnvFile.mockReturnValue({});
    const result = voiceCapabilities();
    expect(result).toEqual({ stt: false, tts: false });
  });

  it('returns { stt: true, tts: true } when only GROQ_API_KEY is set', () => {
    mockReadEnvFile.mockReturnValue({ GROQ_API_KEY: 'gsk_test123' });
    const result = voiceCapabilities();
    expect(result).toEqual({ stt: true, tts: true });
  });

  it('returns { stt: false, tts: false } when only ELEVENLABS_API_KEY is set (missing voice ID)', () => {
    mockReadEnvFile.mockReturnValue({ ELEVENLABS_API_KEY: 'el_test123' });
    const result = voiceCapabilities();
    expect(result).toEqual({ stt: false, tts: false });
  });

  it('returns { stt: false, tts: true } when both ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID set', () => {
    mockReadEnvFile.mockReturnValue({
      ELEVENLABS_API_KEY: 'el_test123',
      ELEVENLABS_VOICE_ID: 'voice_abc',
    });
    const result = voiceCapabilities();
    expect(result).toEqual({ stt: false, tts: true });
  });

  it('returns { stt: true, tts: true } when all three set', () => {
    mockReadEnvFile.mockReturnValue({
      GROQ_API_KEY: 'gsk_test123',
      ELEVENLABS_API_KEY: 'el_test123',
      ELEVENLABS_VOICE_ID: 'voice_abc',
    });
    const result = voiceCapabilities();
    expect(result).toEqual({ stt: true, tts: true });
  });
});

describe('chunkTextForTTS', () => {
  it('returns single chunk for short text', () => {
    expect(chunkTextForTTS('Hello world', 200)).toEqual(['Hello world']);
  });

  it('splits on sentence boundaries', () => {
    const text = 'First sentence here. Second sentence here. Third sentence that goes on a bit longer to fill space.';
    const chunks = chunkTextForTTS(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });

  it('splits on commas when no sentence boundary found', () => {
    const text = 'One thing, another thing, a third thing, a fourth thing, and a fifth thing altogether';
    const chunks = chunkTextForTTS(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });

  it('splits on spaces as last resort', () => {
    const text = 'word '.repeat(50).trim();
    const chunks = chunkTextForTTS(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it('handles empty text', () => {
    expect(chunkTextForTTS('', 200)).toEqual(['']);
  });

  it('preserves all text content across chunks', () => {
    const text = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.';
    const chunks = chunkTextForTTS(text, 50);
    const rejoined = chunks.join(' ');
    // All words from original should appear in the rejoined chunks
    for (const word of text.split(/\s+/)) {
      expect(rejoined).toContain(word.replace(/[.,!?]$/, ''));
    }
  });
});

describe('UPLOADS_DIR', () => {
  it('is an absolute path', () => {
    expect(path.isAbsolute(UPLOADS_DIR)).toBe(true);
  });

  it('ends with workspace/uploads', () => {
    expect(UPLOADS_DIR).toMatch(/workspace[/\\]uploads$/);
  });
});
