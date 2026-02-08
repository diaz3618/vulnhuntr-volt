#!/usr/bin/env node
/**
 * VulnHuntr CLI Entry Point
 * =========================
 * Direct command-line interface for running the VulnHuntr workflow.
 *
 * Usage:
 *   npx tsx src/cli.ts -r /path/to/repo
 *   npx tsx src/cli.ts -r https://github.com/owner/repo
 *   npx tsx src/cli.ts -r /path/to/repo -a specific/file.py
 *   npx tsx src/cli.ts -r /path/to/repo -l openai -m gpt-4o
 *
 * This mirrors the original vulnhuntr CLI interface.
 */

import "dotenv/config";
import { parseArgs } from "node:util";
import { vulnhuntrWorkflow } from "./workflows/index.js";
import type { WorkflowInput } from "./schemas/index.js";
import { WorkflowInputSchema, VulnType } from "./schemas/index.js";

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  options: {
    root: {
      type: "string",
      short: "r",
      description: "Path to the root directory of the project or GitHub URL",
    },
    analyze: {
      type: "string",
      short: "a",
      description: "Specific path or file within the project to analyze",
    },
    llm: {
      type: "string",
      short: "l",
      default: "anthropic",
      description: "LLM provider to use (anthropic, openai, ollama)",
    },
    model: {
      type: "string",
      short: "m",
      description: "Specific model name to use",
    },
    budget: {
      type: "string",
      short: "b",
      description: "Maximum budget in USD",
    },
    confidence: {
      type: "string",
      short: "c",
      default: "5",
      description: "Minimum confidence threshold (0-10)",
    },
    iterations: {
      type: "string",
      short: "i",
      default: "7",
      description: "Maximum secondary analysis iterations",
    },
    vuln: {
      type: "string",
      multiple: true,
      short: "v",
      description:
        "Specific vulnerability types to scan (LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR)",
    },
    help: {
      type: "boolean",
      short: "h",
      description: "Show help",
    },
  },
  allowPositionals: true,
  strict: true,
});

// ---------------------------------------------------------------------------
// Help Text
// ---------------------------------------------------------------------------

