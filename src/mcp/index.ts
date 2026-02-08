/**
 * MCP Server Configuration for VulnHuntr
 *
 * Configures connections to external MCP servers that provide enhanced
 * code analysis capabilities. These servers run as stdio processes and
 * are accessed via VoltAgent's MCPConfiguration.
 *
 * Servers:
 * - filesystem: File system operations (@modelcontextprotocol/server-filesystem)
 * - ripgrep: Fast text search (mcp-ripgrep)
 */

import { MCPConfiguration, type Tool, type ToolSchema } from "@voltagent/core";

// ---------------------------------------------------------------------------
// Server key type
// ---------------------------------------------------------------------------
export type MCPServerKey = "filesystem" | "ripgrep";

// ---------------------------------------------------------------------------
// Configuration builder
// ---------------------------------------------------------------------------

/**
 * Build an MCPConfiguration for the analysis MCP servers.
 *
 * Each server is configured as a stdio transport using `npx` so the
 * packages don't need to be pre-installed globally — they are resolved
 * at runtime.  If a server binary isn't available the MCPConfiguration
 * will surface a connection error that callers should handle gracefully.
 *
 * @param repoPath  Absolute path to the repository being analysed.
 *                  Used to scope filesystem access and search.
 */
export function createAnalysisMCPConfig(
	repoPath: string,
): MCPConfiguration<MCPServerKey> {
	return new MCPConfiguration<MCPServerKey>({
		servers: {
			// ----- Filesystem MCP Server -----
			// Provides: read_file, write_file, list_directory, etc.
			filesystem: {
				type: "stdio",
				command: "npx",
				args: [
					"-y",
					"@modelcontextprotocol/server-filesystem",
					repoPath, // allowed root directory
				],
				timeout: 30_000,
			},

			// ----- Ripgrep MCP Server -----
			// Provides: grep-style fast text search across files
			ripgrep: {
				type: "stdio",
				command: "npx",
				args: ["-y", "mcp-ripgrep"],
				env: {
					// mcp-ripgrep looks at MCP_RIPGREP_PATH for its search root
					MCP_RIPGREP_PATH: repoPath,
				},
				timeout: 30_000,
			},
		},
	});
}

// ---------------------------------------------------------------------------
// Tool retrieval with graceful degradation
// ---------------------------------------------------------------------------

/**
 * Attempt to get all tools from the MCP configuration.
 *
 * MCP servers may fail to start (missing binaries, permission errors, etc.).
 * This function connects to each server individually and collects whatever
 * tools are available, logging warnings for any that fail.
 *
 * @returns An object containing the successfully loaded tools array and
 *          the MCPConfiguration instance (for later disconnect).
 */
export async function getMCPTools(repoPath: string): Promise<{
	tools: Tool<ToolSchema>[];
	config: MCPConfiguration<MCPServerKey>;
}> {
	const config = createAnalysisMCPConfig(repoPath);
	const tools: Tool<ToolSchema>[] = [];
	const serverKeys: MCPServerKey[] = ["filesystem", "ripgrep"];

	for (const key of serverKeys) {
		try {
			const client = await config.getClient(key);
			if (client) {
				const serverTools = await client.getAgentTools();
				const toolArray = Object.values(serverTools);
				tools.push(...toolArray);
				console.log(
					`   ✅ MCP server "${key}" connected (${toolArray.length} tools)`,
				);
			}
		} catch (error) {
			console.warn(
				`   ⚠️  MCP server "${key}" unavailable: ${error instanceof Error ? error.message : String(error)}`,
			);
			// Continue with other servers — graceful degradation
		}
	}

	console.log(`   📦 Total MCP tools loaded: ${tools.length}`);
	return { tools, config };
}

/**
 * Safely disconnect all MCP servers.
 */
export async function disconnectMCP(
	config: MCPConfiguration<MCPServerKey> | null,
): Promise<void> {
	if (!config) return;
	try {
		await config.disconnect();
		console.log("   🔌 MCP servers disconnected");
	} catch (error) {
		console.warn(
			`   ⚠️  MCP disconnect error: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
