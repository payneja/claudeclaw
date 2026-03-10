# Data Foundation Migration Plan

## Current State (SQLite-Only)

ClaudeClaw runs entirely on a local SQLite database at `store/claudeclaw.db`.

### What SQLite stores today:
| Table | Purpose | Records per msg |
|-------|---------|----------------|
| sessions | chat_id -> Claude session_id | 1 read, 1 write |
| memories + memories_fts | Long-term facts with keyword search | 1-3 reads, 0-1 writes |
| conversation_log | Full transcript (both sides) | 2 writes |
| token_usage | Per-turn metrics (tokens, cost, compaction) | 1 write |
| scheduled_tasks | Cron jobs (prompt + schedule) | polled every 60s |
| wa_*/slack_* | WhatsApp and Slack message logging | varies |

### How messages flow:
1. Telegram msg arrives
2. SQLite: look up session_id, search memories (FTS5 keyword match)
3. Prepend memories as context, send to Claude via Agent SDK
4. Claude responds
5. SQLite: save conversation turns, extract/save memories, log token usage
6. Send response to Telegram

## Target State (SQLite + Postgres)

SQLite stays for speed. Postgres (Data Foundation) adds shared, semantic access.

### What goes where:

| Data | SQLite (local, fast) | Postgres/DF (shared, semantic) |
|------|---------------------|-------------------------------|
| Session ID | YES (hot path) | NO |
| Token usage | YES (operational) | NO (unless analytics needed) |
| Conversation log | YES (hot path, /respin) | Optional batch export |
| Memories | YES (FTS5 for this session) | YES (pgvector for cross-tool) |
| Session summaries | NO | YES (structured, cross-device) |
| Behavioral profiles | NO | YES (identity, domain, project) |
| Evernote/document metadata | NO | YES (structured + embedded) |
| Scheduled tasks | YES (local scheduler) | NO |
| WA/Slack messages | YES (logging) | NO |

### Key principle: Local-first, always.
SQLite is the local cache. Postgres is the source of truth for shared data. Sync happens async, not in the hot path. This matches Data Foundation's own architecture.

## Migration Steps

### Prerequisite: DF MCP operational
Data Foundation's cortex-mcp must be serving data before any of this starts. Current status: iCloud queue Batch 1 of 7 complete.

### Phase 1: Dual-write memories
- When a memory is extracted, write to both SQLite (immediate) and Postgres (async via cortex-mcp `capture`)
- SQLite continues serving reads (FTS5)
- No user-visible change, no latency impact
- **Validates:** write path works, data lands in both stores

### Phase 2: Read from Postgres for semantic search
- `buildMemoryContext()` queries cortex-mcp `search` (pgvector) instead of SQLite FTS5
- Falls back to SQLite FTS5 if cortex-mcp is unreachable
- **Validates:** semantic search returns better results than keyword matching
- **User sees:** more relevant memory recall ("brakes" finds "brake pad replacement")

### Phase 3: Session continuity via Postgres
- On `/newchat`: auto-generate structured summary, save via `save_session_state`
- On new session: load last session state via `get_session_state`
- Replaces lossy `/respin` with curated summary
- **User sees:** better context recovery after /newchat
- **Bonus:** Claude.ai and ChatGPT can read the same session state

### Phase 4: Behavioral profiles
- cortex-mcp `get_profile` loads identity + domain + project profiles
- Prepended to first message of each session (not every message)
- Replaces the static CLAUDE.md as the behavioral instruction source for cross-tool use
- **User sees:** consistent personality across Telegram, Claude.ai, ChatGPT

### Phase 5: Document ingestion (Evernote, receipts)
- Evernote export -> parse -> upload files to GDrive -> index metadata in Postgres
- Structured fields: date, vendor, amount, category, vehicle, mileage
- Extracted text embedded with pgvector for semantic search
- GDrive path stored as reference column
- **User sees:** "Look up all service records for Tundra" returns structured data

## Architecture After Migration

```
TELEGRAM (iPhone)
    |
MAC STUDIO
    |
    +-- ClaudeClaw bot
    |     |
    |     +-- SQLite (store/claudeclaw.db)
    |     |     Session ID, token tracking, conversation log,
    |     |     scheduled tasks, WA/Slack logs
    |     |
    |     +-- cortex-mcp (Postgres/Supabase)  [async]
    |           Memories (pgvector), session summaries,
    |           behavioral profiles, document index
    |
    +-- Claude Agent SDK
          |
          +-- Sonnet (default) / Haiku / Opus via /model
```

## What NOT to migrate
- Session IDs (ephemeral, SDK-managed, no cross-tool value)
- Token usage (operational telemetry, not context)
- WA/Slack message logs (low value, local-only)
- Scheduled tasks (local cron, Mac Studio only)

## Rollback
Every phase is independently reversible:
- Phase 1: Stop dual-writing, SQLite continues working alone
- Phase 2: Revert buildMemoryContext to FTS5-only
- Phase 3: Revert to /respin from conversation_log
- Phase 4: Stop loading profiles, CLAUDE.md still works locally
- Phase 5: Document index is additive, removing it loses nothing

## Dependencies
- cortex-mcp fully operational (iCloud queue + Postgres serving)
- Supabase Pro provisioned and live (already done)
- Bearer token auth working (already done)
- pgvector schema applied (already done)

## Timeline
No dates. Follows Data Foundation progress. Each phase starts when the previous is validated and DF has the required capabilities.
