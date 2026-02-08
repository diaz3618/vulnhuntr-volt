import { describe, it, expect } from "vitest";
import {
	VulnType,
	ResponseSchema,
	WorkflowInputSchema,
	CWE_MAP,
	CWE_NAMES,
	SEVERITY_SCORES,
	responseToFinding,
} from "../src/schemas/index.js";

describe("VulnType enum", () => {
	it("accepts all 7 valid types", () => {
		for (const t of ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"]) {
			expect(VulnType.parse(t)).toBe(t);
		}
	});

	it("rejects invalid type", () => {
		expect(() => VulnType.parse("INVALID")).toThrow();
	});
});

describe("ResponseSchema", () => {
	const validResponse = {
		scratchpad: "Step 1",
		analysis: "Found vulnerability",
		poc: null,
		confidence_score: 7,
		vulnerability_types: ["LFI"],
		context_code: [],
	};

	it("accepts well-formed response", () => {
		expect(() => ResponseSchema.parse(validResponse)).not.toThrow();
	});

	it("rejects confidence > 10", () => {
		expect(() =>
			ResponseSchema.parse({ ...validResponse, confidence_score: 11 }),
		).toThrow();
	});

	it("rejects confidence < 0", () => {
		expect(() =>
			ResponseSchema.parse({ ...validResponse, confidence_score: -1 }),
		).toThrow();
	});

	it("rejects missing scratchpad", () => {
		const { scratchpad, ...rest } = validResponse;
		expect(() => ResponseSchema.parse(rest)).toThrow();
	});
});

describe("WorkflowInputSchema defaults", () => {
	it("applies default provider", () => {
		const parsed = WorkflowInputSchema.parse({ repo_path: "/tmp/repo" });
		expect(parsed.provider).toBe("anthropic");
	});

	it("applies default min_confidence", () => {
		const parsed = WorkflowInputSchema.parse({ repo_path: "/tmp/repo" });
		expect(parsed.min_confidence).toBe(5);
	});

	it("applies default max_iterations", () => {
		const parsed = WorkflowInputSchema.parse({ repo_path: "/tmp/repo" });
		expect(parsed.max_iterations).toBe(7);
	});
});

describe("CWE mappings", () => {
	it("maps all 7 vuln types to CWE IDs", () => {
		for (const t of ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"]) {
			expect(CWE_MAP[t]).toMatch(/^CWE-\d+$/);
		}
	});

	it("has human-readable names for all CWEs", () => {
		for (const cwe of Object.values(CWE_MAP)) {
			expect(CWE_NAMES[cwe]).toBeDefined();
			expect(CWE_NAMES[cwe].length).toBeGreaterThan(0);
		}
	});
});

describe("responseToFinding", () => {
	const baseResponse = {
		scratchpad: "Analysis steps",
		analysis: "Vulnerable endpoint found",
		poc: "curl http://target/exploit",
		confidence_score: 8,
		vulnerability_types: ["LFI" as const],
		context_code: [],
	};

	it("maps confidence 9+ to CRITICAL", () => {
		const f = responseToFinding({ ...baseResponse, confidence_score: 9 }, "app.py", "LFI");
		expect(f.severity).toBe("CRITICAL");
	});

	it("maps confidence 7-8 to HIGH", () => {
		const f = responseToFinding({ ...baseResponse, confidence_score: 7 }, "app.py", "LFI");
		expect(f.severity).toBe("HIGH");
	});

	it("maps confidence 5-6 to MEDIUM", () => {
		const f = responseToFinding({ ...baseResponse, confidence_score: 5 }, "app.py", "LFI");
		expect(f.severity).toBe("MEDIUM");
	});

	it("maps confidence 3-4 to LOW", () => {
		const f = responseToFinding({ ...baseResponse, confidence_score: 3 }, "app.py", "LFI");
		expect(f.severity).toBe("LOW");
	});

	it("maps confidence <3 to INFO", () => {
		const f = responseToFinding({ ...baseResponse, confidence_score: 1 }, "app.py", "LFI");
		expect(f.severity).toBe("INFO");
	});

	it("sets correct CWE for each vuln type", () => {
		for (const [type, cwe] of Object.entries(CWE_MAP)) {
			const f = responseToFinding(baseResponse, "file.py", type);
			expect(f.cwe).toBe(cwe);
			expect(f.cwe_name).toBe(CWE_NAMES[cwe]);
		}
	});

	it("generates title from filename", () => {
		const f = responseToFinding(baseResponse, "src/utils/file_handler.py", "LFI");
		expect(f.title).toContain("file_handler.py");
		expect(f.title).toContain("LFI");
	});

	it("sets rule_id in vulnhuntr/TYPE format", () => {
		const f = responseToFinding(baseResponse, "app.py", "RCE");
		expect(f.rule_id).toBe("vulnhuntr/RCE");
	});

	it("includes discovered_at timestamp", () => {
		const f = responseToFinding(baseResponse, "app.py", "LFI");
		expect(f.discovered_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});
