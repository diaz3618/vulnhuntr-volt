import "dotenv/config";
import {
  Agent,
  Memory,
  VoltAgent,
  VoltAgentObservability,
  VoltOpsClient,
} from "@voltagent/core";
import {
  LibSQLMemoryAdapter,
  LibSQLObservabilityAdapter,
} from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { honoServer } from "@voltagent/server-hono";
import {
  cleanupRepoTool,
  cloneGitHubRepoTool,
  discoverFilesTool,
  listAllFilesTool,
  readFileTool,
  readReadmeTool,
  resolveSymbolTool,
  resolveSymbolsBatchTool,
} from "./tools/index.js";
import { vulnhuntrWorkflow } from "./workflows/index.js";

// Create a logger instance
const logger = createPinoLogger({
  name: "vulnhuntr-volt",
  level: "info",
});

// Configure persistent memory (LibSQL / SQLite)
const memory = new Memory({
  storage: new LibSQLMemoryAdapter({
    url: "file:./.voltagent/memory.db",
    logger: logger.child({ component: "libsql" }),
  }),
});

// Configure persistent observability (LibSQL / SQLite)
const observability = new VoltAgentObservability({
  storage: new LibSQLObservabilityAdapter({
    url: "file:./.voltagent/observability.db",
  }),
});

const agent = new Agent({
  name: "vulnhuntr-volt",
  instructions: `You are an AI-powered vulnerability scanner assistant. You can:
- Analyze Python repositories for security vulnerabilities
- Clone and scan GitHub repositories
- Discover network-related Python files
- Resolve code symbols and definitions
- Generate vulnerability reports (SARIF, JSON, Markdown, HTML)

Supported vulnerability types: LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR

To analyze a repository, use the vulnhuntr-analysis workflow with the repository path or GitHub URL.`,
  model: "anthropic/claude-sonnet-4-20250514",
  tools: [
    discoverFilesTool,
    readFileTool,
    readReadmeTool,
    listAllFilesTool,
    resolveSymbolTool,
    resolveSymbolsBatchTool,
    cloneGitHubRepoTool,
    cleanupRepoTool,
  ],
  memory,
});

new VoltAgent({
  agents: {
    agent,
  },
  workflows: {
    vulnhuntrWorkflow,
  },
  server: honoServer(),
  logger,
  observability,
  voltOpsClient: new VoltOpsClient({
    publicKey: process.env.VOLTAGENT_PUBLIC_KEY!,
    secretKey: process.env.VOLTAGENT_SECRET_KEY!,
  }),
});
