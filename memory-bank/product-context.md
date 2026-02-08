# Product Context — vulnhuntr-volt

## Purpose

Replicate the Python-based vulnhuntr autonomous vulnerability scanner as a TypeScript VoltAgent workflow. This project ports the entire vulnhuntr analysis pipeline to the VoltAgent framework with enhanced capabilities including GitHub repo analysis, MCP server integration, cost tracking, checkpoint/resume, and multi-format reporting.

## Original vulnhuntr Architecture (Python)

- **Entry**: `runner.py::run_analysis(args)` — main orchestrator
- **Repo scanning**: `RepoOps` — file discovery, network-related file filtering (~100 regex patterns)
- **Symbol resolution**: `SymbolExtractor` — 3-phase Jedi AST search for code context
- **LLM analysis**: `VulnerabilityAnalyzer` — two-phase analysis (initial + iterative secondary)
- **LLM clients**: Claude (JSON prefill trick), ChatGPT (json_object mode), Ollama (HTTP)
- **Models**: `VulnType` enum (7 types), `Response` (scratchpad, analysis, poc, confidence, vuln_types, context_code), `Finding` (18+ fields including severity, line numbers, CWE names, metadata)
- **Prompts**: XML-structured (FileCode, CodeDefinitions, ExampleBypasses, Instructions, AnalysisApproach, PreviousAnalysis, Guidelines, ResponseFormat)
- **Reporters**: SARIF (with fingerprints, codeFlows, taxonomies), HTML (interactive), JSON, CSV, Markdown
- **Cost tracking**: Per-call, per-file, per-model tracking; budget enforcement with escalating-cost detection
- **Config**: .vulnhuntr.yaml (project root + home dir)
- **Checkpoint**: Save/resume with SIGINT handler
- **Integrations**: GitHub Issues (duplicate detection), webhooks (HMAC-SHA256, Slack/Discord/Teams)

## VoltAgent Port Architecture (TypeScript) — IMPLEMENTED

### Core Framework

- **Framework**: @voltagent/core ^2.0.0 (Agents, Workflows via createWorkflowChain, Tools)
- **Build**: tsdown v0.15.12, ESM, Node.js 20+, TypeScript strict mode
- **AI SDK**: ai ^6.0.0 (CallSettings uses `maxOutputTokens` not `maxTokens`)
- **WorkflowState**: `executionId`, `active`, `status`, `input`, `data`, `workflowState`, `result` (no `stepId`)

### Module Map (15 source files)

| Module | Path | Purpose |
|--------|------|---------|
| Entry | `src/index.ts` | VoltAgent server, agent, tool + workflow registration |
| Schemas | `src/schemas/index.ts` | VulnType, FindingSeverity, 18-field FindingSchema, ResponseSchema, responseToFinding() |
| Prompts | `src/prompts/index.ts` | All 7 vuln templates (character-identical to Python), system/initial/secondary prompts |
| Workflow | `src/workflows/vulnhuntr.ts` | 5-step chain: setup → discover → readme → analyze → reports |
| Repo Tools | `src/tools/repo.ts` | File discovery, 120+ network patterns, exclusion lists |
| GitHub Tools | `src/tools/github.ts` | Clone, URL parsing, cleanup |
| Symbol Finder | `src/tools/symbol-finder.ts` | Regex-based symbol resolution (3 strategies) |
| Reporters | `src/reporters/index.ts` | SARIF, JSON, Markdown, HTML, CSV (6 formats) |
| LLM Layer | `src/llm/index.ts` | LLMSession, Claude prefill, JSON fixing, conversation history |
| Cost Tracker | `src/cost-tracker/index.ts` | CostTracker, BudgetEnforcer, 14-model pricing, estimation |
| Config | `src/config/index.ts` | .vulnhuntr.yaml loading, merge with CLI input |
| Checkpoint | `src/checkpoint/index.ts` | AnalysisCheckpoint, SIGINT handler, atomic writes |
| GitHub Issues | `src/integrations/github-issues.ts` | Issue creation, duplicate detection |
| Webhook | `src/integrations/webhook.ts` | HMAC-SHA256, Slack/Discord/Teams/JSON |
| MCP | `src/mcp/index.ts` | 5 MCP servers (filesystem, ripgrep, tree-sitter, process, codeql) |

### MCP Servers

- **memory-bank-mcp** — MANDATORY, project memory persistence
- **voltagent docs-mcp** — Documentation search
- **lsp-mcp** — Language server protocol tools
- **filesystem** — File read/write/search (runtime analysis)
- **ripgrep** — Fast code search across repos
- **tree-sitter** — AST parsing for Python files
- **process** — Shell command execution
- **codeql** — Static analysis queries

## Vulnerability Types Covered

| Type | CWE | Description |
|------|-----|-------------|
| LFI | CWE-22 | Local File Inclusion / Path Traversal |
| RCE | CWE-78 | Remote Code Execution / Command Injection |
| SSRF | CWE-918 | Server-Side Request Forgery |
| AFO | CWE-73 | Arbitrary File Overwrite |
| SQLI | CWE-89 | SQL Injection |
| XSS | CWE-79 | Cross-Site Scripting |
| IDOR | CWE-639 | Insecure Direct Object Reference |

## Analysis Pipeline Flow

1. **Setup Repo** — Clone GitHub repos or validate local paths; load .vulnhuntr.yaml config; init CostTracker + BudgetEnforcer + AnalysisCheckpoint; connect MCP servers
2. **Discover Files** — Scan for Python files, filter to network-related ones (120+ patterns); init checkpoint with file list
3. **Summarize README** — LLM summarizes README for security context
4. **Analyze Files** — Per-file:
   - Phase 1: Initial analysis for all 7 vuln types (LLMSession with prefill)
   - Phase 2: Iterative deep analysis per vuln type (up to 7 iterations)
   - Each iteration: LLM requests context → symbol resolution → feed back
   - Termination: no new context, same symbols two iterations in a row, budget limit, or escalating cost
   - Findings with confidence ≥ threshold collected via responseToFinding()
   - Checkpoint updated per file; budget checked per iteration
5. **Generate Reports** — SARIF, JSON, Markdown, HTML, CSV, cost summary; finalize checkpoint; cleanup cloned repos; disconnect MCP

## Known Limitations vs Python

- Symbol finder is regex-based (no Jedi AST) — no type inference, no import resolution
- Conversation history is simulated via prompt context blocks, not true multi-turn API
- No CLI entry point yet (uses VoltAgent HTTP server)
- Cost tracking estimates tokens from character count (VoltAgent doesn't expose raw usage)
