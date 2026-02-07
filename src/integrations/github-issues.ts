/**
 * GitHub Issues Integration — mirrors vulnhuntr/integrations/github_issues.py
 * Creates GitHub issues for findings with duplicate detection.
 */

import type { Finding } from "../schemas/index.js";

export interface GitHubIssueConfig {
  /** GitHub personal access token */
  token: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Labels to apply to created issues */
  labels?: string[];
  /** Assignees for the issues */
  assignees?: string[];
  /** Only create issues for findings at or above this severity */
  minSeverity?: string;
  /** Dry run — don't actually create issues */
  dryRun?: boolean;
}

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
}

const SEVERITY_ORDER = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Build an issue title that can be used for duplicate detection.
 */
function issueTitle(finding: Finding): string {
  return `[vulnhuntr] ${finding.vuln_type} vulnerability in ${finding.file_path}`;
}

/**
 * Build issue body in Markdown.
 */
function issueBody(finding: Finding): string {
  const lines: string[] = [
    `## ${finding.title || `${finding.vuln_type} vulnerability`}`,
    "",
    `| Property | Value |`,
    `|----------|-------|`,
    `| **File** | \`${finding.file_path}\` |`,
    `| **Severity** | ${finding.severity} |`,
    `| **Confidence** | ${finding.confidence}/10 |`,
    `| **CWE** | [${finding.cwe}](https://cwe.mitre.org/data/definitions/${finding.cwe.replace("CWE-", "")}.html) — ${finding.cwe_name} |`,
    ...(finding.start_line > 0 ? [`| **Lines** | ${finding.start_line}–${finding.end_line || finding.start_line} |`] : []),
    "",
    "### Analysis",
    "",
    finding.analysis,
    "",
  ];

  if (finding.poc) {
    lines.push("### Proof of Concept", "", "```", finding.poc, "```", "");
  }

  if (finding.context_code) {
    lines.push(
      "<details>",
      "<summary>Context Code</summary>",
      "",
      "```python",
      finding.context_code,
      "```",
      "",
      "</details>",
      "",
    );
  }

  lines.push(
    "---",
    `*Reported by vulnhuntr-volt at ${finding.discovered_at || new Date().toISOString()}*`,
  );

  return lines.join("\n");
}

/**
 * Check if an issue with the same title already exists (open or closed).
 */
async function findDuplicate(
  config: GitHubIssueConfig,
  title: string,
): Promise<GitHubIssue | null> {
  const query = encodeURIComponent(`repo:${config.owner}/${config.repo} "${title}" in:title`);
  const res = await fetch(
    `https://api.github.com/search/issues?q=${query}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    console.warn(`GitHub search API returned ${res.status}: ${await res.text()}`);
    return null;
  }

  const data = (await res.json()) as { items?: GitHubIssue[] };
  if (data.items && data.items.length > 0) {
    return data.items[0];
  }
  return null;
}

/**
 * Create a single GitHub issue for a finding.
 */
async function createIssue(
  config: GitHubIssueConfig,
  finding: Finding,
): Promise<GitHubIssue | null> {
  const title = issueTitle(finding);
  const body = issueBody(finding);

  const payload: Record<string, unknown> = { title, body };
  if (config.labels?.length) payload.labels = [...config.labels, finding.severity.toLowerCase()];
  if (config.assignees?.length) payload.assignees = config.assignees;

  const res = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    console.error(`Failed to create issue: ${res.status} ${await res.text()}`);
    return null;
  }

  return (await res.json()) as GitHubIssue;
}

export interface CreateIssuesResult {
  created: { finding: Finding; issue: GitHubIssue }[];
  duplicates: { finding: Finding; existingIssue: GitHubIssue }[];
  skipped: { finding: Finding; reason: string }[];
  errors: { finding: Finding; error: string }[];
}

/**
 * Create GitHub issues for all findings, skipping duplicates.
 */
export async function createIssuesForFindings(
  config: GitHubIssueConfig,
  findings: Finding[],
): Promise<CreateIssuesResult> {
  const result: CreateIssuesResult = {
    created: [],
    duplicates: [],
    skipped: [],
    errors: [],
  };

  // Filter by minimum severity
  const minIdx = config.minSeverity
    ? SEVERITY_ORDER.indexOf(config.minSeverity)
    : 0;

  for (const finding of findings) {
    // Check severity threshold
    const sevIdx = SEVERITY_ORDER.indexOf(finding.severity);
    if (sevIdx < minIdx) {
      result.skipped.push({ finding, reason: `Below minimum severity ${config.minSeverity}` });
      continue;
    }

    const title = issueTitle(finding);

    try {
      // Check for duplicates
      const existing = await findDuplicate(config, title);
      if (existing) {
        result.duplicates.push({ finding, existingIssue: existing });
        continue;
      }

      if (config.dryRun) {
        result.skipped.push({ finding, reason: "Dry run" });
        continue;
      }

      const issue = await createIssue(config, finding);
      if (issue) {
        result.created.push({ finding, issue });
      } else {
        result.errors.push({ finding, error: "Failed to create issue" });
      }
    } catch (err) {
      result.errors.push({
        finding,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Rate limiting: wait 1s between issue creations
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return result;
}
