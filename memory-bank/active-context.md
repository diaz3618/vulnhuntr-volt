# Active Context — vulnhuntr-volt

## Current State (2026-02-07)

Phase 7 complete: Added CLI entry point for direct command-line usage. The workflow can now be triggered via:

1. CLI: `npm run scan -- -r /path/to/repo` or `npm run scan -- -r https://github.com/owner/repo`
2. REST API: `POST /workflows/vulnhuntr-analysis/execute`
3. Programmatic: `vulnhuntrWorkflow.run(input)`

Build passes with both CLI and server entry points (601.76 KB total, 88ms).

## What Was Just Completed

**CLI Entry Point & Documentation** — Created `src/cli.ts` (240 lines):

### New Features

1. **CLI Tool** (`src/cli.ts`):
   - Full argparse-style CLI matching original vulnhuntr interface
   - Options: `-r/--root`, `-a/--analyze`, `-l/--llm`, `-m/--model`, `-b/--budget`, `-c/--confidence`, `-i/--iterations`, `-v/--vuln`
   - Runtime Zod validation of input before execution
   - API key validation with helpful error messages
   - Pretty-printed results with findings summary

2. **Package.json Updates**:
   - Added `npm run scan` and `npm run vulnhuntr` scripts
   - Added `npm run dev:server` and `npm run start:server` for server mode
   - Added `bin` field for global installation

3. **tsdown.config.ts Update**:
   - Now builds both `src/index.ts` (server) and `src/cli.ts` (CLI)

4. **README Documentation**:
   - Comprehensive CLI usage section with examples
   - REST API usage with curl examples
   - Streaming endpoint documentation
   - Updated input schema documentation

### CLI vs Original vulnhuntr

| Feature | Original (Python) | VoltAgent Version |
|---------|------------------|-------------------|
| Entry point | `vulnhuntr -r` | `npm run scan -- -r` |
| GitHub support | Local only | GitHub URLs + Local |
| LLM providers | claude, gpt, ollama | anthropic, openai, ollama |
| Output formats | JSON, logs | SARIF, JSON, MD, HTML, CSV |
| Cost tracking | None | Per-file, total budget |
| Checkpoint | None | Resume interrupted scans |

## Known Issues

- Rate limiting on Anthropic API can skip files during scan (handled gracefully)
- Only 2 of originally planned 5 MCP servers exist on npm
## Next Steps

- Consider adding retry with backoff for rate-limited API calls
- Add more MCP servers as real packages become available (e.g. tree-sitter-mcp when published)
- Consider adding parallel file analysis (concurrency > 1) with rate limit awareness
- Add integration tests with mock LLM server
## Current Session Notes

- [3:39:45 AM] [Unknown User] Decision Made: Remove 3 non-existent MCP server packages
- [3:39:37 AM] [Unknown User] Decision Made: Keep andThen + dynamic Agent instead of andAgent for README summarization
- [3:39:29 AM] [Unknown User] Fixed bugs and verified end-to-end workflow (Claude Code): Claude Code comprehensive audit and fix session:

1. **Fixed LFI bypass missing comma** (src/prompts/index.ts): Split "C:\\win.ini/?../../../../../../../etc/passwd" into two separate entries. Bug existed in original Python too.

2. **Fixed isGitHubPath false positive** (src/tools/github.ts): Relative paths like "repos/vulnhuntr" were being treated as GitHub owner/repo shorthand. Added fs.existsSync check to distinguish local paths.

3. **Fixed relative path issue** (src/workflows/vulnhuntr.ts): localPath now resolved to absolute with path.resolve() so MCP servers get correct scoped paths.

4. **Wired MCP tools to analysis Agents** (src/llm/index.ts, src/workflows/vulnhuntr.ts): Added optional tools parameter to LLMSession and createAnalysisSession(). MCP tools from filesystem and ripgrep servers are now passed to analysis Agent instances.

5. **Removed non-existent MCP packages** (src/mcp/index.ts): Removed tree-sitter (mcp-server-tree-sitter: 404), process (@anonx3247/process-mcp: broken), codeql (codeql-mcp: 404). These were hallucinated by Copilot. Kept filesystem (14 tools) and ripgrep (5 tools) which work.

6. **End-to-end test PASSED**: `npm run scan -- -r repos/vulnhuntr -c 3 -i 2` successfully analyzed 3 Python files, found 2 findings (SSRF, RCE in LLMs.py), generated all 6 report formats (JSON, SARIF, MD, HTML, CSV, cost).

7. **Created internal/guide.md**: Comprehensive project guide covering architecture, how to run, MCP servers, analysis pipeline, configuration, troubleshooting.

All 56 tests pass. TypeScript compiles clean. Build succeeds.
- [3:10:19 AM] [Unknown User] Decision Made: Claude Code comprehensive audit and fix plan
- [8:20:22 PM] [Unknown User] Verified memory-bank-mcp connection: Properly connected memory-bank-mcp to the existing memory bank folder. The MCP server required explicit initialization (`initialize_memory_bank`) and mode switch (`switch_mode code`) to recognize the existing files. All 5 core files are present and complete. Status: isComplete=true, mode=code.
- [2:18:01 AM] [Unknown User] Decision Made: vitest v4 constructor mock pattern
- [2:17:53 AM] [Unknown User] Decision Made: andAll returns tuple, not merged object
- [2:17:45 AM] [Unknown User] Fixed workflow bugs and created comprehensive test suite: Major accomplishments in this session:

1. **Fixed andAll data flow bugs in vulnhuntr.ts** (critical production bug):
   - VoltAgent's `andAll` returns a tuple (array), not a merged flat object
   - `prepare-analysis` step was accessing `data.files_to_analyze` and `data.readme_summary` directly from the andAll tuple — now properly destructures `[discoverResult, readmeResult]`
   - Moved `_resume_data` to workflowState so it survives the andAll boundary
   - Fixed `log-reports` to iterate over the report tuple from the second andAll
   - Fixed `andWhen(cleanup)` to check `workflowState.isCloned` instead of lost `data.is_cloned`
   - Added `resumeData` field to VulnHuntrState interface

2. **Fixed constructor mock patterns in tests**:
   - vitest v4 calls `new implementation()` on mockImplementation — arrow functions can't be used with `new`
   - Changed all constructor mocks (CostTracker, BudgetEnforcer, AnalysisCheckpoint) to use regular functions
   - Added partial mock of `@voltagent/core` to mock `Agent` class while keeping `createWorkflowChain` real

3. **Created comprehensive E2E test suite** (56 tests, all passing):
   - Tests cover: chain construction, registration, hooks, execution, findings, GitHub clone, budget enforcement, checkpoint resume, multi-iteration analysis, error resilience, input validation, WorkflowState persistence, result schema, execution metadata, provider configuration, single file analysis, vuln type filtering, edge cases
   - Test configuration: vitest with regex alias for .js→.ts resolution

4. **Build verified**: 0 errors, 194.54 KB, 83ms

## Ongoing Tasks

- All planned fixes complete and verified
- End-to-end test passed with real repo scan
- All 56 unit tests pass
- Internal guide created at internal/guide.md
