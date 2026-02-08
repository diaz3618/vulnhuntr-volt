/**
 * LLM Abstraction Layer for VulnHuntr
 * =====================================
 * Provides Claude prefill trick, JSON response fixing, conversation history,
 * and cost-callback integration. Port of vulnhuntr/LLMs.py.
 *
 * This layer sits between the VoltAgent workflow steps and the raw
 * Agent.generateText() calls, adding the provider-specific behaviours
 * that significantly improve response quality.
 */

import { Agent, type Tool, type ToolSchema } from "@voltagent/core";
import type { CostTracker } from "../cost-tracker/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// JSON response fixing (from LLMs.py _validate_response)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fix common JSON issues from LLM responses:
 * 1. Invalid escape sequences (e.g. \' from SQL/code snippets)
 * 2. Python None → JSON null
 * 3. Python True/False → JSON true/false
 * 4. Strip markdown code fences
 */
export function fixJsonResponse(text: string): string {
	let cleaned = text;

	// Strip markdown code fences
	cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

	// Extract JSON object
	const match = cleaned.match(/\{[\s\S]*\}/);
	if (match) cleaned = match[0];

	// Fix invalid escape sequences (valid: \" \\ \/ \b \f \n \r \t \uXXXX)
	cleaned = cleaned.replace(/(?<!\\)\\(?!["\\\/bfnrtu])/g, "");

	// Python → JSON literals
	cleaned = cleaned.replace(/\b(None)\b/g, "null");
	cleaned = cleaned.replace(/\b(True)\b/g, "true");
	cleaned = cleaned.replace(/\b(False)\b/g, "false");

	return cleaned.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation history
// ─────────────────────────────────────────────────────────────────────────────

export interface Message {
	role: "user" | "assistant" | "system";
	content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider detection
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderKind = "anthropic" | "openai" | "ollama" | "unknown";

export function detectProvider(modelStr: string): ProviderKind {
	const lower = modelStr.toLowerCase();
	if (lower.startsWith("anthropic/") || lower.includes("claude"))
		return "anthropic";
	if (lower.startsWith("openai/") || lower.includes("gpt")) return "openai";
	if (lower.startsWith("ollama/")) return "ollama";
	return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Session — wraps Agent with conversation history + provider tricks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claude prefill: Prepend `'{"scratchpad": "1.'` as an assistant message.
 * This forces Claude to continue generating structured JSON, significantly
 * improving response format reliability.
 */
const CLAUDE_PREFILL = '{"scratchpad": "1.';

export interface LLMSessionOptions {
	systemPrompt: string;
	modelStr: string;
	costTracker?: CostTracker;
	currentFile?: string;
	tools?: Tool<ToolSchema>[];
}

export class LLMSession {
	readonly agent: Agent;
	readonly provider: ProviderKind;
	readonly modelStr: string;
	private history: Message[] = [];
	private costTracker: CostTracker | null;
	private currentFile: string | null;
	private callType = "analysis";

	constructor(opts: LLMSessionOptions) {
		this.modelStr = opts.modelStr;
		this.provider = detectProvider(opts.modelStr);
		this.costTracker = opts.costTracker ?? null;
		this.currentFile = opts.currentFile ?? null;

		this.agent = new Agent({
			name: "vulnhuntr-llm",
			instructions: opts.systemPrompt,
			model: opts.modelStr,
			...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
		});
	}

	/** Update file context for cost tracking. */
	setContext(filePath?: string, callType?: string): void {
		if (filePath !== undefined) this.currentFile = filePath;
		if (callType !== undefined) this.callType = callType;
	}

	/** Clear conversation history (e.g. between files). */
	clearHistory(): void {
		this.history = [];
	}

	/**
	 * Send a chat message with full conversation history context.
	 *
	 * - For Claude: uses prefill trick (unless it's a README summary)
	 * - For OpenAI: relies on VoltAgent's structured output handling
	 * - Applies JSON fixing on all responses
	 * - Tracks cost if CostTracker provided
	 */
	async chat(
		userPrompt: string,
		maxOutputTokens = 8192,
		isReadmeSummary = false,
	): Promise<string> {
		this.history.push({ role: "user", content: userPrompt });

		// Build the full prompt including history context
		let fullPrompt = userPrompt;

		// For Claude: add prefill trick for non-README prompts
		const usePrefill = this.provider === "anthropic" && !isReadmeSummary;

		if (usePrefill) {
			// Include a hint that response should continue the prefill
			fullPrompt += `\n\nIMPORTANT: Begin your JSON response starting with: ${CLAUDE_PREFILL}`;
		}

		// Include recent history context in the prompt (last 4 exchanges)
		// This simulates conversation history that the original Python version
		// maintains via the history[] list
		if (this.history.length > 2) {
			const recentHistory = this.history.slice(-6, -1); // Exclude current message
			if (recentHistory.length > 0) {
				const contextBlock = recentHistory
					.map((m) => `<${m.role}>${m.content.slice(0, 2000)}</${m.role}>`)
					.join("\n");
				fullPrompt = `<conversation_context>\n${contextBlock}\n</conversation_context>\n\n${fullPrompt}`;
			}
		}

		const result = await this.agent.generateText(fullPrompt, {
			maxOutputTokens,
		});

		let responseText = result.text;

		// Apply prefill reconstruction — the response should be the continuation
		if (usePrefill && !responseText.trimStart().startsWith("{")) {
			responseText = CLAUDE_PREFILL + responseText;
		}

		// Apply JSON fixing
		responseText = fixJsonResponse(responseText);

		// Track in history
		this.history.push({ role: "assistant", content: responseText });

		// Track cost (estimate tokens from character count since VoltAgent
		// doesn't expose raw usage)
		if (this.costTracker) {
			const inputTokens = Math.ceil(fullPrompt.length / 4);
			const outputTokens = Math.ceil(responseText.length / 4);
			// Strip provider prefix for pricing lookup
			const model = this.modelStr.includes("/")
				? this.modelStr.split("/").slice(1).join("/")
				: this.modelStr;
			this.costTracker.trackCall(
				inputTokens,
				outputTokens,
				model,
				this.currentFile ?? undefined,
				this.callType,
			);
		}

		return responseText;
	}
}

/**
 * Create an LLMSession for README summarization (no system prompt, no prefill).
 */
export function createReadmeSession(
	modelStr: string,
	costTracker?: CostTracker,
): LLMSession {
	return new LLMSession({
		systemPrompt: "You summarize README files for security analysis.",
		modelStr,
		costTracker,
	});
}

/**
 * Create an LLMSession for vulnerability analysis (full system prompt + prefill).
 */
export function createAnalysisSession(
	systemPrompt: string,
	modelStr: string,
	costTracker?: CostTracker,
	tools?: Tool<ToolSchema>[],
): LLMSession {
	return new LLMSession({
		systemPrompt,
		modelStr,
		costTracker,
		tools,
	});
}
