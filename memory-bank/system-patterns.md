# System Patterns — vulnhuntr-volt

## Architecture Patterns

### VoltAgent Workflow Chain (Idiomatic — Phase 6)
The workflow uses VoltAgent's full Chain API with multiple step types:

```typescript
const workflow = createWorkflowChain({ id, name, purpose, input, result, retryConfig, hooks })
  .andThen({ id: "setup-repo", retries: 2 })       // Init + services → workflowState
  .andTap({ id: "log-setup" })                       // Logging side-effect
  .andAll({ id: "discover-and-summarize", steps: [   // PARALLEL
    andThen({ id: "discover-files" }),                //   File scanning
    andThen({ id: "summarize-readme" }),              //   AI README analysis
  ]})
  .andThen({ id: "prepare-analysis" })               // Bridge data → workflowState
  .andTap({ id: "log-discovery" })                    // Logging side-effect
  .andForEach({ id: "analyze-files",                  // PER-FILE ITERATION
    items: ({data}) => data.files_to_analyze,
    map: (_ctx, file, index) => ({file, index}),
    concurrency: 1,
    step: andThen({ id: "analyze-single-file" }),
  })
  .andThen({ id: "collect-findings" })               // Flatten + build summary
  .andTap({ id: "log-findings" })                    // Logging side-effect
  .andAll({ id: "generate-reports", steps: [          // PARALLEL (6 formats)
    andThen({ id: "write-json-report" }),
    andThen({ id: "write-sarif-report" }),
    andThen({ id: "write-markdown-report" }),
    andThen({ id: "write-html-report" }),
    andThen({ id: "write-csv-report" }),
    andThen({ id: "write-cost-report" }),
  ]})
  .andTap({ id: "log-reports" })                     // Logging side-effect
  .andWhen({ id: "cleanup-cloned-repo", ... })        // CONDITIONAL
  .andThen({ id: "finalize" })                        // Return WorkflowResult
  .andTap({ id: "log-summary" });                     // Final summary
```

### workflowState Pattern
Mutable services and cross-step context stored in `workflowState` (persists through andForEach boundary):

```typescript
interface VulnHuntrState {
  costTracker: CostTracker;       // Mutable service
  budgetEnforcer: BudgetEnforcer; // Mutable service
  checkpoint: AnalysisCheckpoint; // Mutable service
  mcpTools: Tool<any>[];          // Infrastructure
  mcpConfig: MCPConfiguration;    // Infrastructure
  modelStr: string;               // Config (derived from input)
  systemPrompt: string;           // Config (built from README)
  maxIterations: number;          // Config
  minConfidence: number;          // Config
  requestedVulnTypes: string[];   // Config
  localPath: string;              // Context (survives forEach reset)
  isCloned: boolean;              // Context
  allFiles: string[];             // Context
  reportsDir: string;             // Reporting
  timestamp: string;              // Reporting
}
```

**Why workflowState?** After `andForEach`, the accumulated data is REPLACED by an array of step results. Any context from previous steps is lost from the data flow. `workflowState` persists across ALL step types.

**Initialization:** `setWorkflowState(() => ({...}))` in setup-repo step.
**Access:** `const ws = workflowState as VulnHuntrState` in subsequent steps.
**Mutation:** Service objects (CostTracker, etc.) are mutated in-place via their methods.

### Data Flow Rules (VoltAgent)
| After Step Type | Data Becomes |
|-----------------|-------------|
| `andThen` | `{...previousData, ...stepOutput}` (merged) |
| `andAll` | `{...previousData, ...mergedParallelOutputs}` (merged) |
| `andForEach` | `stepResults[]` (REPLACES previous data!) |
| `andTap` | Unchanged (side-effect only) |
| `andWhen(true)` | `{...previousData, ...stepOutput}` |
| `andWhen(false)` | Unchanged (step skipped) |

### getStepData Pattern
Used in `finalize` to recover data from `collect-findings` after `andAll` and `andWhen` may have modified the data shape:
```typescript
const collected = getStepData?.("collect-findings")?.output;
const d = (collected ?? data) as any;
```

