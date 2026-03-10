---
type: project
state: maintenance
domain: productivity
priority: 2
created: 2026-02-28
last-worked: 2026-03-09
---

# ClaudeClaw

## Status
- **State:** Maintenance
- **Domain:** productivity
- **Last Worked:** 2026-03-09 (upstream review, rollback, stability audit)
- **Current Focus:** Running in production. Reviewed upstream's 30-commit multi-agent overhaul, decided to cherry-pick selectively rather than pull everything. Rolled back to 736571f. Established upstream review protocol. Identified future additions: /model, /abort, file markers, TTS, multi-agent (research + health bots on Haiku).

## One-Liner
Telegram bot for mobile Cortex access, push alerts, and quick capture from iPhone.

## Next Action
Commit local customizations as first save point. Then cherry-pick upstream features: /model command, abort mechanism (as /abort), file sending markers, TTS cascade (Groq Orpheus primary). Set up research and health Telegram bots on Haiku.

## Parent Project
Cortex (subproject). Built during CortexRestructure Domain 5 implementation.

## Architecture
- Node.js/TypeScript application (grammy framework)
- SQLite database for token tracking and memory
- LaunchAgent: `com.claudeclaw.app` (keep-alive, ProcessType Interactive)
- Logs: `/tmp/claudeclaw.log`, `/tmp/claudeclaw.err`
- Telegram bot: @jpayne_cortex_bot (ALLOWED_CHAT_ID locked down)
- Dedicated Anthropic API key (isolated from Max subscription)
- Watchdog integration: `scripts/notify.sh` used by `cortex/automation/watchdog.py`

## Goals
- [x] Telegram bot with Claude access from iPhone
- [x] Security: ALLOWED_CHAT_ID, dedicated API key
- [x] Push alerts via notify.sh (watchdog integration)
- [ ] Voice input via Groq Whisper
- [ ] Voice replies
- [ ] Slack integration

## Progress
- [x] Cloned, built, CLAUDE.md customized (2026-02-28)
- [x] Telegram bot created, token in 1Password (2026-02-28)
- [x] ALLOWED_CHAT_ID security lockdown verified from iPhone (2026-02-28)
- [x] Dedicated Anthropic API key isolated from Max subscription (2026-02-28)
- [x] Security audit: 0 critical, 4 warnings addressed (2026-02-28)
- [x] notify.sh integrated with watchdog.py for push alerts (2026-02-28)
- [x] Push alert end-to-end test verified on iPhone (2026-02-28)
- [x] Polling fix: timeoutSeconds 500->60, ProcessType Interactive, DEBUG=grammy:error (2026-03-01)
- [x] Reviewed upstream 30-commit multi-agent overhaul, rolled back, established cherry-pick protocol (2026-03-09)
- [x] Confirmed all known stability issues (polling, auth bypass, context >100%) already fixed (2026-03-09)
