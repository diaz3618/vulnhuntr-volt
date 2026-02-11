# Configuration Guide

VulnHuntr-Volt can be configured through environment variables, configuration files, and command-line arguments.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Configuration File](#configuration-file)
- [LLM Provider Configuration](#llm-provider-configuration)
- [Analysis Settings](#analysis-settings)
- [Cost Management](#cost-management)

## Environment Variables

Create a `.env` file in the project root:

```bash
# LLM API Keys
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here

# VoltAgent Server Configuration
VOLT_PORT=3141
VOLT_HOST=localhost

# Default Analysis Settings
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4
DEFAULT_MIN_CONFIDENCE=5
DEFAULT_MAX_ITERATIONS=7
DEFAULT_MAX_BUDGET=unlimited

# Report Output Directory
REPORT_OUTPUT_DIR=.vulnhuntr-reports

# MCP Server Configuration
MCP_PORT=3142
MCP_ENABLED=true

# GitHub Integration (optional)
GITHUB_TOKEN=your_github_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

### Required Variables

At minimum, you need **one** of the following:

- `ANTHROPIC_API_KEY` - For Claude models (recommended)
- `OPENAI_API_KEY` - For GPT models
- Neither (for local Ollama models)

## Configuration File

Create `vulnhuntr.config.json` in your project root:

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4",
    "temperature": 0.0,
    "maxTokens": 8192
  },
  "analysis": {
    "minConfidence": 5,
    "maxIterations": 7,
    "vulnTypes": ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"]
  },
  "cost": {
    "maxBudgetUsd": null,
    "trackCosts": true,
    "reportCosts": true
  },
  "reports": {
    "outputDir": ".vulnhuntr-reports",
    "formats": ["json", "sarif", "markdown", "html", "csv"],
    "includeCodeSnippets": true,
    "includeCVEReferences": true
  },
  "github": {
    "enabled": false,
    "createIssues": false,
    "updateIssues": true,
    "labels": ["security", "vulnerability"]
  }
}
```

### Configuration Priority

Configuration is loaded in this order (later sources override earlier):

1. Default values
2. `vulnhuntr.config.json` file
3. Environment variables
4. Command-line arguments

## LLM Provider Configuration

### Anthropic (Claude)

**Recommended for best results.**

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4
```

Supported models:

- `claude-sonnet-4` (recommended)
- `claude-3-7-sonnet-20250219`
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`

### OpenAI (GPT)

```bash
# .env
OPENAI_API_KEY=sk-proj-...
DEFAULT_PROVIDER=openai
DEFAULT_MODEL=gpt-4o
```

Supported models:

- `gpt-4o` (recommended)
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

### Ollama (Local)

```bash
# .env
DEFAULT_PROVIDER=ollama
DEFAULT_MODEL=llama3.1:70b
OLLAMA_BASE_URL=http://localhost:11434
```

No API key required. Supported models:

- `llama3.1:70b` (recommended)
- `llama3.1:8b`
- `codellama:34b`
- `mixtral:8x7b`

## Analysis Settings

### Confidence Threshold

Controls the minimum confidence score (0-10) for reported findings:

```bash
# CLI
npm run scan -- -r ./project -c 7

# Config file
{
  "analysis": {
    "minConfidence": 7
  }
}
```

**Recommended values:**

- `5` - Balanced (default)
- `7` - High confidence only
- `3` - Include lower confidence findings

### Maximum Iterations

Controls how many secondary analysis iterations are performed:

```bash
# CLI
npm run scan -- -r ./project -i 10

# Config file
{
  "analysis": {
    "maxIterations": 10
  }
}
```

**Recommended values:**

- `7` - Default (good balance)
- `3-5` - Quick scan
- `10-15` - Deep analysis
- `20` - Maximum depth

### Vulnerability Types

Specify which vulnerability types to scan for:

```bash
# CLI (scan for specific types)
npm run scan -- -r ./project -v SQLI -v XSS

# Config file (scan all types)
{
  "analysis": {
    "vulnTypes": ["LFI", "RCE", "SSRF", "AFO", "SQLI", "XSS", "IDOR"]
  }
}
```

## Cost Management

### Budget Limits

Set a maximum USD budget to prevent unexpected costs:

```bash
# CLI
npm run scan -- -r ./project -b 10.00

# Config file
{
  "cost": {
    "maxBudgetUsd": 10.0
  }
}
```

When the budget is reached:

- Analysis stops immediately
- A partial report is generated
- Cost breakdown shows actual usage

### Cost Tracking

VulnHuntr-Volt tracks costs in real-time:

```json
{
  "cost": {
    "trackCosts": true,
    "reportCosts": true
  }
}
```

Cost reports include:

- Input/output tokens per LLM call
- Cost per call in USD
- Total tokens and cost
- Breakdown by analysis phase

### Dry-Run Mode

Preview analysis without making LLM calls:

```bash
# CLI
npm run scan -- -r ./project --dry-run

# Workflow input
{
  "repo_path": "/path/to/project",
  "dry_run": true
}
```

Dry-run shows:

- Repository structure
- Files to be analyzed
- Estimated token usage
- **No LLM API calls made**
- **Zero cost**

## Report Configuration

### Output Directory

```bash
# Environment variable
REPORT_OUTPUT_DIR=./security-reports

# Config file
{
  "reports": {
    "outputDir": "./security-reports"
  }
}
```

### Report Formats

Enable/disable specific report formats:

```json
{
  "reports": {
    "formats": ["json", "sarif", "markdown", "html", "csv"]
  }
}
```

Available formats:

- `json` - Machine-readable findings
- `sarif` - GitHub Security Tab format
- `markdown` - Human-readable summary
- `html` - Interactive web report
- `csv` - Spreadsheet export

### Report Content

```json
{
  "reports": {
    "includeCodeSnippets": true,
    "includeCVEReferences": true,
    "includeFixSuggestions": true,
    "includeCostBreakdown": true
  }
}
```

## GitHub Integration

### Basic Setup

```bash
# .env
GITHUB_TOKEN=ghp_your_token_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret
```

### Auto-Create Issues

```json
{
  "github": {
    "enabled": true,
    "createIssues": true,
    "updateIssues": true,
    "labels": ["security", "vulnerability", "automated"],
    "assignees": ["security-team"],
    "minConfidence": 7
  }
}
```

When enabled, VulnHuntr-Volt:

- Creates GitHub issues for each high-confidence finding
- Updates existing issues when re-scanning
- Applies labels and assigns team members
- Links to SARIF report in Security Tab

### Webhook Integration

For CI/CD integration, see [deployment.md](deployment.md).

## Advanced Settings

### LLM Parameters

Fine-tune LLM behavior:

```json
{
  "llm": {
    "temperature": 0.0,
    "maxTokens": 8192,
    "topP": 1.0,
    "frequencyPenalty": 0.0,
    "presencePenalty": 0.0,
    "timeout": 300000
  }
}
```

### Analysis Parameters

```json
{
  "analysis": {
    "skipTests": true,
    "skipMigrations": true,
    "skipVendor": true,
    "fileExtensions": [".py"],
    "excludePatterns": ["**/test_*.py", "**/migrations/*"]
  }
}
```

## Next Steps

- [Usage Guide](usage-guide.md) - Learn how to run scans
- [Deployment Guide](deployment.md) - Deploy in production
- [Development Guide](development.md) - Customize and extend
