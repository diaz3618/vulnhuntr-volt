import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { extractSymbol, extractDefinitionBlock } from "../src/tools/symbol-finder.js";
import { makeTempDir, cleanTempDir } from "./fixtures.js";

let tmpDir: string;

beforeAll(() => {
	tmpDir = makeTempDir();

	fs.writeFileSync(
		path.join(tmpDir, "models.py"),
		`class UserModel:
    def __init__(self, name):
        self.name = name

    def get_name(self):
        return self.name

class AdminModel(UserModel):
    def is_admin(self):
        return True

def standalone_func(arg):
    return arg * 2
`,
	);

	fs.writeFileSync(
		path.join(tmpDir, "views.py"),
		`from flask import Flask
app = Flask(__name__)

@app.route("/")
def index():
    return "hello"

async def async_handler(request):
    data = request.json()
    return data
`,
	);

	fs.writeFileSync(
		path.join(tmpDir, "utils.py"),
		`def helper():
    pass
`,
	);
});

afterAll(() => {
	cleanTempDir(tmpDir);
});

describe("extractSymbol", () => {
	const allFiles = ["models.py", "views.py", "utils.py"];

	it("finds a class definition", () => {
		const result = extractSymbol("UserModel", "", allFiles, tmpDir);
		expect(result).not.toBeNull();
		expect(result!.name).toBe("UserModel");
		expect(result!.source).toContain("class UserModel:");
		expect(result!.source).toContain("self.name = name");
	});

	it("finds a function definition", () => {
		const result = extractSymbol("standalone_func", "", allFiles, tmpDir);
		expect(result).not.toBeNull();
		expect(result!.source).toContain("def standalone_func(arg):");
	});

	it("finds async function", () => {
		const result = extractSymbol("async_handler", "", allFiles, tmpDir);
		expect(result).not.toBeNull();
		expect(result!.source).toContain("async def async_handler");
	});

	it("returns null for nonexistent symbol", () => {
		const result = extractSymbol("NonExistentClass", "", allFiles, tmpDir);
		expect(result).toBeNull();
	});

	it("handles ClassName.method_name format", () => {
		// Should find the class containing the method
		const result = extractSymbol("UserModel.get_name", "", allFiles, tmpDir);
		expect(result).not.toBeNull();
		expect(result!.source).toContain("class UserModel:");
	});

	it("falls back to reference search when definition not found", () => {
		// "helper" is defined, but searching for a usage pattern
		const result = extractSymbol("helper", "x = helper()", allFiles, tmpDir);
		expect(result).not.toBeNull();
		expect(result!.filePath).toBe("utils.py");
	});
});

describe("extractDefinitionBlock", () => {
	it("extracts full class body", () => {
		const lines = [
			"class Foo:",
			"    def bar(self):",
			"        return 1",
			"    def baz(self):",
			"        return 2",
			"",
			"class Other:",
			"    pass",
		];
		const block = extractDefinitionBlock(lines, 0);
		expect(block).toContain("class Foo:");
		expect(block).toContain("def bar(self):");
		expect(block).toContain("def baz(self):");
		expect(block).not.toContain("class Other:");
	});

	it("extracts function body", () => {
		const lines = [
			"def my_func(x):",
			"    if x > 0:",
			"        return x",
			"    return 0",
			"",
			"def other():",
			"    pass",
		];
		const block = extractDefinitionBlock(lines, 0);
		expect(block).toContain("def my_func(x):");
		expect(block).toContain("return x");
		expect(block).not.toContain("def other():");
	});

	it("stops at decorator of next definition", () => {
		const lines = [
			"def first():",
			"    return 1",
			"",
			"@decorator",
			"def second():",
			"    return 2",
		];
		const block = extractDefinitionBlock(lines, 0);
		expect(block).toContain("def first():");
		expect(block).not.toContain("@decorator");
	});
});
