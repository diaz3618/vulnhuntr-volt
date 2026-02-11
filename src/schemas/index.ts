/**
 * Zod schemas mirroring vulnhuntr's core/models.py
 * VulnType enum, ContextCode, Response, and analysis types.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Vulnerability Types (mirrors VulnType enum with CWE mappings)
// ---------------------------------------------------------------------------

export const VulnType = z.enum([
  "LFI", // CWE-22  Local File Inclusion
  "RCE", // CWE-78  Remote Code Execution
  "SSRF", // CWE-918 Server-Side Request Forgery
  "AFO", // CWE-73  Arbitrary File Overwrite
  "SQLI", // CWE-89  SQL Injection
  "XSS", // CWE-79  Cross-Site Scripting
  "IDOR", // CWE-639 Insecure Direct Object Reference
]);

export type VulnType = z.infer<typeof VulnType>;

export const CWE_MAP: Record<string, string> = {
  LFI: "CWE-22",
  RCE: "CWE-78",
  SSRF: "CWE-918",
  AFO: "CWE-73",
  SQLI: "CWE-89",
  XSS: "CWE-79",
  IDOR: "CWE-639",
};

// ---------------------------------------------------------------------------
// Context Code (LLM requests for more code context)
// ---------------------------------------------------------------------------

export const ContextCodeSchema = z.object({
  name: z.string().describe("Function or Class name"),
  reason: z
    .string()
    .describe("Brief reason why this function's code is needed"),
  code_line: z
    .string()
    .describe(
      "The single line of code where this context object is referenced",
    ),
});

export type ContextCode = z.infer<typeof ContextCodeSchema>;

// ---------------------------------------------------------------------------
// LLM Response (structured output from analysis)
// ---------------------------------------------------------------------------

export const ResponseSchema = z.object({
  scratchpad: z.string().describe("Step-by-step analysis reasoning"),
  analysis: z.string().describe("Final analysis summary"),
  poc: z.string().nullable().optional().describe("Proof-of-concept exploit"),
  confidence_score: z.number().min(0).max(10).describe("Confidence score 0-10"),
  vulnerability_types: z
    .array(VulnType)
    .describe("Identified vulnerability types"),
  context_code: z
    .array(ContextCodeSchema)
    .describe("Requested code context items"),
});

export type Response = z.infer<typeof ResponseSchema>;

// ---------------------------------------------------------------------------
// Severity (mirrors reporters/base.py FindingSeverity)
// ---------------------------------------------------------------------------

export const FindingSeverity = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
]);
export type FindingSeverity = z.infer<typeof FindingSeverity>;

/** Numeric severity scores for sorting/filtering. */
export const SEVERITY_SCORES: Record<string, number> = {
  CRITICAL: 10,
  HIGH: 8,
  MEDIUM: 5,
  LOW: 3,
  INFO: 1,
};

/** Human-readable CWE names. */
export const CWE_NAMES: Record<string, string> = {
  "CWE-22": "Path Traversal",
  "CWE-78": "OS Command Injection",
  "CWE-918": "Server-Side Request Forgery",
  "CWE-73": "External Control of File Name or Path",
  "CWE-89": "SQL Injection",
  "CWE-79": "Cross-site Scripting",
  "CWE-639": "Authorization Bypass Through User-Controlled Key",
};

// ---------------------------------------------------------------------------
// Enriched Finding (mirrors reporters/base.py Finding dataclass — 18+ fields)
// ---------------------------------------------------------------------------