### Provider/Model String Format
Models specified as `"provider/model-name"`:
```typescript
const defaults = { anthropic: "anthropic/claude-sonnet-4-20250514", ... };
```

### MCPConfiguration Initialization
```typescript
const mcpConfig = new MCPConfiguration({
  servers: { "server-name": { type: "stdio", command: "npx", args: [...] } }
});
```

## Code Patterns

### Extracted analyzeFile Function
Per-file analysis logic extracted from the workflow step for clean `andForEach` body:
```typescript
async function analyzeFile(relativeFilePath: string, ws: VulnHuntrState): Promise<Finding[]>
```
- Creates fresh LLMSession per file (history is per-file, cleared between files)
- Phase 1: Initial analysis → vuln types
- Phase 2: Per-vuln-type iterative secondary analysis
- Budget gate + escalating-cost detection + same-context convergence
- Returns findings above confidence threshold

### Claude JSON Prefill
Appends partial JSON as assistant message to bias model toward structured output:
```typescript
const prefill = '{"scratchpad": "1.';
```

### JSON Fixing Pipeline (fixJsonResponse)
1. Strip markdown code fences  2. Extract first `{...}` block  3. Fix Python literals  4. Fix invalid escapes  5. `JSON.parse()`

### andTap Logging Pattern
Side-effect-only steps for observability at phase boundaries:
```typescript
.andTap({ id: "log-discovery", execute: ({data}) => { console.log(`Found ${data.all_files.length} files`); } })
```
Errors in andTap are caught — workflow continues.

### Parallel Report Generation
Six report formats written concurrently via `andAll`. Each step:
1. Reads findings from data flow
2. Reads paths from workflowState
3. Writes file (side effect)
4. Returns `{ format_report: path }` for logging

### Conditional Clone Cleanup
```typescript
.andWhen({
  id: "cleanup-cloned-repo",
  condition: ({data}) => data.is_cloned === true,
  step: andThen({ ... })  // Copy reports to CWD, rm temp dir
})
```

### Config Merge Pattern
```
CLI input (snake_case) → mergeConfigWithInput(fileConfig, input) → VulnhuntrConfig (camelCase)
```

### Checkpoint Lifecycle
```
start(repo, files, model, costTracker) → per file: setCurrentFile() → markFileComplete()
→ periodic auto-save → SIGINT handler → finalize()
```

### BudgetEnforcer Heuristic
Checks: total budget, per-file budget (total/remaining), escalating cost (>2× average prior).

## API Constraints (Critical)

| Constraint | Correct | Wrong |
|------------|---------|-------|
| CallSettings token limit | `maxOutputTokens` | `maxTokens` |
| WorkflowState step reference | `state.active` | `state.stepId` |
| andForEach data reset | Data becomes array of results | Data is merged |
| workflowState in hooks | `(info as any).state?.workflowState` | `info.workflowState` |
| andWhen condition params | `({data})` confirmed | `({workflowState})` unconfirmed |
| setWorkflowState | `setWorkflowState((prev) => ({...prev, key}))` | Direct mutation |

## File Organization
```
src/
├── index.ts              # Entry point + VoltAgent server
├── schemas/index.ts      # Types, enums, Zod schemas
├── prompts/index.ts      # All vulnerability prompt templates
├── workflows/
│   ├── index.ts          # Re-export barrel
│   └── vulnhuntr.ts      # Multi-step workflow chain (VoltAgent idiomatic)
├── tools/
│   ├── index.ts          # Tool barrel (8 tools)
│   ├── repo.ts           # File discovery + patterns
│   ├── github.ts         # Clone/URL/cleanup
│   └── symbol-finder.ts  # Regex symbol resolution
├── reporters/index.ts    # SARIF, JSON, MD, HTML, CSV
├── llm/index.ts          # LLMSession, prefill, JSON fixing
├── cost-tracker/index.ts # CostTracker, BudgetEnforcer, pricing
├── config/index.ts       # YAML config loading
├── checkpoint/index.ts   # Checkpoint/resume
├── integrations/
│   ├── github-issues.ts  # GitHub issue creation
│   └── webhook.ts        # Webhook notifications
└── mcp/index.ts          # MCP server configurations
```
