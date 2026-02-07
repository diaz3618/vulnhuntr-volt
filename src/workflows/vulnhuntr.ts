/**
 * VulnHuntr VoltAgent Workflow
 * ============================
 * Full replication of the vulnhuntr vulnerability analysis pipeline as a
 * VoltAgent workflow chain. Implements:
 *
 *   1. Repository setup (local or GitHub clone)
 *   2. File discovery & network-related filtering
 *   3. README summarization for security context
 *   4. Per-file Phase 1: Initial analysis (all 7 vuln types)
 *   5. Per-vuln Phase 2: Iterative secondary analysis (up to N iterations)
 *   6. Context expansion via symbol resolution
 *   7. Finding collection (confidence ≥ threshold)
 *   8. Report generation (SARIF, JSON, Markdown, HTML)
 */

import {
  Agent,
  createWorkflowChain,
  andThen,
  andForEach,
  andDoWhile,
} from "@voltagent/core";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  type Finding,
  type Response,
  type ContextCode,
  type WorkflowInput,
  type WorkflowResult,
  WorkflowInputSchema,
  WorkflowResultSchema,
  ResponseSchema,
  CWE_MAP,
  responseToFinding,
} from "../schemas/index.js";

import {
  buildInitialPrompt,
  buildSecondaryPrompt,
  buildReadmeSummaryPrompt,
  buildSystemPrompt,
  VULN_SPECIFIC_BYPASSES_AND_PROMPTS,
} from "../prompts/index.js";

import { extractSymbol } from "../tools/symbol-finder.js";
import {
  getMCPTools,
  disconnectMCP,
  type MCPServerKey,
} from "../mcp/index.js";
import type { MCPConfiguration, Tool } from "@voltagent/core";
import {
  getPythonFiles,
  isNetworkRelated,
  getReadmeContent,
} from "../tools/repo.js";
import { isGitHubPath, cloneRepo, parseGitHubUrl } from "../tools/github.js";
import {
  generateSarifReport,
  generateJsonReport,
  generateMarkdownReport,
  generateHtmlReport,
  generateCsvReport,
} from "../reporters/index.js";
import { CostTracker, BudgetEnforcer } from "../cost-tracker/index.js";
import { loadConfig, mergeConfigWithInput } from "../config/index.js";
import { AnalysisCheckpoint, type CheckpointData } from "../checkpoint/index.js";
import {
  fixJsonResponse,
  createAnalysisSession,
  createReadmeSession,
  type LLMSession,
} from "../llm/index.js";

// ---------------------------------------------------------------------------
// Response format schema string (for prompts)
// ---------------------------------------------------------------------------

