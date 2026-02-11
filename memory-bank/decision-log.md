# Decision Log — vulnhuntr-volt

## Decision 1: Regex-Based Symbol Finder Instead of AST Parser
- **Date**: 2025-02-06
- **Context**: Python vulnhuntr uses Jedi (AST-based) for symbol resolution. TypeScript port needs an equivalent.
- **Decision**: Use regex-based symbol finder with 3 strategies instead of porting Jedi.
- **Alternatives**: (1) tree-sitter WASM, (2) Shell out to Python Jedi, (3) MCP tree-sitter server
- **Consequences**: Simpler; misses type inference; MCP tree-sitter available as future enhancement.

## Decision 2: Claude Prefill Technique for JSON Responses
- **Date**: 2025-02-06
- **Context**: Claude wraps JSON in markdown fences. Python vulnhuntr injects partial JSON as assistant message.
- **Decision**: Replicate prefill technique + fixJsonResponse() pipeline.
- **Consequences**: Reliable JSON extraction; prefill must match expected schema.

## Decision 3: Simulated Conversation History
- **Date**: 2025-02-06
- **Context**: VoltAgent Agent.generateText() doesn't expose multi-turn message arrays.
- **Decision**: Simulate via `<previous_analysis>` XML blocks in prompts.
- **Consequences**: Works within VoltAgent; increases tokens per iteration; capped at 7.

## Decision 4: Budget Enforcement with Escalating-Cost Detection
- **Date**: 2025-02-07
- **Decision**: BudgetEnforcer with 3 checks: total cap, per-file fair-share, escalating cost (>2× average).
- **Consequences**: Prevents runaway spending; fair distribution across files.

## Decision 5: Config File Format — YAML with Fallbacks
- **Date**: 2025-02-07
- **Decision**: YAML primary, JSON/key-value fallbacks. Search: recursive upward + ~/.vulnhuntr.yaml.
- **Consequences**: Compatible with Python version; handles edge cases.

## Decision 6: Atomic Checkpoint Writes
- **Date**: 2025-02-07
- **Decision**: Write temp file → rename. SIGINT handler calls save().
- **Consequences**: Atomic on all filesystems; progress saved on Ctrl+C.

## Decision 7: Enriched Finding Model (18+ Fields)
- **Date**: 2025-02-07
- **Decision**: 18+ field FindingSchema with severity enum, CWE names, line numbers, metadata, responseToFinding() converter.
- **Consequences**: Full SARIF detail; severity sorting across all reporters.

## Decision 8: HMAC-SHA256 Webhook Signing
- **Date**: 2025-02-07
- **Decision**: HMAC-SHA256 in `X-Vulnhuntr-Signature` header, GitHub convention.
- **Consequences**: Standard; verifiable; optional.

## Decision 9: VoltAgent Framework over Raw AI SDK
- **Date**: 2025-02-06
- **Decision**: Use VoltAgent for workflow chain, tool registry, MCP integration.
- **Consequences**: Clean workflow chain; tied to VoltAgent abstractions.

## Decision 10: Template Cleanup
- **Date**: 2025-02-07
- **Decision**: Remove all non-vulnhuntr template code. Keep VoltAgent setup in README.
- **Consequences**: Clean focused codebase.

