/**
 * Test Execution layer — Pixelmatch visual executor.
 *
 * Compares a captured snapshot against a stored baseline using pixelmatch+pngjs.
 * regionRef and maskRefs come from the visual contract and are resolved through
 * the locator adaptation layer (no selectors duplicated here). Visual is a
 * composable oracle: Test Execution composes the already-started UiDriver to
 * capture from (it is NOT a mandatory UI step) and resolves regions via Test
 * Adaptation. It never opens its own session.
 *
 * Flow:
 *   1. Load the visual contract for `feature`; find the snapshot by id.
 *   2. Map driver.platform -> visual platform/viewport. If the snapshot does not
 *      target the current platform/viewport, return SKIP ('not-targeted').
 *   3. Capture the actual: region capture when regionRef resolves via the
 *      locator layer, else a full-page capture. Masks are applied by the driver.
 *   4. Resolve the baseline via the baseline policy (create-or-fail when absent).
 *   5. Diff actual vs baseline against the snapshot threshold and persist PNGs.
 *   6. Emit exactly one VisualContractEvent stamped with runIdentity().
 */
import { writeFileSync } from 'node:fs';
import { ClassifiedError, FailureBucket, errorMessage } from '../../shared/failure-buckets';
import type {
  ExecutionStatus,
  Platform,
  VisualContractEvent,
  VisualPlatform,
  VisualViewport,
} from '../../shared/types';
import { tryResolveLocator } from '../../test-adaptation/locators/locator-resolver';
import type { UiDriver } from '../../test-adaptation/drivers/ui-driver';
import {
  BASELINE_CREATED_REASON,
  baselineExists,
  readBaseline,
  resolveMissingBaseline,
} from '../../test-adaptation/visual/baseline-policy';
import {
  baselinePaths,
  ensureDir,
  resultPaths,
  type VisualPathKey,
} from '../../test-adaptation/visual/visual-paths';
import { visualConfig } from '../../configuration/environments/env';
import { runIdentity } from '../../test-reporting/telemetry/run-context';
import { emitVisualEvent } from '../../test-reporting/telemetry/telemetry-writer';
import { loadVisualContract, type VisualSnapshot } from '../../test-adaptation/visual/visual-contract';

const SCHEMA_VERSION = '1.0.0';

export interface VisualComparisonResult {
  status: ExecutionStatus;
  snapshotId: string;
  regionRef: string;
  maskRefs: string[];
  baselinePath: string | null;
  actualPath: string | null;
  diffPath: string | null;
  diffPixels: number | null;
  diffRatio: number | null;
  threshold: number | null;
  passed: boolean | null;
  failureBucket: FailureBucket | null;
  errorMessage: string | null;
}

/** Resolved visual platform/viewport for the active driver platform. */
interface VisualTarget {
  visualPlatform: VisualPlatform;
  visualViewport: VisualViewport;
}

