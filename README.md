<div align="center">
  <h1>⚡ vulnhuntr-volt</h1>
  <p>AI Agent powered by <a href="https://voltagent.dev">VoltAgent</a></p>
  
  <p>
    <a href="https://github.com/voltagent/voltagent"><img src="https://img.shields.io/badge/built%20with-VoltAgent-blue" alt="Built with VoltAgent" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node Version" /></a>
  </p>
</div>

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Git
- Anthropic API Key (optional - can configure later)
  - Get your key at: <https://console.anthropic.com/settings/keys>

### Installation

```bash
# Clone the repository (if not created via create-voltagent-app)
git clone https://github.com/diaz3618/vulnhuntr-volt.git
cd vulnhuntr-volt

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Configuration

Edit `.env` file with your API keys:

```env
ANTHROPIC_API_KEY=your-api-key-here

# VoltOps Platform (Optional)
# Get your keys at https://console.voltagent.dev/tracing-setup
# VOLTAGENT_PUBLIC_KEY=your-public-key
# VOLTAGENT_SECRET_KEY=your-secret-key
```

### Running the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build

# Start production server
npm start
```

## 🎯 Features

This VoltAgent application is a full port of [VulnHuntr](https://github.com/protectai/vulnhuntr) — an AI-powered vulnerability scanner for Python repositories:

- **7 Vulnerability Types**: LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR
- **Two-Phase Analysis**: Initial scan + iterative deep analysis with symbol resolution
- **Claude Prefill Trick**: Forces structured JSON output from Claude models
- **120+ Network Patterns**: Auto-detects security-relevant Python files (Flask, FastAPI, Django, Tornado, aiohttp, Starlette, Pyramid, Bottle, and many more)
- **6 Report Formats**: SARIF, JSON, Markdown, HTML, CSV, and cost summary
- **Cost Tracking & Budget Enforcement**: Per-file, per-iteration, and total cost limits with escalating-cost detection
- **Checkpoint/Resume**: Gracefully handles SIGINT; resumes interrupted scans
- **Config File Support**: `.vulnhuntr.yaml` in project root or home directory
- **GitHub Clone & Analyze**: Accepts GitHub URLs directly
- **MCP Integration**: Optional filesystem, ripgrep, tree-sitter, process, and CodeQL MCP servers
- **Webhook Notifications**: Slack, Discord, Microsoft Teams, and generic JSON with HMAC-SHA256 signing
- **GitHub Issues Integration**: Auto-create issues with duplicate detection

### How It Works

1. **Repository Setup** — Clone GitHub repos or use local paths
2. **File Discovery** — Scan for Python files, filter to network-related ones using 120+ regex patterns
3. **README Summarization** — LLM summarizes the README for security context
4. **Per-File Analysis**:
   - **Phase 1**: Initial analysis across all 7 vuln types simultaneously
   - **Phase 2**: Iterative deep analysis per vuln type with symbol resolution (up to 7 iterations)
5. **Report Generation** — Writes SARIF, JSON, Markdown, HTML, CSV reports + cost log

### Supported Vulnerability Types

| Type | CWE | Description |
|------|-----|-------------|
| LFI | CWE-22 | Local File Inclusion / Path Traversal |
| RCE | CWE-78 | Remote Code Execution / Command Injection |
| SSRF | CWE-918 | Server-Side Request Forgery |
| AFO | CWE-73 | Arbitrary File Overwrite |
| SQLI | CWE-89 | SQL Injection |
| XSS | CWE-79 | Cross-Site Scripting |
| IDOR | CWE-639 | Insecure Direct Object Reference |

## 🤖 Agent Orchestration System

This workspace includes an **intelligent agent orchestration system** for GitHub Copilot that prevents context flooding:

- **Main Orchestrator**: `.agents/AGENT.md` - Automatically loaded by VS Code
- **Specialized Sub-Agents**: Domain-specific experts (VoltAgent, TypeScript, Git, Docker, etc.)
- **Smart Delegation**: Only loads relevant agents (1-3 max) for each question
- **60-80% Context Reduction**: Faster responses, lower costs, higher accuracy

### Available Sub-Agents

- **VoltAgent Development**: Agents, workflows, tools, VoltAgent API
- **VoltAgent Documentation**: Skills, examples, best practices
- **TypeScript Development**: TypeScript, Node.js, build configuration
- **Git Operations**: Commits, branches, version control
- **Infrastructure**: Docker, deployment, CI/CD

### How It Works

1. You ask Copilot a question
2. Main orchestrator analyzes the domain
3. Loads only relevant sub-agent(s)
4. Provides fast, accurate, researched answer

**Learn More**: [.agents/README.md](.agents/README.md)

## 🔍 VoltOps Platform

### Local Development

The VoltOps Platform provides real-time observability for your agents during development:

1. **Start your agent**: Run `npm run dev`
2. **Open console**: Visit [console.voltagent.dev](https://console.voltagent.dev)
3. **Auto-connect**: The console connects to your local agent at `http://localhost:3141`

Features:

- 🔍 Real-time execution visualization
- 🐛 Step-by-step debugging
- 📊 Performance insights
- 💾 No data leaves your machine

### Production Monitoring

For production environments, configure VoltOpsClient:

1. **Create a project**: Sign up at [console.voltagent.dev/tracing-setup](https://console.voltagent.dev/tracing-setup)
2. **Get your keys**: Copy your Public and Secret keys
3. **Add to .env**:

   ```env
   VOLTAGENT_PUBLIC_KEY=your-public-key
   VOLTAGENT_SECRET_KEY=your-secret-key
   ```

4. **Configure in code**: The template already includes VoltOpsClient setup!

## 📁 Project Structure

```
vulnhuntr-volt/
├── src/
│   ├── index.ts              # Main agent + VoltAgent configuration
│   ├── schemas/              # Zod schemas (VulnType, Finding, Response)
│   │   └── index.ts
│   ├── prompts/              # All 7 vuln-specific prompt templates
│   │   └── index.ts
│   ├── workflows/            # Workflow definitions
│   │   ├── index.ts          # Re-exports
│   │   └── vulnhuntr.ts     # 5-step analysis workflow chain
│   ├── tools/                # VoltAgent tools
│   │   ├── index.ts          # Tool exports
│   │   ├── repo.ts           # File discovery, network pattern matching
│   │   ├── github.ts         # GitHub clone + URL parsing
│   │   └── symbol-finder.ts  # Symbol resolution (regex-based)
│   ├── reporters/            # Report generators
│   │   └── index.ts          # SARIF, JSON, Markdown, HTML, CSV
│   ├── llm/                  # LLM abstraction layer
│   │   └── index.ts          # Claude prefill, JSON fixing, sessions
│   ├── cost-tracker/         # Cost tracking & budget enforcement
│   │   └── index.ts          # CostTracker, BudgetEnforcer, estimation
│   ├── config/               # Configuration file support
│   │   └── index.ts          # .vulnhuntr.yaml loading & merging
│   ├── checkpoint/           # Checkpoint/resume system
│   │   └── index.ts          # AnalysisCheckpoint, SIGINT handler
│   ├── integrations/         # External integrations
│   │   ├── github-issues.ts  # GitHub Issues with duplicate detection
│   │   └── webhook.ts        # Webhook notifications (Slack/Discord/Teams)
│   └── mcp/                  # MCP server integration
│       └── index.ts          # 5 MCP servers configuration
├── repos/
│   └── vulnhuntr/            # Original Python vulnhuntr (reference)
├── dist/                     # Compiled output (after build)
├── .agents/                  # Copilot agent orchestration system
├── .env                      # Environment variables
├── .voltagent/               # Agent memory storage
├── Dockerfile                # Production deployment
├── package.json
└── tsconfig.json
```

## 🧪 Usage

### CLI (Command Line Interface)

The fastest way to scan a repository:

```bash
# Analyze a local repository
npm run scan -- -r /path/to/python-project

# Analyze a GitHub repository
npm run scan -- -r https://github.com/owner/repo

# Analyze a specific file with OpenAI
npm run scan -- -r /path/to/project -a src/api/server.py -l openai

# Scan for specific vulnerability types with budget limit
npm run scan -- -r /path/to/project -v LFI -v RCE -b 5.00

# Full options
npm run vulnhuntr -- --help
```

**CLI Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-r, --root` | Local path or GitHub URL (required) | - |
| `-a, --analyze` | Specific file/directory to analyze | entire repo |
| `-l, --llm` | LLM provider: anthropic, openai, ollama | anthropic |
| `-m, --model` | Specific model name | claude-sonnet-4 |
| `-b, --budget` | Maximum budget in USD | unlimited |
| `-c, --confidence` | Minimum confidence threshold (0-10) | 5 |
| `-i, --iterations` | Max secondary analysis iterations | 7 |
| `-v, --vuln` | Vulnerability types to scan (repeatable) | all |

### REST API (VoltAgent Server)

Start the server and trigger workflows via HTTP:

```bash
# Start the VoltAgent server
npm run dev:server

# Server runs at http://localhost:3141
```

**Execute Workflow:**

```bash
curl -X POST http://localhost:3141/workflows/vulnhuntr-analysis/execute \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "repo_path": "/path/to/python-project",
      "provider": "anthropic",
      "min_confidence": 5
    }
  }'
```

**Stream Workflow (SSE):**

```bash
curl -N -X POST http://localhost:3141/workflows/vulnhuntr-analysis/stream \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "repo_path": "https://github.com/owner/repo",
      "provider": "anthropic"
    }
  }'