## Decision 11: workflowState for Services (Not Data Flow)
- **Date**: 2025-02-07
- **Context**: The previous workflow stored mutable services (CostTracker, BudgetEnforcer, AnalysisCheckpoint) in the data flow using `_`-prefixed keys and `(data as any)` casts. This broke type safety and polluted the data between steps.
- **Decision**: Store all mutable services and cross-step context in `workflowState` via a `VulnHuntrState` interface. Use `setWorkflowState` to initialize in setup-repo. Access via `workflowState as VulnHuntrState` in all subsequent steps.
- **Alternatives**: (1) Keep in data flow with type assertions, (2) Module-level singletons, (3) Context map
- **Consequences**: Clean data flow (only analysis-relevant data); services persist through andForEach data reset; `as VulnHuntrState` casts required (VoltAgent doesn't support generics for state yet).

## Decision 12: andForEach for Per-File Analysis (Not Manual Loop)
- **Date**: 2025-02-07
- **Context**: Previous workflow had a monolithic 300-line andThen step with nested for-loops for file analysis. This was anti-idiomatic VoltAgent.
- **Decision**: Use `andForEach` with `items` selector, `map` function, `concurrency: 1` for per-file analysis. Extract the inner logic to a standalone `analyzeFile()` function.
- **Alternatives**: (1) Keep monolithic step, (2) andDoWhile with manual index, (3) Multiple andThen steps
- **Consequences**: VoltAgent manages iteration; per-file results collected as array; `concurrency: 1` ensures serial execution for budget/checkpoint safety; andForEach REPLACES accumulated data with results array (must use workflowState for context).

## Decision 13: andAll for Parallel Operations
- **Date**: 2025-02-07
- **Context**: File discovery and README summarization are independent. Six report formats are independent. Running them sequentially wastes time.
- **Decision**: Use `andAll` for (1) parallel discovery + README summarization, (2) parallel report generation (6 formats).
- **Alternatives**: (1) Sequential andThen steps, (2) andRace (wrong semantics), (3) Manual Promise.all
- **Consequences**: Faster execution; andAll merges parallel results into one object AND preserves previous accumulated data; report generation is embarrassingly parallel.

## Decision 14: andTap for Logging (Separated Side Effects)
- **Date**: 2025-02-07
- **Context**: Previous workflow mixed console.log into business logic. Logging is a side effect that shouldn't affect data flow or error handling.
- **Decision**: Use `andTap` at phase boundaries for observability. 5 andTap steps: log-setup, log-discovery, log-findings, log-reports, log-summary.
- **Alternatives**: (1) Console.log in andThen steps, (2) Hooks only, (3) External logger
- **Consequences**: Clean separation of concerns; andTap errors are caught (workflow continues); return values ignored (data passes through unchanged).

## Decision 15: New LLM Session Per File (Not Shared)
- **Date**: 2025-02-07
- **Context**: Python vulnhuntr shares one session across files but clears history between them. With andForEach, sharing a session via workflowState would require synchronization.
- **Decision**: Create a new LLMSession per file inside analyzeFile(). Conversation history accumulates within a file (across phases and vuln types) and is discarded between files.
- **Alternatives**: (1) Share session via workflowState (requires clearing between files), (2) Store sessions in a pool
- **Consequences**: Clean isolation per file; equivalent to Python behavior (clear history = new session); no synchronization needed; minor overhead from Agent construction (negligible).

## Decision 16: getStepData in Finalize for Safe Data Recovery
- **Date**: 2025-02-07
- **Context**: After andAll(reports) and andWhen(cleanup), the data shape may differ from what collect-findings returned. The finalize step needs the full WorkflowResult fields (findings, files_analyzed, etc.).
- **Decision**: Use `getStepData("collect-findings")?.output` as primary data source in finalize, with `data` as fallback.
- **Alternatives**: (1) Store WorkflowResult in workflowState, (2) Rely on data flow preservation through andAll, (3) Re-compute from workflowState
- **Consequences**: Robust against data-flow changes from andAll/andWhen; clean fallback; `getStepData` API availability in all step types assumed from docs.

## andAll returns tuple, not merged object
- **Date:** 2026-02-07 2:17:53 AM
- **Author:** Unknown User
- **Context:** VoltAgent's andAll documentation claims it merges results into one object, but empirically it returns a positional tuple (array). This was discovered through test failures where data.property was undefined after andAll.
- **Decision:** Always destructure andAll results as a tuple. Use workflowState for data that must survive andAll boundaries (since andAll replaces the data flow with its output).
- **Alternatives Considered:** 
  - Trust VoltAgent docs and assume merged object (incorrect)
  - Store all shared state in workflowState only (over-engineering)
  - Use getStepData to retrieve previous step outputs (more complex)
- **Consequences:** 
  - Workflow now correctly handles andAll data flow
  - Pattern documented for future andAll usage
  - VoltAgent docs are known to be misleading on this point

## vitest v4 constructor mock pattern
- **Date:** 2026-02-07 2:18:01 AM
- **Author:** Unknown User
- **Context:** vitest v4 calls new on the mockImplementation function. Arrow functions cannot be used with new. For @voltagent/core, needed Agent mocked but createWorkflowChain real.
- **Decision:** Use vi.fn(function(this: any) { this.prop = ...; return this; }) for constructor mocks. Use vi.mock('@voltagent/core', async (importOriginal) => {...partial mock...}) to mock Agent while keeping chain API real.
- **Alternatives Considered:** 
  - Use vi.fn().mockImplementation(arrow) for constructor mocks (fails in vitest v4)
  - Use class-based mocks (more verbose)
  - Mock entire @voltagent/core (breaks chain API)
- **Consequences:** 
  - All constructor mocks work correctly with new
  - Agent class mocked while createWorkflowChain stays real
  - Pattern documented for future test development

## Claude Code comprehensive audit and fix plan
- **Date:** 2026-02-08 3:10:19 AM
- **Author:** Unknown User
- **Context:** Claude Code (Opus 4.6) was brought in to audit and fix vulnhuntr-volt after Copilot's implementation. Full codebase review completed including: all 18 source files, original Python vulnhuntr, VoltAgent docs (workflows, agents, MCP, execute-api, workflow-state, andForEach, andAll), memory bank state. Key issues identified: (1) LFI bypass list has a missing comma bug ported from Python, (2) MCP getClient/getAgentTools API may not match VoltAgent 2.x, (3) Prompt structure differences from original, (4) No AI SDK provider import but VoltAgent model strings handle it, (5) workflowState/setWorkflowState is correct per bundled docs, (6) andAll data flow is confirmed to merge results (per latest docs) but code treats it as tuple.
- **Decision:** Perform systematic fix of all identified issues, verify MCP client API against actual VoltAgent 2.x types, fix prompt fidelity, fix LFI bypass list, test end-to-end with actual repo, create internal guide document.
- **Alternatives Considered:** 
  - Continue with existing code as-is
  - Complete rewrite from scratch
  - Partial fix focusing only on MCP
- **Consequences:** 
  - Full working vulnerability scanner
  - Accurate reproduction of original vulnhuntr quality
  - Proper VoltAgent integration
  - Working MCP client connections

## Keep andThen + dynamic Agent instead of andAgent for README summarization
- **Date:** 2026-02-08 3:39:37 AM
- **Author:** Unknown User
- **Context:** Investigated whether to refactor the summarize-readme step to use VoltAgent's andAgent() pattern for better observability.
- **Decision:** Kept the current andThen + dynamic Agent pattern because andAgent requires a static Agent at chain-build time, but the model comes from workflowState at runtime (determined by CLI --llm/--model flags).
- **Alternatives Considered:** 
  - Use andAgent with a fixed default model
  - Create Agent with model override at runtime
- **Consequences:** 
  - The current approach works correctly for all providers (anthropic, openai, ollama)
  - No observability regression since VoltAgent still tracks the Agent.generateText calls

## Remove 3 non-existent MCP server packages
- **Date:** 2026-02-08 3:39:45 AM
- **Author:** Unknown User
- **Context:** End-to-end testing revealed that mcp-server-tree-sitter, @anonx3247/process-mcp, and codeql-mcp do not exist on npm. They were hallucinated by GitHub Copilot from a reference to repos/vulnhuntr/docs/MCP_SERVERS.md which also doesn't exist.
- **Decision:** Removed tree-sitter, process, and codeql from MCP config. Kept only filesystem (14 tools) and ripgrep (5 tools) which are real, working packages.
- **Alternatives Considered:** 
  - Search for alternative real packages
  - Keep them with graceful degradation
- **Consequences:** 
  - MCP startup is ~15 seconds faster (no failed npx attempts)
  - 19 real MCP tools available vs 0 working out of 5 before
  - Can add real tree-sitter/codeql MCP servers later if they become available

## Modular test suite: one file per source module (Claude Code)
- **Date:** 2026-02-08 5:11:03 AM
- **Author:** Unknown User
- **Context:** Claude Code was asked to rebuild the test suite after the old tests/ directory was deleted. The original was a single large workflow e2e test file. The user wanted modular tests covering as many parts as possible, with only meaningful tests and minimal comments.
- **Decision:** Created 10 new unit test files (one per source module) plus kept the existing workflow e2e test. Each unit test file covers the public API of its module with real assertions (no mocking needed for pure functions). Filesystem-dependent tests (repo, checkpoint, symbol-finder, config) use temp directories with automatic cleanup. The workflow.test.ts mocks all externals for full chain testing. Shared fixtures.ts provides factory functions (makeFinding, makeWorkflowResult, makeTempDir) to avoid duplication. Added test:e2e script to package.json.
- **Alternatives Considered:** 
  - Single monolithic test file covering everything (original approach — harder to maintain, unclear what's tested)
  - Only test pure functions, skip filesystem-dependent modules (less coverage)
  - Mock-heavy approach for all modules (brittle, low confidence)
- **Consequences:** 
  - 206 tests across 11 files, all passing in ~2 seconds
  - Each module can be tested independently
  - Filesystem tests use real temp dirs — high confidence, minimal mocking
  - workflow.test.ts provides integration coverage with full chain mocking
  - Easy to add tests when new functions are added to a module
