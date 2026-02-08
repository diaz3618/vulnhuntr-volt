import { describe, it, expect } from "vitest";
import { parseGitHubUrl, isGitHubPath } from "../src/tools/github.js";

describe("parseGitHubUrl", () => {
	it("parses full HTTPS URL", () => {
		const result = parseGitHubUrl("https://github.com/owner/repo");
		expect(result).toEqual({
			owner: "owner",
			repo: "repo",
			fullUrl: "https://github.com/owner/repo.git",
		});
	});

	it("parses URL with .git suffix", () => {
		const result = parseGitHubUrl("https://github.com/owner/repo.git");
		expect(result).toEqual({
			owner: "owner",
			repo: "repo",
			fullUrl: "https://github.com/owner/repo.git",
		});
	});

	it("parses owner/repo shorthand", () => {
		const result = parseGitHubUrl("protectai/vulnhuntr");
		expect(result).toEqual({
			owner: "protectai",
			repo: "vulnhuntr",
			fullUrl: "https://github.com/protectai/vulnhuntr.git",
		});
	});

	it("parses HTTP URL (non-https)", () => {
		const result = parseGitHubUrl("http://github.com/owner/repo");
		expect(result).not.toBeNull();
		expect(result!.owner).toBe("owner");
	});

	it("returns null for invalid input", () => {
		expect(parseGitHubUrl("not-a-url")).toBeNull();
		expect(parseGitHubUrl("")).toBeNull();
		expect(parseGitHubUrl("/local/path")).toBeNull();
	});

	it("returns null for other git hosts", () => {
		expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
	});
});

describe("isGitHubPath", () => {
	it("returns true for github.com URLs", () => {
		expect(isGitHubPath("https://github.com/owner/repo")).toBe(true);
	});

	it("returns true for owner/repo shorthand (non-existent path)", () => {
		expect(isGitHubPath("nonexistent-owner/nonexistent-repo")).toBe(true);
	});

	it("returns false for absolute local paths", () => {
		expect(isGitHubPath("/home/user/project")).toBe(false);
	});

	it("returns false for single-segment paths", () => {
		expect(isGitHubPath("myproject")).toBe(false);
	});
});
