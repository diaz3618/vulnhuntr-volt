# Active Context — vulnhuntr-volt

## Current State (2026-02-07)
Phase 6 complete: the workflow has been refactored from a simple 5-step sequential `andThen` chain to an idiomatic VoltAgent workflow leveraging the full Chain API. Build passes (0 errors, 194.30 KB, 102ms).

## What Was Just Completed
**VoltAgent Best Practices Refactoring** — Complete rewrite of `src/workflows/vulnhuntr.ts` (952 lines):

### Research (VoltAgent Docs + GitHub)
- Read all 14 bundled workflow docs from `node_modules/@voltagent/core/docs/workflows/`
- Read 3 skill files (best-practices, docs-bundle, create-voltagent)
- Studied GitHub workflow examples (`with-workflow-chain/src/index.ts`)
- Identified 12 anti-patterns in the previous implementation

### Anti-patterns Fixed
1. **All `andThen`** → now uses `andThen`, `andAll`, `andForEach`, `andWhen`, `andTap`
2. **Monolithic 300-line analyze step** → extracted `analyzeFile()` standalone function
3. **No `andAll` parallelism** → parallel file discovery + README, parallel report gen (6 formats)
4. **No `andForEach`** → per-file analysis with `items` selector, `map`, `concurrency: 1`
5. **No `workflowState`** → `VulnHuntrState` interface, `setWorkflowState`/`workflowState` throughout
6. **`(data as any)` casts** → eliminated via workflowState for services, clean data returns
7. **`_`-prefixed internal data keys** → services live in workflowState, not data flow
8. **No `andTap` for logging** → 5 andTap steps at phase boundaries
9. **No `andWhen` for conditionals** → conditional clone cleanup
10. **No comprehensive hooks** → onStart, onStepStart, onStepEnd, onError, onFinish
11. **No retry policies** → `retryConfig` workflow-wide + `retries: 2` on setup-repo
12. **No `getStepData`** → used in finalize to recover collect-findings data

### New Architecture
```
setup-repo → andTap → andAll(discover-files + summarize-readme) → prepare-analysis
→ andTap → andForEach(analyze-files) → collect-findings → andTap
→ andAll(6 report writers) → andTap → andWhen(cleanup-cloned) → finalize → andTap
```

## Known Issues
- MCP servers require npx at runtime (graceful degradation if unavailable)
- Symbol finder is regex-based (no Jedi AST)
- No unit tests yet for modules
- No CLI entry point (uses VoltAgent server API)
- `workflowState` typing relies on `as VulnHuntrState` casts (VoltAgent doesn't support generics for state yet)
- `andWhen` condition function: `workflowState` availability unconfirmed — using `data.is_cloned` as fallback
- `getStepData` availability inside `andForEach` inner steps unconfirmed — not relied upon there

## Next Steps
- Runtime test with an actual Python repository
- Write unit tests for new modules (cost-tracker, config, checkpoint, llm, reporters)
- Verify workflowState/getStepData behavior in forEach inner steps at runtime
- Consider adding a CLI runner for direct invocation
- Consider `andGuardrail` for input validation and `andSleep` for rate limiting
