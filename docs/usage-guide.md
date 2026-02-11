# Usage Guide

This guide covers all the ways to use VulnHuntr-Volt for vulnerability analysis.

## Table of Contents

- [CLI Usage](#cli-usage)
- [REST API](#rest-api)
- [Workflow Execution](#workflow-execution)
- [Common Scenarios](#common-scenarios)

## CLI Usage

The command-line interface provides the fastest way to scan repositories.

### Basic Commands

```bash
# Analyze a local repository
npm run scan -- -r /path/to/python-project

# Analyze a GitHub repository
npm run scan -- -r https://github.com/owner/repo

# Analyze a specific file
npm run scan -- -r /path/to/project -a src/api/server.py

# Use different LLM provider
npm run scan -- -r /path/to/project -l openai

# Scan for specific vulnerability types
npm run scan -- -r /path/to/project -v LFI -v RCE -v SQLI

# Set budget limit
npm run scan -- -r /path/to/project -b 5.00

# Get help
npm run vulnhuntr -- --help
```

### CLI Options Reference

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

## REST API

Start the VoltAgent server to use the REST API for workflow execution.

### Starting the Server

```bash
npm run dev:server
```

The server runs at `http://localhost:3141`

### Execute Workflow

POST to `/workflows/{workflowId}/execute`:

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

### Stream Workflow (Server-Sent Events)

POST to `/workflows/{workflowId}/stream`:

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

## Workflow Execution

### Input Schema

All workflow executions accept the following JSON input:

```json
{
  "repo_path": "string (required)",
  "provider": "anthropic | openai | ollama",
  "model": "string (optional)",
  "analyze_path": "string (optional)",
  "max_budget_usd": "number (optional)",
  "min_confidence": "number (0-10, default: 5)",
  "max_iterations": "number (1-20, default: 7)",
  "vuln_types": ["LFI", "RCE", ...] (optional),
  "dry_run": "boolean (default: false)"
}
```

For detailed workflow examples, see [workflow-examples.md](workflow-examples.md).

## Common Scenarios

### Analyze a Local Repository

```bash
npm run scan -- -r ./my-python-project
```

Or via API:

```json
{
  "repo_path": "/path/to/python-project",
  "provider": "anthropic"
}
```

### Analyze a GitHub Repository

```bash
npm run scan -- -r https://github.com/username/repo -b 10.0
```

Or via API:

```json
{
  "repo_path": "https://github.com/username/repo",
  "provider": "anthropic",
  "max_budget_usd": 10.0
}
```

### Analyze a Specific File

```bash
npm run scan -- -r ./my-project -a src/api/views.py
```

Or via API:

```json
{
  "repo_path": "/path/to/project",
  "analyze_path": "src/api/views.py",
  "provider": "openai",
  "model": "gpt-4o"
}
```

### Scan for Specific Vulnerabilities

```bash
npm run scan -- -r ./my-project -v SQLI -v XSS -v SSRF
```

Or via API:

```json
{
  "repo_path": "/path/to/project",
  "provider": "anthropic",
  "vuln_types": ["SQLI", "XSS", "SSRF"]
}
```

### Budget-Constrained Scan

```bash
npm run scan -- -r ./large-project -b 5.00 -i 3
```

Or via API:

```json
{
  "repo_path": "/path/to/large-project",
  "provider": "anthropic",
  "max_budget_usd": 5.0,
  "max_iterations": 3
}
```

### Dry-Run Mode (Preview Without Cost)

```bash
npm run scan -- -r ./my-project --dry-run
```

Or via API:

```json
{
  "repo_path": "/path/to/project",
  "provider": "anthropic",
  "dry_run": true
}
```

### High-Confidence Findings Only

```bash
npm run scan -- -r ./production-app -c 8
```

Or via API:

```json
{
  "repo_path": "/path/to/production-app",
  "provider": "anthropic",
  "min_confidence": 8,
  "max_iterations": 10
}
```

## Output Reports

After analysis, reports are generated in `.vulnhuntr-reports/`:

```
.vulnhuntr-reports/
├── report-{timestamp}.json      # JSON format
├── report-{timestamp}.sarif     # SARIF format (GitHub Security)
├── report-{timestamp}.md        # Markdown report
├── report-{timestamp}.html      # HTML report
├── report-{timestamp}.csv       # CSV format
└── cost-{timestamp}.txt         # Cost breakdown
```

### Report Formats

- **JSON**: Machine-readable findings with full metadata
- **SARIF**: GitHub Security Tab compatible format
- **Markdown**: Human-readable summary with tables
- **HTML**: Interactive web report with filtering
- **CSV**: Spreadsheet-compatible data export
- **Cost Report**: Token usage and USD cost breakdown

## Next Steps

- [Configuration Guide](configuration.md) - Learn about config files and settings
- [Workflow Examples](workflow-examples.md) - See more execution examples
- [Development Guide](development.md) - Extend and customize VulnHuntr-Volt