export const FindingSchema = z.object({
  /** Unique rule identifier, e.g. "vulnhuntr/LFI" */
  rule_id: z.string().default(""),
  /** Short title, e.g. "LFI in file_utils.py" */
  title: z.string().default(""),
  /** Path relative to repo root */
  file_path: z.string(),
  /** Start line number (1-based, 0 = unknown) */
  start_line: z.number().default(0),
  /** End line number (1-based, 0 = unknown) */
  end_line: z.number().default(0),
  /** Start column (0-based, 0 = unknown) */
  start_column: z.number().default(0),
  /** End column (0-based, 0 = unknown) */
  end_column: z.number().default(0),
  /** Human-readable description for reports */
  description: z.string().default(""),
  /** Full analysis text from the LLM */
  analysis: z.string(),
  /** LLM scratchpad / chain-of-thought */
  scratchpad: z.string().default(""),
  /** Proof-of-concept exploit */
  poc: z.string().nullable().optional(),
  /** Confidence 0-10 */
  confidence: z.number().min(0).max(10),
  /** Severity level */
  severity: FindingSeverity.default("MEDIUM"),
  /** Primary vulnerability type */
  vuln_type: VulnType,
  /** CWE identifier, e.g. "CWE-22" */
  cwe: z.string(),
  /** CWE human name */
  cwe_name: z.string().default(""),
  /** Relevant source code snippet */
  context_code: z.string().default(""),
  /** Arbitrary metadata */
  metadata: z.record(z.string(), z.unknown()).default({}),
  /** ISO 8601 timestamp of discovery */
  discovered_at: z.string().default(""),
});

export type Finding = z.infer<typeof FindingSchema>;

// ---------------------------------------------------------------------------
// Finding constructor helper
// ---------------------------------------------------------------------------

/**
 * Convert a raw LLM Response into an enriched Finding.
 * Mirrors reporters/base.py response_to_finding().
 */
export function responseToFinding(
  response: Response,
  filePath: string,
  vulnType: string,
): Finding {
  const cwe = CWE_MAP[vulnType] ?? "CWE-0";
  const cweName = CWE_NAMES[cwe] ?? "Unknown";
  const confidence = response.confidence_score;

  // Map confidence → severity (matches Python logic)
  let severity: FindingSeverity;
  if (confidence >= 9) severity = "CRITICAL";
  else if (confidence >= 7) severity = "HIGH";
  else if (confidence >= 5) severity = "MEDIUM";
  else if (confidence >= 3) severity = "LOW";
  else severity = "INFO";

  return {
    rule_id: `vulnhuntr/${vulnType}`,
    title: `${vulnType} vulnerability in ${filePath.split("/").pop() ?? filePath}`,
    file_path: filePath,
    start_line: 0,
    end_line: 0,
    start_column: 0,
    end_column: 0,
    description: response.analysis,
    analysis: response.analysis,
    scratchpad: response.scratchpad,
    poc: response.poc ?? null,
    confidence,
    severity,
    vuln_type: vulnType as z.infer<typeof VulnType>,
    cwe,
    cwe_name: cweName,
    context_code: "",
    metadata: {},
    discovered_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Analysis Result (per-file output)
// ---------------------------------------------------------------------------

export const AnalysisResultSchema = z.object({
  file_path: z.string(),
  initial_report: ResponseSchema,
  findings: z.array(FindingSchema),
  context_code_used: z.record(z.string(), z.string()).optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ---------------------------------------------------------------------------
// Workflow Input / Output schemas
// ---------------------------------------------------------------------------

export const WorkflowInputSchema = z.object({
  /** Local path or GitHub URL of the repository to analyze */
  repo_path: z.string().describe("Local path or GitHub URL to analyze"),
  /** LLM provider to use */
  provider: z.enum(["anthropic", "openai", "ollama"]).default("anthropic"),
  /** Model name override */
  model: z.string().optional(),
  /** Specific file or directory to analyze (optional) */
  analyze_path: z.string().optional(),
  /** Maximum budget in USD (optional) */
  max_budget_usd: z.number().optional(),
  /** Minimum confidence to report (default 5) */
  min_confidence: z.number().min(0).max(10).default(5),
  /** Maximum secondary analysis iterations per vuln type */
  max_iterations: z.number().min(1).max(20).default(7),
  /** Vulnerability types to scan for (default all) */
  vuln_types: z.array(VulnType).optional(),
  /** Dry-run mode: preview analysis without making LLM API calls */
  dry_run: z.boolean().default(false),
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

export const WorkflowResultSchema = z.object({
  /** All findings across all files */
  findings: z.array(FindingSchema),
  /** Files analyzed */
  files_analyzed: z.array(z.string()),
  /** Total cost in USD */
  total_cost_usd: z.number().optional(),
  /** Summary statistics */
  summary: z.object({
    total_files: z.number(),
    total_findings: z.number(),
    by_vuln_type: z.record(z.string(), z.number()),
    by_confidence: z.record(z.string(), z.number()),
  }),
});

export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;