const RESPONSE_FORMAT_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      scratchpad: { type: "string", description: "Step-by-step analysis reasoning" },
      analysis: { type: "string", description: "Final analysis summary" },
      poc: { type: "string", nullable: true, description: "Proof-of-concept exploit" },
      confidence_score: {
        type: "integer",
        minimum: 0,
        maximum: 10,
        description: "Confidence score 0-10",
      },
      vulnerability_types: {
        type: "array",
        items: { type: "string", enum: ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"] },
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
  2
);

// ---------------------------------------------------------------------------
// Helper: resolve model string for VoltAgent
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

// ---------------------------------------------------------------------------
// Helper: parse LLM response safely
// ---------------------------------------------------------------------------

function parseLLMResponse(text: string): Response {
  const cleaned = fixJsonResponse(text);

  try {
    const parsed = JSON.parse(cleaned);
    return ResponseSchema.parse(parsed);
  } catch {
    // Return a minimal valid response if parsing fails
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

// ---------------------------------------------------------------------------
// Helper: extract text between XML tags
// ---------------------------------------------------------------------------

function extractBetweenTags(tag: string, text: string): string {
  const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, "s");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

// ---------------------------------------------------------------------------
// The main vulnhuntr analysis workflow
// ---------------------------------------------------------------------------

export const vulnhuntrWorkflow = createWorkflowChain({
  id: "vulnhuntr-analysis",
  name: "VulnHuntr Security Analysis",
  purpose:
    "Analyze a Python repository for remotely exploitable vulnerabilities using LLM-powered static analysis. Supports 7 vulnerability types: LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR.",

  input: WorkflowInputSchema,
  result: WorkflowResultSchema,

  hooks: {
    onStart: async (state) => {
      console.log(`\n🛡️  VulnHuntr Analysis Started`);
      console.log(`   Repository: ${state.data.repo_path}`);
      console.log(`   Provider: ${state.data.provider}`);
    },
    onStepStart: async (state) => {
      console.log(`   → Step ${state.active} (${state.status})`);
    },
    onFinish: async (info) => {
      if (info.status === "completed") {
        console.log(`\n✅ Analysis completed`);
      } else if (info.status === "error") {
        console.error(`\n❌ Analysis failed: ${info.error}`);
      }
    },
  },
})

  // ===========================================================================
  // Step 1: Repository Setup
  // Resolve GitHub URLs, validate paths, set up local working directory
  // ===========================================================================
  .andThen({
    id: "setup-repo",
    execute: async ({ data }) => {
      let localPath = data.repo_path;
      let isCloned = false;
      let owner = "";
      let repo = "";

      // Handle GitHub URLs/shorthands
      if (isGitHubPath(data.repo_path)) {
        const parsed = parseGitHubUrl(data.repo_path);
        if (!parsed) throw new Error(`Invalid GitHub URL: ${data.repo_path}`);

        owner = parsed.owner;
        repo = parsed.repo;

        const tmpDir = path.join(
          (await import("node:os")).tmpdir(),
          `vulnhuntr-${owner}-${repo}-${Date.now()}`
        );
        console.log(`   📥 Cloning ${owner}/${repo}...`);
        cloneRepo(parsed.fullUrl, tmpDir, true);
        localPath = tmpDir;
        isCloned = true;
        console.log(`   📁 Cloned to ${tmpDir}`);
      }

      if (!fs.existsSync(localPath)) {
        throw new Error(`Repository path does not exist: ${localPath}`);
      }

      // Load config (.vulnhuntr.yaml) and merge with CLI input
      console.log(`   ⚙️  Loading configuration...`);
      const config = loadConfig(localPath);
      const mergedConfig = mergeConfigWithInput(config, data as Record<string, any>);

      // Initialize cost tracker
      const costTracker = new CostTracker();
      const budgetEnforcer = new BudgetEnforcer(
        mergedConfig.budget,
      );

      // Initialize checkpoint system
      const checkpoint = new AnalysisCheckpoint(
        path.join(localPath, ".vulnhuntr_checkpoint"),
      );
      const resumeData = checkpoint.canResume()
        ? checkpoint.resume(costTracker)
        : null;
      if (resumeData) {
        console.log(`   🔄 Resuming from checkpoint: ${resumeData.completedFiles.length} files already done`);
      }

      // Connect to MCP analysis servers (graceful degradation)
      console.log(`   🔌 Connecting to MCP analysis servers...`);
      let mcpTools: Tool<any>[] = [];
      let mcpConfig: MCPConfiguration<MCPServerKey> | null = null;
      try {
        const mcp = await getMCPTools(localPath);
        mcpTools = mcp.tools;
        mcpConfig = mcp.config;
      } catch (error) {
        console.warn(
          `   ⚠️  MCP initialization failed: ${error instanceof Error ? error.message : String(error)}. Continuing without MCP tools.`
        );
      }

      return {
        ...data,
        ...mergedConfig,
        local_path: localPath,
        is_cloned: isCloned,
        github_owner: owner,
        github_repo: repo,
        _mcp_tools: mcpTools,
        _mcp_config: mcpConfig,
        _cost_tracker: costTracker,
        _budget_enforcer: budgetEnforcer,
        _checkpoint: checkpoint,
        _resume_data: resumeData,
      };
    },
  })

  // ===========================================================================
  // Step 2: File Discovery
  // Scan for Python files, filter to network-related files
  // ===========================================================================
  .andThen({
    id: "discover-files",
    execute: async ({ data }) => {
      const analyzePath = (data as any).analyze_path as string | undefined;
      const targetPath = analyzePath
        ? path.resolve(data.local_path, analyzePath)
        : data.local_path;

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

      // Initialize checkpoint with files list (now that we know them)
      const checkpoint: AnalysisCheckpoint = data._checkpoint;
      const resumeData = data._resume_data;
      if (!resumeData) {
        const relFiles = networkFiles.map((f) => path.relative(data.local_path, f));
        checkpoint.start(
          data.local_path,
          relFiles,
          resolveModel((data as any).provider ?? "anthropic", (data as any).model),
          data._cost_tracker,
        );
      }

      const relativeAll = allPyFiles.map((f) => path.relative(data.local_path, f));
      const relativeNetwork = networkFiles.map((f) =>
        path.relative(data.local_path, f)
      );

      console.log(
        `   📂 Found ${allPyFiles.length} Python files, ${networkFiles.length} network-related`
      );

      return {
        ...data,
        all_files: relativeAll,
        files_to_analyze: relativeNetwork,
      };
    },
  })

  // ===========================================================================
  // Step 3: README Summarization
  // Use LLM to summarize README for security context
  // ===========================================================================
  .andThen({
    id: "summarize-readme",
    execute: async ({ data }) => {
      const readmeContent = getReadmeContent(data.local_path);

      if (!readmeContent) {
        console.log("   ℹ️  No README found, skipping summarization");
        return { ...data, readme_summary: "No README available." };
      }

      // Create a temporary agent for README summarization (no system prompt)
      const d = data as any;
      const modelStr = resolveModel(d.provider ?? "anthropic", d.model);
      const readmeAgent = new Agent({
        name: "readme-summarizer",
        instructions: "You summarize README files for security analysis.",
        model: modelStr,
      });

      const prompt = buildReadmeSummaryPrompt(readmeContent);

      try {
        const result = await readmeAgent.generateText(prompt, {
          maxOutputTokens: 2048,
        });

        const summary =
          extractBetweenTags("summary", result.text) || result.text;
        console.log("   📄 README summarized for security context");
        return { ...data, readme_summary: summary };
      } catch (error) {
        console.warn("   ⚠️  README summarization failed, continuing without it");
        return { ...data, readme_summary: "README summarization failed." };
      }
    },
  })

  // ===========================================================================
  // Step 4: Analyze Each File
  // For each network-related file:
  //   Phase 1: Initial analysis for all 7 vuln types
  //   Phase 2: Iterative secondary analysis per vuln type found
  // ===========================================================================
  .andThen({
    id: "analyze-files",
    execute: async ({ data }) => {
      const findings: Finding[] = [];
      const d = data as any;
      const modelStr = resolveModel(d.provider ?? "anthropic", d.model);
      const systemPrompt = buildSystemPrompt(data.readme_summary);

      // Retrieve new modules from state
      const costTracker = data._cost_tracker as CostTracker;
      const budgetEnforcer = data._budget_enforcer as BudgetEnforcer;
      const checkpoint = data._checkpoint as AnalysisCheckpoint;
      const resumeData = data._resume_data as CheckpointData | null;
      const completedFiles = new Set<string>(resumeData?.completedFiles ?? []);

      // Create LLM session with cost tracking
      const session = createAnalysisSession(systemPrompt, modelStr, costTracker);

      const maxIterations = (d.maxIterations ?? d.max_iterations ?? 7) as number;
      const minConfidence = (d.confidenceThreshold ?? d.min_confidence ?? 5) as number;
      const filesToAnalyze = data.files_to_analyze as string[];

      console.log(`\n   🔍 Analyzing ${filesToAnalyze.length} files...\n`);

      for (const [fileIdx, relativeFilePath] of filesToAnalyze.entries()) {
        // Skip files completed in previous checkpoint run
        if (completedFiles.has(relativeFilePath)) {
          console.log(
            `   [${fileIdx + 1}/${filesToAnalyze.length}] ${relativeFilePath} (resumed — skipped)`
          );
          continue;
        }

        // Budget check before starting a new file
        if (!budgetEnforcer.check(costTracker.totalCost, costTracker.getFileCost(relativeFilePath))) {
          console.warn(`   ⚠️  Budget limit reached. Stopping analysis.`);
          break;
        }

        const fullPath = path.resolve(data.local_path, relativeFilePath);
        let fileContent: string;
        try {
          fileContent = fs.readFileSync(fullPath, "utf-8");
        } catch {
          console.warn(`   ⚠️  Could not read ${relativeFilePath}, skipping`);
          continue;
        }

        console.log(
          `   [${fileIdx + 1}/${filesToAnalyze.length}] ${relativeFilePath}`
        );

        // Update checkpoint & session context
        checkpoint.setCurrentFile(relativeFilePath);
        session.setContext(relativeFilePath, "initial");
        session.clearHistory();

        // =====================================================================
        // Phase 1: Initial Analysis
        // =====================================================================
        const initialPrompt = buildInitialPrompt(
          relativeFilePath,
          fileContent,
          RESPONSE_FORMAT_SCHEMA
        );

        let initialReport: Response;
        try {
          const responseText = await session.chat(initialPrompt, 8192);
          initialReport = parseLLMResponse(responseText);
        } catch (error) {
          console.warn(
            `   ⚠️  Initial analysis failed for ${relativeFilePath}: ${error instanceof Error ? error.message : String(error)}`
          );
          continue;
        }

        const vulnTypes = initialReport.vulnerability_types;
        if (vulnTypes.length === 0) {
          console.log(`   ✓ No potential vulnerabilities found`);
          checkpoint.markFileComplete(relativeFilePath);
          continue;
        }

        console.log(
          `   🔎 Potential vulns: ${vulnTypes.join(", ")}`
        );

        // =====================================================================
        // Phase 2: Secondary Analysis (per vuln type)
        // =====================================================================
        for (const vulnType of vulnTypes) {
          // Filter to requested vuln types if specified
          const requestedTypes = (d.vulnTypes ?? d.vuln_types ?? []) as string[];
          if (requestedTypes.length > 0 && !requestedTypes.includes(vulnType)) continue;

          if (!VULN_SPECIFIC_BYPASSES_AND_PROMPTS[vulnType]) {
            console.warn(`   ⚠️  Unknown vuln type: ${vulnType}`);
            continue;
          }

          session.setContext(relativeFilePath, `secondary-${vulnType}`);

          let currentReport: Response = initialReport;
          let previousAnalysisJson = JSON.stringify(initialReport);
          let resolvedContextCount = 0;
          let lastContextCount = -1;
          let prevContextNames: string[] = [];
          const codeDefinitions: Array<{
            name: string;
            contextNameRequested: string;
            filePath: string;
            source: string;
          }> = [];

          for (let iteration = 0; iteration < maxIterations; iteration++) {
            // Budget check per iteration
            if (!budgetEnforcer.check(costTracker.totalCost)) {
              console.warn(`   ⚠️  Budget limit reached during secondary analysis.`);
              break;
            }

            // Cost-based iteration control (escalating cost detection)
            const iterCost = costTracker.getFileCost(relativeFilePath);
            if (!budgetEnforcer.shouldContinueIteration(relativeFilePath, iteration, iterCost, costTracker.totalCost)) {
              break;
            }

            // Resolve context code requests (skip first iteration — use initial report)
            if (iteration > 0 && currentReport.context_code.length > 0) {
              const newContextCount = currentReport.context_code.length;
              const currentContextNames = currentReport.context_code.map((c) => c.name).sort();

              // Stop if no new context requested, same count as before,
              // OR same symbols requested two iterations in a row (Python parity)
              if (
                newContextCount === lastContextCount ||
                JSON.stringify(currentContextNames) === JSON.stringify(prevContextNames)
              ) {
                break;
              }
              lastContextCount = newContextCount;
              prevContextNames = currentContextNames;

              // Resolve each symbol
              for (const ctx of currentReport.context_code) {
                const result = extractSymbol(
                  ctx.name,
                  ctx.code_line,
                  data.all_files,
                  data.local_path
                );
                if (result) {
                  codeDefinitions.push(result);
                  resolvedContextCount++;
                }
              }
            } else if (
              iteration > 0 &&
              currentReport.context_code.length === 0
            ) {
              // No more context requested, done
              break;
            }

            // Build the secondary prompt
            const secondaryPrompt = buildSecondaryPrompt(
              relativeFilePath,
              fileContent,
              codeDefinitions,
              vulnType,
              previousAnalysisJson,
              RESPONSE_FORMAT_SCHEMA
            );

            try {
              const responseText = await session.chat(secondaryPrompt, 8192);
              currentReport = parseLLMResponse(responseText);
              previousAnalysisJson = JSON.stringify(currentReport);
            } catch (error) {
              console.warn(
                `   ⚠️  Secondary analysis iteration ${iteration + 1} failed: ${error instanceof Error ? error.message : String(error)}`
              );
              break;
            }
          }

          // Collect finding if confidence meets threshold
          if (currentReport.confidence_score >= minConfidence) {
            const finding = responseToFinding(
              currentReport,
              relativeFilePath,
              vulnType,
            );
            findings.push(finding);
            console.log(
              `   🚨 ${vulnType} finding (confidence: ${currentReport.confidence_score}/10, severity: ${finding.severity})`
            );
          }
        }

        checkpoint.markFileComplete(relativeFilePath);
      }

      // Log cost summary
      const costSummary = costTracker.getSummary() as Record<string, any>;
      const totalCostUsd = (costSummary.total_cost_usd ?? 0) as number;
      console.log(`\n   💰 Cost: $${totalCostUsd.toFixed(4)} (${costSummary.api_calls} calls, ${(costSummary.total_input_tokens ?? 0) + (costSummary.total_output_tokens ?? 0)} tokens)`);

      return {
        ...data,
        findings,
        _total_cost_usd: totalCostUsd,
      };
    },
  })

  // ===========================================================================
  // Step 5: Generate Reports & Build Result
  // ===========================================================================
  .andThen({
    id: "generate-reports",
    execute: async ({ data }) => {
      const findings: Finding[] = data.findings;
      const filesAnalyzed: string[] = data.files_to_analyze;
      const costTracker = data._cost_tracker as CostTracker;
      const checkpoint = data._checkpoint as AnalysisCheckpoint;
      const totalCostUsd: number = (data._total_cost_usd as number) ?? 0;

      // Build summary
      const byVulnType: Record<string, number> = {};
      const byConfidence: Record<string, number> = {};
      for (const f of findings) {
        byVulnType[f.vuln_type] = (byVulnType[f.vuln_type] ?? 0) + 1;
        const bucket =
          f.confidence >= 8 ? "high" : f.confidence >= 5 ? "medium" : "low";
        byConfidence[bucket] = (byConfidence[bucket] ?? 0) + 1;
      }

      const result: WorkflowResult = {
        findings,
        files_analyzed: filesAnalyzed,
        total_cost_usd: totalCostUsd,
        summary: {
          total_files: filesAnalyzed.length,
          total_findings: findings.length,
          by_vuln_type: byVulnType,
          by_confidence: byConfidence,
        },
      };

      // Generate report files
      const reportsDir = path.resolve(data.local_path, ".vulnhuntr-reports");
      fs.mkdirSync(reportsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      // JSON
      const jsonPath = path.join(reportsDir, `report-${timestamp}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(generateJsonReport(result), null, 2));

      // SARIF
      const sarifPath = path.join(reportsDir, `report-${timestamp}.sarif`);
      fs.writeFileSync(sarifPath, JSON.stringify(generateSarifReport(result), null, 2));

      // Markdown
      const mdPath = path.join(reportsDir, `report-${timestamp}.md`);
      fs.writeFileSync(mdPath, generateMarkdownReport(result));

      // HTML
      const htmlPath = path.join(reportsDir, `report-${timestamp}.html`);
      fs.writeFileSync(htmlPath, generateHtmlReport(result));

      // CSV
      const csvPath = path.join(reportsDir, `report-${timestamp}.csv`);
      fs.writeFileSync(csvPath, generateCsvReport(result));

      // Cost report
      const costPath = path.join(reportsDir, `cost-${timestamp}.json`);
      fs.writeFileSync(costPath, JSON.stringify(costTracker.getSummary(), null, 2));

      console.log(`\n   📊 Reports written to ${reportsDir}/`);
      console.log(`      • ${path.basename(jsonPath)}`);
      console.log(`      • ${path.basename(sarifPath)}`);
      console.log(`      • ${path.basename(mdPath)}`);
      console.log(`      • ${path.basename(htmlPath)}`);
      console.log(`      • ${path.basename(csvPath)}`);
      console.log(`      • ${path.basename(costPath)}`);

      // Finalize checkpoint (removes checkpoint file = analysis complete)
      checkpoint.finalize();

      // Clean up cloned repos if needed
      if (data.is_cloned) {
        try {
          // Copy reports before cleanup
          const destDir = path.resolve(".", ".vulnhuntr-reports");
          fs.mkdirSync(destDir, { recursive: true });
          for (const file of fs.readdirSync(reportsDir)) {
            fs.copyFileSync(
              path.join(reportsDir, file),
              path.join(destDir, file)
            );
          }
          console.log(`   📋 Reports copied to ${destDir}/`);
          fs.rmSync(data.local_path, { recursive: true, force: true });
          console.log(`   🧹 Cleaned up cloned repo`);
        } catch (error) {
          console.warn(`   ⚠️  Cleanup failed: ${error}`);
        }
      }

      // Disconnect MCP servers
      await disconnectMCP(data._mcp_config ?? null);

      return result;
    },
  });
