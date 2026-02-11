/**
 * VulnHuntr VoltAgent Workflow
 * ============================
 * Idiomatic VoltAgent workflow leveraging the full Chain API for
 * LLM-powered Python vulnerability analysis.
 *
 * Architecture:
 *   ┌───────────────┐
 *   │  setup-repo   │  Clone/validate, init services → workflowState
 *   └────────┬──────┘
 *            ▼
 *   ┌──────────────────────────┐
 *   │  discover-and-summarize  │  andAll: parallel file scan + README AI
 *   │  ├─ discover-files       │
 *   │  └─ summarize-readme     │
 *   └────────┬─────────────────┘
 *            ▼
 *   ┌──────────────────┐
 *   │ prepare-analysis │  Store analysis context in workflowState
 *   └────────┬─────────┘
 *            ▼
 *   ┌───────────────────┐
 *   │   analyze-files   │  andForEach: per-file Phase 1→2 analysis
 *   │   └─ analyze-file │
 *   └────────┬──────────┘
 *            ▼
 *   ┌──────────────────┐
 *   │ collect-findings │  Flatten results, build summary
 *   └────────┬─────────┘
 *            ▼
 *   ┌──────────────────────┐
 *   │   generate-reports   │  andAll: parallel report writing
 *   │   ├─ write-json      │
 *   │   ├─ write-sarif     │
 *   │   ├─ write-markdown  │
 *   │   ├─ write-html      │
 *   │   ├─ write-csv       │
 *   │   └─ write-cost      │
 *   └──────────┬───────────┘
 *              ▼
 *   ┌───────────────────────────┐
 *   │    cleanup-and-finalize   │  andWhen(cloned → cleanup), disconnect MCP
 *   └───────────────────────────┘
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Agent, andAll, andThen, createWorkflowChain } from "@voltagent/core";

import {
  type Finding,
  type Response,
  ResponseSchema,
  WorkflowInputSchema,
  type WorkflowResult,
  WorkflowResultSchema,
  responseToFinding,
} from "../schemas/index.js";

import {
  VULN_SPECIFIC_BYPASSES_AND_PROMPTS,
  buildInitialPrompt,
  buildReadmeSummaryPrompt,
  buildSecondaryPrompt,
  buildSystemPrompt,
} from "../prompts/index.js";

import type { MCPConfiguration, Tool, ToolSchema } from "@voltagent/core";
import {
  AnalysisCheckpoint,
  type CheckpointData,
} from "../checkpoint/index.js";
import { loadConfig, mergeConfigWithInput } from "../config/index.js";
import { BudgetEnforcer, CostTracker } from "../cost-tracker/index.js";
import {
  type LLMSession,
  createAnalysisSession,
  fixJsonResponse,
} from "../llm/index.js";
import { type MCPServerKey, disconnectMCP, getMCPTools } from "../mcp/index.js";
import {
  generateCsvReport,
  generateHtmlReport,
  generateJsonReport,
  generateMarkdownReport,
  generateSarifReport,
} from "../reporters/index.js";
import { cloneRepo, isGitHubPath, parseGitHubUrl } from "../tools/github.js";
import {
  getPythonFiles,
  getReadmeContent,
  isNetworkRelated,
} from "../tools/repo.js";
import { extractSymbol } from "../tools/symbol-finder.js";

// ---------------------------------------------------------------------------
// Shared Workflow State
// ---------------------------------------------------------------------------
// workflowState holds mutable services and cross-step context that persists
// across the entire workflow run — including through andForEach boundaries
// where the data flow is replaced by an array of results.
// ---------------------------------------------------------------------------

interface VulnHuntrState {
  // Services
  costTracker: CostTracker;
  budgetEnforcer: BudgetEnforcer;
  checkpoint: AnalysisCheckpoint;
  mcpTools: Tool<ToolSchema>[];
  mcpConfig: MCPConfiguration<MCPServerKey> | null;

  // Analysis configuration (derived from input + config file)
  modelStr: string;
  systemPrompt: string;
  maxIterations: number;
  minConfidence: number;
  requestedVulnTypes: string[];

  // Repository context
  localPath: string;
  isCloned: boolean;
  allFiles: string[];

  // Reporting
  reportsDir: string;
  timestamp: string;

  // Checkpoint resume data (survives andAll boundary)
  resumeData: CheckpointData | null;
}

// ---------------------------------------------------------------------------
// Response format schema string (embedded in LLM prompts)
// ---------------------------------------------------------------------------

const RESPONSE_FORMAT_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      scratchpad: {
        type: "string",
        description: "Step-by-step analysis reasoning",
      },
      analysis: { type: "string", description: "Final analysis summary" },
      poc: {
        type: "string",
        nullable: true,
        description: "Proof-of-concept exploit",
      },
      confidence_score: {
        type: "integer",
        minimum: 0,
        maximum: 10,
        description: "Confidence score 0-10",
      },
      vulnerability_types: {
        type: "array",
        items: {
          type: "string",
          enum: ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"],
        },
      },
      context_code: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            reason: { type: "string" },
            code_line: { type: "string" },
          },
        },
      },
    },
    required: [
      "scratchpad",
      "analysis",
      "confidence_score",
      "vulnerability_types",
      "context_code",
    ],
  },
  null,
  2,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveModel(provider: string, model?: string): string {
  const defaults: Record<string, string> = {
    anthropic: "anthropic/claude-sonnet-4-20250514",
    openai: "openai/gpt-4o",
    ollama: "ollama/llama3.2",
  };
  if (model) return `${provider}/${model}`;
  return defaults[provider] ?? defaults.anthropic;
}

function parseLLMResponse(text: string): Response {
  const cleaned = fixJsonResponse(text);
  try {
    return ResponseSchema.parse(JSON.parse(cleaned));
  } catch {
    return {
      scratchpad: text,
      analysis: "Failed to parse structured response",
      poc: null,
      confidence_score: 0,
      vulnerability_types: [],
      context_code: [],
    };
  }
}

function extractBetweenTags(tag: string, text: string): string {
  const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, "s");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

// ---------------------------------------------------------------------------
// Per-file analysis function
// ---------------------------------------------------------------------------
// Extracted from the workflow step so the forEach body stays clean.
// Runs Phase 1 (initial analysis for all 7 vuln types) and Phase 2
// (iterative secondary analysis per discovered vuln type).
// ---------------------------------------------------------------------------

async function analyzeFile(
  relativeFilePath: string,
  ws: VulnHuntrState,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Budget gate
  if (
    !ws.budgetEnforcer.check(
      ws.costTracker.totalCost,
      ws.costTracker.getFileCost(relativeFilePath),
    )
  ) {
    console.warn(`   ⚠️  Budget limit reached. Skipping ${relativeFilePath}.`);
    return findings;
  }

  // Read source
  const fullPath = path.resolve(ws.localPath, relativeFilePath);
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(fullPath, "utf-8");
  } catch {
    console.warn(`   ⚠️  Could not read ${relativeFilePath}, skipping`);
    return findings;
  }

  // Update checkpoint
  ws.checkpoint.setCurrentFile(relativeFilePath);

  // Create a fresh LLM session per file (conversation history is per-file)
  // MCP tools (filesystem, ripgrep, tree-sitter, etc.) are passed through
  // so the LLM agent can optionally use them for deeper code exploration.
  const session: LLMSession = createAnalysisSession(
    ws.systemPrompt,
    ws.modelStr,
    ws.costTracker,
    ws.mcpTools,
  );
  session.setContext(relativeFilePath, "initial");

  // =====================================================================
  // Phase 1: Initial Analysis
  // =====================================================================
  const initialPrompt = buildInitialPrompt(
    relativeFilePath,
    fileContent,
    RESPONSE_FORMAT_SCHEMA,
  );

  let initialReport: Response;
  try {
    const responseText = await session.chat(initialPrompt, 8192);
    initialReport = parseLLMResponse(responseText);
  } catch (error) {
    console.warn(
      `   ⚠️  Initial analysis failed for ${relativeFilePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    ws.checkpoint.markFileComplete(relativeFilePath);
    return findings;
  }

  const vulnTypes = initialReport.vulnerability_types;
  if (vulnTypes.length === 0) {
    console.log("   ✓ No potential vulnerabilities found");
    ws.checkpoint.markFileComplete(relativeFilePath);
    return findings;
  }

  console.log(`   🔎 Potential vulns: ${vulnTypes.join(", ")}`);

  // =====================================================================
  // Phase 2: Secondary Analysis (per vuln type)
  // =====================================================================
  for (const vulnType of vulnTypes) {
    // Filter to requested vuln types
    if (
      ws.requestedVulnTypes.length > 0 &&
      !ws.requestedVulnTypes.includes(vulnType)
    )
      continue;
    if (!VULN_SPECIFIC_BYPASSES_AND_PROMPTS[vulnType]) {
      console.warn(`   ⚠️  Unknown vuln type: ${vulnType}`);
      continue;
    }

    session.setContext(relativeFilePath, `secondary-${vulnType}`);

    let currentReport: Response = initialReport;
    let previousAnalysisJson = JSON.stringify(initialReport);
    let lastContextCount = -1;
    let prevContextNames: string[] = [];
    const codeDefinitions: Array<{
      name: string;
      contextNameRequested: string;
      filePath: string;
      source: string;
    }> = [];

    for (let iteration = 0; iteration < ws.maxIterations; iteration++) {
      // Budget gate per iteration
      if (!ws.budgetEnforcer.check(ws.costTracker.totalCost)) {
        console.warn("   ⚠️  Budget limit reached during secondary analysis.");
        break;
      }

      // Escalating cost detection
      const iterCost = ws.costTracker.getFileCost(relativeFilePath);
      if (
        !ws.budgetEnforcer.shouldContinueIteration(
          relativeFilePath,
          iteration,
          iterCost,
          ws.costTracker.totalCost,
        )
      ) {
        break;
      }

      // Resolve new context symbols (skip iteration 0 — uses initial report)
      if (iteration > 0 && currentReport.context_code.length > 0) {
        const currentContextNames = currentReport.context_code
          .map((c) => c.name)
          .sort();

        // Terminate if same symbols requested twice in a row
        if (
          currentReport.context_code.length === lastContextCount ||
          JSON.stringify(currentContextNames) ===
            JSON.stringify(prevContextNames)
        ) {
          break;
        }
        lastContextCount = currentReport.context_code.length;
        prevContextNames = currentContextNames;

        for (const ctx of currentReport.context_code) {
          const result = extractSymbol(
            ctx.name,
            ctx.code_line,
            ws.allFiles,
            ws.localPath,
          );
          if (result) codeDefinitions.push(result);
        }
      } else if (iteration > 0 && currentReport.context_code.length === 0) {
        break; // No more context requested
      }

      // Build & send secondary prompt
      const secondaryPrompt = buildSecondaryPrompt(
        relativeFilePath,
        fileContent,
        codeDefinitions,
        vulnType,
        previousAnalysisJson,
        RESPONSE_FORMAT_SCHEMA,
      );

      try {
        const responseText = await session.chat(secondaryPrompt, 8192);
        currentReport = parseLLMResponse(responseText);
        previousAnalysisJson = JSON.stringify(currentReport);
      } catch (error) {
        console.warn(
          `   ⚠️  Secondary iteration ${iteration + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }
    }

    // Collect finding if above confidence threshold
    if (currentReport.confidence_score >= ws.minConfidence) {
      const finding = responseToFinding(
        currentReport,
        relativeFilePath,
        vulnType,
      );
      findings.push(finding);
      console.log(
        `   🚨 ${vulnType} finding (confidence: ${currentReport.confidence_score}/10, severity: ${finding.severity})`,
      );
    }
  }

  ws.checkpoint.markFileComplete(relativeFilePath);
  return findings;
}

// ---------------------------------------------------------------------------
// Report-writing helper (reduces duplication in the parallel andAll)
// ---------------------------------------------------------------------------

function buildResultForReport(data: unknown): WorkflowResult {
  const d = data as Record<string, unknown>;
  return {
    findings: (d.findings as Finding[]) ?? [],
    files_analyzed: (d.files_analyzed as string[]) ?? [],
    total_cost_usd: (d.total_cost_usd as number) ?? 0,
    summary: (d.summary as WorkflowResult["summary"]) ?? {
      total_files: 0,
      total_findings: 0,
      by_vuln_type: {},
      by_confidence: {},
    },
  };
}

// ---------------------------------------------------------------------------
// The Workflow
// ---------------------------------------------------------------------------

export const vulnhuntrWorkflow = createWorkflowChain({
  id: "vulnhuntr-analysis",
  name: "VulnHuntr Security Analysis",
  purpose:
    "Analyze a Python repository for remotely exploitable vulnerabilities using " +
    "LLM-powered static analysis. Supports 7 vulnerability types: LFI, RCE, " +
    "SSRF, AFO, SQLI, XSS, IDOR.",

  input: WorkflowInputSchema,
  result: WorkflowResultSchema,

  // Workflow-wide retry policy (individual steps can override with retries: N)
  retryConfig: { attempts: 1, delayMs: 1000 },

  // ─── Lifecycle Hooks ────────────────────────────────────────────────
  hooks: {
    onStart: async (state) => {
      console.log("\n🛡️  VulnHuntr Analysis Started");
      console.log(`   Repository: ${state.data.repo_path}`);
      console.log(`   Provider:   ${state.data.provider}`);
      if (state.data.model) console.log(`   Model:      ${state.data.model}`);
      console.log(`   Execution:  ${state.executionId}`);
    },

    onStepStart: async (state) => {
      const idx = state.active;
      if (idx != null) console.log(`\n   → step ${idx}`);
    },

    onStepEnd: async (state) => {
      const idx = state.active;
      if (idx != null) console.log(`   ← step ${idx} done`);
    },

    onError: async (info) => {
      console.error(`\n❌ Workflow error: ${info.error}`);
      // Best-effort: save checkpoint on error
      try {
        const ws = info.state?.workflowState as unknown as
          | VulnHuntrState
          | undefined;
        if (ws?.checkpoint) ws.checkpoint.save();
      } catch {
        /* best-effort */
      }
    },

    onFinish: async (info) => {
      if (info.status === "completed") {
        console.log("\n✅ Analysis completed successfully");
      } else if (info.status === "error") {
        console.error(`\n❌ Analysis failed: ${info.error}`);
      } else if (info.status === "cancelled") {
        console.log("\n⛔ Analysis was cancelled");
      } else if (info.status === "suspended") {
        console.log("\n⏸️  Analysis suspended");
      }
    },
  },
})
  // =====================================================================
  // Step 1: Repository Setup
  // Clone GitHub repos, validate paths, load config, init services.
  // All mutable services go into workflowState — NOT the data flow.
  // =====================================================================
  .andThen({
    id: "setup-repo",
    retries: 2, // Network clone can be flaky
    execute: async ({ data, setWorkflowState }) => {
      let localPath = path.resolve(data.repo_path);
      let isCloned = false;
      let owner = "";
      let repo = "";

      // Clone GitHub repos
      if (isGitHubPath(data.repo_path)) {
        const parsed = parseGitHubUrl(data.repo_path);
        if (!parsed) throw new Error(`Invalid GitHub URL: ${data.repo_path}`);

        owner = parsed.owner;
        repo = parsed.repo;

        const tmpDir = path.join(
          (await import("node:os")).tmpdir(),
          `vulnhuntr-${owner}-${repo}-${Date.now()}`,
        );
        console.log(`   Cloning ${owner}/${repo}...`);
        cloneRepo(parsed.fullUrl, tmpDir, true);
        localPath = tmpDir;
        isCloned = true;
        console.log(`   Cloned to ${tmpDir}`);
      }

      if (!fs.existsSync(localPath)) {
        throw new Error(`Repository path does not exist: ${localPath}`);
      }

      // Load config & merge with CLI input
      console.log("   ⚙️  Loading configuration...");
      const config = loadConfig(localPath);
      const merged = mergeConfigWithInput(
        config,
        data as Record<string, unknown>,
      );

      const modelStr = resolveModel(data.provider, data.model);
      const costTracker = new CostTracker();
      const budgetEnforcer = new BudgetEnforcer(merged.budget);
      const reportsDir = path.resolve(localPath, ".vulnhuntr-reports");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      // Checkpoint init
      const checkpoint = new AnalysisCheckpoint(
        path.join(localPath, ".vulnhuntr_checkpoint"),
      );
      const resumeData = checkpoint.canResume()
        ? checkpoint.resume(costTracker)
        : null;
      if (resumeData) {
        console.log(
          `   Resuming from checkpoint: ${resumeData.completedFiles.length} files done`,
        );
      }

      // MCP servers (graceful degradation)
      console.log("   🔌 Connecting to MCP analysis servers...");
      let mcpTools: Tool<ToolSchema>[] = [];
      let mcpConfig: MCPConfiguration<MCPServerKey> | null = null;
      try {
        const mcp = await getMCPTools(localPath);
        mcpTools = mcp.tools;
        mcpConfig = mcp.config;
      } catch (error) {
        console.warn(
          `   ⚠️  MCP init failed: ${error instanceof Error ? error.message : String(error)}. Continuing without MCP.`,
        );
      }

      // ─── Initialize workflowState ───────────────────────────────────
      setWorkflowState(
        () =>
          ({
            costTracker,
            budgetEnforcer,
            checkpoint,
            mcpTools,
            mcpConfig,
            modelStr,
            systemPrompt: "", // set after README summarization
            maxIterations: merged.maxIterations ?? data.max_iterations ?? 7,
            minConfidence:
              merged.confidenceThreshold ?? data.min_confidence ?? 5,
            requestedVulnTypes:
              merged.vulnTypes ??
              (data.vuln_types as string[] | undefined) ??
              [],
            localPath,
            isCloned,
            allFiles: [], // set after discovery
            reportsDir,
            timestamp,
            resumeData,
          }) satisfies VulnHuntrState,
      );

      // Return ONLY what needs to flow through subsequent step data
      return {
        ...data,
        local_path: localPath,
        is_cloned: isCloned,
        github_owner: owner,
        github_repo: repo,
      };
    },
  })

  .andTap({
    id: "log-setup",
    execute: async ({ data }) => {
      console.log(`   📁 Local path: ${data.local_path}`);
      if (data.is_cloned) {
        console.log(
          `   📦 Source: GitHub (${data.github_owner}/${data.github_repo})`,
        );
      }
    },
  })

  // =====================================================================
  // Step 2: Discovery + Summarization (PARALLEL via andAll)
  // File discovery and README summarization are independent operations.
  // Running them concurrently improves startup time.
  // =====================================================================
  .andAll({
    id: "discover-and-summarize",
    steps: [
      // ── 2a: Discover network-related Python files ──────────────────
      andThen({
        id: "discover-files",
        execute: async ({ data, workflowState }) => {
          const ws = workflowState as unknown as VulnHuntrState;
          const analyzePath = data.analyze_path as string | undefined;
          const targetPath = analyzePath
            ? path.resolve(ws.localPath, analyzePath)
            : ws.localPath;

          let allPyFiles: string[];
          const stat = fs.statSync(targetPath);

          if (stat.isFile()) {
            allPyFiles = [targetPath];
          } else {
            allPyFiles = getPythonFiles(targetPath);
          }

          // Filter to network-related files unless analyzing a specific file
          const networkFiles = stat.isFile()
            ? allPyFiles
            : allPyFiles.filter(isNetworkRelated);

          return {
            all_files: allPyFiles.map((f) => path.relative(ws.localPath, f)),
            files_to_analyze: networkFiles.map((f) =>
              path.relative(ws.localPath, f),
            ),
          };
        },
      }),

      // ── 2b: Summarize README for security context ──────────────────
      andThen({
        id: "summarize-readme",
        execute: async ({ workflowState }) => {
          const ws = workflowState as unknown as VulnHuntrState;
          const readmeContent = getReadmeContent(ws.localPath);

          if (!readmeContent) {
            console.log("   ℹ️  No README found, skipping summarization");
            return { readme_summary: "No README available." };
          }

          // Dynamic agent — model is a runtime input
          const readmeAgent = new Agent({
            name: "readme-summarizer",
            instructions: "You summarize README files for security analysis.",
            model: ws.modelStr,
          });

          try {
            const result = await readmeAgent.generateText(
              buildReadmeSummaryPrompt(readmeContent),
              { maxOutputTokens: 2048 },
            );
            const summary =
              extractBetweenTags("summary", result.text) || result.text;
            console.log("   README summarized for security context");
            return { readme_summary: summary };
          } catch (error) {
            console.warn(
              `   ⚠️  README summarization failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return { readme_summary: "README summarization failed." };
          }
        },
      }),
    ],
  })

  // =====================================================================
  // Step 3: Prepare Analysis
  // Merge discovery results into workflowState so they survive the
  // andForEach data-flow reset. Initialize checkpoint with file list.
  // =====================================================================
  .andThen({
    id: "prepare-analysis",
    execute: async ({ data, workflowState, setWorkflowState }) => {
      const ws = workflowState as unknown as VulnHuntrState;

      // andAll returns a tuple: [discoverResult, readmeResult]
      const [discoverResult, readmeResult] = data as [
        { all_files: string[]; files_to_analyze: string[] },
        { readme_summary: string },
      ];

      // Build system prompt with README context
      const systemPrompt = buildSystemPrompt(readmeResult.readme_summary);

      // Store in workflowState (persists through forEach boundary)
      setWorkflowState((prev: Record<string, unknown>) => ({
        ...prev,
        allFiles: discoverResult.all_files,
        systemPrompt,
      }));

      // Initialize checkpoint with the file list
      const resumeData = ws.resumeData as CheckpointData | null;
      const filesToAnalyze = discoverResult.files_to_analyze;

      if (!resumeData) {
        ws.checkpoint.start(
          ws.localPath,
          filesToAnalyze,
          ws.modelStr,
          ws.costTracker,
        );
      }

      // Filter out already-completed files (checkpoint resume)
      const completedFiles = new Set<string>(resumeData?.completedFiles ?? []);
      const pendingFiles = filesToAnalyze.filter((f) => !completedFiles.has(f));

      return {
        all_files: discoverResult.all_files,
        files_to_analyze: pendingFiles,
        readme_summary: readmeResult.readme_summary,
      };
    },
  })

  .andTap({
    id: "log-discovery",
    execute: async ({ data }) => {
      const all = (data.all_files as string[]) ?? [];
      const pending = (data.files_to_analyze as string[]) ?? [];
      console.log(
        `   📂 Found ${all.length} Python files, ${pending.length} to analyze`,
      );
    },
  })

  // =====================================================================
  // Step 3.5: Dry-Run Early Exit
  // If dry_run mode is enabled, display analysis preview and exit early.
  // This avoids LLM API calls and report generation.
  // =====================================================================
  .andWhen({
    id: "check-dry-run",
    condition: async ({ data }) => {
      const isDryRun = (data as { dry_run?: boolean }).dry_run ?? false;
      return isDryRun;
    },
    then: andThen({
      id: "execute-dry-run",
      execute: async ({ data, workflowState }) => {
        const ws = workflowState as unknown as VulnHuntrState;
        const input = data as {
          all_files: string[];
          files_to_analyze: string[];
          readme_summary: string;
          provider: string;
          model?: string;
          max_iterations?: number;
          min_confidence?: number;
          max_budget_usd?: number;
          vuln_types?: string[];
        };

        console.log("\n");
        console.log(
          "🔍 ═══════════════════════════════════════════════════════",
        );
        console.log("   DRY-RUN MODE: Preview Analysis");
        console.log("═══════════════════════════════════════════════════════");
        console.log("");
        console.log("📂 Repository Configuration:");
        console.log(`   Path: ${ws.localPath}`);
        console.log(`   Total Python files: ${input.all_files.length}`);
        console.log(`   Files to analyze: ${input.files_to_analyze.length}`);
        console.log("");

        console.log("   LLM Configuration:");
        console.log(`   Provider: ${input.provider}`);
        console.log(`   Model: ${ws.modelStr}`);
        console.log("");

        console.log("🛡️  Analysis Configuration:");
        const vulnTypes =
          ws.requestedVulnTypes.length > 0
            ? ws.requestedVulnTypes.join(", ")
            : "LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR (all)";
        console.log(`   Vulnerability types: ${vulnTypes}`);
        console.log(`   Max iterations: ${ws.maxIterations}`);
        console.log(`   Min confidence: ${ws.minConfidence}/10`);
        if (input.max_budget_usd) {
          console.log(`   Max budget: $${input.max_budget_usd.toFixed(2)} USD`);
        } else {
          console.log("   Max budget: No limit");
        }
        console.log("");

        console.log("README Summary:");
        console.log("─".repeat(60));
        const summaryLines = input.readme_summary.split("\n");
        for (const line of summaryLines.slice(0, 10)) {
          console.log(`   ${line}`);
        }
        if (summaryLines.length > 10) {
          console.log(`   ... (${summaryLines.length - 10} more lines)`);
        }
        console.log("─".repeat(60));
        console.log("");

        console.log(
          `📁 Files to Analyze (${input.files_to_analyze.length} files):`,
        );
        console.log("─".repeat(60));
        const maxDisplay = 20;
        const filesToShow = input.files_to_analyze.slice(0, maxDisplay);
        for (let i = 0; i < filesToShow.length; i++) {
          console.log(
            `   ${(i + 1).toString().padStart(3)}. ${filesToShow[i]}`,
          );
        }
        if (input.files_to_analyze.length > maxDisplay) {
          console.log(
            `   ... and ${input.files_to_analyze.length - maxDisplay} more files`,
          );
        }
        console.log("─".repeat(60));
        console.log("");

        console.log("✅ Dry-run complete. No LLM API calls made.");
        console.log('💡 Remove "dry_run": true to execute actual analysis.');
        console.log(
          "═══════════════════════════════════════════════════════\n",
        );

        // Return dry-run result
        return {
          findings: [],
          files_analyzed: input.all_files,
          total_cost_usd: 0,
          is_cloned: ws.isCloned,
          summary: {
            total_files: input.all_files.length,
            total_findings: 0,
            by_vuln_type: {},
            by_confidence: {},
          },
          dry_run_completed: true,
        };
      },
    }),
    else: andThen({
      id: "skip-dry-run",
      execute: async ({ data }) => {
        // Pass data through unchanged, mark as real execution
        return { ...data, dry_run_completed: false };
      },
    }),
  })

  // =====================================================================
  // Step 4: Per-File Analysis (andForEach)
  // Replaces the monolithic for-loop with VoltAgent's iteration primitive.
  // Each iteration gets its own LLM session (history is per-file).
  // concurrency: 1 ensures serial execution for budget/checkpoint safety.
  // Only runs if NOT in dry-run mode.
  // =====================================================================
  .andWhen({
    id: "check-run-analysis",
    condition: async ({ data }) => {
      const isDryRunCompleted = (data as { dry_run_completed?: boolean })
        .dry_run_completed;
      return !isDryRunCompleted; // Only analyze if NOT dry-run
    },
    then: andThen({
      id: "run-analysis-pipeline",
      execute: async ({ data }) => {
        // Pass through to andForEach
        return data;
      },
    })
      .andForEach({
        id: "analyze-files",
        items: async ({ data }) => (data.files_to_analyze as string[]) ?? [],
        map: (_ctx: unknown, file: string, index: number) => ({
          file,
          index,
        }),
        concurrency: 1,
        step: andThen({
          id: "analyze-single-file",
          execute: async ({ data, workflowState }) => {
            const ws = workflowState as unknown as VulnHuntrState;
            const { file, index } = data as { file: string; index: number };

            console.log(`   [${index + 1}] ${file}`);

            const fileFindings = await analyzeFile(file, ws);
            return { findings: fileFindings };
          },
        }),
      })

      // =================================================================
      // Step 5: Collect Findings
      // Flatten per-file results from andForEach into a single list.
      // After andForEach, data is an array of {findings: Finding[]}.
      // =================================================================
      .andThen({
        id: "collect-findings",
        execute: async ({ data, workflowState }) => {
          const ws = workflowState as unknown as VulnHuntrState;
          const fileResults = data as Array<{ findings: Finding[] }>;

          // Flatten all findings
          const allFindings = fileResults.flatMap((r) => r.findings ?? []);

          // Cost summary
          const costSummary = ws.costTracker.getSummary() as Record<
            string,
            unknown
          >;
          const totalCostUsd = (costSummary.total_cost_usd ?? 0) as number;

          // Build summary statistics
          const byVulnType: Record<string, number> = {};
          const byConfidence: Record<string, number> = {};
          for (const f of allFindings) {
            byVulnType[f.vuln_type] = (byVulnType[f.vuln_type] ?? 0) + 1;
            const bucket =
              f.confidence >= 8 ? "high" : f.confidence >= 5 ? "medium" : "low";
            byConfidence[bucket] = (byConfidence[bucket] ?? 0) + 1;
          }

          return {
            findings: allFindings,
            files_analyzed: ws.allFiles,
            total_cost_usd: totalCostUsd,
            is_cloned: ws.isCloned,
            summary: {
              total_files: ws.allFiles.length,
              total_findings: allFindings.length,
              by_vuln_type: byVulnType,
              by_confidence: byConfidence,
            },
            dry_run_completed: false,
          };
        },
      })

      .andTap({
        id: "log-findings",
        execute: async ({ data }) => {
          const d = data as Record<string, unknown>;
          const findingsArr = d.findings as unknown[] | undefined;
          const costUsd = (d.total_cost_usd as number) ?? 0;
          console.log(`\n   📊 Results: ${findingsArr?.length ?? 0} findings`);
          console.log(`   💰 Cost: $${costUsd.toFixed(4)}`);
        },
      }),
  })

  // =====================================================================
  // Step 6: Generate Reports (PARALLEL via andAll)
  // Write all 6 report formats concurrently.
  // Each step reads findings from the data flow and paths from workflowState.
  // Skip if dry-run mode was executed.
  // =====================================================================
  .andWhen({
    id: "check-skip-reports",
    condition: async ({ data }) => {
      const isDryRunComplete = (data as { dry_run_completed?: boolean })
        .dry_run_completed;
      return !isDryRunComplete; // Only generate reports if NOT dry-run
    },
    then: andAll({
      id: "generate-reports",
      steps: [
        andThen({
          id: "write-json-report",
          execute: async ({ data, workflowState }) => {
            const ws = workflowState as unknown as VulnHuntrState;
            fs.mkdirSync(ws.reportsDir, { recursive: true });
            const p = path.join(ws.reportsDir, `report-${ws.timestamp}.json`);
            fs.writeFileSync(
              p,
              JSON.stringify(
                generateJsonReport(buildResultForReport(data)),
                null,
                2,
              ),
            );
            return { json_report: p };
          },
        }),

        andThen({
          id: "write-sarif-report",
          execute: async ({ data, workflowState }) => {
            const ws = workflowState as unknown as VulnHuntrState;
            fs.mkdirSync(ws.reportsDir, { recursive: true });
            const p = path.join(ws.reportsDir, `report-${ws.timestamp}.sarif`);
            fs.writeFileSync(
              p,
              JSON.stringify(
                generateSarifReport(buildResultForReport(data)),
                null,
                2,
              ),
            );
            return { sarif_report: p };
          },
        }),

        andThen({
          id: "write-markdown-report",
          execute: async ({ data, workflowState }) => {
            const ws = workflowState as unknown as VulnHuntrState;
            fs.mkdirSync(ws.reportsDir, { recursive: true });
            const p = path.join(ws.reportsDir, `report-${ws.timestamp}.md`);
            fs.writeFileSync(
              p,
              generateMarkdownReport(buildResultForReport(data)),
            );
            return { markdown_report: p };
          },
        }),

        andThen({
          id: "write-html-report",
          execute: async ({ data, workflowState }) => {
            const ws = workflowState as unknown as VulnHuntrState;
            fs.mkdirSync(ws.reportsDir, { recursive: true });
            const p = path.join(ws.reportsDir, `report-${ws.timestamp}.html`);
            fs.writeFileSync(p, generateHtmlReport(buildResultForReport(data)));
            return { html_report: p };
          },
        }),

        andThen({
          id: "write-csv-report",
          execute: async ({ data, workflowState }) => {
            const ws = workflowState as unknown as VulnHuntrState;
            fs.mkdirSync(ws.reportsDir, { recursive: true });
            const p = path.join(ws.reportsDir, `report-${ws.timestamp}.csv`);
            fs.writeFileSync(p, generateCsvReport(buildResultForReport(data)));
            return { csv_report: p };
          },
        }),

        andThen({
          id: "write-cost-report",
          execute: async ({ workflowState }) => {
            const ws = workflowState as unknown as VulnHuntrState;
            fs.mkdirSync(ws.reportsDir, { recursive: true });
            const p = path.join(ws.reportsDir, `cost-${ws.timestamp}.json`);
            fs.writeFileSync(
              p,
              JSON.stringify(ws.costTracker.getSummary(), null, 2),
            );
            return { cost_report: p };
          },
        }),
      ],
    }),
  })

  .andTap({
    id: "log-reports",
    execute: async ({ data, workflowState }) => {
      const ws = workflowState as unknown as VulnHuntrState;
      // andAll returns a tuple of report results
      const reportResults = (Array.isArray(data) ? data : [data]) as Record<
        string,
        unknown
      >[];
      console.log(`\n   📊 Reports written to ${ws.reportsDir}/`);
      for (const r of reportResults) {
        if (!r) continue;
        for (const key of Object.keys(r)) {
          if (key.endsWith("_report") && typeof r[key] === "string") {
            console.log(`      • ${path.basename(r[key] as string)}`);
          }
        }
      }
    },
  })

  // =====================================================================
  // Step 7: Conditional Cleanup (andWhen)
  // Only runs when the repo was cloned from GitHub.
  // Copies reports to CWD before removing the temp clone.
  // =====================================================================
  .andWhen({
    id: "cleanup-cloned-repo",
    condition: async ({ workflowState }) =>
      (workflowState as unknown as VulnHuntrState).isCloned === true,
    step: andThen({
      id: "cleanup-clone",
      execute: async ({ data, workflowState }) => {
        const ws = workflowState as unknown as VulnHuntrState;
        try {
          const destDir = path.resolve(".", ".vulnhuntr-reports");
          fs.mkdirSync(destDir, { recursive: true });
          for (const file of fs.readdirSync(ws.reportsDir)) {
            fs.copyFileSync(
              path.join(ws.reportsDir, file),
              path.join(destDir, file),
            );
          }
          console.log(`   📋 Reports copied to ${destDir}/`);
          fs.rmSync(ws.localPath, { recursive: true, force: true });
          console.log("   Cleaned up cloned repo");
        } catch (error) {
          console.warn(`   ⚠️  Cleanup failed: ${error}`);
        }
        return data; // Pass through unchanged
      },
    }),
  })

  // =====================================================================
  // Step 8: Finalize
  // Finalize checkpoint, disconnect MCP, return WorkflowResult.
  // Uses getStepData to safely retrieve findings in case andAll
  // or andWhen changed the data shape.
  // =====================================================================
  .andThen({
    id: "finalize",
    execute: async ({ data, workflowState, getStepData }) => {
      const ws = workflowState as unknown as VulnHuntrState;

      // Finalize checkpoint (removes file = analysis complete)
      ws.checkpoint.finalize();

      // Disconnect MCP servers
      await disconnectMCP(ws.mcpConfig);

      // Retrieve findings — prefer getStepData for safety, fallback to data
      const collected = getStepData?.("collect-findings")?.output;
      const d = (collected ?? data) as Record<string, unknown>;

      const result: WorkflowResult = {
        findings: (d.findings as Finding[]) ?? [],
        files_analyzed: (d.files_analyzed as string[]) ?? ws.allFiles,
        total_cost_usd:
          (d.total_cost_usd as number) ?? ws.costTracker.totalCost,
        summary: (d.summary as WorkflowResult["summary"]) ?? {
          total_files: ws.allFiles.length,
          total_findings: ((d.findings as Finding[]) ?? []).length,
          by_vuln_type: {},
          by_confidence: {},
        },
      };

      return result;
    },
  })

  .andTap({
    id: "log-summary",
    execute: async ({ data }) => {
      const d = data as WorkflowResult;
      console.log("\n   ═══════════════════════════════════════");
      console.log("   VulnHuntr Analysis Summary");
      console.log("   ═══════════════════════════════════════");
      console.log(`   Files analyzed:  ${d.files_analyzed?.length ?? 0}`);
      console.log(`   Findings:        ${d.findings?.length ?? 0}`);
      console.log(`   Total cost:      $${(d.total_cost_usd ?? 0).toFixed(4)}`);
      if (d.summary?.by_vuln_type) {
        const types = Object.entries(d.summary.by_vuln_type)
          .map(([k, v]) => `${k}(${v})`)
          .join(", ");
        if (types) console.log(`   By type:         ${types}`);
      }
      console.log("   ═══════════════════════════════════════\n");
    },
  });
