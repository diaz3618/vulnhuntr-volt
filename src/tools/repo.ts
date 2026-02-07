/**
 * Repository operations tool — mirrors vulnhuntr's RepoOps.
 * Handles file discovery, filtering, and network-related file detection.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createTool } from "@voltagent/core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants (from repo.py)
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDE_PATHS = new Set([
	"/setup.py",
	"/test",
	"/example",
	"/docs",
	"/site-packages",
	".venv",
	"virtualenv",
	"/dist",
	"/node_modules",
	"/__pycache__",
	"/.git",
]);

const DEFAULT_EXCLUDE_FILENAMES = ["test_", "conftest", "_test.py"];

/** ~50 regex patterns that indicate network/endpoint handler code */
const NETWORK_PATTERNS: RegExp[] = [
	// Flask
	/app\.route\s*\(/,
	/app\.add_url_rule\s*\(/,
	/Blueprint\s*\(/,
	/@.*\.route\s*\(/,
	/flask\.make_response/,
	/flask\.send_file/,
	/flask\.send_from_directory/,
	// FastAPI
	/app\.(get|post|put|delete|patch|options|head)\s*\(/,
	/@.*\.(get|post|put|delete|patch|options|head)\s*\(/,
	/APIRouter\s*\(/,
	/FastAPI\s*\(/,
	/Depends\s*\(/,
	/BackgroundTasks/,
	// Django
	/path\s*\(\s*['"].*['"]\s*,/,
	/re_path\s*\(/,
	/url\s*\(\s*r?['"].*['"]\s*,/,
	/urlpatterns\s*=/,
	/class\s+\w+.*View\s*[:(]/,
	/class\s+\w+.*APIView\s*[:(]/,
	/class\s+\w+.*ViewSet\s*[:(]/,
	/class\s+\w+.*Serializer\s*[:(]/,
	/class\s+\w+.*Mixin\s*[:(]/,
	/class\s+\w+.*Middleware\s*[:(]/,
	/def\s+(get|post|put|patch|delete|dispatch)\s*\(self/,
	/HttpResponse\s*\(/,
	/JsonResponse\s*\(/,
	/FileResponse\s*\(/,
	/StreamingHttpResponse/,
	// Tornado
	/class\s+\w+.*RequestHandler\s*[:(]/,
	/class\s+\w+.*WebSocketHandler\s*[:(]/,
	/tornado\.web\.Application\s*\(/,
	/tornado\.ioloop/,
	// aiohttp
	/app\.router\.add_(get|post|put|delete|patch|route)\s*\(/,
	/web\.(get|post|put|delete|patch|route)\s*\(/,
	/aiohttp\.web\.Application/,
	/aiohttp\.ClientSession/,
	// Sanic
	/app\.(get|post|put|delete|patch)\s*\(/,
	/@app\.(get|post|put|delete|patch)\s*\(/,
	/sanic\.Sanic/,
	// Falcon
	/class\s+\w+.*Resource\s*[:(]/,
	/app\.add_route\s*\(/,
	/falcon\.App\s*\(/,
	/falcon\.API\s*\(/,
	// CherryPy
	/@cherrypy\.expose/,
	/cherrypy\.quickstart\s*\(/,
	/cherrypy\.tree\.mount/,
	// Starlette
	/Route\s*\(\s*['"].*['"]\s*,/,
	/Mount\s*\(\s*['"].*['"]\s*,/,
	/Starlette\s*\(/,
	/WebSocketRoute\s*\(/,
	// Pyramid
	/config\.add_route\s*\(/,
	/config\.add_view\s*\(/,
	/@view_config/,
	/@view_defaults/,
	/Configurator\s*\(/,
	// Bottle
	/bottle\.route\s*\(/,
	/bottle\.get\s*\(/,
	/bottle\.post\s*\(/,
	/@bottle\.(route|get|post|put|delete)/,
	/bottle\.run\s*\(/,
	// Quart
	/quart\.Quart\s*\(/,
	/@app\.before_request/,
	/@app\.after_request/,
	// web2py
	/def\s+(index|create|update|delete|show)\s*\(\)/,
	/response\.render/,
	/request\.vars/,
	// Hug
	/hug\.(get|post|put|delete|call)\s*\(/,
	/@hug\./,
	// Dash
	/dash\.Dash\s*\(/,
	/@app\.callback/,
	/dash_core_components/,
	// Responder
	/responder\.API\s*\(/,
	// Gradio
	/gr\.Interface\s*\(/,
	/gr\.Blocks\s*\(/,
	/\.launch\s*\(/,
	// GraphQL
	/graphene\.(ObjectType|Mutation|Schema)/,
	/strawberry\.(type|mutation|schema)/,
	/ariadne\./,
	// AWS Lambda
	/def\s+lambda_handler\s*\(/,
	/def\s+handler\s*\(event/,
	// Azure Functions
	/def\s+main\s*\(req:\s*func\.HttpRequest/,
	/@app\.function_name/,
	// GCP Functions
	/def\s+\w+\(request\)/,
	/functions_framework/,
	// Server startup
	/uvicorn\.run\s*\(/,
	/gunicorn/,
	/waitress\.serve\s*\(/,
	/app\.run\s*\(/,
	/hypercorn\.run/,
	/daphne/,
	/twisted\.web/,
	/http\.server\.HTTPServer/,
	/socketserver\.(TCPServer|ThreadingTCPServer)/,
	// WebSocket patterns
	/websocket/i,
	/@.*\.ws\s*\(/,
	/WebSocket\s*\(/,
	/channels\.routing/,
	/channels\.consumer/,
	// gRPC
	/servicer/i,
	/add_.*_to_server/,
	/grpc\.server/,
	// HTTP clients (potential SSRF sources)
	/requests\.(get|post|put|delete|patch|head|options)\s*\(/,
	/urllib\.request\.urlopen/,
	/urllib3/,
	/httpx\.(get|post|put|delete|AsyncClient|Client)/,
	/aiohttp\.ClientSession/,
	// Async handler patterns
	/async\s+def\s+(get|post|put|delete|patch|dispatch|handle|websocket_connect)\s*\(/,
	// XML/data parsing (XXE vectors)
	/xml\.etree\.ElementTree/,
	/lxml\.etree/,
	/xml\.sax/,
	/defusedxml/,
	// File handling (LFI/AFO vectors)
	/send_file\s*\(/,
	/open\s*\(.*request/,
	/shutil\.(copy|move|rmtree)/,
	/os\.path\.join\s*\(.*request/,
	/pathlib\.Path.*request/,
	// Database (SQLi vectors)
	/cursor\.execute\s*\(/,
	/\.raw\s*\(/,
	/\.extra\s*\(/,
	/sqlalchemy\.text\s*\(/,
	/engine\.execute/,
	// Template rendering (XSS vectors)
	/render_template_string\s*\(/,
	/Markup\s*\(/,
	/\|safe\b/,
	/mark_safe\s*\(/,
	/autoescape\s*=\s*False/,
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Recursively glob for Python files */
function getPythonFiles(dir: string): string[] {
	const results: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		const relativeLower = `/${path.relative(dir, fullPath).toLowerCase()}`;

		if (entry.isDirectory()) {
			// Check exclude paths
			const shouldExclude = [...DEFAULT_EXCLUDE_PATHS].some(
				(exc) => relativeLower.includes(exc) || entry.name.startsWith("."),
			);
			if (!shouldExclude) {
				results.push(...getPythonFilesRecursive(fullPath, dir));
			}
		}
	}

	// Also check root-level .py files
	for (const entry of entries) {
		if (entry.isFile() && entry.name.endsWith(".py")) {
			const shouldExcludeFilename = DEFAULT_EXCLUDE_FILENAMES.some((exc) =>
				entry.name.includes(exc),
			);
			if (!shouldExcludeFilename) {
				results.push(path.join(dir, entry.name));
			}
		}
	}

	return results;
}

function getPythonFilesRecursive(dir: string, rootDir: string): string[] {
	const results: string[] = [];

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return results;
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		const relativeLower = `/${path.relative(rootDir, fullPath).toLowerCase()}`;

		if (entry.isDirectory()) {
			const shouldExclude = [...DEFAULT_EXCLUDE_PATHS].some(
				(exc) => relativeLower.includes(exc) || entry.name.startsWith("."),
			);
			if (!shouldExclude) {
				results.push(...getPythonFilesRecursive(fullPath, rootDir));
			}
		} else if (entry.isFile() && entry.name.endsWith(".py")) {
			const shouldExcludePath = [...DEFAULT_EXCLUDE_PATHS].some((exc) =>
				relativeLower.includes(exc),
			);
			const shouldExcludeFilename = DEFAULT_EXCLUDE_FILENAMES.some((exc) =>
				entry.name.includes(exc),
			);
			if (!shouldExcludePath && !shouldExcludeFilename) {
				results.push(fullPath);
			}
		}
	}

	return results;
}

/** Check if a file contains network-related patterns */
function isNetworkRelated(filePath: string): boolean {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		return NETWORK_PATTERNS.some((pattern) => pattern.test(content));
	} catch {
		return false;
	}
}

/** Read README content from a repo */
function getReadmeContent(repoPath: string): string | null {
	const candidates = [
		"README.md",
		"readme.md",
		"README.rst",
		"README.txt",
		"README",
	];
	for (const name of candidates) {
		const filePath = path.join(repoPath, name);
		if (fs.existsSync(filePath)) {
			try {
				return fs.readFileSync(filePath, "utf-8");
			} catch {}
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// VoltAgent Tools
// ---------------------------------------------------------------------------

/** Discover Python files in a repository, filtering for relevance */
export const discoverFilesTool = createTool({
	name: "discover_files",
	description:
		"Scan a local repository for Python files, optionally filtering to network-related files only. Returns a list of file paths.",
	parameters: z.object({
		repo_path: z.string().describe("Absolute path to the repository root"),
		network_only: z
			.boolean()
			.default(true)
			.describe(
				"Filter to only network-related files (endpoint handlers, API routes)",
			),
		analyze_path: z
			.string()
			.optional()
			.describe("Specific file or subdirectory to analyze"),
	}),
	execute: async ({ repo_path, network_only, analyze_path }) => {
		const targetPath = analyze_path
			? path.resolve(repo_path, analyze_path)
			: repo_path;

		if (!fs.existsSync(targetPath)) {
			throw new Error(`Path does not exist: ${targetPath}`);
		}

		const stat = fs.statSync(targetPath);
		let files: string[];

		if (stat.isFile()) {
			files = [targetPath];
		} else {
			files = getPythonFiles(targetPath);
		}

		if (network_only && !stat.isFile()) {
			files = files.filter(isNetworkRelated);
		}

		return {
			files: files.map((f) => path.relative(repo_path, f)),
			total: files.length,
			repo_path,
		};
	},
});

/** Read a file from the repository */
export const readFileTool = createTool({
	name: "read_file",
	description: "Read the contents of a file from the repository",
	parameters: z.object({
		repo_path: z.string().describe("Absolute path to the repository root"),
		file_path: z.string().describe("Relative path to the file within the repo"),
	}),
	execute: async ({ repo_path, file_path }) => {
		const fullPath = path.resolve(repo_path, file_path);
		if (!fs.existsSync(fullPath)) {
			throw new Error(`File not found: ${fullPath}`);
		}
		const content = fs.readFileSync(fullPath, "utf-8");
		return {
			path: file_path,
			content,
			lines: content.split("\n").length,
		};
	},
});

/** Read the README file from a repository */
export const readReadmeTool = createTool({
	name: "read_readme",
	description: "Read the README file from a repository for security context",
	parameters: z.object({
		repo_path: z.string().describe("Absolute path to the repository root"),
	}),
	execute: async ({ repo_path }) => {
		const content = getReadmeContent(repo_path);
		return {
			found: content !== null,
			content: content ?? "",
		};
	},
});

/** List all Python files in a repository (without network filtering) */
export const listAllFilesTool = createTool({
	name: "list_all_files",
	description:
		"List all Python files in a repository (including non-network files). Useful for symbol resolution.",
	parameters: z.object({
		repo_path: z.string().describe("Absolute path to the repository root"),
	}),
	execute: async ({ repo_path }) => {
		const files = getPythonFiles(repo_path);
		return {
			files: files.map((f) => path.relative(repo_path, f)),
			total: files.length,
		};
	},
});

export { getReadmeContent, getPythonFiles, isNetworkRelated };
