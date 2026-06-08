/**
 * Test Adaptation layer — deterministic path builders for the visual oracle.
 *
 * Baselines are version-controlled fixtures; actual/diff artifacts are run
 * outputs. They therefore live under different roots:
 *
 *   visual-baselines/<feature>/<snapshotId>/<visualPlatform>/<visualViewport>/baseline.png
 *   visual-results/<runId>/<feature>/<snapshotId>/<visualPlatform>/<visualViewport>/{actual,diff}.png
 *
 * The baseline layout (<feature>/<snapshotId>/<platform>/<viewport>/baseline.png)
 * matches the reference convention so the two architectures store comparable
 * fixtures. `visual-results/` is gitignored —
 * it is regenerated on every run and keyed by runId so concurrent platform
 * jobs never collide.
 *
 * Path building is pure and side-effect free except for {@link ensureDir},
 * which is the single place allowed to touch the filesystem.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { VisualPlatform, VisualViewport } from '../../shared/types';

/**
 * Repo root. This file lives at
 * <root>/src/gtaa/test-adaptation/visual/visual-paths.ts, so four levels up
 * from its directory is the repository root (same anchor the telemetry writer
 * uses for metrics/raw).
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

export const BASELINES_ROOT = join(REPO_ROOT, 'visual-baselines');
export const RESULTS_ROOT = join(REPO_ROOT, 'visual-results');

/** The minimal identity a baseline/actual/diff path is keyed by. */
export interface VisualPathKey {
  feature: string;
  snapshotId: string;
  visualPlatform: VisualPlatform;
  visualViewport: VisualViewport;
  /** Optional scenario-data dimension (country code, e.g. "US"/"MX"). */
  market?: string;
  /**
   * Optional rendering-language dimension. Needed when one snapshot renders
   * differently per market/language (e.g. the localized catalog, CH-de vs
   * CH-fr) so each localized variant gets its own baseline instead of colliding.
   */
  language?: string;
  /**
   * Optional scenario dimension. The finest bucket: a snapshot id can fire from
   * several scenarios in the same (market, language) — e.g. the invalid-login
   * cases all share login_screen_invalid_credentials with no market — so keying
   * by scenario gives each its own stable baseline instead of colliding.
   */
  scenario?: string;
}

/**
 * Path-safe, lower-cased segment for an optional dimension (omitted when
 * absent). Non-alphanumeric runs collapse to a single '-' so scenario names
 * (which carry spaces, slashes, parentheses) are usable as directory names.
 */
function optionalSegment(value: string | undefined): string[] {
  if (!value) return [];
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe ? [safe] : [];
}

export interface VisualBaselinePaths {
  baselineDir: string;
  baselinePath: string;
}

export interface VisualResultPaths {
  runId: string;
  resultDir: string;
  actualPath: string;
  diffPath: string;
}

function keySegments(key: VisualPathKey): string[] {
  return [
    key.feature,
    key.snapshotId,
    key.visualPlatform,
    key.visualViewport,
    ...optionalSegment(key.market),
    ...optionalSegment(key.language),
    ...optionalSegment(key.scenario),
  ];
}

/** Version-controlled baseline location for a snapshot/platform/viewport. */
export function baselinePaths(key: VisualPathKey): VisualBaselinePaths {
  const baselineDir = join(BASELINES_ROOT, ...keySegments(key));
  return { baselineDir, baselinePath: join(baselineDir, 'baseline.png') };
}

/**
 * Per-run output location for the captured actual and generated diff PNGs.
 * Keyed by runId first so artifacts from different runs/platforms never
 * overwrite each other.
 */
export function resultPaths(key: VisualPathKey, runId: string): VisualResultPaths {
  const resultDir = join(RESULTS_ROOT, runId, ...keySegments(key));
  return {
    runId,
    resultDir,
    actualPath: join(resultDir, 'actual.png'),
    diffPath: join(resultDir, 'diff.png'),
  };
}

/** Create a directory (recursively). The only filesystem side effect here. */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}
