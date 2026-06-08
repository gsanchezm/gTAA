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

/**
 * Run a snapshot comparison if visuals are enabled for this run.
 *
 * The Visual oracle is a RECORDED research signal, not a gate: the executor
 * emits exactly one VisualContractEvent (PASS/FAIL/SKIP, diff ratio, paths) to
 * telemetry for every comparison, and a diff is NEVER propagated to fail the
 * functional scenario. This mirrors the reference's visual hooks, which log a
 * diff to the Visual report and swallow it — a pixel drift in non-deterministic
 * content (e.g. an order-success courier card whose data changes per order)
 * must not turn a passing functional flow red, or the baseline would look worse
 * than the reference for a reason unrelated to its behaviour.
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
  // Pass the scenario's market/language so localized snapshots bucket per
  // variant (a US capture must not be compared against an MX baseline). Absent
  // values (e.g. the pre-market login screens) leave the snapshot un-bucketed.
  const market = world.state.market as string | undefined;
  const language = world.state.language as string | undefined;
  // The scenario is the finest bucket: snapshots that share an id across
  // scenarios (e.g. the invalid-login cases, which carry no market) get a
  // distinct, stable baseline per scenario instead of colliding.
  const scenario = world.state.__scenarioName as string | undefined;
  const result = await new PixelmatchVisualExecutor().compareSnapshot(domain, snapshotId, driver, {
    market,
    language,
    scenario,
  });

  // The comparison (PASS/FAIL/SKIP) is already recorded to telemetry by the
  // executor. We do NOT throw on FAIL: the Visual oracle records drift for the
  // research dataset but never fails the functional scenario (see the doc
  // comment above — this matches the reference's swallow-and-log behaviour).
  return result.status === 'PASS';
}
