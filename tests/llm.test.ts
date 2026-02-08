import { describe, it, expect } from "vitest";
import { fixJsonResponse, detectProvider } from "../src/llm/index.js";

describe("fixJsonResponse", () => {
	it("strips markdown code fences", () => {
		const input = '```json\n{"key": "value"}\n```';
		expect(fixJsonResponse(input)).toBe('{"key": "value"}');
	});

	it("extracts JSON object from surrounding text", () => {
		const input = 'Here is the result: {"found": true} done.';
		expect(fixJsonResponse(input)).toBe('{"found": true}');
	});

	it("converts Python None to null", () => {
		const input = '{"value": None}';
		expect(fixJsonResponse(input)).toBe('{"value": null}');
	});

	it("converts Python True/False to true/false", () => {
		const input = '{"a": True, "b": False}';
		expect(fixJsonResponse(input)).toBe('{"a": true, "b": false}');
	});

	it("removes invalid escape sequences", () => {
		const input = `{"sql": "SELECT * WHERE name = \\'admin\\'"}`;
		const result = fixJsonResponse(input);
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it("preserves valid escape sequences", () => {
		const input = '{"text": "line1\\nline2\\ttab"}';
		const result = fixJsonResponse(input);
		expect(result).toContain("\\n");
		expect(result).toContain("\\t");
	});

	it("handles already-clean JSON", () => {
		const input = '{"scratchpad": "1. Checked input", "confidence_score": 5}';
		expect(fixJsonResponse(input)).toBe(input);
	});
});

describe("detectProvider", () => {
	it("detects Anthropic from claude model name", () => {
		expect(detectProvider("claude-sonnet-4-20250514")).toBe("anthropic");
	});

	it("detects Anthropic from anthropic/ prefix", () => {
		expect(detectProvider("anthropic/claude-3-haiku")).toBe("anthropic");
	});

	it("detects OpenAI from gpt model name", () => {
		expect(detectProvider("gpt-4o")).toBe("openai");
	});

	it("detects OpenAI from openai/ prefix", () => {
		expect(detectProvider("openai/gpt-4-turbo")).toBe("openai");
	});

	it("detects Ollama from ollama/ prefix", () => {
		expect(detectProvider("ollama/llama3")).toBe("ollama");
	});

	it("returns unknown for unrecognized models", () => {
		expect(detectProvider("some-random-model")).toBe("unknown");
	});
});
