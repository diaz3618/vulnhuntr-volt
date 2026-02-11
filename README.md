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

## Features

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
├── docs/                     # Documentation
├── tests/                    # Test files
├── Dockerfile                # Docker configuration
└── package.json              # Project dependencies
```

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Documentation

- [Usage Guide](docs/usage-guide.md) - CLI, REST API, and workflow examples
- [Configuration](docs/configuration.md) - Environment variables, config files, LLM setup
- [Deployment](docs/deployment.md) - Docker, CI/CD, production setup
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

MIT License - see [LICENSE](LICENSE) file for details