export class PixelmatchVisualExecutor {
  async compareSnapshot(
    feature: string,
    snapshotId: string,
    driver: UiDriver,
  ): Promise<VisualComparisonResult> {
    const startedAt = Date.now();
    const driverPlatform = driver.platform as Platform;
    const target = mapDriverPlatform(driverPlatform);

    // Load the declarative contract; selectors are never duplicated here.
    const { snapshot } = loadVisualContract(feature, snapshotId);
    const maskRefs = snapshot.maskRefs ?? [];

    const baseResult: VisualComparisonResult = {
      status: 'UNKNOWN',
      snapshotId,
      regionRef: snapshot.regionRef,
      maskRefs,
      baselinePath: null,
      actualPath: null,
      diffPath: null,
      diffPixels: null,
      diffRatio: null,
      threshold: null,
      passed: null,
      failureBucket: null,
      errorMessage: null,
    };

    // 2. Targeting: skip cleanly when this snapshot is not declared for the
    //    current platform/viewport.
    if (!isTargeted(snapshot, target)) {
      const result: VisualComparisonResult = {
        ...baseResult,
        status: 'SKIP',
        errorMessage: 'not-targeted',
      };
      this.emit(feature, snapshot, target, result, Date.now() - startedAt, 'page', 0, {
        reason: 'not-targeted',
      });
      return result;
    }

    const threshold = resolveThreshold(feature, snapshot);
    const key: VisualPathKey = {
      feature,
      snapshotId,
      visualPlatform: target.visualPlatform,
      visualViewport: target.visualViewport,
    };

    // Decide region vs page strategy via the locator adaptation layer.
    const regionResolves = tryResolveLocator(snapshot.regionRef, driverPlatform) !== null;
    const strategy: 'region' | 'page' = regionResolves ? 'region' : 'page';
    const resolvedMaskCount = maskRefs.filter(
      (ref) => tryResolveLocator(ref, driverPlatform) !== null,
    ).length;

    try {
      // 3. Capture the actual (driver applies masks). Mobile sessions may not
      //    support capture; surface that as a clear SKIP rather than crashing.
      let actualPng: Buffer;
      try {
        actualPng =
          strategy === 'region'
            ? await driver.captureRegion(snapshot.regionRef, { maskRefs })
            : await driver.capturePage({ maskRefs });
      } catch (captureErr) {
        const isMobile = target.visualPlatform !== 'web';
        const result: VisualComparisonResult = {
          ...baseResult,
          status: 'SKIP',
          threshold,
          failureBucket: isMobile ? null : FailureBucket.WEB_SESSION_FAILURE,
          errorMessage: `capture-unavailable: ${errorMessage(captureErr)}`,
        };
        this.emit(
          feature,
          snapshot,
          target,
          result,
          Date.now() - startedAt,
          strategy,
          resolvedMaskCount,
          { reason: 'capture-unavailable' },
        );
        return result;
      }

      const paths = resultPaths(key, runIdentity().run_id);
      ensureDir(paths.resultDir);
      writeFileSync(paths.actualPath, actualPng);
      baseResult.actualPath = paths.actualPath;

      // 4. Baseline policy: compare, create (bootstrap), or report missing.
      if (!baselineExists(key)) {
        const outcome = resolveMissingBaseline(key, actualPng, visualConfig().updateBaseline);
        const result: VisualComparisonResult = {
          ...baseResult,
          status: outcome.status ?? 'SKIP',
          threshold,
          baselinePath: outcome.decision === 'created' ? outcome.baselinePath : null,
          failureBucket: outcome.failureBucket ?? null,
          errorMessage: outcome.errorMessage ?? null,
        };
        this.emit(
          feature,
          snapshot,
          target,
          result,
          Date.now() - startedAt,
          strategy,
          resolvedMaskCount,
          {
            reason: outcome.reason,
            baselineCreated: outcome.decision === 'created',
          },
        );
        return result;
      }

      // 5. Diff actual vs baseline. Lazy import keeps pixelmatch/pngjs out of
      //    the not-targeted / missing-baseline paths.
      const { diffPngBuffers } = await import('./image-diff');
      const baselinePng = readBaseline(key);
      const diff = diffPngBuffers(actualPng, baselinePng);
      baseResult.baselinePath = baselinePaths(key).baselinePath;

      if (diff.sizeMismatch) {
        const result: VisualComparisonResult = {
          ...baseResult,
          status: 'FAIL',
          threshold,
          diffPixels: diff.diffPixels,
          diffRatio: diff.diffRatio,
          passed: false,
          failureBucket: FailureBucket.VISUAL_DIFF_FAILURE,
          errorMessage: diff.error,
        };
        this.emit(
          feature,
          snapshot,
          target,
          result,
          Date.now() - startedAt,
          strategy,
          resolvedMaskCount,
          { reason: 'size-mismatch' },
        );
        return result;
      }

      if (diff.diffPng) {
        writeFileSync(paths.diffPath, diff.diffPng);
      }
      const passed = diff.diffRatio <= threshold;
      const result: VisualComparisonResult = {
        ...baseResult,
        diffPath: diff.diffPng ? paths.diffPath : null,
        status: passed ? 'PASS' : 'FAIL',
        threshold,
        diffPixels: diff.diffPixels,
        diffRatio: diff.diffRatio,
        passed,
        failureBucket: passed ? null : FailureBucket.VISUAL_DIFF_FAILURE,
        errorMessage: passed
          ? null
          : `Visual diff ${diff.diffRatio.toFixed(6)} exceeds threshold ${threshold}`,
      };
      this.emit(
        feature,
        snapshot,
        target,
        result,
        Date.now() - startedAt,
        strategy,
        resolvedMaskCount,
        { reason: passed ? 'match' : 'diff-over-threshold' },
      );
      return result;
    } catch (err) {
      const bucket = err instanceof ClassifiedError ? err.bucket : FailureBucket.VISUAL_DIFF_FAILURE;
      const result: VisualComparisonResult = {
        ...baseResult,
        status: 'FAIL',
        threshold,
        failureBucket: bucket,
        errorMessage: errorMessage(err),
      };
      this.emit(
        feature,
        snapshot,
        target,
        result,
        Date.now() - startedAt,
        strategy,
        resolvedMaskCount,
        { reason: 'error' },
      );
      return result;
    }
  }

