import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
	defaultConfig,
	configFromDict,
	mergeConfigWithInput,
	loadConfig,
} from "../src/config/index.js";
import { makeTempDir, cleanTempDir } from "./fixtures.js";

describe("defaultConfig", () => {
	it("returns expected defaults", () => {
		const c = defaultConfig();
		expect(c.budget).toBeNull();
		expect(c.checkpoint).toBe(true);
		expect(c.checkpointInterval).toBe(300);
		expect(c.maxIterations).toBe(7);
		expect(c.confidenceThreshold).toBe(1);
		expect(c.vulnTypes).toEqual([]);
		expect(c.dryRun).toBe(false);
		expect(c.provider).toBeNull();
		expect(c.model).toBeNull();
	});
});

describe("configFromDict", () => {
	it("parses flat keys", () => {
		const c = configFromDict({
			budget: 10,
			provider: "anthropic",
			model: "claude-sonnet-4-20250514",
			max_iterations: 3,
			confidence_threshold: 5,
		});
		expect(c.budget).toBe(10);
		expect(c.provider).toBe("anthropic");
		expect(c.maxIterations).toBe(3);
		expect(c.confidenceThreshold).toBe(5);
	});

	it("parses nested cost section", () => {
		const c = configFromDict({
			cost: { budget: 5, checkpoint: false, checkpoint_interval: 60 },
		});
		expect(c.budget).toBe(5);
		expect(c.checkpoint).toBe(false);
		expect(c.checkpointInterval).toBe(60);
	});

	it("parses nested llm section", () => {
		const c = configFromDict({
			llm: { provider: "openai", model: "gpt-4o" },
		});
		expect(c.provider).toBe("openai");
		expect(c.model).toBe("gpt-4o");
	});

	it("parses nested analysis section", () => {
		const c = configFromDict({
			analysis: {
				vuln_types: ["LFI", "RCE"],
				exclude_paths: ["tests/"],
				max_iterations: 2,
				confidence_threshold: 8,
			},
		});
		expect(c.vulnTypes).toEqual(["LFI", "RCE"]);
		expect(c.excludePaths).toEqual(["tests/"]);
		expect(c.maxIterations).toBe(2);
		expect(c.confidenceThreshold).toBe(8);
	});

	it("coerces string numbers", () => {
		const c = configFromDict({ budget: "15.5" });
		expect(c.budget).toBe(15.5);
	});
});

describe("mergeConfigWithInput", () => {
	it("overrides config with input values", () => {
		const config = defaultConfig();
		config.maxIterations = 7;
		config.confidenceThreshold = 1;

		const merged = mergeConfigWithInput(config, {
			max_budget_usd: 20,
			max_iterations: 3,
			min_confidence: 5,
		});

		expect(merged.budget).toBe(20);
		expect(merged.maxIterations).toBe(3);
		expect(merged.confidenceThreshold).toBe(5);
	});

	it("preserves config when input fields are absent", () => {
		const config = defaultConfig();
		config.provider = "anthropic";
		config.model = "claude-sonnet-4-20250514";

		const merged = mergeConfigWithInput(config, {});
		expect(merged.provider).toBe("anthropic");
		expect(merged.model).toBe("claude-sonnet-4-20250514");
	});

	it("overrides vuln_types only if non-empty", () => {
		const config = defaultConfig();
		config.vulnTypes = ["LFI"];

		const merged1 = mergeConfigWithInput(config, { vuln_types: [] });
		expect(merged1.vulnTypes).toEqual(["LFI"]);

		const merged2 = mergeConfigWithInput(config, { vuln_types: ["RCE", "XSS"] });
		expect(merged2.vulnTypes).toEqual(["RCE", "XSS"]);
	});
});

describe("loadConfig", () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir) cleanTempDir(tmpDir);
	});

	it("returns default when no file exists", () => {
		const c = loadConfig("/nonexistent/path/.vulnhuntr.yaml");
		expect(c).toEqual(defaultConfig());
	});

	it("loads JSON config file", () => {
		tmpDir = makeTempDir();
		const configPath = path.join(tmpDir, ".vulnhuntr.yaml");
		fs.writeFileSync(configPath, JSON.stringify({ budget: 25, max_iterations: 4 }));

		const c = loadConfig(configPath);
		expect(c.budget).toBe(25);
		expect(c.maxIterations).toBe(4);
	});

	it("returns default for empty file", () => {
		tmpDir = makeTempDir();
		const configPath = path.join(tmpDir, ".vulnhuntr.yaml");
		fs.writeFileSync(configPath, "");

		const c = loadConfig(configPath);
		expect(c).toEqual(defaultConfig());
	});
});
