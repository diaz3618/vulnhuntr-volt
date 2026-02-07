/**
 * Cost Tracker for VulnHuntr
 * ==========================
 * Token usage tracking, cost calculation, budget enforcement, and cost
 * reporting for LLM API calls. Port of vulnhuntr/cost_tracker.py.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pricing Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Prices per 1 000 tokens (USD) — updated 2024-12 */
export const PRICING_TABLE: Record<string, { input: number; output: number }> =
	{
		// Claude (Anthropic)
		"claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
		"claude-3-5-sonnet-latest": { input: 0.003, output: 0.015 },
		"claude-sonnet-4-5": { input: 0.003, output: 0.015 },
		"claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
		"claude-3-opus-20240229": { input: 0.015, output: 0.075 },
		"claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
		// OpenAI
		"gpt-4o": { input: 0.005, output: 0.015 },
		"gpt-4o-2024-08-06": { input: 0.005, output: 0.015 },
		"chatgpt-4o-latest": { input: 0.005, output: 0.015 },
		"gpt-4-turbo": { input: 0.01, output: 0.03 },
		"gpt-4-turbo-preview": { input: 0.01, output: 0.03 },
		"gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
		// Local (free)
		ollama: { input: 0, output: 0 },
		llama3: { input: 0, output: 0 },
		codellama: { input: 0, output: 0 },
		mistral: { input: 0, output: 0 },
	};

const DEFAULT_PRICING = { input: 0.01, output: 0.03 };

