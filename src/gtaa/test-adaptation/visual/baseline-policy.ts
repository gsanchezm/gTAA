/**
 * Test Adaptation layer — baseline lifecycle policy for the visual oracle.
 *
 * Encapsulates the single decision "what do we do when a baseline is (or is
 * not) present?" so the execution layer stays free of filesystem branching.
 *
 * Policy (intentionally strict for reproducibility — mirrors the reference):
 *   - Baseline present                  -> COMPARE (caller runs the diff).
 *   - Baseline missing + updateBaseline -> CREATE: write the captured actual as
 *     the new baseline and report status SKIP with reason 'baseline-created'.
 *     The run did NOT perform a real comparison, so it is not a PASS; SKIP keeps
 *     the telemetry stream honest about that.
 *   - Baseline missing + !updateBaseline -> MISSING: status SKIP with
 *     failure_bucket VISUAL_BASELINE_MISSING. We choose SKIP (not FAIL) so a
 *     not-yet-baselined snapshot does not turn a functional scenario red; the
 *     dedicated failure bucket still surfaces the gap in the metrics, and the
 *     reporting layer can gate on it independently.
 *
 * A baseline is NEVER auto-updated unless visualConfig().updateBaseline is true.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FailureBucket } from '../../shared/failure-buckets';
import type { ExecutionStatus } from '../../shared/types';
import { baselinePaths, ensureDir, type VisualPathKey } from './visual-paths';

export type BaselineDecision = 'compare' | 'created' | 'missing';

/** Reason string recorded when the policy creates a baseline from the actual. */
export const BASELINE_CREATED_REASON = 'baseline-created';

export interface BaselineOutcome {
  decision: BaselineDecision;
  baselinePath: string;
  /** Set for the non-comparison outcomes ('created' | 'missing'). */
  status?: ExecutionStatus;
  failureBucket?: FailureBucket | null;
  reason?: string;
  errorMessage?: string | null;
}

/** True when a stored baseline PNG exists for this key. */
export function baselineExists(key: VisualPathKey): boolean {
  return existsSync(baselinePaths(key).baselinePath);
}

/** Read the stored baseline PNG. Caller must have checked {@link baselineExists}. */
export function readBaseline(key: VisualPathKey): Buffer {
  return readFileSync(baselinePaths(key).baselinePath);
}

/** Persist a PNG buffer as the new baseline for this key (creates dirs). */
export function writeBaseline(key: VisualPathKey, png: Buffer): string {
  const { baselineDir, baselinePath } = baselinePaths(key);
  ensureDir(baselineDir);
  writeFileSync(baselinePath, png);
  return baselinePath;
}

/**
 * Decide what to do when no baseline exists, applying the create-vs-fail policy.
 * `updateBaseline` MUST come from visualConfig().updateBaseline — callers never
 * write a baseline outside this gate.
 */
export function resolveMissingBaseline(
  key: VisualPathKey,
  actualPng: Buffer,
  updateBaseline: boolean,
): BaselineOutcome {
  const { baselinePath } = baselinePaths(key);

  if (updateBaseline) {
    const created = writeBaseline(key, actualPng);
    return {
      decision: 'created',
      baselinePath: created,
      status: 'SKIP',
      failureBucket: null,
      reason: BASELINE_CREATED_REASON,
      errorMessage: null,
    };
  }

  return {
    decision: 'missing',
    baselinePath,
    status: 'SKIP',
    failureBucket: FailureBucket.VISUAL_BASELINE_MISSING,
    reason: 'baseline-missing',
    errorMessage:
      `Missing visual baseline for ${key.feature}/${key.snapshotId} ` +
      `(${key.visualPlatform}/${key.visualViewport}). ` +
      `Set UPDATE_VISUAL_BASELINE=true to bootstrap it.`,
  };
}
