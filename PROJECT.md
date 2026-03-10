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
- **Last Worked:** 2026-03-09 (upstream cherry-pick, DF migration planning, documentation)
- **Current Focus:** Running in production with cherry-picked features (/model, /abort, file markers, baseline context tracking). Reviewed Data Foundation and Cortex architecture for integration path. Documented 5-phase SQLite+Postgres migration plan and upstream review process. Next milestone: health bot prototype as first domain-specific agent.

## One-Liner
Telegram bot for mobile Cortex access, push alerts, and quick capture from iPhone.

## Next Action
Create a health-domain Telegram bot (Haiku model) as a prototype for domain-specific agents. This bot would load Health project context and let Jason query health data, Function Health results, and fitness logs from his phone. Design it to coordinate through cortex-mcp (Data Foundation) when DF is operational, not through upstream's SQLite Hive Mind.

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
- [x] First Jason commit: save point for local customizations at 9d4de27 (2026-03-09)
- [x] Cherry-picked 4 upstream features: /model, /abort, file markers, context tracking (2026-03-09)
- [x] Analyzed Data Foundation + Cortex architecture for ClaudeClaw integration (2026-03-09)
- [x] Documented upstream review process and 5-phase DF migration plan (2026-03-09)
- [x] Service restarted with new features, verified clean startup (2026-03-09)
