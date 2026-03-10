# Upstream Review Process

## Overview

ClaudeClaw is forked from `earlyaidopters/claudeclaw` (originally promptadvisers/oldbettie). The author is active and pushes weekly. We do NOT blindly pull. Every upstream change is reviewed and cherry-picked selectively.

## Process

### 1. Fetch (never pull)

```bash
cd ~/Developer/projects/claudeclaw
git fetch origin
```

### 2. Review what's new

```bash
git log HEAD..origin/main --oneline
```

### 3. Inspect the diff

```bash
# High-level: what files changed
git diff HEAD..origin/main --stat

# Detailed: per-file changes
git diff HEAD..origin/main -- src/bot.ts
git diff HEAD..origin/main -- src/agent.ts
# etc.
```

### 4. Decide what to cherry-pick

Evaluate each commit/feature against these criteria:

**Take it if:**
- Self-contained (no multi-agent dependencies)
- Adds capability we need (bug fix, new command, better tracking)
- Does not conflict with Data Foundation architecture

**Skip it if:**
- Multi-agent infrastructure (we build our own on cortex-mcp)
- Hive Mind / cross-agent SQLite coordination (conflicts with DF)
- Obsidian scanner (cortex-mcp handles context)
- Agent templates (we define our own agents)
- Dependencies we don't need (@google/genai, js-yaml)

### 5. Implement

Do NOT use `git cherry-pick` directly (upstream commits bundle multiple features). Instead:

1. Read the upstream file version: `git show origin/main:src/file.ts`
2. Extract only the code needed for the feature
3. Adapt to our setup (strip AGENT_ID, SSE events, dashboard refs)
4. Build: `npm run build`
5. Test: `npm test`
6. Commit with clear description of what was cherry-picked and why

### 6. Document

After each review cycle, update:
- `MEMORY.md` (Upstream Features sections)
- This file (if the process changes)

## What We've Taken (History)

### 2026-03-09: Initial cherry-pick (commits up to 05a4fca)

**Taken:**
1. Context tracking improvements (lastCallInputTokens, baseline-aware warnings)
2. /model command (per-chat model switching)
3. /abort command (cancel active queries via AbortController)
4. File sending markers ([SEND_FILE:path], [SEND_PHOTO:path])
5. context_tokens column in token_usage table
6. DB migration system (runMigrations)

**Skipped:**
- All agents/ directory (templates, configs, YAML)
- src/agent-config.ts, src/obsidian.ts
- src/dashboard.ts, src/dashboard-html.ts (too interleaved with multi-agent)
- Hive Mind table and queries in db.ts
- Multi-agent wiring in index.ts, config.ts
- @google/genai, js-yaml, hono dependencies
- /timezone skill
- GitHub issue/PR templates
- TTS cascade (Gradium, macOS say) -- deferred, not using voice yet

**Files modified:**
- src/state.ts (NEW -- abort controller management)
- src/config.ts (added CONTEXT_LIMIT)
- src/agent.ts (model param, abort, lastCallInputTokens)
- src/bot.ts (/model, /abort, file markers, baseline context warnings)
- src/db.ts (context_tokens column, runMigrations)

## Cadence

Review upstream monthly or when notified of interesting changes. The author tends to push feature bundles (phases), so checking after each phase announcement is efficient.