  /** Build and emit exactly one VisualContractEvent for this comparison. */
  private emit(
    feature: string,
    snapshot: VisualSnapshot,
    target: VisualTarget,
    result: VisualComparisonResult,
    durationMs: number,
    strategy: 'region' | 'page',
    resolvedMaskCount: number,
    metadata: Record<string, unknown>,
  ): void {
    const id = runIdentity();
    const event: VisualContractEvent = {
      ...id,
      schema_version: SCHEMA_VERSION,
      feature,
      contract_type: 'VISUAL',
      contract_id: `${feature}@${result.snapshotId}`,
      snapshot_id: result.snapshotId,
      region_ref: snapshot.regionRef,
      resolved_region_strategy: strategy,
      mask_refs: result.maskRefs,
      resolved_mask_count: resolvedMaskCount,
      platform: target.visualPlatform,
      viewport: target.visualViewport,
      status: result.status,
      duration_ms: durationMs,
      baseline_path: result.baselinePath,
      actual_path: result.actualPath,
      diff_path: result.diffPath,
      diff_pixels: result.diffPixels,
      diff_ratio: result.diffRatio,
      threshold: result.threshold,
      passed: result.passed,
      failure_bucket: result.failureBucket,
      error_message: result.errorMessage,
      metadata,
    };
    emitVisualEvent(event);
  }
}

/** Map the active driver platform to the visual platform/viewport vocabulary. */
function mapDriverPlatform(platform: Platform): VisualTarget {
  switch (platform) {
    case 'desktop':
      return { visualPlatform: 'web', visualViewport: 'desktop' };
    case 'responsive':
      return { visualPlatform: 'web', visualViewport: 'responsive' };
    case 'android':
      return { visualPlatform: 'android', visualViewport: 'mobile' };
    case 'ios':
      return { visualPlatform: 'ios', visualViewport: 'mobile' };
    default:
      // 'api' (or anything non-UI) has no visual target; default to web/desktop
      // so callers still get a deterministic key, though such snapshots will
      // typically be filtered out as not-targeted.
      return { visualPlatform: 'web', visualViewport: 'desktop' };
  }
}

/** A snapshot is targeted when both its platform and viewport include the target. */
function isTargeted(snapshot: VisualSnapshot, target: VisualTarget): boolean {
  const platforms = snapshot.platforms;
  const viewports = snapshot.viewports;
  const platformOk = !platforms || platforms.includes(target.visualPlatform);
  const viewportOk = !viewports || viewports.includes(target.visualViewport);
  return platformOk && viewportOk;
}

/**
 * Threshold precedence: snapshot.thresholds.pixelRatio -> contract defaults ->
 * visualConfig().pixelRatio.
 */
function resolveThreshold(feature: string, snapshot: VisualSnapshot): number {
  if (typeof snapshot.thresholds?.pixelRatio === 'number') {
    return snapshot.thresholds.pixelRatio;
  }
  const { defaults } = loadVisualContract(feature, snapshot.id);
  if (typeof defaults?.thresholds?.pixelRatio === 'number') {
    return defaults.thresholds.pixelRatio;
  }
  return visualConfig().pixelRatio;
}

export { BASELINE_CREATED_REASON };