```

### Workflow Input Schema

```json
{
  "repo_path": "/path/to/python-project",
  "provider": "anthropic",
  "min_confidence": 5,
  "max_iterations": 7
}
```

### Analyze a GitHub Repository

```json
{
  "repo_path": "https://github.com/owner/repo",
  "provider": "anthropic",
  "max_budget_usd": 5.0,
  "vuln_types": ["SQLI", "XSS", "SSRF"]
}
```

### Analyze a Specific File

```json
{
  "repo_path": "/path/to/project",
  "analyze_path": "src/api/views.py",
  "provider": "openai",
  "model": "gpt-4o"
}
```

### Configuration File (`.vulnhuntr.yaml`)

```yaml
cost:
  budget: 10.0
  checkpoint: true
llm:
  provider: claude
analysis:
  vuln_types: []
  exclude_paths: [tests/, docs/, venv/]
  max_iterations: 7
  confidence_threshold: 1
verbosity: 1
```

## 🐳 Docker Deployment

Build and run with Docker:

```bash
# Build image
docker build -t vulnhuntr-volt .

# Run container
docker run -p 3141:3141 --env-file .env vulnhuntr-volt

# Or use docker-compose
docker-compose up
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run volt` - VoltAgent CLI tools

### Adding Custom Tools

Create new tools in `src/tools/`:

```typescript
import { createTool } from '@voltagent/core';
import { z } from 'zod';

