/**
 * GitHub repository tool — enables analysis of remote GitHub repos.
 * Handles cloning repositories to a temporary directory for analysis.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Parse a GitHub URL into owner/repo format */
function parseGitHubUrl(input: string): { owner: string; repo: string; fullUrl: string } | null {
  // Handle full URLs: https://github.com/owner/repo(.git)
  const urlMatch = input.match(
    /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      fullUrl: `https://github.com/${urlMatch[1]}/${urlMatch[2]}.git`,
    };
  }

  // Handle owner/repo shorthand
  const shortMatch = input.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      fullUrl: `https://github.com/${shortMatch[1]}/${shortMatch[2]}.git`,
    };
  }

  return null;
}

/** Check if a path is a GitHub URL or shorthand */
function isGitHubPath(repoPath: string): boolean {
  return (
    repoPath.includes("github.com") ||
    /^[^/]+\/[^/]+$/.test(repoPath)
  );
}

/** Clone a GitHub repository to a temporary directory */
function cloneRepo(url: string, targetDir: string, shallow = true): void {
  const args = shallow ? ["clone", "--depth", "1", url, targetDir] : ["clone", url, targetDir];
  execSync(`git ${args.join(" ")}`, {
    stdio: "pipe",
    timeout: 120_000, // 2 minute timeout
  });
}

// ---------------------------------------------------------------------------
// VoltAgent Tools
// ---------------------------------------------------------------------------

/** Clone a GitHub repository for analysis */
export const cloneGitHubRepoTool = createTool({
  name: "clone_github_repo",
  description:
    "Clone a GitHub repository to a local temporary directory for analysis. Accepts GitHub URLs or owner/repo shorthand.",
  parameters: z.object({
    repo: z
      .string()
      .describe(
        "GitHub repo — URL (https://github.com/owner/repo) or shorthand (owner/repo)"
      ),
    branch: z.string().optional().describe("Specific branch to clone"),
    shallow: z
      .boolean()
      .default(true)
      .describe("Shallow clone (depth=1) for faster download"),
  }),
  execute: async ({ repo, branch, shallow }) => {
    const parsed = parseGitHubUrl(repo);
    if (!parsed) {
      throw new Error(
        `Invalid GitHub repository: ${repo}. Use https://github.com/owner/repo or owner/repo`
      );
    }

    const tmpDir = path.join(
      os.tmpdir(),
      `vulnhuntr-${parsed.owner}-${parsed.repo}-${Date.now()}`
    );

    try {
      fs.mkdirSync(tmpDir, { recursive: true });

      let cloneUrl = parsed.fullUrl;
      if (branch) {
        execSync(
          `git clone ${shallow ? "--depth 1" : ""} --branch ${branch} ${cloneUrl} ${tmpDir}`,
          { stdio: "pipe", timeout: 120_000 }
        );
      } else {
        cloneRepo(cloneUrl, tmpDir, shallow);
      }

      return {
        success: true,
        local_path: tmpDir,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: branch ?? "default",
        message: `Cloned ${parsed.owner}/${parsed.repo} to ${tmpDir}`,
      };
    } catch (error) {
      // Clean up on failure
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}

      throw new Error(
        `Failed to clone ${parsed.fullUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

/** Clean up a cloned repository */
export const cleanupRepoTool = createTool({
  name: "cleanup_repo",
  description: "Remove a cloned repository directory to free up disk space",
  parameters: z.object({
    local_path: z.string().describe("Path to the cloned repository to remove"),
  }),
  execute: async ({ local_path }) => {
    if (!local_path.includes("vulnhuntr-")) {
      throw new Error("Safety check: can only clean up vulnhuntr temp directories");
    }

    try {
      fs.rmSync(local_path, { recursive: true, force: true });
      return { success: true, message: `Removed ${local_path}` };
    } catch (error) {
      throw new Error(
        `Failed to remove ${local_path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
});

export { isGitHubPath, parseGitHubUrl, cloneRepo };
