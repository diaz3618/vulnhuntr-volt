<div align="center">
  <h1>⚡ vulnhuntr-volt</h1>
  <p>AI Agent powered by <a href="https://voltagent.dev">VoltAgent</a></p>
  
  <p>
    <a href="https://github.com/voltagent/voltagent"><img src="https://img.shields.io/badge/built%20with-VoltAgent-blue" alt="Built with VoltAgent" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node Version" /></a>
  </p>
</div>

An AI-powered vulnerability scanner for Python repositories, built on [VoltAgent](https://voltagent.dev). Full port of the original [VulnHuntr](https://github.com/protectai/vulnhuntr) project with enhanced cost tracking, checkpoint/resume, and multiple report formats.

## Quick Start

### Prerequisites

- Node.js 20+
- Anthropic API Key (recommended) or OpenAI API Key
  - Get key at: <https://console.anthropic.com/settings/keys>

### Installation

```bash
git clone https://github.com/diaz3618/vulnhuntr-volt.git
cd vulnhuntr-volt
npm install
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=your-api-key-here
```

### Run a Scan

```bash
# Analyze a local repository
npm run scan -- -r /path/to/python-project

# Analyze a GitHub repository
npm run scan -- -r https://github.com/owner/repo

# With budget limit
npm run scan -- -r /path/to/project -b 5.00
```

See [Usage Guide](docs/usage-guide.md) for all options and examples.

## Features

**Security Analysis:**
- 7 Vulnerability Types: LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR
- Two-Phase Analysis: Initial scan + iterative deep analysis with symbol resolution
- 120+ Network Patterns: Auto-detects security-relevant Python files
- Multiple LLM Providers: Anthropic Claude, OpenAI GPT, Ollama (local)

**Cost Management:**
- Real-time cost tracking with per-file, per-iteration, and total limits
- Budget enforcement with escalating-cost detection
- Dry-run mode for cost-free preview
- Detailed cost reports with token usage breakdown

**Reporting & Integration:**
- 6 Report Formats: SARIF, JSON, Markdown, HTML, CSV, Cost Summary
- GitHub Security Tab integration (SARIF upload)
- GitHub Issues auto-creation with duplicate detection
- Webhook notifications: Slack, Discord, MS Teams

**Development Features:**
- Checkpoint/Resume: Gracefully handles interruptions
- MCP Integration: Optional filesystem, ripgrep, tree-sitter, process, CodeQL servers
- Configuration: `.vulnhuntr.yaml` or environment variables
- CLI and REST API interfaces

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

## Agent Orchestration System

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

## VoltOps Platform

### Local Development

The VoltOps Platform provides real-time observability for your agents during development:

1. **Start your agent**: Run `npm run dev`
2. **Open console**: Visit [console.voltagent.dev](https://console.voltagent.dev)
3. **Auto-connect**: The console connects to your local agent at `http://localhost:3141`

Features:

- Real-time execution visualization
- Step-by-step debugging
- Performance insights
- No data leaves your machine

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

## Project Structure

```
vulnhuntr-volt/
├── src/
│   ├── index.ts              # Main agent + VoltAgent configuration
│   ├── workflows/            # Analysis workflow chain
│   ├── tools/                # GitHub, repo, symbol-finder tools
│   ├── prompts/              # Vulnerability-specific prompts
│   ├── reporters/            # SARIF, JSON, Markdown, HTML, CSV
│   ├── llm/                  # LLM provider abstraction
│   ├── cost-tracker/         # Cost tracking & budget enforcement
│   ├── config/               # Configuration file support
│   ├── checkpoint/           # Checkpoint/resume system
│   ├── integrations/         # GitHub issues & webhooks
│   └── mcp/                  # MCP server integration
├── repos/vulnhuntr/          # Original Python implementation (reference)
├── docs/                     # Documentation
├── .agents/                  # Copilot agent orchestration
└── .voltagent/               # Agent memory storage
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Documentation

- [Usage Guide](docs/usage-guide.md) - CLI, REST API, and workflow examples
- [Configuration](docs/configuration.md) - Environment variables, config files, LLM setup
- [Deployment](docs/deployment.md) - Docker, CI/CD, Kubernetes, production setup
- [Development](docs/development.md) - Creating custom tools, workflows, reporters
- [Workflow Examples](docs/workflow-examples.md) - Comprehensive workflow execution examples
- [Architecture](docs/ARCHITECTURE.md) - System design and technical details

## Resources

- **Documentation**: [voltagent.dev/docs](https://voltagent.dev/docs/)
- **Examples**: [github.com/VoltAgent/voltagent/tree/main/examples](https://github.com/VoltAgent/voltagent/tree/main/examples)
- **Discord**: [Join our community](https://s.voltagent.dev/discord)
- **Blog**: [voltagent.dev/](https://voltagent.dev/blog/)

## Contributing

Contributions are welcome! Please see the [Development Guide](docs/development.md) for details on:

- Setting up development environment
- Creating custom tools and workflows
- Running tests
- Pull request process

## License

MIT License - see LICENSE file for details

---

<div align="center">
  <p>Built with ❤️ using <a href="https://voltagent.dev">VoltAgent</a></p>
</div>
