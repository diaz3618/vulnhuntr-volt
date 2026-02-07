/**
 * Checkpoint System for VulnHuntr
 * ================================
 * Provides checkpointing and resume for interrupted analyses.
 * Port of vulnhuntr/checkpoint.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CostTracker } from "../cost-tracker/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint Data
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckpointData {
  completedFiles: string[];
  pendingFiles: string[];
  currentFile: string | null;
  results: Array<{ file: string; result: Record<string, unknown>; timestamp: string }>;
  costTrackerData: Record<string, unknown> | null;
  repoPath: string | null;
  model: string | null;
  startedAt: string | null;
  lastUpdated: string | null;
  version: string;
}

function emptyCheckpoint(): CheckpointData {
  return {
    completedFiles: [],
    pendingFiles: [],
    currentFile: null,
    results: [],
    costTrackerData: null,
    repoPath: null,
    model: null,
    startedAt: null,
    lastUpdated: null,
    version: "1.0.0",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Checkpoint
// ─────────────────────────────────────────────────────────────────────────────

export class AnalysisCheckpoint {
  private _data: CheckpointData | null = null;
  private _filesSinceSave = 0;
  private _costTracker: CostTracker | null = null;
  private _originalSigintListeners: NodeJS.SignalsListener[] = [];

  constructor(
    public readonly checkpointDir: string = ".vulnhuntr_checkpoint",
    public readonly saveFrequency = 5,
    public readonly enabled = true,
  ) {}

  private get checkpointFile(): string {
    return path.join(this.checkpointDir, "checkpoint.json");
  }

  private ensureDir(): void {
    if (this.enabled) fs.mkdirSync(this.checkpointDir, { recursive: true });
  }

  /** Start a new analysis session. */
  start(
    repoPath: string,
    filesToAnalyze: string[],
    model: string,
    costTracker?: CostTracker,
  ): void {
    if (!this.enabled) return;
    this.ensureDir();
    this._costTracker = costTracker ?? null;

    this._data = {
      ...emptyCheckpoint(),
      pendingFiles: [...filesToAnalyze],
      repoPath,
      model,
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    this.installSignalHandler();
    this.save();
    console.log(
      `   💾 Checkpoint initialized (${filesToAnalyze.length} files)`,
    );
  }

  setCurrentFile(filePath: string): void {
    if (!this.enabled || !this._data) return;
    this._data.currentFile = filePath;
    this._data.lastUpdated = new Date().toISOString();
  }

  markFileComplete(filePath: string, result?: Record<string, unknown>): void {
    if (!this.enabled || !this._data) return;

    const idx = this._data.pendingFiles.indexOf(filePath);
    if (idx !== -1) this._data.pendingFiles.splice(idx, 1);
    if (!this._data.completedFiles.includes(filePath)) {
      this._data.completedFiles.push(filePath);
    }

    if (result) {
      this._data.results.push({
        file: filePath,
        result,
        timestamp: new Date().toISOString(),
      });
    }

    this._data.currentFile = null;
    this._data.lastUpdated = new Date().toISOString();
    this._filesSinceSave++;

    if (this._filesSinceSave >= this.saveFrequency) {
      this.save();
      this._filesSinceSave = 0;
    }
  }

  /** Force-save checkpoint to disk (atomic via temp file). */
  save(): void {
    if (!this.enabled || !this._data) return;

    if (this._costTracker) {
      this._data.costTrackerData = this._costTracker.toDict();
    }
    this._data.lastUpdated = new Date().toISOString();

    try {
      this.ensureDir();
      const tmp = this.checkpointFile + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2));
      fs.renameSync(tmp, this.checkpointFile);
    } catch (err) {
      console.warn(`   ⚠️  Checkpoint save failed: ${err}`);
    }
  }

  saveNow(): void {
    this.save();
  }

  canResume(): boolean {
    if (!fs.existsSync(this.checkpointFile)) return false;
    try {
      const data = this.load();
      return data.pendingFiles.length > 0;
    } catch {
      return false;
    }
  }

  load(): CheckpointData {
    const raw = fs.readFileSync(this.checkpointFile, "utf-8");
    const data = JSON.parse(raw);
    return {
      completedFiles: data.completedFiles ?? data.completed_files ?? [],
      pendingFiles: data.pendingFiles ?? data.pending_files ?? [],
      currentFile: data.currentFile ?? data.current_file ?? null,
      results: data.results ?? [],
      costTrackerData:
        data.costTrackerData ?? data.cost_tracker_data ?? null,
      repoPath: data.repoPath ?? data.repo_path ?? null,
      model: data.model ?? null,
      startedAt: data.startedAt ?? data.started_at ?? null,
      lastUpdated: data.lastUpdated ?? data.last_updated ?? null,
      version: data.version ?? data.vulnhuntr_version ?? "1.0.0",
    };
  }

  resume(costTracker?: CostTracker): CheckpointData {
    const data = this.load();
    this._data = data;
    this._costTracker = costTracker ?? null;

    // Restore cost tracker state
    if (costTracker && data.costTrackerData) {
      const { CostTracker: CT } = require("../cost-tracker/index.js");
      const restored = CT.fromDict(data.costTrackerData);
      Object.assign(costTracker, {
        _calls: restored._calls,
        _totalInputTokens: restored._totalInputTokens,
        _totalOutputTokens: restored._totalOutputTokens,
        _totalCost: restored._totalCost,
        _costsByFile: restored._costsByFile,
        _costsByModel: restored._costsByModel,
      });
    }

    this.installSignalHandler();
    console.log(
      `   🔄 Resumed: ${data.completedFiles.length} done, ${data.pendingFiles.length} pending`,
    );
    return data;
  }

  finalize(success = true): void {
    if (!this.enabled) return;
    this.save();
    this.restoreSignalHandler();

    if (success && this._data && this._data.pendingFiles.length === 0) {
      this.cleanup();
      console.log("   ✅ Checkpoint removed (analysis complete)");
    } else {
      console.log(`   💾 Checkpoint saved for resume: ${this.checkpointFile}`);
    }
  }

  private cleanup(): void {
    try {
      if (fs.existsSync(this.checkpointFile)) fs.unlinkSync(this.checkpointFile);
      // Remove dir if empty
      if (
        fs.existsSync(this.checkpointDir) &&
        fs.readdirSync(this.checkpointDir).length === 0
      ) {
        fs.rmdirSync(this.checkpointDir);
      }
    } catch {
      // ignore
    }
  }

  private installSignalHandler(): void {
    this._originalSigintListeners = process.listeners("SIGINT") as NodeJS.SignalsListener[];

    const handler = () => {
      console.warn("\n\n   ⚠️  Interrupt received, saving checkpoint...");
      this.save();
      console.log(`   💾 Progress saved. Resume from: ${this.checkpointDir}`);
      process.exit(130);
    };

    process.removeAllListeners("SIGINT");
    process.on("SIGINT", handler);
  }

  private restoreSignalHandler(): void {
    process.removeAllListeners("SIGINT");
    for (const listener of this._originalSigintListeners) {
      process.on("SIGINT", listener);
    }
  }

  getProgressSummary(): Record<string, unknown> {
    if (!this._data) return { status: "not_started" };
    const total =
      this._data.completedFiles.length + this._data.pendingFiles.length;
    const completed = this._data.completedFiles.length;
    return {
      status: this._data.pendingFiles.length > 0 ? "in_progress" : "complete",
      total_files: total,
      completed_files: completed,
      pending_files: this._data.pendingFiles.length,
      progress_percent: total > 0 ? +((completed / total) * 100).toFixed(1) : 0,
      current_file: this._data.currentFile,
      started_at: this._data.startedAt,
      last_updated: this._data.lastUpdated,
    };
  }
}
