# Active Context — vulnhuntr-volt

## Current State (2026-02-08)

Project is feature-complete with full test coverage. All systems operational.

### Entry Points
| Mode | Command | Description |
|------|---------|-------------|
| CLI | `npm run scan -- -r /path/to/repo` | Direct workflow execution |
| REST API | `npm run dev:server` | VoltAgent server at localhost:3141 |
| Programmatic | `vulnhuntrWorkflow.run(input)` | Import and call directly |

### Test Suite (rebuilt by Claude Code — Opus 4.6)
206 tests across 11 files, all passing. One test file per source module + shared fixtures:

| File | Tests | Covers |
|------|-------|--------|
| fixtures.ts | — | Shared factories: makeFinding, makeWorkflowResult, makeTempDir |
| llm.test.ts | 13 | fixJsonResponse, detectProvider |
| schemas.test.ts | 20 | Zod validation, responseToFinding, CWE mappings |
| prompts.test.ts | 20 | XML builders, compound prompts, bypass data |
| github.test.ts | 10 | parseGitHubUrl, isGitHubPath |
| reporters.test.ts | 21 | All 5 report generators, sorting, escaping |
| cost-tracker.test.ts | 19 | getModelPricing, estimateTokens, CostTracker, BudgetEnforcer |
| config.test.ts | 12 | defaultConfig, configFromDict, mergeConfigWithInput, loadConfig |
| symbol-finder.test.ts | 9 | extractSymbol, extractDefinitionBlock |
| repo.test.ts | 14 | getPythonFiles, isNetworkRelated, getReadmeContent |
| checkpoint.test.ts | 12 | Full lifecycle: start, markComplete, canResume, finalize |
| workflow.test.ts | 56 | Full workflow chain e2e (mocked LLM/fs/MCP) |

## Recent Changes (by Claude Code)

1. **Modular test suite** — Rebuilt from scratch after old tests/ directory was deleted. Created 10 unit test files + 1 e2e workflow test + shared fixtures. Added `test:e2e` script to package.json.

2. **Updated internal/guide.md** — Added integrations/ and tests/ to architecture tree, added Testing and Integrations sections, noted MCP tools wiring to LLMSession Agent.

3. **Updated memory bank** — Rewrote product-context.md (fixed stale MCP count, added CLI entry, updated pipeline steps), updated system-patterns.md (added tests/ to file org, added test patterns section), rewrote active-context.md.

## Known Issues

- Rate limiting on Anthropic API can skip files during scan (handled gracefully)
- Only 2 of originally planned 5 MCP servers exist on npm (filesystem, ripgrep)

## Next Steps

- Consider retry with backoff for rate-limited API calls
- Add more MCP servers as real packages become available
- Consider parallel file analysis (concurrency > 1) with rate limit awareness
