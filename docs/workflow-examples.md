# VulnHuntr Workflow Execution Examples

This guide provides comprehensive examples for executing the VulnHuntr vulnerability scanning workflow, along with detailed explanations of all available options.

## Table of Contents

- [Quick Start Examples](#quick-start-examples)
- [Complete Options Reference](#complete-options-reference)
- [Advanced Usage Examples](#advanced-usage-examples)
- [Configuration File Usage](#configuration-file-usage)
- [Dry-Run Mode](#dry-run-mode)

---

## Quick Start Examples

### Example 1: Basic Repository Scan

Scan a local repository with default settings using Anthropic Claude:

```json
{
  "repo_path": "/path/to/my-python-project",
  "provider": "anthropic"
}
```

**What this does:**

- Scans all network-related Python files
- Uses Claude Sonnet 4 (default model)
- Scans for all 7 vulnerability types (LFI, RCE, SSRF, AFO, SQLI, XSS, IDOR)
- Runs up to 7 iterations per vulnerability type
- Reports findings with confidence ≥ 5

---

### Example 2: GitHub Repository Scan

Scan a GitHub repository directly:

```json
{
  "repo_path": "https://github.com/username/vulnerable-app",
  "provider": "anthropic",
  "max_budget_usd": 10.0
}
```

**What this does:**

- Clones the GitHub repository automatically
- Sets a budget limit of $10 USD
- Stops execution if budget is exceeded
- Cleans up cloned repository after analysis

---

### Example 3: Specific File Analysis

Analyze a specific file or directory within a repository:

```json
{
  "repo_path": "./my-app",
  "provider": "openai",
  "model": "gpt-4o",
  "analyze_path": "src/api/handlers.py",
  "vuln_types": ["RCE", "SQLI", "XSS"]
}
```

**What this does:**

- Uses OpenAI GPT-4o instead of Claude
- Only analyzes `src/api/handlers.py`
- Scans for 3 specific vulnerability types only
- Ignores other files in the repository

---

### Example 4: High-Confidence Findings Only

Filter for high-confidence vulnerabilities:

```json
{
  "repo_path": "/path/to/production-app",
  "provider": "anthropic",
  "min_confidence": 8,
  "max_iterations": 10
}
```

**What this does:**

- Only reports findings with confidence score ≥ 8
- Runs more iterations (10) for thorough analysis
- Suitable for production code requiring high certainty
- Reduces false positives

---

### Example 5: Budget-Constrained Scan

Scan with strict budget control:

```json
{
  "repo_path": "https://github.com/large-org/big-monorepo",
  "provider": "anthropic",
  "analyze_path": "services/auth",
  "max_budget_usd": 5.0,
  "max_iterations": 3
}
```

**What this does:**

- Limits spending to $5 USD maximum
- Reduces iterations to 3 (faster but less thorough)
- Focuses on `services/auth` subdirectory only
- Cost-effective approach for large codebases

---

### Example 6: Dry-Run Mode (Preview Analysis)

Preview what would be analyzed without spending money:

```json
{
  "repo_path": "/path/to/my-project",
  "provider": "anthropic",
  "dry_run": true
}
```

**What this does:**

- Discovers and lists all files that would be analyzed
- Shows README summary extraction
- Displays vulnerability types that would be scanned
- **Does NOT call LLM APIs** (no cost incurred)
- **Does NOT generate reports**
- Useful for validating scan scope before execution

---

### Example 7: Specific Vulnerability Type Scan

Scan for SQL injection vulnerabilities only:

```json
{
  "repo_path": "./web-app",
  "provider": "anthropic",
  "vuln_types": ["SQLI"],
  "min_confidence": 7,
  "max_iterations": 15
}
```

**What this does:**

- Focuses exclusively on SQL injection (SQLI)
- Runs 15 iterations for comprehensive SQL analysis
- Reports medium-to-high confidence findings (≥7)
- Faster than scanning all vulnerability types

---

### Example 8: Ollama Local LLM

Use a local Ollama model (no API costs):

```json
{
  "repo_path": "./my-project",
  "provider": "ollama",
  "model": "codellama:70b",
  "max_iterations": 5
}
```

**What this does:**

- Uses Ollama local LLM (requires Ollama server running)
- Uses CodeLlama 70b model
- No cloud API costs
- Privacy-focused (data stays local)
- Requires sufficient local compute resources

---

## Complete Options Reference

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `repo_path` | `string` | **Required.** Local filesystem path or GitHub URL to the repository. Examples: `"/path/to/repo"`, `"./relative/path"`, `"https://github.com/user/repo"` |

### LLM Provider Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | `"anthropic"` \| `"openai"` \| `"ollama"` | `"anthropic"` | LLM provider to use for analysis |
| `model` | `string` | Provider default | Override default model. Examples: `"claude-sonnet-4-20250514"`, `"gpt-4o"`, `"codellama:70b"` |

**Default Models by Provider:**

- **Anthropic:** `claude-sonnet-4-20250514`
- **OpenAI:** `gpt-4o`
- **Ollama:** Uses model specified in `model` parameter

### Analysis Scope Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `analyze_path` | `string` | `null` | Specific file or directory to analyze (relative to `repo_path`). If omitted, scans all network-related files |
| `vuln_types` | `VulnType[]` | All types | Array of vulnerability types to scan for. Valid values: `"LFI"`, `"RCE"`, `"SSRF"`, `"AFO"`, `"SQLI"`, `"XSS"`, `"IDOR"` |

**Vulnerability Type Reference:**

- **LFI** (CWE-22): Local File Inclusion / Path Traversal
- **RCE** (CWE-78): Remote Code Execution / OS Command Injection
- **SSRF** (CWE-918): Server-Side Request Forgery
- **AFO** (CWE-73): Arbitrary File Overwrite
- **SQLI** (CWE-89): SQL Injection
- **XSS** (CWE-79): Cross-Site Scripting
- **IDOR** (CWE-639): Insecure Direct Object Reference

### Quality & Iteration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `min_confidence` | `number` (0-10) | `5` | Minimum confidence score to include in reports. Higher = fewer false positives |
| `max_iterations` | `number` (1-20) | `7` | Maximum context-refinement iterations per vulnerability type. Higher = more thorough but slower/costlier |

**Confidence Score Mapping:**

- **9-10**: CRITICAL severity (high certainty exploit)
- **7-8**: HIGH severity (likely exploitable)
- **5-6**: MEDIUM severity (potential vulnerability)
- **3-4**: LOW severity (suspicious patterns)
- **0-2**: INFO severity (code smells)

### Cost Control Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_budget_usd` | `number` | `null` | Maximum spending limit in USD. Workflow stops if exceeded. `null` = no limit |
| `dry_run` | `boolean` | `false` | Preview mode: discovers files and shows scope without calling LLM APIs or spending money |

### Execution Mode Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dry_run` | `boolean` | `false` | **Dry-run mode:** Simulates workflow execution without making LLM API calls. Lists files to analyze, shows README processing, displays scan configuration. No cost incurred, no reports generated |

---

## Advanced Usage Examples

### Multi-Vulnerability Targeted Scan

Scan for web vulnerabilities in specific paths:

```json
{
  "repo_path": "https://github.com/company/web-app",
  "provider": "anthropic",
  "analyze_path": "src/controllers",
  "vuln_types": ["SQLI", "XSS", "IDOR"],
  "min_confidence": 6,
  "max_iterations": 12,
  "max_budget_usd": 15.0
}
```

### High-Throughput Scan (Fast)

Quick scan for obvious issues:

```json
{
  "repo_path": "./microservice",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "max_iterations": 3,
  "min_confidence": 8
}
```

### Deep Analysis Scan (Thorough)

Comprehensive scan for production systems:

```json
{
  "repo_path": "/prod/critical-api",
  "provider": "anthropic",
  "model": "claude-opus-4-20250514",
  "max_iterations": 20,
  "min_confidence": 5,
  "max_budget_usd": 50.0
}
```

### Privacy-First Local Scan

Use Ollama for air-gapped environments:

```json
{
  "repo_path": "/secure/private-app",
  "provider": "ollama",
  "model": "codellama:70b",
  "max_iterations": 8,
  "min_confidence": 6
}
```

---

## Configuration File Usage

Instead of passing all options in the workflow input, you can create a `.vulnhuntr.yaml` configuration file in your project root:

### Example: `.vulnhuntr.yaml`

```yaml
# Cost management
cost:
  budget: 20.0
  checkpoint: true
  checkpoint_interval: 300

# LLM settings
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514

# Analysis settings
analysis:
  vuln_types: [RCE, SQLI, XSS, SSRF]
  max_iterations: 10
  confidence_threshold: 6
  exclude_paths:
    - tests/
    - docs/
    - examples/

# Output settings
output:
  verbosity: 1
  
# Execution
dry_run: false
```

Then run with minimal workflow input:

```json
{
  "repo_path": "."
}
```

**Configuration Precedence:**

1. Workflow input parameters (highest priority)
2. Project-level `.vulnhuntr.yaml`
3. User-level `~/.vulnhuntr.yaml`
4. Default values (lowest priority)

---

## Dry-Run Mode

Dry-run mode is perfect for:

- **Validating scan scope** before spending money
- **Estimating analysis breadth** (how many files will be scanned)
- **Testing configuration** without API calls
- **CI/CD pipeline verification** (ensure workflow works before production)

### Dry-Run Output

When `dry_run: true` is set, the workflow will:

1. ✅ **Clone repository** (if GitHub URL)
2. ✅ **Discover Python files** matching patterns
3. ✅ **Read and display README** content
4. ✅ **List files to be analyzed** with full paths
5. ✅ **Show vulnerability types** that would be scanned
6. ✅ **Display configuration** (iterations, confidence threshold, budget)
7. ❌ **Skip LLM API calls** (no cost)
8. ❌ **Skip vulnerability analysis** (no findings)
9. ❌ **Skip report generation** (no output files)

### Example Dry-Run Workflow Input

```json
{
  "repo_path": "https://github.com/psf/requests",
  "provider": "anthropic",
  "analyze_path": "requests",
  "vuln_types": ["SSRF", "RCE"],
  "max_iterations": 10,
  "min_confidence": 7,
  "max_budget_usd": 25.0,
  "dry_run": true
}
```

**Expected Output:**

```markdown
Dry-Run Mode: Preview Analysis
==================================

- Repository: https://github.com/psf/requests
- Analyze Path: requests
- Vulnerability Types: SSRF, RCE
- Max Iterations: 10
- Min Confidence: 7
- Max Budget: $25.00 US

README Summary:
------------------
[README content would be displayed here]

Files to Analyze (12 files):
--------------------------------
  1. requests/adapters.py
  2. requests/api.py
  3. requests/auth.py
  4. requests/cookies.py
  5. requests/exceptions.py
  6. requests/hooks.py
  7. requests/models.py
  8. requests/sessions.py
  9. requests/structures.py
 10. requests/utils.py
 11. requests/__init__.py
 12. requests/__version__.py

- Dry-run complete. No LLM API calls made.
- Remove "dry_run": true to execute actual analysis.
```

### Comparing Dry-Run vs. Real Execution

| Feature | Dry-Run (`dry_run: true`) | Real Execution (`dry_run: false`) |
|---------|---------------------------|-----------------------------------|
| Clone Repository | ✅ Yes | ✅ Yes |
| Discover Files | ✅ Yes | ✅ Yes |
| Read README | ✅ Yes | ✅ Yes |
| Display Configuration | ✅ Yes | ❌ No (logs only) |
| LLM API Calls | ❌ No | ✅ Yes |
| Vulnerability Analysis | ❌ No | ✅ Yes |
| Generate Reports | ❌ No | ✅ Yes (JSON, SARIF, Markdown, HTML, CSV) |
| Cost Incurred | ❌ $0.00 | ✅ Based on usage |
| Execution Time | ⚡ Fast (seconds) | ⏱️ Slow (minutes to hours) |

---

## Tips for Effective Scanning

### For Large Repositories

1. **Use `analyze_path`** to focus on specific directories
2. **Set lower `max_iterations`** (3-5) for initial scans
3. **Enable budget limits** with `max_budget_usd`
4. **Dry-run first** to estimate scope

### For High Accuracy

1. **Increase `max_iterations`** (12-20)
2. **Use Claude Opus** (`model: "claude-opus-4-20250514"`)
3. **Lower `min_confidence`** to 3-4 to catch more issues
4. **Focus on specific `vuln_types`** for deeper analysis

### For Cost Efficiency

1. **Use GPT-4o-mini** for budget-conscious scans
2. **Set `max_iterations: 3`** for quick passes
3. **Increase `min_confidence: 8`** to reduce false positives
4. **Use dry-run** to validate scope before spending

### For Privacy-Sensitive Code

1. **Use `provider: "ollama"`** with local models
2. **Ensure no `max_budget_usd`** (doesn't apply to Ollama)
3. **Run on air-gapped systems** if needed
4. **Larger models** (70B+) recommended for accuracy

---

## Workflow Execution Methods

### 1. Via VoltAgent API

```bash
curl -X POST http://localhost:3141/api/workflows/vulnhuntr-analysis/execute \
  -H "Content-Type: application/json" \
  -d @workflow-input.json
```

### 2. Via VoltAgent CLI

```bash
voltagent workflow run vulnhuntr-analysis --input workflow-input.json
```

### 3. Programmatically (TypeScript)

```typescript
import { vulnhuntrWorkflow } from "./workflows/vulnhuntr.js";

const result = await vulnhuntrWorkflow.execute({
  repo_path: "./my-app",
  provider: "anthropic",
  max_budget_usd: 10.0,
  dry_run: false
});

console.log(result.findings);
```

---

## Report Outputs

After successful execution (not in dry-run mode), reports are generated in `.vulnhuntr-reports/`:

```markdown
.vulnhuntr-reports/
├── vulnhuntr-report-20260210-153022.json      # JSON format
├── vulnhuntr-report-20260210-153022.sarif     # SARIF format (GitHub Security)
├── vulnhuntr-report-20260210-153022.md        # Markdown report
├── vulnhuntr-report-20260210-153022.html      # HTML report
├── vulnhuntr-report-20260210-153022.csv       # CSV format
└── cost-report-20260210-153022.txt            # Cost breakdown
```

### Report Format Details

- **JSON**: Machine-readable findings with full metadata
- **SARIF**: GitHub Security Tab compatible format
- **Markdown**: Human-readable summary with tables
- **HTML**: Interactive web report with filtering
- **CSV**: Spreadsheet-compatible data export
- **Cost Report**: Token usage and USD cost breakdown

---

## Need Help?

- **Documentation**: Check the main README.md
- **Issues**: Open a GitHub issue for bugs
- **Examples**: Browse `docs/` for more examples
- **Contributing**: See CONTRIBUTING.md for development guide
