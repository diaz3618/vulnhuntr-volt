# Decision Log — vulnhuntr-volt

## Decision 1: Regex-Based Symbol Finder Instead of AST Parser
- **Date**: 2025-02-06
- **Context**: Python vulnhuntr uses Jedi (AST-based) for symbol resolution, which provides type inference, import chain resolution, and cross-file definition lookup. TypeScript port needs an equivalent.
- **Decision**: Use regex-based symbol finder with 3 strategies (function/class def, method def, variable assignment) instead of porting Jedi.
- **Alternatives**: (1) Use tree-sitter WASM for Python AST parsing, (2) Shell out to Python Jedi, (3) MCP tree-sitter server
- **Consequences**: Simpler implementation, no Python runtime dependency; but misses type inference, can't resolve re-exports or dynamic imports. MCP tree-sitter server available as future enhancement path.

## Decision 2: Claude Prefill Technique for JSON Responses
- **Date**: 2025-02-06
- **Context**: Claude consistently wraps JSON in markdown fences or adds commentary. Python vulnhuntr solves this by injecting a partial JSON string as an assistant message.
- **Decision**: Replicate the prefill technique: append `'{"scratchpad": "1.'` as instruction, reconstruct if response doesn't start with `{`. Combined with fixJsonResponse() pipeline for robustness.
- **Alternatives**: (1) Use Claude's JSON mode (not available in all models), (2) Post-processing only
- **Consequences**: Very reliable JSON extraction; requires the prefill constant to match the expected response schema.

## Decision 3: Simulated Conversation History
- **Date**: 2025-02-06
- **Context**: Python vulnhuntr uses true multi-turn Claude API (appending messages to a conversation). VoltAgent Agent.generateText() doesn't expose multi-turn message arrays.
- **Decision**: Simulate conversation via prompt context blocks — each LLMSession.chat() call includes all prior exchanges as `<previous_analysis>` XML blocks in the prompt.
- **Alternatives**: (1) Use AI SDK directly bypassing VoltAgent Agent, (2) Maintain external AI SDK conversation
- **Consequences**: Works within VoltAgent's abstraction; increases prompt token usage with each iteration; cap at 7 iterations limits growth.

## Decision 4: Budget Enforcement with Escalating-Cost Detection
- **Date**: 2025-02-07
- **Context**: Long analyses on large repos can burn significant API budget. Python vulnhuntr had basic budget checking. Need smarter early termination.
- **Decision**: BudgetEnforcer with three checks: (1) total budget cap, (2) per-file fair-share budget, (3) escalating cost detection — if current iteration costs >2× the average of prior iterations for the same file, stop.
- **Alternatives**: (1) Simple total-budget-only cap, (2) Fixed per-file budget, (3) Token-count limits
- **Consequences**: Prevents runaway spending on files that generate increasingly verbose context; fair-share lets remaining files get adequate budget.

## Decision 5: Config File Format — YAML with Fallbacks
- **Date**: 2025-02-07
- **Context**: Python vulnhuntr uses `.vulnhuntr.yaml`. Need to support same format for compatibility plus user convenience.
- **Decision**: Primary: YAML via `yaml` npm package. Fallbacks: JSON parse, then key=value line parsing. Config search: recursive upward from repo root + `~/.vulnhuntr.yaml`.
- **Alternatives**: (1) YAML only, (2) TOML, (3) JSON only
- **Consequences**: Maximum compatibility with Python version; fallbacks handle edge cases; recursive search matches common config-file conventions.

## Decision 6: Atomic Checkpoint Writes
- **Date**: 2025-02-07
- **Context**: SIGINT during checkpoint write could corrupt the file, losing all progress.
- **Decision**: Write to temp file (`checkpoint.tmp`) then rename. SIGINT handler calls save() before exit.
- **Alternatives**: (1) Direct file write, (2) SQLite-based checkpoint, (3) Append-only log
- **Consequences**: Rename is atomic on all major filesystems; minimal complexity; SIGINT handler ensures progress is saved even on Ctrl+C.

## Decision 7: Enriched Finding Model (18+ Fields)
- **Date**: 2025-02-07
- **Context**: Python vulnhuntr has a rich Finding model with severity, CWE names, line numbers, metadata. Initial TypeScript port had a minimal schema.
- **Decision**: Expand FindingSchema to 18+ fields matching Python: add rule_id, title, start_line, end_line, start_column, end_column, severity enum (5 levels), cwe, cwe_name, metadata (discovered_at, model, iteration). Add responseToFinding() converter.
- **Alternatives**: (1) Keep minimal schema, add fields lazily, (2) Use Python Finding model directly via JSON interface
- **Consequences**: SARIF reports have full detail (fingerprints, codeFlows, taxonomies); CSV export has all columns; severity-based sorting works across all reporters.

## Decision 8: HMAC-SHA256 Webhook Signing
- **Date**: 2025-02-07
- **Context**: Webhook notifications need authentication to prevent spoofing.
- **Decision**: HMAC-SHA256 signature in `X-Vulnhuntr-Signature` header, format: `sha256=<hex>`. Matches GitHub webhook signing convention.
- **Alternatives**: (1) Bearer token auth, (2) API key in header, (3) No signing
- **Consequences**: Standard approach; recipients can verify payload integrity; optional (only if secret configured).

## Decision 9: VoltAgent Framework over Raw AI SDK
- **Date**: 2025-02-06
- **Context**: Could implement vulnhuntr as a plain TypeScript app using AI SDK directly. VoltAgent adds Agent/Workflow/Tool abstractions.
- **Decision**: Use VoltAgent for its workflow chain pattern, tool registry, and MCP integration support.
- **Alternatives**: (1) Raw AI SDK with custom orchestration, (2) LangChain.js, (3) Plain TypeScript
- **Consequences**: Clean 5-step workflow chain; built-in tool management; MCP server support; but tied to VoltAgent's abstractions (e.g., no direct multi-turn message control).

## Decision 10: Template Cleanup — Remove All Non-Vulnhuntr Code
- **Date**: 2025-02-07
- **Context**: Project started from VoltAgent template with weather tools and expense approval workflow. These are irrelevant.
- **Decision**: Remove weather.ts, expense approval workflow, all template references. Keep only vulnhuntr-related code. Preserve VoltAgent setup instructions in README.
- **Alternatives**: (1) Keep templates as examples, (2) Move to examples/ directory
- **Consequences**: Clean codebase focused entirely on vulnhuntr; README retains VoltAgent setup instructions for new developers.
