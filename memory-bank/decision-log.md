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
