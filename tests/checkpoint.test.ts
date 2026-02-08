import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AnalysisCheckpoint } from "../src/checkpoint/index.js";
import { makeTempDir, cleanTempDir } from "./fixtures.js";

let tmpDir: string;
let cpDir: string;

beforeEach(() => {
	tmpDir = makeTempDir();
	cpDir = path.join(tmpDir, ".vulnhuntr_checkpoint");
});

afterEach(() => {
	cleanTempDir(tmpDir);
});

describe("AnalysisCheckpoint", () => {
	it("creates checkpoint file on start", () => {
		const cp = new AnalysisCheckpoint(cpDir, 5, true);
		cp.start("/repo", ["a.py", "b.py", "c.py"], "claude-sonnet");
		expect(fs.existsSync(path.join(cpDir, "checkpoint.json"))).toBe(true);
		cp.finalize(false);
	});

	it("initializes with correct pending files", () => {
		const cp = new AnalysisCheckpoint(cpDir, 5, true);
		cp.start("/repo", ["a.py", "b.py"], "claude-sonnet");
		const data = cp.load();
		expect(data.pendingFiles).toEqual(["a.py", "b.py"]);
		expect(data.completedFiles).toEqual([]);
		cp.finalize(false);
	});

	it("markFileComplete moves file from pending to completed", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		cp.start("/repo", ["a.py", "b.py"], "claude-sonnet");
		cp.markFileComplete("a.py", { findings: [] });

		const data = cp.load();
		expect(data.completedFiles).toContain("a.py");
		expect(data.pendingFiles).not.toContain("a.py");
		expect(data.pendingFiles).toContain("b.py");
		cp.finalize(false);
	});

	it("saves result data on markFileComplete", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		cp.start("/repo", ["a.py"], "claude-sonnet");
		cp.markFileComplete("a.py", { vulns: ["LFI"] });

		const data = cp.load();
		expect(data.results).toHaveLength(1);
		expect(data.results[0].file).toBe("a.py");
		expect(data.results[0].result).toEqual({ vulns: ["LFI"] });
		cp.finalize(false);
	});

	it("canResume returns true when pending files exist", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		cp.start("/repo", ["a.py", "b.py"], "claude-sonnet");
		cp.markFileComplete("a.py");

		const cp2 = new AnalysisCheckpoint(cpDir, 1, true);
		expect(cp2.canResume()).toBe(true);
		cp.finalize(false);
	});

	it("canResume returns false when no checkpoint file", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		expect(cp.canResume()).toBe(false);
	});

	it("canResume returns false when all files completed", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		cp.start("/repo", ["a.py"], "claude-sonnet");
		cp.markFileComplete("a.py");

		const cp2 = new AnalysisCheckpoint(cpDir, 1, true);
		expect(cp2.canResume()).toBe(false);
		cp.finalize(false);
	});

	it("finalize cleans up checkpoint on success with no pending", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		cp.start("/repo", ["a.py"], "claude-sonnet");
		cp.markFileComplete("a.py");
		cp.finalize(true);
		expect(fs.existsSync(path.join(cpDir, "checkpoint.json"))).toBe(false);
	});

	it("finalize preserves checkpoint when incomplete", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		cp.start("/repo", ["a.py", "b.py"], "claude-sonnet");
		cp.markFileComplete("a.py");
		cp.finalize(false);
		expect(fs.existsSync(path.join(cpDir, "checkpoint.json"))).toBe(true);
	});

	it("getProgressSummary reports correct percentages", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		cp.start("/repo", ["a.py", "b.py", "c.py", "d.py"], "claude-sonnet");
		cp.markFileComplete("a.py");
		cp.markFileComplete("b.py");

		const summary = cp.getProgressSummary();
		expect(summary.total_files).toBe(4);
		expect(summary.completed_files).toBe(2);
		expect(summary.pending_files).toBe(2);
		expect(summary.progress_percent).toBe(50);
		expect(summary.status).toBe("in_progress");
		cp.finalize(false);
	});

	it("load handles snake_case keys (backward compat)", () => {
		fs.mkdirSync(cpDir, { recursive: true });
		fs.writeFileSync(
			path.join(cpDir, "checkpoint.json"),
			JSON.stringify({
				completed_files: ["x.py"],
				pending_files: ["y.py"],
				current_file: null,
				results: [],
				cost_tracker_data: null,
				repo_path: "/repo",
				started_at: "2025-01-01T00:00:00Z",
				last_updated: "2025-01-01T00:01:00Z",
				version: "1.0.0",
			}),
		);

		const cp = new AnalysisCheckpoint(cpDir, 1, true);
		const data = cp.load();
		expect(data.completedFiles).toEqual(["x.py"]);
		expect(data.pendingFiles).toEqual(["y.py"]);
		expect(data.repoPath).toBe("/repo");
	});

	it("does nothing when disabled", () => {
		const cp = new AnalysisCheckpoint(cpDir, 1, false);
		cp.start("/repo", ["a.py"], "claude-sonnet");
		expect(fs.existsSync(cpDir)).toBe(false);
	});
});
