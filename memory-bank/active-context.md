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

- VoltAgent docs misleadingly say andAll 'merges results into one object' — it actually returns a tuple
- VoltAgent chain.run() does NOT validate input against Zod schema at runtime — CLI adds explicit validation

## Next Steps

- Test end-to-end with actual Python repository
- Consider adding streaming progress output to CLI (using workflow.stream())
- Push to main branch

## Current Session Notes

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

- All 56 E2E tests passing
- Build clean (0 errors, 194.54 KB)
- Workflow bugs fixed (andAll tuple handling, workflowState persistence)
- Ready to push to main
