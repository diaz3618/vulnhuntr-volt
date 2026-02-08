import { describe, it, expect } from "vitest";
import {
	xmlTag,
	buildFileCode,
	buildCodeDefinitions,
	buildExampleBypasses,
	buildInitialPrompt,
	buildSecondaryPrompt,
	buildSystemPrompt,
	buildReadmeSummaryPrompt,
	VULN_SPECIFIC_BYPASSES_AND_PROMPTS,
} from "../src/prompts/index.js";

describe("xmlTag", () => {
	it("wraps content in tags", () => {
		expect(xmlTag("foo", "bar")).toBe("<foo>bar</foo>");
	});

	it("handles empty content", () => {
		expect(xmlTag("empty", "")).toBe("<empty></empty>");
	});
});

describe("buildFileCode", () => {
	it("wraps file path and source in nested tags", () => {
		const result = buildFileCode("app.py", "print('hello')");
		expect(result).toContain("<file_code>");
		expect(result).toContain("<file_path>app.py</file_path>");
		expect(result).toContain("<file_source>print('hello')</file_source>");
		expect(result).toContain("</file_code>");
	});
});

describe("buildCodeDefinitions", () => {
	it("returns empty tags for empty array", () => {
		expect(buildCodeDefinitions([])).toBe("<context_code></context_code>");
	});

	it("includes all definition fields", () => {
		const defs = [
			{ name: "MyClass", contextNameRequested: "MyClass", filePath: "models.py", source: "class MyClass:\n  pass" },
		];
		const result = buildCodeDefinitions(defs);
		expect(result).toContain("<name>MyClass</name>");
		expect(result).toContain("<file_path>models.py</file_path>");
		expect(result).toContain("<source>class MyClass:");
	});
});

describe("buildExampleBypasses", () => {
	it("joins bypasses with newlines", () => {
		const result = buildExampleBypasses(["a", "b", "c"]);
		expect(result).toBe("<example_bypasses>a\nb\nc</example_bypasses>");
	});
});

describe("buildInitialPrompt", () => {
	const prompt = buildInitialPrompt("app.py", "import flask", "{}");

	it("contains file_code section", () => {
		expect(prompt).toContain("<file_code>");
	});

	it("contains instructions section", () => {
		expect(prompt).toContain("<instructions>");
	});

	it("contains analysis_approach section", () => {
		expect(prompt).toContain("<analysis_approach>");
	});

	it("contains guidelines section", () => {
		expect(prompt).toContain("<guidelines>");
	});

	it("contains response_format section", () => {
		expect(prompt).toContain("<response_format>");
	});
});

describe("buildSecondaryPrompt", () => {
	const defs = [
		{ name: "handler", contextNameRequested: "handler", filePath: "views.py", source: "def handler(): pass" },
	];

	it("includes vuln-specific bypasses", () => {
		const prompt = buildSecondaryPrompt("app.py", "code", defs, "LFI", "{}", "{}");
		expect(prompt).toContain("<example_bypasses>");
		expect(prompt).toContain("etc/passwd");
	});

	it("includes previous analysis", () => {
		const prompt = buildSecondaryPrompt("app.py", "code", defs, "RCE", '{"prev": true}', "{}");
		expect(prompt).toContain("<previous_analysis>");
		expect(prompt).toContain('{"prev": true}');
	});

	it("throws for unknown vuln type", () => {
		expect(() =>
			buildSecondaryPrompt("app.py", "code", defs, "INVALID", "{}", "{}"),
		).toThrow("Unknown vulnerability type");
	});
});

describe("buildSystemPrompt", () => {
	it("includes readme summary", () => {
		const prompt = buildSystemPrompt("A Flask web application.");
		expect(prompt).toContain("<readme_summary>A Flask web application.</readme_summary>");
	});

	it("includes system instructions", () => {
		const prompt = buildSystemPrompt("");
		expect(prompt).toContain("<instructions>");
		expect(prompt).toContain("security analysis");
	});
});

describe("buildReadmeSummaryPrompt", () => {
	it("includes readme content", () => {
		const prompt = buildReadmeSummaryPrompt("# My App\nA cool app.");
		expect(prompt).toContain("<readme_content>");
		expect(prompt).toContain("# My App");
	});
});

describe("VULN_SPECIFIC_BYPASSES_AND_PROMPTS", () => {
	const allTypes = ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"];

	it("has entries for all 7 vuln types", () => {
		for (const t of allTypes) {
			expect(VULN_SPECIFIC_BYPASSES_AND_PROMPTS[t]).toBeDefined();
		}
	});

	it("each entry has a non-empty prompt", () => {
		for (const t of allTypes) {
			expect(VULN_SPECIFIC_BYPASSES_AND_PROMPTS[t].prompt.length).toBeGreaterThan(0);
		}
	});

	it("LFI has 6 bypass entries (comma fix verified)", () => {
		const lfi = VULN_SPECIFIC_BYPASSES_AND_PROMPTS.LFI;
		expect(lfi.bypasses).toHaveLength(6);
		expect(lfi.bypasses).toContain("C:\\win.ini");
		expect(lfi.bypasses).toContain("/?../../../../../../../etc/passwd");
	});
});
