# Active Context — vulnhuntr-volt

## Current State (2026-02-07)
All implementation work is complete. The project is a feature-complete port of Python vulnhuntr to TypeScript/VoltAgent with zero compilation errors and a passing production build.

## What Was Just Completed
Full gap analysis + implementation of all missing features identified between Python vulnhuntr and the TypeScript port:

1. **Template cleanup** — Removed weather.ts, expense approval workflow, and all VoltAgent template references
2. **6 new modules created**:
   - `src/llm/index.ts` — LLMSession with Claude prefill trick, JSON fixing (invalid escapes, Python None/True/False → null/true/false), conversation history context
   - `src/cost-tracker/index.ts` — CostTracker (per-call tracking, per-file/model cost breakdown), BudgetEnforcer (budget limits, escalating-cost detection, per-file/per-iteration limits), pricing table for 14 models, dry-run estimation
   - `src/config/index.ts` — .vulnhuntr.yaml config file support (project root + home dir search), defaultConfig(), loadConfig(), mergeConfigWithInput()
   - `src/checkpoint/index.ts` — AnalysisCheckpoint with save/resume/finalize, SIGINT handler for graceful shutdown, atomic temp-file writes
   - `src/integrations/github-issues.ts` — GitHub issue creation with duplicate detection, severity filtering, rate limiting
   - `src/integrations/webhook.ts` — Webhook notifications with HMAC-SHA256 signing, Slack/Discord/Teams/JSON formats
3. **Enriched schemas** — FindingSchema expanded from 7 to 18+ fields (severity enum, line numbers, CWE names, discovered_at, metadata, context_code), responseToFinding() converter, FindingSeverity 5-level enum, SEVERITY_SCORES, CWE_NAMES
4. **Enriched reporters** — SARIF (partialFingerprints via SHA-256, codeFlows, taxonomies, invocations, security-severity), JSON (severity breakdown, scratchpad, line numbers), Markdown (collapsible details, 5-level severity emojis, severity breakdown table), HTML (interactive collapsible findings, severity badges, keyboard shortcuts, print CSS), **new CSV reporter**
5. **Network patterns expanded** — From ~50 to ~120 patterns (added Pyramid, Bottle, Quart, web2py, Hug, Dash, Responder, HTTP clients, async handlers, XML/file/DB/template patterns)
6. **Workflow fully wired** — All new modules integrated into vulnhuntr.ts: cost tracking on every LLM call, budget enforcement per-file and per-iteration, checkpoint start/resume/finalize, config loading + merge, improved termination logic (same-context-names detection), responseToFinding() for enriched findings, CSV + cost report output
7. **README updated** — Added vulnhuntr features, vuln types table, usage examples, updated project structure; kept VoltAgent instructions

## Known Issues
- MCP servers require npx at runtime (graceful degradation if unavailable)
- Symbol finder is regex-based (no Jedi AST — acceptable tradeoff for TypeScript port)
- No unit tests yet for the new modules
- No CLI entry point (uses VoltAgent server API)
- Conversation history in LLMSession is simulated via prompt context blocks, not true multi-turn API

## Next Steps
- Runtime test with an actual Python repository
- Write unit tests for new modules (cost-tracker, config, checkpoint, llm, reporters)
- Consider adding a CLI runner for direct invocation
- Install MCP server packages globally for production use
- Test webhook + GitHub Issues integrations with real endpoints
