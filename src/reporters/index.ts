/**
 * Report generators — mirrors vulnhuntr's reporters/.
 * Generates SARIF, JSON, Markdown, HTML, and CSV reports from findings.
 * Enriched with full Python parity: partialFingerprints, codeFlows,
 * severity badges, collapsible details, interactive HTML, etc.
 */

import { createHash } from "node:crypto";
import type { Finding, WorkflowResult } from "../schemas/index.js";
import { CWE_MAP, CWE_NAMES, SEVERITY_SCORES } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function escapeCsv(str: string): string {
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/** SHA-256 fingerprint for a finding (for SARIF partialFingerprints). */
function fingerprintFinding(f: Finding): string {
	const data = `${f.file_path}:${f.vuln_type}:${f.analysis.slice(0, 200)}`;
	return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function severityEmoji(sev: string): string {
	switch (sev) {
		case "CRITICAL":
			return "🔴";
		case "HIGH":
			return "🟠";
		case "MEDIUM":
			return "🟡";
		case "LOW":
			return "🟢";
		case "INFO":
			return "🔵";
		default:
			return "⚪";
	}
}

function sarifLevel(f: Finding): string {
	if (f.severity === "CRITICAL" || f.severity === "HIGH") return "error";
	if (f.severity === "MEDIUM") return "warning";
	return "note";
}

/** Sort findings by severity (most severe first), then confidence desc. */
function sortFindings(findings: Finding[]): Finding[] {
	return [...findings].sort((a, b) => {
		const sa = SEVERITY_SCORES[a.severity] ?? 0;
		const sb = SEVERITY_SCORES[b.severity] ?? 0;
		if (sb !== sa) return sb - sa;
		return b.confidence - a.confidence;
	});
}

// ---------------------------------------------------------------------------
// SARIF Report (enriched: partialFingerprints, codeFlows, taxonomies)
// ---------------------------------------------------------------------------

export function generateSarifReport(result: WorkflowResult): object {
	const sorted = sortFindings(result.findings);

	return {
		$schema:
			"https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
		version: "2.1.0",
		runs: [
			{
				tool: {
					driver: {
						name: "vulnhuntr-volt",
						version: "1.0.0",
						semanticVersion: "1.0.0",
						informationUri: "https://github.com/protectai/vulnhuntr",
						rules: Object.entries(CWE_MAP).map(([id, cwe]) => ({
							id: `vulnhuntr/${id}`,
							name: id,
							shortDescription: { text: `${id} vulnerability detection` },
							fullDescription: {
								text: CWE_NAMES[cwe] ?? `${id} vulnerability`,
							},
							helpUri: `https://cwe.mitre.org/data/definitions/${cwe.replace("CWE-", "")}.html`,
							properties: {
								tags: ["security", cwe],
								"security-severity": String(SEVERITY_SCORES.HIGH),
							},
						})),
					},
				},
				invocations: [
					{
						executionSuccessful: true,
						startTimeUtc: new Date().toISOString(),
					},
				],
				taxonomies: [
					{
						name: "CWE",
						version: "4.13",
						informationUri:
							"https://cwe.mitre.org/data/published/cwe_v4.13.pdf",
						taxa: Object.entries(CWE_NAMES).map(([cwe, name]) => ({
							id: cwe,
							name,
							shortDescription: { text: name },
							helpUri: `https://cwe.mitre.org/data/definitions/${cwe.replace("CWE-", "")}.html`,
						})),
					},
				],
				results: sorted.map((finding) => {
					const fp = fingerprintFinding(finding);
					const region =
						finding.start_line > 0
							? {
									startLine: finding.start_line,
									endLine: finding.end_line || finding.start_line,
								}
							: undefined;

					const resultObj: Record<string, unknown> = {
						ruleId: finding.rule_id || finding.vuln_type,
						level: sarifLevel(finding),
						message: { text: finding.analysis },
						partialFingerprints: {
							primaryLocationLineHash: fp,
						},
						locations: [
							{
								physicalLocation: {
									artifactLocation: { uri: finding.file_path },
									...(region ? { region } : {}),
								},
							},
						],
						properties: {
							confidence: finding.confidence,
							severity: finding.severity,
							cwe: finding.cwe,
							"security-severity": String(
								SEVERITY_SCORES[finding.severity] ?? 5,
							),
							...(finding.poc ? { poc: finding.poc } : {}),
							...(finding.discovered_at
								? { discovered_at: finding.discovered_at }
								: {}),
						},
					};

					// codeFlows for context
					if (finding.context_code) {
						resultObj.codeFlows = [
							{
								threadFlows: [
									{
										locations: [
											{
												location: {
													physicalLocation: {
														artifactLocation: { uri: finding.file_path },
													},
													message: { text: finding.context_code.slice(0, 500) },
												},
											},
										],
									},
								],
							},
						];
					}

					return resultObj;
				}),
			},
		],
	};
}

// ---------------------------------------------------------------------------
// JSON Report (enriched: severity, timestamps, scratchpad, line numbers)
// ---------------------------------------------------------------------------

export function generateJsonReport(result: WorkflowResult): object {
	const sorted = sortFindings(result.findings);

	// Build severity breakdown
	const bySeverity: Record<string, number> = {};
	for (const f of sorted) {
		bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
	}

	return {
		metadata: {
			tool: "vulnhuntr-volt",
			version: "1.0.0",
			timestamp: new Date().toISOString(),
			files_analyzed: result.files_analyzed.length,
			total_findings: result.findings.length,
		},
		summary: {
			...result.summary,
			by_severity: bySeverity,
		},
		findings: sorted.map((f) => ({
			rule_id: f.rule_id,
			title: f.title,
			file_path: f.file_path,
			start_line: f.start_line,
			end_line: f.end_line,
			vuln_type: f.vuln_type,
			severity: f.severity,
			confidence: f.confidence,
			cwe: f.cwe,
			cwe_name: f.cwe_name,
			cwe_url: `https://cwe.mitre.org/data/definitions/${f.cwe.replace("CWE-", "")}.html`,
			analysis: f.analysis,
			scratchpad: f.scratchpad,
			poc: f.poc ?? null,
			context_code: f.context_code || undefined,
			discovered_at: f.discovered_at,
		})),
	};
}

// ---------------------------------------------------------------------------
// Markdown Report (enriched: 5-level severity, collapsible details)
// ---------------------------------------------------------------------------

export function generateMarkdownReport(result: WorkflowResult): string {
	const sorted = sortFindings(result.findings);
	const lines: string[] = [
		"# Vulnerability Analysis Report",
		"",
		`**Generated**: ${new Date().toISOString()}`,
		"**Tool**: vulnhuntr-volt v1.0.0",
		"",
		"## Summary",
		"",
		"| Metric | Value |",
		"|--------|-------|",
		`| Files Analyzed | ${result.summary.total_files} |`,
		`| Total Findings | ${result.summary.total_findings} |`,
		...(result.total_cost_usd
			? [`| Estimated Cost | $${result.total_cost_usd.toFixed(4)} |`]
			: []),
		"",
	];

	// Severity breakdown table
	const bySeverity: Record<string, number> = {};
	for (const f of sorted) {
		bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
	}
	if (Object.keys(bySeverity).length > 0) {
		lines.push("### Findings by Severity", "");
		lines.push("| Severity | Count |");
		lines.push("|----------|-------|");
		for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]) {
			if (bySeverity[sev]) {
				lines.push(`| ${severityEmoji(sev)} ${sev} | ${bySeverity[sev]} |`);
			}
		}
		lines.push("");
	}

	// By vulnerability type
	if (Object.keys(result.summary.by_vuln_type).length > 0) {
		lines.push("### Findings by Vulnerability Type", "");
		lines.push("| Type | Count | CWE |");
		lines.push("|------|-------|-----|");
		for (const [type, count] of Object.entries(result.summary.by_vuln_type)) {
			lines.push(`| ${type} | ${count} | ${CWE_MAP[type] ?? "N/A"} |`);
		}
		lines.push("");
	}

	// Individual findings with collapsible details
	if (sorted.length > 0) {
		lines.push("## Findings", "");
		for (const [i, f] of sorted.entries()) {
			const sev = `${severityEmoji(f.severity)} ${f.severity}`;
			const loc =
				f.start_line > 0
					? ` (L${f.start_line}–L${f.end_line || f.start_line})`
					: "";

			lines.push(
				`### ${i + 1}. ${f.vuln_type} in \`${f.file_path}\`${loc}`,
				"",
				`- **Severity**: ${sev}`,
				`- **Confidence**: ${f.confidence}/10`,
				`- **CWE**: [${f.cwe} — ${f.cwe_name || ""}](https://cwe.mitre.org/data/definitions/${f.cwe.replace("CWE-", "")}.html)`,
				...(f.discovered_at ? [`- **Discovered**: ${f.discovered_at}`] : []),
				"",
				"**Analysis**:",
				"",
				f.analysis,
				"",
			);

			if (f.poc) {
				lines.push("**Proof of Concept**:", "", "```", f.poc, "```", "");
			}

			// Collapsible scratchpad
			if (f.scratchpad) {
				lines.push(
					"<details>",
					"<summary>LLM Reasoning (scratchpad)</summary>",
					"",
					f.scratchpad,
					"",
					"</details>",
					"",
				);
			}

			// Collapsible context code
			if (f.context_code) {
				lines.push(
					"<details>",
					"<summary>Context Code</summary>",
					"",
					"```python",
					f.context_code,
					"```",
					"",
					"</details>",
					"",
				);
			}

			lines.push("---", "");
		}
	} else {
		lines.push("## No vulnerabilities found", "");
	}

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// HTML Report (enriched: interactive, collapsible, severity badges, print CSS)
// ---------------------------------------------------------------------------

export function generateHtmlReport(result: WorkflowResult): string {
	const sorted = sortFindings(result.findings);

	// Severity breakdown for summary
	const bySeverity: Record<string, number> = {};
	for (const f of sorted) {
		bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
	}
	const severityRows = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
		.filter((s) => bySeverity[s])
		.map(
			(s) =>
				`<tr><td><span class="badge ${s.toLowerCase()}">${s}</span></td><td>${bySeverity[s]}</td></tr>`,
		)
		.join("\n");

	const findings = sorted
		.map(
			(f, i) => `
    <div class="finding ${f.severity.toLowerCase()}">
      <div class="finding-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <span class="finding-num">#${i + 1}</span>
        <span class="badge ${f.severity.toLowerCase()}">${f.severity}</span>
        <span class="finding-title">${escapeHtml(f.vuln_type)} — ${escapeHtml(f.file_path)}${f.start_line > 0 ? ` (L${f.start_line})` : ""}</span>
        <span class="confidence">Confidence: ${f.confidence}/10</span>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="finding-body">
        <div class="meta">
          <span class="cwe"><a href="https://cwe.mitre.org/data/definitions/${f.cwe.replace("CWE-", "")}.html">${escapeHtml(f.cwe)}${f.cwe_name ? ` — ${escapeHtml(f.cwe_name)}` : ""}</a></span>
          ${f.discovered_at ? `<span class="timestamp">${escapeHtml(f.discovered_at)}</span>` : ""}
        </div>
        <div class="analysis"><h4>Analysis</h4><p>${escapeHtml(f.analysis)}</p></div>
        ${f.poc ? `<div class="poc"><h4>Proof of Concept</h4><pre><code>${escapeHtml(f.poc)}</code></pre></div>` : ""}
        ${f.scratchpad ? `<details class="scratchpad"><summary>LLM Reasoning</summary><pre>${escapeHtml(f.scratchpad)}</pre></details>` : ""}
        ${f.context_code ? `<details class="context"><summary>Context Code</summary><pre><code>${escapeHtml(f.context_code)}</code></pre></details>` : ""}
      </div>
    </div>`,
		)
		.join("\n");

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vulnerability Report — vulnhuntr-volt</title>
  <style>
    :root { --bg: #0d1117; --surface: #161b22; --border: #21262d; --text: #c9d1d9; --muted: #8b949e; --link: #58a6ff; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; background: var(--bg); color: var(--text); }
    h1 { color: var(--link); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    h2 { color: var(--muted); }
    a { color: var(--link); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .summary { background: var(--surface); padding: 1rem 1.5rem; border-radius: 6px; margin: 1rem 0; }
    .summary table { width: 100%; border-collapse: collapse; }
    .summary td, .summary th { padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge.critical { background: #f85149; color: #fff; }
    .badge.high { background: #d29922; color: #fff; }
    .badge.medium { background: #e3b341; color: #000; }
    .badge.low { background: #3fb950; color: #000; }
    .badge.info { background: #58a6ff; color: #000; }
    .finding { background: var(--surface); border-radius: 6px; margin: 1rem 0; border-left: 4px solid var(--muted); overflow: hidden; }
    .finding.critical { border-left-color: #f85149; }
    .finding.high { border-left-color: #d29922; }
    .finding.medium { border-left-color: #e3b341; }
    .finding.low { border-left-color: #3fb950; }
    .finding.info { border-left-color: #58a6ff; }
    .finding-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1.25rem; cursor: pointer; user-select: none; }
    .finding-header:hover { background: var(--border); }
    .finding-num { font-weight: 700; color: var(--muted); min-width: 2rem; }
    .finding-title { flex: 1; font-weight: 600; }
    .confidence { font-size: 0.85rem; color: var(--muted); }
    .toggle-icon { transition: transform 0.2s; font-size: 0.75rem; color: var(--muted); }
    .finding.collapsed .finding-body { display: none; }
    .finding.collapsed .toggle-icon { transform: rotate(-90deg); }
    .finding-body { padding: 0 1.25rem 1rem; }
    .meta { display: flex; gap: 1rem; margin: 0.5rem 0; flex-wrap: wrap; }
    .timestamp { color: var(--muted); font-size: 0.85rem; }
    .poc pre, .scratchpad pre, .context pre { background: var(--bg); padding: 1rem; border-radius: 4px; overflow-x: auto; }
    details summary { cursor: pointer; color: var(--link); margin: 0.5rem 0; }
    code { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.9rem; }

    /* Print styles */
    @media print {
      body { background: #fff; color: #000; max-width: 100%; }
      .finding { break-inside: avoid; border-left-width: 3px; background: #f9f9f9; }
      .finding-header { cursor: default; }
      .finding.collapsed .finding-body { display: block; }
      .toggle-icon { display: none; }
      a { color: #0366d6; }
    }
  </style>
</head>
<body>
  <h1>Vulnerability Analysis Report</h1>
  <p>Generated: ${new Date().toISOString()} | Tool: vulnhuntr-volt v1.0.0</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <table>
      <tr><td>Files Analyzed</td><td>${result.summary.total_files}</td></tr>
      <tr><td>Total Findings</td><td>${result.summary.total_findings}</td></tr>
      ${result.total_cost_usd ? `<tr><td>Estimated Cost</td><td>$${result.total_cost_usd.toFixed(4)}</td></tr>` : ""}
    </table>
    ${severityRows ? `<h3>By Severity</h3><table>${severityRows}</table>` : ""}
  </div>

  <h2>Findings</h2>
  ${sorted.length === 0 ? "<p>No vulnerabilities found.</p>" : findings}

  <script>
    // Keyboard navigation: press 'c' to collapse all, 'e' to expand all
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const findings = document.querySelectorAll('.finding');
      if (e.key === 'c') findings.forEach(f => f.classList.add('collapsed'));
      if (e.key === 'e') findings.forEach(f => f.classList.remove('collapsed'));
    });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// CSV Report (mirrors reporters/csv_reporter.py)
// ---------------------------------------------------------------------------

export function generateCsvReport(result: WorkflowResult): string {
	const headers = [
		"rule_id",
		"title",
		"file_path",
		"start_line",
		"end_line",
		"vuln_type",
		"severity",
		"confidence",
		"cwe",
		"cwe_name",
		"analysis",
		"poc",
		"discovered_at",
	];
	const sorted = sortFindings(result.findings);

	const rows = sorted.map((f) =>
		[
			escapeCsv(f.rule_id),
			escapeCsv(f.title),
			escapeCsv(f.file_path),
			String(f.start_line),
			String(f.end_line),
			escapeCsv(f.vuln_type),
			escapeCsv(f.severity),
			String(f.confidence),
			escapeCsv(f.cwe),
			escapeCsv(f.cwe_name),
			escapeCsv(f.analysis),
			escapeCsv(f.poc ?? ""),
			escapeCsv(f.discovered_at),
		].join(","),
	);

	return [headers.join(","), ...rows].join("\n");
}
