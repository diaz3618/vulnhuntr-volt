import { describe, it, expect } from "vitest";
import {
	getModelPricing,
	estimateTokens,
	CostTracker,
	BudgetEnforcer,
	PRICING_TABLE,
} from "../src/cost-tracker/index.js";

describe("getModelPricing", () => {
	it("returns exact match", () => {
		const pricing = getModelPricing("gpt-4o");
		expect(pricing).toEqual(PRICING_TABLE["gpt-4o"]);
	});

	it("returns partial match (substring)", () => {
		const pricing = getModelPricing("claude-sonnet-4-20250514");
		expect(pricing.input).toBe(0.003);
	});

	it("falls back to provider pattern for unknown claude model", () => {
		const pricing = getModelPricing("claude-5-ultra");
		expect(pricing.input).toBe(PRICING_TABLE["claude-3-5-sonnet-20241022"].input);
	});

	it("returns default pricing for completely unknown model", () => {
		const pricing = getModelPricing("totally-unknown-model");
		expect(pricing.input).toBe(0.01);
		expect(pricing.output).toBe(0.03);
	});

	it("returns zero pricing for local models", () => {
		const pricing = getModelPricing("ollama");
		expect(pricing.input).toBe(0);
		expect(pricing.output).toBe(0);
	});
});

describe("estimateTokens", () => {
	it("estimates ~4 chars per token", () => {
		expect(estimateTokens("1234")).toBe(1);
		expect(estimateTokens("12345")).toBe(2);
		expect(estimateTokens("")).toBe(0);
	});
});

describe("CostTracker", () => {
	it("tracks a single call", () => {
		const tracker = new CostTracker();
		const cost = tracker.trackCall(1000, 500, "gpt-4o", "app.py", "initial");
		expect(cost).toBeGreaterThan(0);
		expect(tracker.callCount).toBe(1);
		expect(tracker.totalInputTokens).toBe(1000);
		expect(tracker.totalOutputTokens).toBe(500);
		expect(tracker.totalTokens).toBe(1500);
	});

	it("accumulates multiple calls", () => {
		const tracker = new CostTracker();
		tracker.trackCall(1000, 500, "gpt-4o");
		tracker.trackCall(2000, 1000, "gpt-4o");
		expect(tracker.callCount).toBe(2);
		expect(tracker.totalInputTokens).toBe(3000);
		expect(tracker.totalOutputTokens).toBe(1500);
	});

	it("tracks per-file costs", () => {
		const tracker = new CostTracker();
		tracker.trackCall(1000, 500, "gpt-4o", "a.py");
		tracker.trackCall(2000, 1000, "gpt-4o", "b.py");
		expect(tracker.getFileCost("a.py")).toBeGreaterThan(0);
		expect(tracker.getFileCost("b.py")).toBeGreaterThan(tracker.getFileCost("a.py"));
		expect(tracker.getFileCost("nonexistent.py")).toBe(0);
	});

	it("getSummary returns expected structure", () => {
		const tracker = new CostTracker();
		tracker.trackCall(1000, 500, "gpt-4o", "app.py");
		const summary = tracker.getSummary();
		expect(summary).toHaveProperty("total_cost_usd");
		expect(summary).toHaveProperty("total_tokens");
		expect(summary).toHaveProperty("api_calls", 1);
		expect(summary).toHaveProperty("costs_by_file");
		expect(summary).toHaveProperty("costs_by_model");
	});

	it("round-trips through toDict/fromDict", () => {
		const tracker = new CostTracker();
		tracker.trackCall(1000, 500, "gpt-4o", "app.py", "initial");
		tracker.trackCall(2000, 800, "claude-sonnet-4-20250514", "views.py", "secondary");

		const dict = tracker.toDict();
		const restored = CostTracker.fromDict(dict);

		expect(restored.totalCost).toBeCloseTo(tracker.totalCost, 6);
		expect(restored.totalInputTokens).toBe(tracker.totalInputTokens);
		expect(restored.totalOutputTokens).toBe(tracker.totalOutputTokens);
		expect(restored.callCount).toBe(tracker.callCount);
	});

	it("getDetailedReport returns formatted string", () => {
		const tracker = new CostTracker();
		tracker.trackCall(1000, 500, "gpt-4o", "app.py");
		const report = tracker.getDetailedReport();
		expect(report).toContain("COST SUMMARY");
		expect(report).toContain("Total Cost");
		expect(report).toContain("gpt-4o");
	});
});

describe("BudgetEnforcer", () => {
	it("returns true when no budget set", () => {
		const enforcer = new BudgetEnforcer(null);
		expect(enforcer.check(100)).toBe(true);
	});

	it("returns true when under budget", () => {
		const enforcer = new BudgetEnforcer(10);
		expect(enforcer.check(5)).toBe(true);
	});

	it("returns false when budget exceeded", () => {
		const enforcer = new BudgetEnforcer(10);
		expect(enforcer.check(10)).toBe(false);
	});

	it("enforces per-file cost limit", () => {
		const enforcer = new BudgetEnforcer(100, 0.8, 1.0);
		expect(enforcer.check(0.5, 0.5)).toBe(true);
		expect(enforcer.check(0.5, 1.0)).toBe(false);
	});

	it("getRemainingBudget returns correct value", () => {
		const enforcer = new BudgetEnforcer(10);
		expect(enforcer.getRemainingBudget(3)).toBe(7);
		expect(enforcer.getRemainingBudget(10)).toBe(0);
		expect(enforcer.getRemainingBudget(15)).toBe(0);
	});

	it("getRemainingBudget returns null when no budget", () => {
		const enforcer = new BudgetEnforcer(null);
		expect(enforcer.getRemainingBudget(100)).toBeNull();
	});

	it("shouldContinueIteration respects per-iteration limit", () => {
		const enforcer = new BudgetEnforcer(100, 0.8, null, 0.5);
		expect(enforcer.shouldContinueIteration("a.py", 1, 0.3, 1)).toBe(true);
		expect(enforcer.shouldContinueIteration("a.py", 2, 0.5, 2)).toBe(false);
	});
});