/** Resolve pricing for a model name (exact → partial → provider pattern). */
export function getModelPricing(model: string): {
	input: number;
	output: number;
} {
	if (PRICING_TABLE[model]) return PRICING_TABLE[model];

	const lower = model.toLowerCase();
	for (const [known, pricing] of Object.entries(PRICING_TABLE)) {
		if (
			known.toLowerCase().includes(lower) ||
			lower.includes(known.toLowerCase())
		) {
			return pricing;
		}
	}

	if (lower.includes("claude"))
		return PRICING_TABLE["claude-3-5-sonnet-20241022"];
	if (lower.includes("gpt-4o")) return PRICING_TABLE["gpt-4o"];
	if (lower.includes("gpt-4")) return PRICING_TABLE["gpt-4-turbo"];
	if (lower.includes("gpt-3")) return PRICING_TABLE["gpt-3.5-turbo"];

	return DEFAULT_PRICING;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Usage
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	model: string;
	costUsd: number;
	timestamp: string; // ISO
	filePath?: string;
	callType: string; // 'readme' | 'initial' | 'secondary'
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost Tracker
// ─────────────────────────────────────────────────────────────────────────────

export class CostTracker {
	private _calls: TokenUsage[] = [];
	private _totalInputTokens = 0;
	private _totalOutputTokens = 0;
	private _totalCost = 0;
	private _costsByFile: Record<string, number> = {};
	private _costsByModel: Record<string, number> = {};
	private _startTime = new Date();

	/** Track a single LLM API call. Returns cost in USD for this call. */
	trackCall(
		inputTokens: number,
		outputTokens: number,
		model: string,
		filePath?: string,
		callType = "analysis",
	): number {
		const pricing = getModelPricing(model);
		const cost =
			(inputTokens / 1000) * pricing.input +
			(outputTokens / 1000) * pricing.output;

		const usage: TokenUsage = {
			inputTokens,
			outputTokens,
			model,
			costUsd: cost,
			timestamp: new Date().toISOString(),
			filePath,
			callType,
		};

		this._calls.push(usage);
		this._totalInputTokens += inputTokens;
		this._totalOutputTokens += outputTokens;
		this._totalCost += cost;

		if (filePath) {
			this._costsByFile[filePath] = (this._costsByFile[filePath] ?? 0) + cost;
		}
		this._costsByModel[model] = (this._costsByModel[model] ?? 0) + cost;

		return cost;
	}

	get totalCost(): number {
		return this._totalCost;
	}
	get totalInputTokens(): number {
		return this._totalInputTokens;
	}
	get totalOutputTokens(): number {
		return this._totalOutputTokens;
	}
	get totalTokens(): number {
		return this._totalInputTokens + this._totalOutputTokens;
	}
	get callCount(): number {
		return this._calls.length;
	}

	getFileCost(filePath: string): number {
		return this._costsByFile[filePath] ?? 0;
	}

	getSummary(): Record<string, unknown> {
		const elapsed = (Date.now() - this._startTime.getTime()) / 1000;
		return {
			total_cost_usd: +this._totalCost.toFixed(4),
			total_input_tokens: this._totalInputTokens,
			total_output_tokens: this._totalOutputTokens,
			total_tokens: this.totalTokens,
			api_calls: this.callCount,
			costs_by_file: Object.fromEntries(
				Object.entries(this._costsByFile).map(([k, v]) => [k, +v.toFixed(4)]),
			),
			costs_by_model: Object.fromEntries(
				Object.entries(this._costsByModel).map(([k, v]) => [k, +v.toFixed(4)]),
			),
			elapsed_seconds: +elapsed.toFixed(1),
			start_time: this._startTime.toISOString(),
		};
	}

	getDetailedReport(): string {
		// biome-ignore lint/suspicious/noExplicitAny: getSummary returns dynamic shape
		const s = this.getSummary() as Record<string, any>;
		const lines: string[] = [
			"",
			"=".repeat(60),
			"COST SUMMARY",
			"=".repeat(60),
			`Total Cost: $${(s.total_cost_usd as number).toFixed(4)} USD`,
			`Total Tokens: ${s.total_tokens.toLocaleString()} (${s.total_input_tokens.toLocaleString()} in / ${s.total_output_tokens.toLocaleString()} out)`,
			`API Calls: ${s.api_calls}`,
			`Elapsed Time: ${s.elapsed_seconds} seconds`,
			"",
		];

		const byModel = s.costs_by_model as Record<string, number>;
		if (Object.keys(byModel).length) {
			lines.push("Costs by Model:");
			for (const [model, cost] of Object.entries(byModel).sort(
				(a, b) => b[1] - a[1],
			)) {
				lines.push(`  ${model}: $${cost.toFixed(4)}`);
			}
			lines.push("");
		}

		const byFile = s.costs_by_file as Record<string, number>;
		if (Object.keys(byFile).length) {
			lines.push("Top 10 Files by Cost:");
			const sorted = Object.entries(byFile)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 10);
			for (const [fp, cost] of sorted) {
				lines.push(`  $${cost.toFixed(4)} - ${fp}`);
			}
			lines.push("");
		}

		lines.push("=".repeat(60));
		return lines.join("\n");
	}

	toDict(): Record<string, unknown> {
		return {
			calls: this._calls,
			total_input_tokens: this._totalInputTokens,
			total_output_tokens: this._totalOutputTokens,
			total_cost: this._totalCost,
			costs_by_file: this._costsByFile,
			costs_by_model: this._costsByModel,
			start_time: this._startTime.toISOString(),
		};
	}

	// biome-ignore lint/suspicious/noExplicitAny: deserialization from untyped dict
	static fromDict(data: Record<string, any>): CostTracker {
		const t = new CostTracker();
		t._calls = data.calls ?? [];
		t._totalInputTokens = data.total_input_tokens ?? 0;
		t._totalOutputTokens = data.total_output_tokens ?? 0;
		t._totalCost = data.total_cost ?? 0;
		t._costsByFile = data.costs_by_file ?? {};
		t._costsByModel = data.costs_by_model ?? {};
		if (data.start_time) t._startTime = new Date(data.start_time);
		return t;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget Enforcer
// ─────────────────────────────────────────────────────────────────────────────

export class BudgetEnforcer {
	private _warningIssued = false;
	private _iterationCosts: Record<string, number[]> = {};

	constructor(
		public maxBudgetUsd: number | null = null,
		public warningThreshold = 0.8,
		public maxCostPerFile: number | null = null,
		public maxCostPerIteration: number | null = null,
	) {}

	/** Returns true if analysis can continue, false if budget exceeded. */
	check(currentCost: number, fileCost?: number): boolean {
		if (this.maxCostPerFile != null && fileCost != null) {
			if (fileCost >= this.maxCostPerFile) {
				console.warn(
					`   ⚠️  Per-file cost limit reached ($${fileCost.toFixed(4)} >= $${this.maxCostPerFile})`,
				);
				return false;
			}
		}

		if (this.maxBudgetUsd == null) return true;

		if (
			!this._warningIssued &&
			currentCost >= this.maxBudgetUsd * this.warningThreshold
		) {
			console.warn(
				`   ⚠️  Budget warning: $${currentCost.toFixed(4)} / $${this.maxBudgetUsd} (${((currentCost / this.maxBudgetUsd) * 100).toFixed(1)}%)`,
			);
			this._warningIssued = true;
		}

		if (currentCost >= this.maxBudgetUsd) {
			console.error(
				`   🛑 Budget exceeded: $${currentCost.toFixed(4)} >= $${this.maxBudgetUsd}`,
			);
			return false;
		}

		return true;
	}

	getRemainingBudget(currentCost: number): number | null {
		if (this.maxBudgetUsd == null) return null;
		return Math.max(0, this.maxBudgetUsd - currentCost);
	}

	/** Cost-aware iteration limiter. Returns false to stop iterating. */
	shouldContinueIteration(
		filePath: string,
		_iteration: number,
		iterationCost: number,
		totalCost: number,
	): boolean {
		if (!this._iterationCosts[filePath]) {
			this._iterationCosts[filePath] = [];
		}
		this._iterationCosts[filePath].push(iterationCost);

		if (
			this.maxCostPerIteration != null &&
			iterationCost >= this.maxCostPerIteration
		) {
			console.warn(
				`   ⚠️  Per-iteration cost limit for ${filePath}: $${iterationCost.toFixed(4)}`,
			);
			return false;
		}

		// Escalating-cost detection (3+ iterations)
		const costs = this._iterationCosts[filePath];
		if (costs.length >= 3) {
			const recent = costs.slice(-3);
			const escalating = recent.every(
				(c, i) => i === 0 || recent[i - 1] < c * 0.8,
			);
			if (escalating) {
				console.warn(
					`   ⚠️  Escalating iteration costs for ${filePath} — stopping`,
				);
				return false;
			}
		}

		return this.check(totalCost);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost Estimation (Dry Run)
// ─────────────────────────────────────────────────────────────────────────────

/** Rough token estimate (~4 chars/token). */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function estimateFileCost(
	fileContent: string,
	filePath: string,
	model: string,
): Record<string, unknown> {
	const fileTokens = estimateTokens(fileContent);
	const pricing = getModelPricing(model);
	const promptOverhead = 3000;
	const avgContextPerIteration = 1000;

	const initialInput = fileTokens + promptOverhead;
	const initialOutput = 2000;
	const avgVulnTypesFound = 2.5;
	const avgIterationsPerVuln = 5;
	const secondaryCalls = avgVulnTypesFound * avgIterationsPerVuln;
	const avgAccumulatedContext =
		avgContextPerIteration * (avgIterationsPerVuln / 2);
	const secondaryInputPerCall =
		fileTokens + promptOverhead + avgAccumulatedContext;
	const secondaryOutputPerCall = 2500;

	const totalInput = Math.round(
		initialInput + secondaryInputPerCall * secondaryCalls,
	);
	const totalOutput = Math.round(
		initialOutput + secondaryOutputPerCall * secondaryCalls,
	);
	const cost =
		(totalInput / 1000) * pricing.input + (totalOutput / 1000) * pricing.output;

	return {
		file_path: filePath,
		file_tokens: fileTokens,
		estimated_input_tokens: totalInput,
		estimated_output_tokens: totalOutput,
		estimated_total_tokens: totalInput + totalOutput,
		estimated_calls: Math.round(1 + secondaryCalls),
		estimated_cost_usd: +cost.toFixed(4),
	};
}

export function estimateAnalysisCost(
	files: Array<{ path: string; content: string }>,
	model: string,
): Record<string, unknown> {
	const fileEstimates: Record<string, unknown>[] = [];
	let totalInput = 0;
	let totalOutput = 0;
	let totalCost = 0;

	for (const f of files) {
		const est = estimateFileCost(f.content, f.path, model) as Record<
			string,
			// biome-ignore lint/suspicious/noExplicitAny: estimation returns dynamic shape
			any
		>;
		fileEstimates.push(est);
		totalInput += est.estimated_input_tokens as number;
		totalOutput += est.estimated_output_tokens as number;
		totalCost += est.estimated_cost_usd as number;
	}

	totalCost += 0.01; // README overhead

	return {
		model,
		file_count: files.length,
		estimated_input_tokens: totalInput,
		estimated_output_tokens: totalOutput,
		estimated_total_tokens: totalInput + totalOutput,
		estimated_cost_usd: +totalCost.toFixed(4),
		estimated_cost_range: {
			low: +(totalCost * 0.5).toFixed(4),
			high: +(totalCost * 1.5).toFixed(4),
		},
		file_estimates: fileEstimates,
	};
}
