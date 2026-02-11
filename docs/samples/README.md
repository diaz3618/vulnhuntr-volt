# Workflow Examples Sample Files

This directory contains sample JSON files demonstrating various ways to execute the VulnHuntr workflow.

## Sample Files

### 1. `basic-scan.json` - Simple Local Repository Scan

```json
{
  "repo_path": "/path/to/my-python-project",
  "provider": "anthropic"
}
```

### 2. `github-scan.json` - Scan GitHub Repository

```json
{
  "repo_path": "https://github.com/username/repository",
  "provider": "anthropic",
  "max_budget_usd": 10.0
}
```

### 3. `targeted-scan.json` - Specific File/Directory Analysis

```json
{
  "repo_path": "./my-app",
  "provider": "openai",
  "model": "gpt-4o",
  "analyze_path": "src/api/handlers.py",
  "vuln_types": ["RCE", "SQLI", "XSS"]
}
```

### 4. `dry-run.json` - Preview Analysis (No Cost)

```json
{
  "repo_path": "./my-project",
  "provider": "anthropic",
  "dry_run": true
}
```

### 5. `complete-config.json` - All Options Specified

```json
{
  "repo_path": "https://github.com/org/secure-api",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "analyze_path": "src/controllers",
  "max_budget_usd": 25.0,
  "min_confidence": 7,
  "max_iterations": 12,
  "vuln_types": ["SQLI", "XSS", "SSRF", "IDOR"],
  "dry_run": false
}
```

## Usage

Execute a workflow using one of these samples:

```bash
# Via API
curl -X POST http://localhost:3000/api/workflows/vulnhuntr-analysis/execute \
  -H "Content-Type: application/json" \
  -d @samples/dry-run.json

# Via VoltAgent CLI
voltagent workflow run vulnhuntr-analysis --input samples/basic-scan.json
```

## Creating Custom Samples

Copy any of these files and modify the values to match your requirements. See the complete options reference in [workflow-examples.md](../workflow-examples.md).
