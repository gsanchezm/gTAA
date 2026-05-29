/**
 * Test Definition layer — shared visual-oracle helper (DRY).
 *
 * Several @visual scenarios run a snapshot comparison after reaching the
 * relevant UI state. The gating and result handling are identical, so they
 * live here and are reused by the domain use cases.
 *
 * Call path (direct calls between layers; no indirection layer):
 *   use case -> runVisualCheck(world, domain, snapshotId)
 *     -> PixelmatchVisualExecutor.compareSnapshot(domain, snapshotId, await world.ui())  [Test Execution]
 *
 * Gating (per task spec): compare only when the scenario is @visual AND
 * world.context.visualEnabled. visualEnabled is the run-level switch flipped on
 * by the test:visual:* scripts (which also filter to "@visual" scenarios), so a
 * call reached under visualEnabled is, by construction, inside a @visual run.
 * Each call site is additionally placed only on a step that @visual scenarios
 * reach, keeping the "@visual AND visualEnabled" contract intact.
 */
import type { GtaaWorld } from '../support/world';
import { PixelmatchVisualExecutor } from '../../test-execution/pixelmatch/pixelmatch-visual-executor';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';

/**
 * Run a snapshot comparison if visuals are enabled for this run.
 *
 * - PASS -> ok.
 * - SKIP -> allowed (e.g. VISUAL_BASELINE_MISSING); the executor decides.
 * - FAIL -> throw a ClassifiedError so the step/scenario fails.
 *
 * Returns false when the check was skipped because visuals are disabled (or the
 * run is API-only); true when a comparison was actually performed.
 *
 * @param domain     the visual contract domain (== compareSnapshot's `feature`)
 * @param snapshotId the snapshot id from the domain's visual contract
 */
export async function runVisualCheck(
  world: GtaaWorld,
  domain: string,
  snapshotId: string,
): Promise<boolean> {
  if (!world.context.visualEnabled) {
    return false; // Visuals off for this run — nothing to compare.
  }
  if (world.context.driver === 'api') {
    return false; // No UI surface to capture on the API path.
  }

  const driver = await world.ui();
  const result = await new PixelmatchVisualExecutor().compareSnapshot(domain, snapshotId, driver);

  if (result.status === 'FAIL') {
    throw new ClassifiedError(
      result.failureBucket ?? FailureBucket.VISUAL_DIFF_FAILURE,
      result.errorMessage ?? `visual snapshot "${snapshotId}" did not match the baseline`,
    );
  }
  // SKIP (e.g. VISUAL_BASELINE_MISSING) and PASS are both acceptable here.
  return true;
}
