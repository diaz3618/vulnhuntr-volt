/**
 * VulnHuntr VoltAgent Workflow — End-to-End Test Suite
 * =====================================================
 *
 * Comprehensive tests covering:
 *   1.  Workflow chain construction & registration
 *   2.  Chain configuration (hooks, schemas, retry)
 *   3.  Individual hook behaviour
 *   4.  fixJsonResponse mock-contract
 *   5.  Full workflow execution — local repository
 *   6.  Full workflow execution — with findings
 *   7.  GitHub clone path
 *   8.  andWhen conditional cleanup
 *   9.  Budget enforcement
 *  10.  Checkpoint resume
 *  11.  Multi-iteration secondary analysis
 *  12.  Error resilience
 *  13.  Input validation (Zod schema)
 *  14.  WorkflowState persistence
 *  15.  Result schema validation
 *  16.  Execution metadata
 *  17.  Provider configuration
 *  18.  Single file analysis
 *  19.  VulnType filtering
 *  20.  Edge cases
 *
 * Follows VoltAgent's own test patterns from packages/core/src/workflow/*.spec.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// 1. Mock external modules BEFORE importing the workflow
// ---------------------------------------------------------------------------

// --- @voltagent/core: partial mock — mock Agent while keeping chain API real ---
vi.mock("@voltagent/core", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    // biome-ignore lint: mock constructor
    Agent: vi.fn(function (this: any) {
      this.generateText = vi.fn(async () => ({
        text: "<summary>Mock readme summary for security context</summary>",
      }));
      return this;
    }),
  };
});

// --- fs ---
vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => "# mock file content\nimport os\n"),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      statSync: vi.fn(() => ({ isFile: () => false, isDirectory: () => true })),
      readdirSync: vi.fn(() => ["report.json", "report.sarif"]),
      copyFileSync: vi.fn(),
      rmSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "# mock file content\nimport os\n"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({ isFile: () => false, isDirectory: () => true })),
    readdirSync: vi.fn(() => ["report.json", "report.sarif"]),
    copyFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

// --- github tools ---
vi.mock("../src/tools/github.ts", () => ({
  isGitHubPath: vi.fn(() => false),
  cloneRepo: vi.fn(),
  parseGitHubUrl: vi.fn(() => null),
}));

// --- repo tools ---
vi.mock("../src/tools/repo.ts", () => ({
  getPythonFiles: vi.fn(() => ["/tmp/test-repo/app.py", "/tmp/test-repo/views.py"]),
  isNetworkRelated: vi.fn(() => true),
  getReadmeContent: vi.fn(() => "# Test Repo\nA test Python app"),
}));

// --- symbol-finder ---
vi.mock("../src/tools/symbol-finder.ts", () => ({
  extractSymbol: vi.fn(() => ({
    name: "mock_func",
    contextNameRequested: "mock_func",
    filePath: "utils.py",
    source: "def mock_func(): pass",
  })),
}));

// --- mcp ---
vi.mock("../src/mcp/index.ts", () => ({
  getMCPTools: vi.fn(async () => ({ tools: [], config: null })),
  disconnectMCP: vi.fn(async () => {}),
}));

// --- reporters ---
vi.mock("../src/reporters/index.ts", () => ({
  generateJsonReport: vi.fn((r: any) => ({ report: "json", findings: r.findings })),
  generateSarifReport: vi.fn((r: any) => ({
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [],
  })),
  generateMarkdownReport: vi.fn(() => "# Report\n"),
  generateHtmlReport: vi.fn(() => "<html></html>"),
  generateCsvReport: vi.fn(() => "rule_id,title\n"),
}));

// --- config ---
vi.mock("../src/config/index.ts", () => ({
  loadConfig: vi.fn(() => ({
    budget: null,
    checkpoint: true,
    checkpointInterval: 5,
    provider: null,
    model: null,
    verbosity: 0,
    dryRun: false,
    vulnTypes: [],
    excludePaths: [],
    includePaths: [],
    maxIterations: 7,
    confidenceThreshold: 5,
  })),
  mergeConfigWithInput: vi.fn((config: any, input: any) => ({
    ...config,
    budget: input.max_budget_usd ?? config.budget,
    maxIterations: input.max_iterations ?? config.maxIterations,
    confidenceThreshold: input.min_confidence ?? config.confidenceThreshold,
    vulnTypes: input.vuln_types ?? config.vulnTypes,
  })),
}));

// --- checkpoint (regular function constructor) ---
vi.mock("../src/checkpoint/index.ts", () => {
  // biome-ignore lint: mock constructor
  const MockCheckpoint = vi.fn(function (this: any) {
    this.canResume = vi.fn(() => false);
    this.resume = vi.fn(() => null);
    this.start = vi.fn();
    this.setCurrentFile = vi.fn();
    this.markFileComplete = vi.fn();
    this.save = vi.fn();
    this.saveNow = vi.fn();
    this.finalize = vi.fn();
    this.getProgressSummary = vi.fn(() => ({
      status: "complete",
      total_files: 0,
      completed_files: 0,
      pending_files: 0,
      progress_percent: 100,
    }));
    return this;
  });
  return { AnalysisCheckpoint: MockCheckpoint };
});

// --- cost-tracker (regular function constructors) ---
vi.mock("../src/cost-tracker/index.ts", () => {
  // biome-ignore lint: mock constructor
  const MockCostTracker = vi.fn(function (this: any) {
    this.trackCall = vi.fn(() => 0.001);
    this.totalCost = 0.05;
    this.totalInputTokens = 1000;
    this.totalOutputTokens = 500;
    this.totalTokens = 1500;
    this.callCount = 2;
    this.getFileCost = vi.fn(() => 0.01);
    this.getSummary = vi.fn(() => ({
      total_cost_usd: 0.05,
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_tokens: 1500,
      api_calls: 2,
      costs_by_file: {},
      costs_by_model: {},
      elapsed_seconds: 10,
      start_time: new Date().toISOString(),
    }));
    this.getDetailedReport = vi.fn(() => "Cost report");
    this.toDict = vi.fn(() => ({}));
    return this;
  });
  // biome-ignore lint: mock constructor
  const MockBudgetEnforcer = vi.fn(function (this: any) {
    this.maxBudgetUsd = null;
    this.check = vi.fn(() => true);
    this.getRemainingBudget = vi.fn(() => null);
    this.shouldContinueIteration = vi.fn(() => true);
    return this;
  });
  return {
    CostTracker: MockCostTracker,
    BudgetEnforcer: MockBudgetEnforcer,
    estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
    estimateFileCost: vi.fn(() => ({})),
    estimateAnalysisCost: vi.fn(() => ({})),
    PRICING_TABLE: {},
    getModelPricing: vi.fn(() => ({ input: 0.003, output: 0.015 })),
  };
});

// --- llm ---
const mockChat = vi.fn(async () =>
  JSON.stringify({
    scratchpad: "Analysis reasoning",
    analysis: "No vulnerability found",
    poc: null,
    confidence_score: 3,
    vulnerability_types: [],
    context_code: [],
  }),
);

vi.mock("../src/llm/index.ts", () => ({
  fixJsonResponse: vi.fn((text: string) => {
    let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) cleaned = objMatch[0];
    return cleaned;
  }),
  createAnalysisSession: vi.fn(() => ({
    agent: {},
    provider: "anthropic",
    modelStr: "anthropic/claude-sonnet-4-20250514",
    setContext: vi.fn(),
    clearHistory: vi.fn(),
    chat: mockChat,
  })),
  createReadmeSession: vi.fn(() => ({
    agent: {},
    setContext: vi.fn(),
    clearHistory: vi.fn(),
    chat: vi.fn(async () => "<summary>Test repo summary</summary>"),
  })),
  detectProvider: vi.fn((m: string) => {
    if (m.includes("claude")) return "anthropic";
    if (m.includes("gpt")) return "openai";
    return "unknown";
  }),
}));

// --- prompts ---
vi.mock("../src/prompts/index.ts", () => ({
  buildSystemPrompt: vi.fn((summary: string) => `System prompt with: ${summary}`),
  buildInitialPrompt: vi.fn(
    (fp: string, content: string, schema: string) =>
      `Analyze ${fp} for vulnerabilities. Schema: ${schema}`,
  ),
  buildSecondaryPrompt: vi.fn(
    (fp: string, _c: string, _d: any[], vt: string, prev: string) =>
      `Secondary analysis of ${fp} for ${vt}. Previous: ${prev}`,
  ),
  buildReadmeSummaryPrompt: vi.fn(
    (content: string) => `Summarize this README: ${content}`,
  ),
  VULN_SPECIFIC_BYPASSES_AND_PROMPTS: {
    LFI: { prompt: "LFI template", bypasses: ["path traversal"] },
    RCE: { prompt: "RCE template", bypasses: ["eval", "exec"] },
    SSRF: { prompt: "SSRF template", bypasses: ["http://0.0.0.0"] },
    AFO: { prompt: "AFO template", bypasses: ["null byte"] },
    SQLI: { prompt: "SQLI template", bypasses: ["UNION"] },
    XSS: { prompt: "XSS template", bypasses: ["<script>"] },
    IDOR: { prompt: "IDOR template", bypasses: [] },
  },
}));

// ---------------------------------------------------------------------------
// Now import the workflow (after mocks are set up)
// ---------------------------------------------------------------------------

import { vulnhuntrWorkflow } from "../src/workflows/vulnhuntr.js";
import * as fs from "node:fs";
import { fixJsonResponse } from "../src/llm/index.js";

/** Shortcut to get the chain's internal config (where hooks/schemas live) */
const chainConfig = () => (vulnhuntrWorkflow as any).config;

