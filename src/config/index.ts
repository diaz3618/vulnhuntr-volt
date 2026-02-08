/**
 * Configuration File Support
 * =========================================
 * Loads settings from .vulnhuntr.yaml (project root).
 * Project-level config takes precedence over user-level. Port of config.py.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Config Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface VulnhuntrConfig {
  // Cost management
  budget: number | null;
  checkpoint: boolean;
  checkpointInterval: number; // seconds

  // LLM settings
  provider: string | null;
  model: string | null;

  // Output settings
  verbosity: number; // 0-3
  dryRun: boolean;

  // Analysis settings
  vulnTypes: string[];
  excludePaths: string[];
  includePaths: string[];
  maxIterations: number;
  confidenceThreshold: number; // 1-10
}

export function defaultConfig(): VulnhuntrConfig {
  return {
    budget: null,
    checkpoint: true,
    checkpointInterval: 300,
    provider: null,
    model: null,
    verbosity: 0,
    dryRun: false,
    vulnTypes: [],
    excludePaths: [],
    includePaths: [],
    maxIterations: 7,
    confidenceThreshold: 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Config from dict (YAML-parsed object)
// ─────────────────────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: YAML-parsed dict has dynamic shape
export function configFromDict(data: Record<string, any>): VulnhuntrConfig {
  const c = defaultConfig();

  // Flat keys
  if (data.budget != null) c.budget = Number(data.budget);
  if (data.checkpoint != null) c.checkpoint = Boolean(data.checkpoint);
  if (data.checkpoint_interval != null)
    c.checkpointInterval = Number(data.checkpoint_interval);
  if (data.provider) c.provider = String(data.provider);
  if (data.model) c.model = String(data.model);
  if (data.verbosity != null) c.verbosity = Number(data.verbosity);
  if (data.dry_run != null) c.dryRun = Boolean(data.dry_run);
  if (Array.isArray(data.vuln_types)) c.vulnTypes = data.vuln_types;
  if (Array.isArray(data.exclude_paths)) c.excludePaths = data.exclude_paths;
  if (Array.isArray(data.include_paths)) c.includePaths = data.include_paths;
  if (data.max_iterations != null)
    c.maxIterations = Number(data.max_iterations);
  if (data.confidence_threshold != null)
    c.confidenceThreshold = Number(data.confidence_threshold);

  // Nested sections
  if (data.cost && typeof data.cost === "object") {
    const cost = data.cost;
    if (cost.budget != null) c.budget = Number(cost.budget);
    if (cost.checkpoint != null) c.checkpoint = Boolean(cost.checkpoint);
    if (cost.checkpoint_interval != null)
      c.checkpointInterval = Number(cost.checkpoint_interval);
  }

  if (data.llm && typeof data.llm === "object") {
    if (data.llm.provider) c.provider = String(data.llm.provider);
    if (data.llm.model) c.model = String(data.llm.model);
  }

  if (data.analysis && typeof data.analysis === "object") {
    const a = data.analysis;
    if (Array.isArray(a.vuln_types)) c.vulnTypes = a.vuln_types;
    if (Array.isArray(a.exclude_paths)) c.excludePaths = a.exclude_paths;
    if (Array.isArray(a.include_paths)) c.includePaths = a.include_paths;
    if (a.max_iterations != null) c.maxIterations = Number(a.max_iterations);
    if (a.confidence_threshold != null)
      c.confidenceThreshold = Number(a.confidence_threshold);
  }

  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config file discovery
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_NAMES = [".vulnhuntr.yaml", ".vulnhuntr.yml"];

export function findConfigFile(startDir?: string): string | null {
  let current = path.resolve(startDir ?? process.cwd());
  const root = path.parse(current).root;

  while (true) {
    for (const name of CONFIG_NAMES) {
      const p = path.join(current, name);
      if (fs.existsSync(p)) return p;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Check home dir
  const home = os.homedir();
  for (const name of CONFIG_NAMES) {
    const p = path.join(home, name);
    if (fs.existsSync(p)) return p;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load config (JSON fallback if no YAML parser)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load config from YAML file.
 * Falls back to JSON parsing if the file looks like JSON.
 * Returns default config if no file found or parsing fails.
 */
export function loadConfig(
  configPath?: string,
  startDir?: string,
): VulnhuntrConfig {
  const resolved = configPath ?? findConfigFile(startDir);
  if (!resolved || !fs.existsSync(resolved)) return defaultConfig();

  try {
    const raw = fs.readFileSync(resolved, "utf-8").trim();
    if (!raw) return defaultConfig();

    // Try JSON first (simpler, no dep)
    if (raw.startsWith("{")) {
      return configFromDict(JSON.parse(raw));
    }

    // Try dynamic YAML import
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const yaml = require("js-yaml");
      const data = yaml.load(raw);
      if (data && typeof data === "object") return configFromDict(data);
    } catch {
      // YAML parser not available — treat as simple key: value lines
      // biome-ignore lint/suspicious/noExplicitAny: simple YAML fallback parser
      const data: Record<string, any> = {};
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf(":");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        // biome-ignore lint/suspicious/noExplicitAny: parsed from untyped YAML line
        let val: any = trimmed.slice(idx + 1).trim();
        if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (val === "null" || val === "~") val = null;
        else if (/^\d+(\.\d+)?$/.test(val)) val = Number(val);
        data[key] = val;
      }
      return configFromDict(data);
    }
  } catch (err) {
    console.warn(`   ⚠️  Failed to load config from ${resolved}: ${err}`);
  }

  return defaultConfig();
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge config with workflow input (input takes precedence)
// ─────────────────────────────────────────────────────────────────────────────

export function mergeConfigWithInput(
  config: VulnhuntrConfig,
  // biome-ignore lint/suspicious/noExplicitAny: CLI input has dynamic shape
  input: Record<string, any>,
): VulnhuntrConfig {
  const merged = { ...config };
  if (input.max_budget_usd != null) merged.budget = input.max_budget_usd;
  if (input.provider) merged.provider = input.provider;
  if (input.model) merged.model = input.model;
  if (input.max_iterations != null) merged.maxIterations = input.max_iterations;
  if (input.min_confidence != null)
    merged.confidenceThreshold = input.min_confidence;
  if (Array.isArray(input.vuln_types) && input.vuln_types.length)
    merged.vulnTypes = input.vuln_types;
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Example config generator
// ─────────────────────────────────────────────────────────────────────────────

export const EXAMPLE_CONFIG = `# Vulnhuntr Configuration File
# Place as .vulnhuntr.yaml in your project root or home directory

# Cost Management
cost:
  budget: 10.0
  checkpoint: true
  checkpoint_interval: 300

# LLM Settings
llm:
  provider: claude
  # model: claude-sonnet-4-5

# Analysis Settings
analysis:
  vuln_types: []
  exclude_paths:
    - tests/
    - docs/
    - examples/
    - venv/
    - .venv/
    - node_modules/
  max_iterations: 7
  confidence_threshold: 1

verbosity: 1
dry_run: false
`;
