# System Patterns — vulnhuntr-volt

## Architecture Patterns

### VoltAgent Workflow Chain
The core pattern used throughout the project. Each step receives the accumulated state from prior steps:
```typescript
const workflow = createWorkflowChain("name", step1)
  .andThen(step2)
  .andThen(step3)
  .andThen(step4)
  .andThen(step5);
```
Step handler signature: `async (state: WorkflowState, agent: Agent) => result`

### Flexible Workflow State Access
VoltAgent's `WorkflowState` doesn't type the `.data` accumulator. We use:
```typescript
const localPath = (data as any).local_path;
const model = (data as any).model;
```
This is the recommended pattern until VoltAgent adds generics for workflow data.

### Provider/Model String Format
Models are specified as `"provider/model-name"` and split at the first `/`:
```typescript
const [provider, ...rest] = model.split("/");
const modelName = rest.join("/");
```

### MCPConfiguration Initialization
```typescript
const mcpConfig = new MCPConfiguration({
  servers: {
    "server-name": {
      type: "stdio",
      command: "npx",
      args: ["-y", "package-name"],
      env: { KEY: "value" },
      timeout: 10000,
    },
  },
});
await mcpConfig.getTools(); // materializes connections
```

## Code Patterns

### Claude JSON Prefill
Appends a partial JSON string as an assistant message to bias the model toward structured output:
```typescript
const prefill = '{"scratchpad": "1.';
// If response doesn't start with '{', reconstruct: prefill + response
```
The Python vulnhuntr uses this technique to force Claude into JSON mode without a `json_object` response format.

### JSON Fixing Pipeline (fixJsonResponse)
Handles common LLM JSON output issues in sequence:
1. Strip markdown code fences (\`\`\`json ... \`\`\`)
2. Extract first `{...}` block from wrapped text
3. Fix Python-style literals (`True` → `true`, `False` → `false`, `None` → `null`)
4. Fix invalid escape sequences
5. `JSON.parse()` with error context

### LLMSession Conversation Pattern
Simulates multi-turn conversation via prompt context blocks:
```typescript
class LLMSession {
  private history: { role: string; content: string }[] = [];
  async chat(message: string, options?: Partial<CallSettings>): Promise<string> {
    // Builds prompt with history context, sends to agent, tracks cost
  }
}
```
Each `chat()` call includes all prior exchanges as `<previous_analysis>` blocks in the prompt.

### Config Merge Pattern
```
CLI input (snake_case) → mergeConfigWithInput(fileConfig, input) → VulnhuntrConfig (camelCase)
```
Config files found via recursive upward search + `~/.vulnhuntr.yaml` fallback. Supports YAML, JSON, and key=value format. CLI/input values override file values.

### Checkpoint Lifecycle
```
start(repo, files, model, costTracker)
  → per file: setCurrentFile() → markFileComplete()
  → periodic auto-save (every N files)
  → SIGINT handler → save()
  → finalize(success)
```
Atomic writes via temp file + rename. Resume loads checkpoint data and skips completed files.

### BudgetEnforcer Heuristic
```typescript
shouldContinueIteration(filePath, iteration, iterationCost, totalCost) → boolean
```
Checks: (1) total budget remaining, (2) file budget = total / remaining files, (3) escalating cost = current iteration > 2× average of prior iterations for same file.

### Tool Schema Pattern
All VoltAgent tools follow:
```typescript
createTool({
  name: "tool_name",
  description: "...",
  parameters: z.object({ ... }),
  execute: async (params) => { ... },
});
```

### Reporter Sorting Convention
All report formats sort findings by:
1. Severity (CRITICAL → INFO, descending via SEVERITY_SCORES)
2. Confidence (descending)

### Enriched Finding Model (responseToFinding)
Converts raw LLM response + metadata into a full Finding:
```typescript
{
  rule_id, title, file_path, start_line, end_line, description, analysis,
  scratchpad, poc, confidence, severity, vuln_type, cwe, cwe_name,
  context_code, metadata: { discovered_at, model, iteration, raw_response }
}
```

## API Constraints (Critical)

| Constraint | Correct | Wrong |
|------------|---------|-------|
| CallSettings token limit | `maxOutputTokens` | `maxTokens` |
| WorkflowState step reference | `state.active` | `state.stepId` |
| CostTracker.getSummary() return | `Record<string, unknown>` (keys: `total_cost_usd`, etc.) | typed object |
| BudgetEnforcer.check() params | `(currentCost: number, fileCost?: number)` | `(costTracker)` |
| checkpoint.start() params | `(repoPath, files, model, costTracker?)` | `(repoPath, files)` |

## File Organization
```
src/
├── index.ts              # Entry point + VoltAgent server
├── schemas/index.ts      # Types, enums, Zod schemas
├── prompts/index.ts      # All vulnerability prompt templates
├── workflows/
│   ├── index.ts          # Re-export barrel
│   └── vulnhuntr.ts      # 5-step workflow chain
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

## Documentation Patterns
- Memory bank files in `.memory-bank/` via memory-bank-mcp
- Agent delegation via `.agents/AGENT.md` + `.agents/sub-agents/`
- Skills in `.agents/skills/` for VoltAgent documentation lookup
- Original vulnhuntr docs preserved in `repos/vulnhuntr/docs/`
