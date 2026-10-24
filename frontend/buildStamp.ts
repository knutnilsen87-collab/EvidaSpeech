import { execSync } from "node:child_process";

export interface BuildStamp {
  commit: string;
  dirty: boolean;
  time: string;
}

function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

/** Leses ved bygging. Uten commit (nytt repo) står det «ingen commit», aldri en oppdiktet hash. */
export function readBuildStamp(now: Date = new Date()): BuildStamp {
  const commit = git("rev-parse --short=10 HEAD") ?? "ingen commit";
  const status = git("status --porcelain");
  return { commit, dirty: status === null ? false : status.length > 0, time: now.toISOString() };
}
