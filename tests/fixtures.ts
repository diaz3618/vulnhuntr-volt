import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Finding, WorkflowResult } from "../src/schemas/index.js";

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
	return {
		rule_id: "vulnhuntr/LFI",
		title: "LFI vulnerability in app.py",
		file_path: "app.py",
		start_line: 0,
		end_line: 0,
		start_column: 0,
		end_column: 0,
		description: "Test analysis",
		analysis: "Test analysis",
		scratchpad: "Step 1: checked input flow",
		poc: "curl http://target/read?file=../../etc/passwd",
		confidence: 8,
		severity: "HIGH",
		vuln_type: "LFI",
		cwe: "CWE-22",
		cwe_name: "Path Traversal",
		context_code: "",
		metadata: {},
		discovered_at: "2025-01-01T00:00:00.000Z",
		...overrides,
	};
}

export function makeWorkflowResult(
	overrides: Partial<WorkflowResult> = {},
): WorkflowResult {
	const findings = overrides.findings ?? [
		makeFinding({ confidence: 9, severity: "CRITICAL", vuln_type: "RCE", rule_id: "vulnhuntr/RCE", cwe: "CWE-78", cwe_name: "OS Command Injection" }),
		makeFinding({ confidence: 7, severity: "HIGH" }),
		makeFinding({ confidence: 4, severity: "LOW", vuln_type: "XSS", rule_id: "vulnhuntr/XSS", cwe: "CWE-79", cwe_name: "Cross-site Scripting" }),
	];
	return {
		findings,
		files_analyzed: ["app.py", "views.py"],
		total_cost_usd: 0.1234,
		summary: {
			total_files: 2,
			total_findings: findings.length,
			by_vuln_type: { RCE: 1, LFI: 1, XSS: 1 },
			by_confidence: { "9": 1, "7": 1, "4": 1 },
		},
		...overrides,
	};
}

export function makeTempDir(prefix = "vulnhuntr-test-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanTempDir(dir: string): void {
	fs.rmSync(dir, { recursive: true, force: true });
}
