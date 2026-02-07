/**
 * Webhook Notification — mirrors vulnhuntr/integrations/webhook.py
 * Sends analysis results to webhooks with HMAC-SHA256 signing.
 * Supports Slack, Discord, and Microsoft Teams formats.
 */

import { createHmac } from "node:crypto";
import type { Finding, WorkflowResult } from "../schemas/index.js";
import { SEVERITY_SCORES } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookFormat = "json" | "slack" | "discord" | "teams";

export interface WebhookConfig {
  /** Webhook URL */
  url: string;
  /** HMAC-SHA256 signing secret (optional) */
  secret?: string;
  /** Payload format */
  format?: WebhookFormat;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Only notify for findings at or above this severity */
  minSeverity?: string;
  /** Timeout in ms */
  timeout?: number;
}

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function buildJsonPayload(result: WorkflowResult): object {
  return {
    event: "vulnhuntr.analysis.complete",
    timestamp: new Date().toISOString(),
    summary: {
      files_analyzed: result.summary.total_files,
      total_findings: result.summary.total_findings,
      by_vuln_type: result.summary.by_vuln_type,
    },
    findings: result.findings.map((f) => ({
      vuln_type: f.vuln_type,
      severity: f.severity,
      confidence: f.confidence,
      file_path: f.file_path,
      cwe: f.cwe,
    })),
  };
}

function severityEmoji(sev: string): string {
  switch (sev) {
    case "CRITICAL": return ":rotating_light:";
    case "HIGH": return ":red_circle:";
    case "MEDIUM": return ":large_orange_circle:";
    case "LOW": return ":large_green_circle:";
    default: return ":large_blue_circle:";
  }
}

function buildSlackPayload(result: WorkflowResult): object {
  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Vulnerability Analysis Complete" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Files analyzed:* ${result.summary.total_files}\n*Total findings:* ${result.summary.total_findings}`,
      },
    },
  ];

  // Add top 5 findings
  const sorted = [...result.findings].sort(
    (a, b) => (SEVERITY_SCORES[b.severity] ?? 0) - (SEVERITY_SCORES[a.severity] ?? 0),
  );

  for (const f of sorted.slice(0, 5)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${severityEmoji(f.severity)} *${f.vuln_type}* — \`${f.file_path}\`\nConfidence: ${f.confidence}/10 | ${f.cwe}`,
      },
    });
  }

  if (sorted.length > 5) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `...and ${sorted.length - 5} more findings` },
      ],
    });
  }

  return { blocks };
}

function buildDiscordPayload(result: WorkflowResult): object {
  const sorted = [...result.findings].sort(
    (a, b) => (SEVERITY_SCORES[b.severity] ?? 0) - (SEVERITY_SCORES[a.severity] ?? 0),
  );

  const fields = sorted.slice(0, 10).map((f) => ({
    name: `${f.severity} — ${f.vuln_type}`,
    value: `\`${f.file_path}\` (${f.confidence}/10)`,
    inline: true,
  }));

  return {
    embeds: [
      {
        title: "Vulnerability Analysis Complete",
        color: result.findings.length > 0 ? 0xff4444 : 0x44ff44,
        description: `**${result.summary.total_files}** files analyzed, **${result.summary.total_findings}** findings`,
        fields,
        footer: { text: "vulnhuntr-volt" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function buildTeamsPayload(result: WorkflowResult): object {
  const sorted = [...result.findings].sort(
    (a, b) => (SEVERITY_SCORES[b.severity] ?? 0) - (SEVERITY_SCORES[a.severity] ?? 0),
  );

  const facts = sorted.slice(0, 10).map((f) => ({
    name: `${f.severity} ${f.vuln_type}`,
    value: `${f.file_path} (confidence: ${f.confidence}/10)`,
  }));

  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: result.findings.length > 0 ? "FF4444" : "44FF44",
    summary: `vulnhuntr: ${result.summary.total_findings} findings in ${result.summary.total_files} files`,
    sections: [
      {
        activityTitle: "Vulnerability Analysis Complete",
        activitySubtitle: `${result.summary.total_files} files analyzed`,
        facts,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

/**
 * Send a webhook notification for analysis results.
 */
export async function sendWebhookNotification(
  config: WebhookConfig,
  result: WorkflowResult,
): Promise<WebhookResult> {
  const format = config.format ?? "json";
  const timeout = config.timeout ?? 10000;

  // Filter findings by min severity
  if (config.minSeverity) {
    const minIdx = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(config.minSeverity);
    const filtered: Finding[] = result.findings.filter((f) => {
      const idx = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(f.severity);
      return idx >= minIdx;
    });
    result = {
      ...result,
      findings: filtered,
      summary: {
        ...result.summary,
        total_findings: filtered.length,
      },
    };
  }

  let payload: object;
  switch (format) {
    case "slack": payload = buildSlackPayload(result); break;
    case "discord": payload = buildDiscordPayload(result); break;
    case "teams": payload = buildTeamsPayload(result); break;
    default: payload = buildJsonPayload(result); break;
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "vulnhuntr-volt/1.0.0",
    ...config.headers,
  };

  // Add HMAC signature header
  if (config.secret) {
    headers["X-Vulnhuntr-Signature"] = `sha256=${signPayload(body, config.secret)}`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    return {
      success: res.ok,
      statusCode: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}: ${await res.text()}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
