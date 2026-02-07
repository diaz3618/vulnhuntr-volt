/**
 * Symbol finder tool — mirrors vulnhuntr's symbol_finder.py
 * Uses grep-based search to resolve code context requests.
 *
 * The original vulnhuntr uses Jedi (Python-specific) for symbol resolution.
 * This implementation uses a multi-strategy approach:
 *   1. Regex search for class/function definitions in the codebase
 *   2. Line-based context extraction around references
 *   3. Full file scan as fallback
 *
 * When tree-sitter MCP is available, it can be used for AST-level resolution.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createTool } from "@voltagent/core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Symbol extraction logic
// ---------------------------------------------------------------------------

interface SymbolResult {
	name: string;
	contextNameRequested: string;
	filePath: string;
	source: string;
}

/**
 * Extract a symbol (class or function) definition from a codebase.
 * Uses a 3-phase search strategy similar to vulnhuntr's SymbolExtractor:
 *   Phase 1: Search for definition in the same file
 *   Phase 2: Search across all project files for the definition
 *   Phase 3: Grep for usage references and extract surrounding context
 */
function extractSymbol(
	name: string,
	codeLine: string,
	allFiles: string[],
	repoPath: string,
): SymbolResult | null {
	// Clean the name — handle "ClassName.method_name" format
	const parts = name.split(".");
	const searchPatterns = buildSearchPatterns(parts);

	// Phase 1 & 2: Search all files for the definition
	for (const filePath of allFiles) {
		const fullPath = path.resolve(repoPath, filePath);
		let content: string;
		try {
			content = fs.readFileSync(fullPath, "utf-8");
		} catch {
			continue;
		}

		const lines = content.split("\n");

		for (const pattern of searchPatterns) {
			const matchIdx = lines.findIndex((line) => pattern.test(line));
			if (matchIdx !== -1) {
				// Extract the full definition (class or function body)
				const extracted = extractDefinitionBlock(lines, matchIdx);
				return {
					name: parts.join("."),
					contextNameRequested: name,
					filePath,
					source: extracted,
				};
			}
		}
	}

	// Phase 3: Search for the name as a reference and extract context
	for (const filePath of allFiles) {
		const fullPath = path.resolve(repoPath, filePath);
		let content: string;
		try {
			content = fs.readFileSync(fullPath, "utf-8");
		} catch {
			continue;
		}

		const lines = content.split("\n");
		const baseName = parts[parts.length - 1];

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(baseName)) {
				// Extract surrounding context (20 lines before, 30 after)
				const start = Math.max(0, i - 20);
				const end = Math.min(lines.length, i + 30);
				return {
					name: parts.join("."),
					contextNameRequested: name,
					filePath,
					source: lines.slice(start, end).join("\n"),
				};
			}
		}
	}

	return null;
}

/**
 * Build regex patterns to search for a symbol definition.
 */
function buildSearchPatterns(parts: string[]): RegExp[] {
	const patterns: RegExp[] = [];

	if (parts.length === 1) {
		const name = parts[0];
		// Class definition
		patterns.push(new RegExp(`^\\s*class\\s+${escapeRegex(name)}\\s*[:(]`));
		// Function/method definition
		patterns.push(
			new RegExp(`^\\s*(?:async\\s+)?def\\s+${escapeRegex(name)}\\s*\\(`),
		);
	} else if (parts.length === 2) {
		const [className, methodName] = parts;
		// First try to find the class, then the method within it
		patterns.push(
			new RegExp(`^\\s*class\\s+${escapeRegex(className)}\\s*[:(]`),
		);
		// Also search for standalone method
		patterns.push(
			new RegExp(`^\\s*(?:async\\s+)?def\\s+${escapeRegex(methodName)}\\s*\\(`),
		);
	}

	return patterns;
}

/**
 * Extract a Python definition block starting from a given line index.
 * Follows indentation to capture the full class or function body.
 */
function extractDefinitionBlock(lines: string[], startIdx: number): string {
	const result: string[] = [lines[startIdx]];
	const startLine = lines[startIdx];

	// Determine the indentation level of the definition
	const defIndent = startLine.search(/\S/);
	if (defIndent === -1) return lines[startIdx];

	// Collect lines that are part of this definition block
	let maxLines = 150; // Cap to avoid extracting entire files
	for (let i = startIdx + 1; i < lines.length && maxLines > 0; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Empty lines are included
		if (trimmed === "") {
			result.push(line);
			maxLines--;
			continue;
		}

		// Check indentation — if we're back to same or lesser indent, stop
		const currentIndent = line.search(/\S/);
		if (currentIndent <= defIndent && trimmed !== "") {
			// Check if this is a decorator for the next definition
			if (
				trimmed.startsWith("@") ||
				trimmed.startsWith("class ") ||
				trimmed.startsWith("def ")
			) {
				break;
			}
			break;
		}

		result.push(line);
		maxLines--;
	}

	return result.join("\n");
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// VoltAgent Tool
// ---------------------------------------------------------------------------

/** Resolve code context: find class/function definitions by name */
export const resolveSymbolTool = createTool({
	name: "resolve_symbol",
	description:
		"Find the source code definition of a class or function by name. Searches across all Python files in the repository. Returns the source code block.",
	parameters: z.object({
		repo_path: z.string().describe("Absolute path to the repository root"),
		name: z
			.string()
			.describe("Symbol name (e.g., 'ClassName' or 'ClassName.method_name')"),
		code_line: z
			.string()
			.describe("The line of code where this symbol is referenced"),
		all_files: z
			.array(z.string())
			.describe("List of all Python file paths (relative to repo_path)"),
	}),
	execute: async ({ repo_path, name, code_line, all_files }) => {
		const result = extractSymbol(name, code_line, all_files, repo_path);
		if (!result) {
			return {
				found: false,
				name,
				source: "",
				file_path: "",
			};
		}
		return {
			found: true,
			name: result.name,
			source: result.source,
			file_path: result.filePath,
		};
	},
});

/**
 * Batch-resolve multiple symbols at once.
 * Used during secondary analysis when the LLM requests multiple context items.
 */
export const resolveSymbolsBatchTool = createTool({
	name: "resolve_symbols_batch",
	description:
		"Resolve multiple code symbols at once. Returns an array of results with source code for each symbol found.",
	parameters: z.object({
		repo_path: z.string().describe("Absolute path to the repository root"),
		symbols: z.array(
			z.object({
				name: z.string().describe("Symbol name"),
				code_line: z.string().describe("Reference line of code"),
			}),
		),
		all_files: z.array(z.string()).describe("List of all Python file paths"),
	}),
	execute: async ({ repo_path, symbols, all_files }) => {
		const results = symbols.map((sym) => {
			const result = extractSymbol(
				sym.name,
				sym.code_line,
				all_files,
				repo_path,
			);
			if (!result) {
				return {
					found: false,
					name: sym.name,
					source: "",
					file_path: "",
				};
			}
			return {
				found: true,
				name: result.name,
				source: result.source,
				file_path: result.filePath,
			};
		});

		return {
			resolved: results.filter((r) => r.found).length,
			total: symbols.length,
			results,
		};
	},
});

export { extractSymbol, extractDefinitionBlock };