function showHelp(): void {
  console.log(`
VulnHuntr - AI-Powered Python Vulnerability Scanner
====================================================

Analyze Python repositories for remotely exploitable vulnerabilities using
LLM-powered static analysis.

USAGE:
  npx tsx src/cli.ts -r <path-or-url> [options]
  npm run vulnhuntr -- -r <path-or-url> [options]

REQUIRED:
  -r, --root <path>       Path to local repo OR GitHub URL
                          Examples:
                            -r /path/to/local/repo
                            -r https://github.com/owner/repo
                            -r github.com/owner/repo

OPTIONS:
  -a, --analyze <path>    Specific file or directory to analyze (relative to root)
  -l, --llm <provider>    LLM provider: anthropic, openai, ollama (default: anthropic)
  -m, --model <name>      Specific model name (default: claude-sonnet-4-20250514)
  -b, --budget <usd>      Maximum budget in USD
  -c, --confidence <n>    Minimum confidence threshold 0-10 (default: 5)
  -i, --iterations <n>    Max secondary analysis iterations (default: 7)
  -v, --vuln <type>       Scan for specific vuln types only (can repeat)
                          Types: LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR
  -h, --help              Show this help message

EXAMPLES:
  # Analyze entire local repository
  npx tsx src/cli.ts -r /path/to/project

  # Analyze a GitHub repository
  npx tsx src/cli.ts -r https://github.com/owner/repo

  # Analyze specific file with OpenAI
  npx tsx src/cli.ts -r /path/to/project -a server.py -l openai

  # Scan for specific vulnerability types with budget limit
  npx tsx src/cli.ts -r /path/to/project -v LFI -v RCE -b 5.00

ENVIRONMENT VARIABLES:
  ANTHROPIC_API_KEY       Required for Anthropic/Claude
  OPENAI_API_KEY          Required for OpenAI
  OLLAMA_BASE_URL         Ollama server URL (default: http://localhost:11434)

OUTPUT:
  Reports are written to .vulnhuntr-reports/ in the current directory.
  Formats: JSON, SARIF, Markdown, HTML, CSV, and cost summary.

For more information, see: https://github.com/protectai/vulnhuntr
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Show help
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // Require --root
  if (!values.root) {
    console.error("Error: --root (-r) is required.");
    console.error("Use --help for usage information.");
    process.exit(1);
  }

  // Validate provider
  const validProviders = ["anthropic", "openai", "ollama"] as const;
  const provider = values.llm as (typeof validProviders)[number];
  if (!validProviders.includes(provider)) {
    console.error(`Error: Invalid LLM provider: ${values.llm}`);
    console.error("Valid options: anthropic, openai, ollama");
    process.exit(1);
  }

  // Validate vuln types
  const validVulnTypes = ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"];
  const vulnTypes = values.vuln?.filter((v): v is string =>
    validVulnTypes.includes(v.toUpperCase()),
  );
  if (values.vuln && vulnTypes?.length !== values.vuln.length) {
    const invalid = values.vuln.filter(
      (v) => !validVulnTypes.includes(v.toUpperCase()),
    );
    console.error(`Error: Invalid vulnerability types: ${invalid.join(", ")}`);
    console.error(`Valid options: ${validVulnTypes.join(", ")}`);
    process.exit(1);
  }

  // Build workflow input
  const input: WorkflowInput = {
    repo_path: values.root,
    provider,
    model: values.model,
    analyze_path: values.analyze,
    max_budget_usd: values.budget
      ? Number.parseFloat(values.budget)
      : undefined,
    min_confidence: Number.parseInt(values.confidence ?? "5", 10),
    max_iterations: Number.parseInt(values.iterations ?? "7", 10),
    vuln_types: vulnTypes?.map((v) => v.toUpperCase()) as
      | (typeof VulnType._type)[]
      | undefined,
  };

  // Validate input with Zod (runtime validation)
  const parseResult = WorkflowInputSchema.safeParse(input);
  if (!parseResult.success) {
    console.error("Error: Invalid input:");
    for (const issue of parseResult.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  // Check API keys
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is required for Anthropic/Claude.",
    );
    console.error("Export it before running: export ANTHROPIC_API_KEY=sk-...");
    process.exit(1);
  }
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    console.error(
      "Error: OPENAI_API_KEY environment variable is required for OpenAI.",
    );
    console.error("Export it before running: export OPENAI_API_KEY=sk-...");
    process.exit(1);
  }

  console.log("\n🛡️  VulnHuntr - AI-Powered Vulnerability Scanner");
  console.log("═══════════════════════════════════════════════\n");

  try {
    // Run the workflow
    const result = await vulnhuntrWorkflow.run(parseResult.data);

    // Print final results
    if (result.status === "completed" && result.result) {
      const r = result.result;
      console.log("\n═══════════════════════════════════════════════");
      console.log("                  SCAN COMPLETE                 ");
      console.log("═══════════════════════════════════════════════");
      console.log(`Files analyzed:    ${r.files_analyzed?.length ?? 0}`);
      console.log(`Total findings:    ${r.findings?.length ?? 0}`);
      console.log(`Total cost:        $${(r.total_cost_usd ?? 0).toFixed(4)}`);

      if (r.findings && r.findings.length > 0) {
        console.log("\n🚨 FINDINGS:");
        for (const f of r.findings) {
          console.log(`\n  [${f.severity}] ${f.vuln_type} in ${f.file_path}`);
          console.log(`  Confidence: ${f.confidence}/10`);
          console.log(`  CWE: ${f.cwe} (${f.cwe_name})`);
          console.log(
            `  ${f.description.substring(0, 200)}${f.description.length > 200 ? "..." : ""}`,
          );
        }
      } else {
        console.log("\n✅ No vulnerabilities found.");
      }

      console.log("\n📊 Reports written to .vulnhuntr-reports/");
      console.log("═══════════════════════════════════════════════\n");
    } else if (result.status === "error") {
      console.error(`\n❌ Analysis failed: ${result.error}`);
      process.exit(1);
    } else if (result.status === "suspended") {
      console.log("\n⏸️  Analysis suspended. Resume using workflow API.");
      console.log(`   Execution ID: ${result.executionId}`);
    }
  } catch (error) {
    console.error(
      "\n❌ Fatal error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
