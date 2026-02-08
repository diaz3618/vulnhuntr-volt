import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
	getPythonFiles,
	isNetworkRelated,
	getReadmeContent,
} from "../src/tools/repo.js";
import { makeTempDir, cleanTempDir } from "./fixtures.js";

let tmpDir: string;

beforeAll(() => {
	tmpDir = makeTempDir();

	// Create directory structure
	fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
	fs.mkdirSync(path.join(tmpDir, "__pycache__"), { recursive: true });
	fs.mkdirSync(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
	fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
	fs.mkdirSync(path.join(tmpDir, "tests"), { recursive: true });

	// Python files
	fs.writeFileSync(path.join(tmpDir, "app.py"), 'from flask import Flask\napp = Flask(__name__)\n@app.route("/")\ndef index(): return "hi"');
	fs.writeFileSync(path.join(tmpDir, "src", "views.py"), "def view(): pass");
	fs.writeFileSync(path.join(tmpDir, "utils.py"), "def helper(): return 42");

	// Files that should be excluded
	fs.writeFileSync(path.join(tmpDir, "test_app.py"), "def test(): pass");
	fs.writeFileSync(path.join(tmpDir, "__pycache__", "app.cpython-311.pyc"), "");
	fs.writeFileSync(path.join(tmpDir, "node_modules", "pkg", "setup.py"), "");
	fs.writeFileSync(path.join(tmpDir, ".git", "config"), "");
	fs.writeFileSync(path.join(tmpDir, "tests", "conftest.py"), "import pytest");

	// Non-Python files (should be ignored)
	fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test Repo\nA flask app.");
	fs.writeFileSync(path.join(tmpDir, "config.json"), "{}");
});

afterAll(() => {
	cleanTempDir(tmpDir);
});

describe("getPythonFiles", () => {
	it("finds .py files in root and subdirectories", () => {
		const files = getPythonFiles(tmpDir);
		const basenames = files.map((f) => path.basename(f));
		expect(basenames).toContain("app.py");
		expect(basenames).toContain("views.py");
		expect(basenames).toContain("utils.py");
	});

	it("excludes test_ files", () => {
		const files = getPythonFiles(tmpDir);
		const basenames = files.map((f) => path.basename(f));
		expect(basenames).not.toContain("test_app.py");
	});

	it("excludes __pycache__ directory", () => {
		const files = getPythonFiles(tmpDir);
		expect(files.every((f) => !f.includes("__pycache__"))).toBe(true);
	});

	it("excludes node_modules directory", () => {
		const files = getPythonFiles(tmpDir);
		expect(files.every((f) => !f.includes("node_modules"))).toBe(true);
	});

	it("excludes .git directory", () => {
		const files = getPythonFiles(tmpDir);
		expect(files.every((f) => !f.includes(".git"))).toBe(true);
	});

	it("excludes conftest files", () => {
		const files = getPythonFiles(tmpDir);
		const basenames = files.map((f) => path.basename(f));
		expect(basenames).not.toContain("conftest.py");
	});
});

describe("isNetworkRelated", () => {
	it("detects Flask routes", () => {
		const filePath = path.join(tmpDir, "app.py");
		expect(isNetworkRelated(filePath)).toBe(true);
	});

	it("rejects plain utility code", () => {
		const filePath = path.join(tmpDir, "utils.py");
		expect(isNetworkRelated(filePath)).toBe(false);
	});

	it("detects FastAPI patterns", () => {
		const fastApiFile = path.join(tmpDir, "fastapi_app.py");
		fs.writeFileSync(fastApiFile, 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/")\ndef root(): pass');
		expect(isNetworkRelated(fastApiFile)).toBe(true);
		fs.unlinkSync(fastApiFile);
	});

	it("detects Django view classes", () => {
		const djangoFile = path.join(tmpDir, "django_views.py");
		fs.writeFileSync(djangoFile, "class UserDetailView(DetailView):\n    model = User");
		expect(isNetworkRelated(djangoFile)).toBe(true);
		fs.unlinkSync(djangoFile);
	});

	it("returns false for nonexistent file", () => {
		expect(isNetworkRelated("/nonexistent/file.py")).toBe(false);
	});
});

describe("getReadmeContent", () => {
	it("reads README.md", () => {
		const content = getReadmeContent(tmpDir);
		expect(content).not.toBeNull();
		expect(content).toContain("# Test Repo");
	});

	it("returns null when no README exists", () => {
		const emptyDir = makeTempDir();
		expect(getReadmeContent(emptyDir)).toBeNull();
		cleanTempDir(emptyDir);
	});

	it("finds readme.md (lowercase)", () => {
		const dir = makeTempDir();
		fs.writeFileSync(path.join(dir, "readme.md"), "# Lowercase");
		expect(getReadmeContent(dir)).toContain("# Lowercase");
		cleanTempDir(dir);
	});
});
