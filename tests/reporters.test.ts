import { describe, it, expect } from "vitest";
import {
	generateSarifReport,
	generateJsonReport,
	generateMarkdownReport,
	generateHtmlReport,
	generateCsvReport,
} from "../src/reporters/index.js";
import { makeWorkflowResult, makeFinding } from "./fixtures.js";

const result = makeWorkflowResult();

describe("generateSarifReport", () => {
	const sarif = generateSarifReport(result) as Record<string, unknown>;

	it("uses SARIF 2.1.0 schema", () => {
		expect(sarif.version).toBe("2.1.0");
		expect(sarif.$schema).toContain("sarif-schema-2.1.0");
	});

	it("includes tool driver with rules", () => {
		const runs = sarif.runs as Array<Record<string, unknown>>;
		const driver = (runs[0].tool as Record<string, unknown>).driver as Record<string, unknown>;
		expect(driver.name).toBe("vulnhuntr-volt");
		expect(Array.isArray(driver.rules)).toBe(true);
		expect((driver.rules as unknown[]).length).toBe(7);
	});

	it("maps findings to results", () => {
		const runs = sarif.runs as Array<Record<string, unknown>>;
		const results = runs[0].results as Array<Record<string, unknown>>;
		expect(results).toHaveLength(3);
	});

	it("includes partialFingerprints on each result", () => {
		const runs = sarif.runs as Array<Record<string, unknown>>;
		const results = runs[0].results as Array<Record<string, unknown>>;
		for (const r of results) {
			expect(r.partialFingerprints).toBeDefined();
		}
	});

	it("maps CRITICAL/HIGH to error level", () => {
		const runs = sarif.runs as Array<Record<string, unknown>>;
		const results = runs[0].results as Array<Record<string, unknown>>;
		// First result is CRITICAL (sorted by severity)
		expect(results[0].level).toBe("error");
	});
});

describe("generateJsonReport", () => {
	const json = generateJsonReport(result) as Record<string, unknown>;

	it("includes metadata", () => {
		const meta = json.metadata as Record<string, unknown>;
		expect(meta.tool).toBe("vulnhuntr-volt");
		expect(meta.total_findings).toBe(3);
	});

	it("sorts findings by severity (most severe first)", () => {
		const findings = (json.findings as Array<Record<string, unknown>>);
		expect(findings[0].severity).toBe("CRITICAL");
		expect(findings[findings.length - 1].severity).toBe("LOW");
	});

	it("includes CWE URL", () => {
		const findings = (json.findings as Array<Record<string, unknown>>);
		expect(findings[0].cwe_url).toContain("cwe.mitre.org");
	});
});

describe("generateMarkdownReport", () => {
	const md = generateMarkdownReport(result);

	it("starts with report header", () => {
		expect(md).toContain("# Vulnerability Analysis Report");
	});

	it("includes summary table", () => {
		expect(md).toContain("Files Analyzed");
		expect(md).toContain("Total Findings");
	});

	it("includes finding sections", () => {
		expect(md).toContain("## Findings");
		expect(md).toContain("RCE");
		expect(md).toContain("LFI");
	});

	it("includes PoC code blocks", () => {
		expect(md).toContain("**Proof of Concept**");
		expect(md).toContain("```");
	});

	it("shows no findings message when empty", () => {
		const empty = makeWorkflowResult({ findings: [], summary: { total_files: 1, total_findings: 0, by_vuln_type: {}, by_confidence: {} } });
		const md = generateMarkdownReport(empty);
		expect(md).toContain("No vulnerabilities found");
	});
});

describe("generateHtmlReport", () => {
	const html = generateHtmlReport(result);

	it("is valid HTML document", () => {
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
	});

	it("includes severity badges", () => {
		expect(html).toContain('class="badge critical"');
		expect(html).toContain('class="badge high"');
	});

	it("includes finding divs", () => {
		expect(html).toContain('class="finding');
		expect(html).toContain("finding-header");
	});

	it("includes keyboard navigation script", () => {
		expect(html).toContain("keydown");
		expect(html).toContain("collapsed");
	});
});

describe("generateCsvReport", () => {
	const csv = generateCsvReport(result);
	const lines = csv.split("\n");

	it("starts with header row", () => {
		expect(lines[0]).toBe(
			"rule_id,title,file_path,start_line,end_line,vuln_type,severity,confidence,cwe,cwe_name,analysis,poc,discovered_at",
		);
	});

	it("has correct number of data rows", () => {
		expect(lines).toHaveLength(4); // header + 3 findings
	});

	it("escapes commas in fields", () => {
		const withComma = makeWorkflowResult({
			findings: [makeFinding({ analysis: "Found vuln, needs fix" })],
			summary: { total_files: 1, total_findings: 1, by_vuln_type: { LFI: 1 }, by_confidence: { "8": 1 } },
		});
		const csv = generateCsvReport(withComma);
		expect(csv).toContain('"Found vuln, needs fix"');
	});

	it("escapes double quotes in fields", () => {
		const withQuote = makeWorkflowResult({
			findings: [makeFinding({ analysis: 'Use "safe" mode' })],
			summary: { total_files: 1, total_findings: 1, by_vuln_type: { LFI: 1 }, by_confidence: { "8": 1 } },
		});
		const csv = generateCsvReport(withQuote);
		expect(csv).toContain('""safe""');
	});
});
