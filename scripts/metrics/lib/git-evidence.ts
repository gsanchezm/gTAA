/**
 * Private, deterministic git-evidence helpers shared by the quality scripts
 * (maintainability + modifiability). Every call is crash-safe: git failures,
 * missing repo, or shallow/single-commit history return a neutral "no evidence"
 * result instead of throwing, so a single metric never aborts a script.
 *
 * Only the maintainability/modifiability/extensibility scripts import this file.
 */
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './io';

/** Run a git subcommand, returning trimmed stdout or null on any failure. */
export function git(args: string[]): string | null {
  try {
    const out = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch {
    return null;
  }
}

/** Total commit count reachable from HEAD; 0 when git is unavailable. */
export function commitCount(): number {
  const out = git(['rev-list', '--count', 'HEAD']);
  if (out === null) return 0;
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

export interface NumstatEntry {
  added: number; // '-' (binary) becomes 0
  deleted: number;
  path: string;
}

/**
 * Parse `git diff --numstat <base> HEAD`. Returns null when the base ref is
 * empty/invalid or git fails. Binary files (numstat '-') count as 0 added/0
 * deleted but keep their path so they still register as a touched file.
 */
export function diffNumstat(base: string): NumstatEntry[] | null {
  if (!base) return null;
  const out = git(['diff', '--numstat', base, 'HEAD']);
  if (out === null) return null;
  if (out === '') return [];
  const entries: NumstatEntry[] = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number(parts[0]);
    const deleted = parts[1] === '-' ? 0 : Number(parts[1]);
    const path = parts.slice(2).join('\t').replace(/\\/g, '/');
    entries.push({
      added: Number.isFinite(added) ? added : 0,
      deleted: Number.isFinite(deleted) ? deleted : 0,
      path,
    });
  }
  // Deterministic ordering by path.
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