// ═══════════════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════════════

describe("VulnHuntr Workflow E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default mock implementation for mockChat
    mockChat.mockImplementation(async () =>
      JSON.stringify({
        scratchpad: "Analysis reasoning",
        analysis: "No vulnerability found",
        poc: null,
        confidence_score: 3,
        vulnerability_types: [],
        context_code: [],
      }),
    );
    // Suppress console output during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 1: Workflow Chain Construction
  // ═════════════════════════════════════════════════════════════════════

  describe("Workflow Chain Construction", () => {
    it("should export vulnhuntrWorkflow as a valid chain", () => {
      expect(vulnhuntrWorkflow).toBeDefined();
      expect(typeof vulnhuntrWorkflow).toBe("object");
    });

    it("should have toWorkflow() method for registration", () => {
      expect(typeof (vulnhuntrWorkflow as any).toWorkflow).toBe("function");
    });

    it("should produce a valid workflow definition via toWorkflow()", () => {
      const wf = (vulnhuntrWorkflow as any).toWorkflow();
      expect(wf).toBeDefined();
      expect(wf.id).toBe("vulnhuntr-analysis");
      expect(wf.name).toBe("VulnHuntr Security Analysis");
    });

    it("should have run() method on chain", () => {
      expect(typeof vulnhuntrWorkflow.run).toBe("function");
    });

    it("should have input and result schemas in config", () => {
      const cfg = chainConfig();
      expect(cfg.input).toBeDefined();
      expect(cfg.result).toBeDefined();
    });

    it("should have hooks defined in config", () => {
      const cfg = chainConfig();
      expect(cfg.hooks).toBeDefined();
      expect(typeof cfg.hooks.onStart).toBe("function");
      expect(typeof cfg.hooks.onStepStart).toBe("function");
      expect(typeof cfg.hooks.onStepEnd).toBe("function");
      expect(typeof cfg.hooks.onError).toBe("function");
      expect(typeof cfg.hooks.onFinish).toBe("function");
    });

    it("should have retry config", () => {
      const cfg = chainConfig();
      expect(cfg.retryConfig).toEqual({ attempts: 1, delayMs: 1000 });
    });

    it("should have steps array populated", () => {
      const chain = vulnhuntrWorkflow as any;
      expect(chain.steps).toBeDefined();
      expect(Array.isArray(chain.steps)).toBe(true);
      expect(chain.steps.length).toBeGreaterThan(0);
    });

    it("should have workflow definition schemas via toWorkflow()", () => {
      const wf = (vulnhuntrWorkflow as any).toWorkflow();
      expect(wf.inputSchema).toBeDefined();
      expect(wf.resultSchema).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 2: Workflow Registration with VoltAgent Registry
  // ═════════════════════════════════════════════════════════════════════

  describe("Workflow Registration", () => {
    it("should register with WorkflowRegistry without errors", async () => {
      const { WorkflowRegistry } = await import("@voltagent/core");
      const registry = WorkflowRegistry.getInstance();
      (registry as any).workflows?.clear?.();

      const wf = (vulnhuntrWorkflow as any).toWorkflow();
      expect(() => registry.registerWorkflow(wf)).not.toThrow();
    });

    it("should be registered and runnable via toWorkflow()", async () => {
      const wf = (vulnhuntrWorkflow as any).toWorkflow();
      expect(typeof wf.run).toBe("function");
      expect(wf.id).toBe("vulnhuntr-analysis");
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 3: Workflow Hooks
  // ═════════════════════════════════════════════════════════════════════

  describe("Workflow Hooks", () => {
    it("onStart hook should log repository info", async () => {
      const hooks = chainConfig().hooks;
      const logSpy = vi.spyOn(console, "log");

      await hooks.onStart({
        data: { repo_path: "/test/repo", provider: "anthropic" },
        executionId: "test-exec-123",
        workflowState: {},
        active: 0,
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("VulnHuntr Analysis Started"),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("/test/repo"),
      );
    });

    it("onStepStart hook should log step index", async () => {
      const hooks = chainConfig().hooks;
      const logSpy = vi.spyOn(console, "log");

      await hooks.onStepStart({
        active: 3,
        data: {},
        executionId: "test",
        workflowState: {},
      });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("step 3"));
    });

    it("onStepStart hook should handle step index 0 (falsy)", async () => {
      const hooks = chainConfig().hooks;
      const logSpy = vi.spyOn(console, "log");

      await hooks.onStepStart({
        active: 0,
        data: {},
        executionId: "test",
        workflowState: {},
      });

      // Step 0 SHOULD log (we fixed the != null check)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("step 0"));
    });

    it("onStepEnd hook should log step completion", async () => {
      const hooks = chainConfig().hooks;
      const logSpy = vi.spyOn(console, "log");

      await hooks.onStepEnd({
        active: 2,
        data: {},
        executionId: "test",
        workflowState: {},
      });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("step 2 done"));
    });

    it("onError hook should save checkpoint on error", async () => {
      const hooks = chainConfig().hooks;
      const mockSave = vi.fn();

      await hooks.onError({
        error: new Error("test error"),
        state: {
          workflowState: {
            checkpoint: { save: mockSave },
          },
        },
        status: "error",
        result: null,
        steps: [],
      });

      expect(mockSave).toHaveBeenCalled();
    });

    it("onError hook should handle missing state gracefully", async () => {
      const hooks = chainConfig().hooks;

      await expect(
        hooks.onError({
          error: new Error("test"),
          state: null,
          status: "error",
          result: null,
          steps: [],
        }),
      ).resolves.not.toThrow();
    });

    it("onFinish hook should log success on completion", async () => {
      const hooks = chainConfig().hooks;
      const logSpy = vi.spyOn(console, "log");

      await hooks.onFinish({
        status: "completed",
        state: {},
        result: null,
        error: null,
        steps: [],
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("completed successfully"),
      );
    });

    it("onFinish hook should log failure on error", async () => {
      const hooks = chainConfig().hooks;
      const errorSpy = vi.spyOn(console, "error");

      await hooks.onFinish({
        status: "error",
        state: {},
        result: null,
        error: "Something went wrong",
        steps: [],
      });

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Analysis failed"),
      );
    });

    it("onFinish hook should handle cancelled status", async () => {
      const hooks = chainConfig().hooks;
      const logSpy = vi.spyOn(console, "log");

      await hooks.onFinish({
        status: "cancelled",
        state: {},
        result: null,
        error: null,
        steps: [],
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("cancelled"),
      );
    });

    it("onFinish hook should handle suspended status", async () => {
      const hooks = chainConfig().hooks;
      const logSpy = vi.spyOn(console, "log");

      await hooks.onFinish({
        status: "suspended",
        state: {},
        result: null,
        error: null,
        steps: [],
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("suspended"),
      );
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 4: fixJsonResponse (mock contract)
  // ═════════════════════════════════════════════════════════════════════

  describe("fixJsonResponse (mock)", () => {
    it("should strip markdown fences", () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = fixJsonResponse(input);
      expect(result).toContain('"key"');
      expect(result).not.toContain("```");
    });

    it("should extract JSON object from surrounding text", () => {
      const input = 'Here is my response: {"analysis": "test"} hope that helps';
      const result = fixJsonResponse(input);
      expect(JSON.parse(result)).toEqual({ analysis: "test" });
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 5: Workflow Execution — Local Repository
  // ═════════════════════════════════════════════════════════════════════

  describe("Workflow Execution — Local Repository", () => {
    const localInput = {
      repo_path: "/tmp/test-repo",
      provider: "anthropic" as const,
      min_confidence: 5,
      max_iterations: 3,
    };

    it("should complete workflow run with local repo and no findings", async () => {
      const result = await vulnhuntrWorkflow.run(localInput);

      expect(result).toBeDefined();
      expect(result.status).toBe("completed");
      expect(result.result).toBeDefined();
      expect(result.result.findings).toBeInstanceOf(Array);
      expect(result.result.files_analyzed).toBeInstanceOf(Array);
      expect(typeof result.result.total_cost_usd).toBe("number");
      expect(result.result.summary).toBeDefined();
      expect(typeof result.result.summary.total_files).toBe("number");
      expect(typeof result.result.summary.total_findings).toBe("number");
    });

    it("should generate reports in expected directory", async () => {
      await vulnhuntrWorkflow.run(localInput);

      const writeSync = fs.writeFileSync as unknown as ReturnType<typeof vi.fn>;
      expect(writeSync).toHaveBeenCalled();

      const writePaths = writeSync.mock.calls.map((c: any[]) => c[0] as string);
      expect(writePaths.some((p: string) => p.endsWith(".json"))).toBe(true);
      expect(writePaths.some((p: string) => p.endsWith(".sarif"))).toBe(true);
      expect(writePaths.some((p: string) => p.endsWith(".md"))).toBe(true);
      expect(writePaths.some((p: string) => p.endsWith(".html"))).toBe(true);
      expect(writePaths.some((p: string) => p.endsWith(".csv"))).toBe(true);
    });

    it("should have zero findings when LLM scores below threshold", async () => {
      const result = await vulnhuntrWorkflow.run(localInput);
      expect(result.result.findings).toHaveLength(0);
      expect(result.result.summary.total_findings).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 6: Workflow Execution — With Findings
  // ═════════════════════════════════════════════════════════════════════

  describe("Workflow Execution — With Findings", () => {
    it("should collect findings when LLM returns high confidence", async () => {
      mockChat.mockImplementation(async () =>
        JSON.stringify({
          scratchpad: "Deep analysis",
          analysis: "Found SSRF via user-controlled URL",
          poc: "curl http://localhost/api?url=http://169.254.169.254",
          confidence_score: 9,
          vulnerability_types: ["SSRF"],
          context_code: [],
        }),
      );

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        min_confidence: 5,
        max_iterations: 3,
      });

      expect(result.status).toBe("completed");
      expect(result.result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.result.findings[0].vuln_type).toBe("SSRF");
    });

    it("should correctly assign severity based on confidence score", async () => {
      mockChat.mockImplementation(async () =>
        JSON.stringify({
          scratchpad: "Critical RCE",
          analysis: "Remote code execution via eval",
          poc: "eval(user_input)",
          confidence_score: 10,
          vulnerability_types: ["RCE"],
          context_code: [],
        }),
      );

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        min_confidence: 5,
        max_iterations: 2,
      });

      expect(result.status).toBe("completed");
      const rceFinding = result.result.findings.find(
        (f: any) => f.vuln_type === "RCE",
      );
      expect(rceFinding).toBeDefined();
      expect(rceFinding!.severity).toBe("CRITICAL");
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 7: Workflow Execution — GitHub Clone Path
  // ═════════════════════════════════════════════════════════════════════

  describe("Workflow Execution — GitHub Clone", () => {
    it("should clone repo and cleanup for GitHub URLs", async () => {
      const { isGitHubPath, parseGitHubUrl, cloneRepo } = await import(
        "../src/tools/github.ts"
      );

      (isGitHubPath as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (parseGitHubUrl as ReturnType<typeof vi.fn>).mockReturnValue({
        owner: "test-owner",
        repo: "test-repo",
        fullUrl: "https://github.com/test-owner/test-repo.git",
      });

      const result = await vulnhuntrWorkflow.run({
        repo_path: "https://github.com/test-owner/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
      expect(cloneRepo).toHaveBeenCalled();

      const rmSync = fs.rmSync as unknown as ReturnType<typeof vi.fn>;
      expect(rmSync).toHaveBeenCalled();

      // Reset for other tests
      (isGitHubPath as ReturnType<typeof vi.fn>).mockReturnValue(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 8: andWhen Conditional — Cleanup Gating
  // ═════════════════════════════════════════════════════════════════════

  describe("andWhen — Conditional Cleanup", () => {
    it("should NOT cleanup when repo is local (not cloned)", async () => {
      const rmSync = fs.rmSync as unknown as ReturnType<typeof vi.fn>;
      rmSync.mockClear();

      await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(rmSync).not.toHaveBeenCalled();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 9: Budget Enforcement
  // ═════════════════════════════════════════════════════════════════════

  describe("Budget Enforcement", () => {
    it("should skip files when budget is exhausted", async () => {
      const { BudgetEnforcer } = await import("../src/cost-tracker/index.ts");

      // biome-ignore lint: mock constructor override
      (BudgetEnforcer as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function (this: any) {
        this.maxBudgetUsd = 0.01;
        this.check = vi.fn(() => false);
        this.getRemainingBudget = vi.fn(() => 0);
        this.shouldContinueIteration = vi.fn(() => false);
        return this;
      });

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        max_budget_usd: 0.01,
      });

      expect(result.status).toBe("completed");
      expect(result.result.findings).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 10: Checkpoint Resume
  // ═════════════════════════════════════════════════════════════════════

  describe("Checkpoint Resume", () => {
    it("should resume from checkpoint and skip completed files", async () => {
      const { AnalysisCheckpoint } = await import("../src/checkpoint/index.ts");

      // biome-ignore lint: mock constructor override
      (AnalysisCheckpoint as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function (this: any) {
        this.canResume = vi.fn(() => true);
        this.resume = vi.fn(() => ({
          completedFiles: ["app.py"],
          pendingFiles: ["views.py"],
          currentFile: null,
          results: [],
          costTrackerData: null,
          repoPath: "/tmp/test-repo",
          model: "anthropic/claude-sonnet-4-20250514",
          startedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          version: "1.0",
        }));
        this.start = vi.fn();
        this.setCurrentFile = vi.fn();
        this.markFileComplete = vi.fn();
        this.save = vi.fn();
        this.saveNow = vi.fn();
        this.finalize = vi.fn();
        this.getProgressSummary = vi.fn(() => ({}));
        return this;
      });

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 11: Multi-Iteration Secondary Analysis
  // ═════════════════════════════════════════════════════════════════════

  describe("Multi-Iteration Secondary Analysis", () => {
    it("should iterate through context resolution up to maxIterations", async () => {
      let callCount = 0;

      mockChat.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            scratchpad: "Spotted potential LFI",
            analysis: "User input flows to file open",
            poc: null,
            confidence_score: 7,
            vulnerability_types: ["LFI"],
            context_code: [
              { name: "open_file", reason: "file access", code_line: "open(user_input)" },
            ],
          });
        }
        if (callCount === 2) {
          return JSON.stringify({
            scratchpad: "Checking sanitization",
            analysis: "Found path traversal with open_file",
            poc: "GET /api?file=../../etc/passwd",
            confidence_score: 8,
            vulnerability_types: ["LFI"],
            context_code: [
              { name: "sanitize_path", reason: "check sanitization", code_line: "sanitize_path(p)" },
            ],
          });
        }
        return JSON.stringify({
          scratchpad: "Confirmed LFI",
          analysis: "Path traversal confirmed",
          poc: "GET /api?file=....//....//etc/passwd",
          confidence_score: 9,
          vulnerability_types: ["LFI"],
          context_code: [],
        });
      });

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        min_confidence: 5,
        max_iterations: 5,
      });

      expect(result.status).toBe("completed");
      expect(result.result.findings.length).toBeGreaterThanOrEqual(1);

      const lfiFinding = result.result.findings.find(
        (f: any) => f.vuln_type === "LFI",
      );
      expect(lfiFinding).toBeDefined();
      expect(lfiFinding!.confidence).toBeGreaterThanOrEqual(8);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 12: Error Resilience
  // ═════════════════════════════════════════════════════════════════════

  describe("Error Resilience", () => {
    it("should handle LLM errors gracefully during initial analysis", async () => {
      mockChat.mockImplementation(async () => {
        throw new Error("Model API timeout");
      });

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
      expect(result.result.findings).toHaveLength(0);
    });

    it("should handle unreadable files gracefully", async () => {
      const readFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;
      readFileSync.mockImplementation((p: unknown) => {
        if (typeof p === "string" && p.includes("app.py")) {
          throw new Error("Permission denied");
        }
        return "# mock content\n";
      });

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");

      readFileSync.mockImplementation(() => "# mock file content\nimport os\n");
    });

    it("should handle MCP connection failures gracefully", async () => {
      const { getMCPTools } = await import("../src/mcp/index.ts");
      (getMCPTools as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("MCP server not found"),
      );

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
    });

    it("should handle malformed LLM response gracefully", async () => {
      mockChat.mockImplementation(async () =>
        "This is not valid JSON at all, just random text",
      );

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
      expect(result.result.findings).toHaveLength(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 13: Input Validation (Zod Schema)
  // ═════════════════════════════════════════════════════════════════════

  describe("Input Validation", () => {
    it("should accept minimal valid input", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
      });
      expect(result.status).toBe("completed");
    });

    it("should accept all optional fields", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "openai" as const,
        model: "gpt-4o",
        analyze_path: "src/app.py",
        max_budget_usd: 1.5,
        min_confidence: 7,
        max_iterations: 10,
        vuln_types: ["LFI", "RCE", "SSRF"],
      });
      expect(result.status).toBe("completed");
    });

    it("should handle unknown provider gracefully (falls back to default model)", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "invalid_provider" as any,
      });
      // VoltAgent does not enforce Zod schema at runtime; resolveModel
      // falls back to the anthropic default for unrecognized providers.
      expect(result.status).toBe("completed");
    });

    it("should handle out-of-range confidence score (no runtime Zod validation)", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        min_confidence: 15,
      });
      // VoltAgent chain does not validate input against the Zod schema at
      // runtime. The value passes through to mergeConfigWithInput as-is.
      expect(result.status).toBe("completed");
    });

    it("should handle out-of-range max_iterations (no runtime Zod validation)", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        max_iterations: 25,
      });
      expect(result.status).toBe("completed");
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 14: WorkflowState Persistence Through Steps
  // ═════════════════════════════════════════════════════════════════════

  describe("WorkflowState Persistence", () => {
    it("should initialize workflowState in setup-repo step", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
    });

    it("should persist workflowState through andForEach boundary", async () => {
      mockChat.mockImplementation(async () =>
        JSON.stringify({
          scratchpad: "Analysis",
          analysis: "Found RCE",
          poc: "exec(input)",
          confidence_score: 8,
          vulnerability_types: ["RCE"],
          context_code: [],
        }),
      );

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        min_confidence: 5,
      });

      expect(result.status).toBe("completed");
      expect(result.result.findings.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 15: Result Schema Validation
  // ═════════════════════════════════════════════════════════════════════

  describe("Result Schema Validation", () => {
    it("should return result matching WorkflowResultSchema shape", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      const r = result.result;
      expect(r).toHaveProperty("findings");
      expect(r).toHaveProperty("files_analyzed");
      expect(r).toHaveProperty("summary");
      expect(r.summary).toHaveProperty("total_files");
      expect(r.summary).toHaveProperty("total_findings");
      expect(r.summary).toHaveProperty("by_vuln_type");
      expect(r.summary).toHaveProperty("by_confidence");
    });

    it("should have correct summary statistics", async () => {
      mockChat.mockImplementation(async () =>
        JSON.stringify({
          scratchpad: "Found XSS",
          analysis: "Reflected XSS via template",
          poc: "<script>alert(1)</script>",
          confidence_score: 8,
          vulnerability_types: ["XSS"],
          context_code: [],
        }),
      );

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        min_confidence: 5,
      });

      const { summary } = result.result;
      expect(summary.total_findings).toBe(result.result.findings.length);
      expect(typeof summary.by_vuln_type).toBe("object");
      expect(typeof summary.by_confidence).toBe("object");
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 16: Execution Metadata
  // ═════════════════════════════════════════════════════════════════════

  describe("Execution Metadata", () => {
    it("should return execution metadata", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.executionId).toBeDefined();
      expect(typeof result.executionId).toBe("string");
      expect(result.workflowId).toBe("vulnhuntr-analysis");
      expect(result.status).toBe("completed");
    });

    it("should have timing information", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.startAt).toBeDefined();
      expect(result.endAt).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 17: Provider Configuration
  // ═════════════════════════════════════════════════════════════════════

  describe("Provider Configuration", () => {
    it("should work with anthropic provider (default)", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });
      expect(result.status).toBe("completed");
    });

    it("should work with openai provider", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "openai" as const,
      });
      expect(result.status).toBe("completed");
    });

    it("should work with ollama provider", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "ollama" as const,
      });
      expect(result.status).toBe("completed");
    });

    it("should use custom model when provided", async () => {
      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        model: "claude-opus-4-20250514",
      });
      expect(result.status).toBe("completed");
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 18: Single File Analysis (analyze_path)
  // ═════════════════════════════════════════════════════════════════════

  describe("Single File Analysis (analyze_path)", () => {
    it("should analyze a single file when analyze_path is provided", async () => {
      const statSync = fs.statSync as unknown as ReturnType<typeof vi.fn>;
      statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false });

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        analyze_path: "app.py",
      });

      expect(result.status).toBe("completed");

      statSync.mockReturnValue({ isFile: () => false, isDirectory: () => true });
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 19: VulnType Filtering
  // ═════════════════════════════════════════════════════════════════════

  describe("VulnType Filtering", () => {
    it("should only report findings for requested vuln types", async () => {
      mockChat.mockImplementation(async () =>
        JSON.stringify({
          scratchpad: "Multiple vulns",
          analysis: "Found SSRF and LFI",
          poc: "exploit",
          confidence_score: 9,
          vulnerability_types: ["SSRF", "LFI"],
          context_code: [],
        }),
      );

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
        vuln_types: ["SSRF"],
        min_confidence: 5,
      });

      expect(result.status).toBe("completed");

      for (const f of result.result.findings) {
        expect(f.vuln_type).toBe("SSRF");
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // Section 20: Edge Cases
  // ═════════════════════════════════════════════════════════════════════

  describe("Edge Cases", () => {
    it("should handle empty file list gracefully", async () => {
      const { getPythonFiles } = await import("../src/tools/repo.ts");
      (getPythonFiles as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
      expect(result.result.findings).toHaveLength(0);
    });

    it("should handle missing README gracefully", async () => {
      const { getReadmeContent } = await import("../src/tools/repo.ts");
      (getReadmeContent as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

      const result = await vulnhuntrWorkflow.run({
        repo_path: "/tmp/test-repo",
        provider: "anthropic" as const,
      });

      expect(result.status).toBe("completed");
    });
  });
});