export const myTool = createTool({
  name: 'myTool',
  description: 'Description of what this tool does',
  input: z.object({
    param: z.string(),
  }),
  output: z.string(),
  handler: async ({ param }) => {
    // Tool logic here
    return `Result: ${param}`;
  },
});
```

### Creating New Workflows

Add workflows in `src/workflows/`:

```typescript
import { createWorkflowChain } from '@voltagent/core';
import { z } from 'zod';

export const myWorkflow = createWorkflowChain({
  id: "my-workflow",
  name: "My Custom Workflow",
  purpose: "Description of what this workflow does",
  input: z.object({
    data: z.string(),
  }),
  result: z.object({
    output: z.string(),
  }),
})
  .andThen({
    id: "process-data",
    execute: async ({ data }) => {
      // Process the input
      const processed = data.toUpperCase();
      return { processed };
    },
  })
  .andThen({
    id: "final-step",
    execute: async ({ data }) => {
      // Final transformation
      return { output: `Result: ${data.processed}` };
    },
  });
```

## 📚 Resources

- **Documentation**: [voltagent.dev/docs](https://voltagent.dev/docs/)
- **Examples**: [github.com/VoltAgent/voltagent/tree/main/examples](https://github.com/VoltAgent/voltagent/tree/main/examples)
- **Discord**: [Join our community](https://s.voltagent.dev/discord)
- **Blog**: [voltagent.dev/](https://voltagent.dev/blog/)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

---

<div align="center">
  <p>Built with ❤️ using <a href="https://voltagent.dev">VoltAgent</a></p>
</div>
