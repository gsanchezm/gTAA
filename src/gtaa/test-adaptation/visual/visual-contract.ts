/**
 * Test Adaptation layer — loader for declarative visual contracts.
 *
 * Visual contracts live at
 *   test-generation/contracts/visual/<feature>.visual.json
 * and declare snapshots (id, regionRef, maskRefs, targeted platforms/viewports,
 * thresholds). Selectors are NOT stored here — regionRef/maskRefs are logical
 * locator refs resolved through the locator adaptation layer. This module only
 * reads and shapes the contract; it performs no capture or comparison.
 *
 * Mirrors the locator-resolver's loading style (sync read + per-feature cache).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import type { VisualPlatform, VisualViewport } from '../../shared/types';

const CONTRACTS_ROOT = resolve(
  __dirname,
  '..',
  '..',
  'test-generation',
  'contracts',
  'visual',
);

export interface VisualThresholds {
  pixelRatio?: number;
  pixelCount?: number;
}

export interface VisualSnapshot {
  id: string;
  description?: string;
  regionRef: string;
  maskRefs?: string[];
  platforms?: VisualPlatform[];
  viewports?: VisualViewport[];
  thresholds?: VisualThresholds;
  tags?: string[];
}

export interface VisualContractDefaults {
  thresholds?: VisualThresholds;
  platforms?: VisualPlatform[];
  viewports?: VisualViewport[];
}

export interface VisualContract {
  feature: string;
  version: string;
  defaults?: VisualContractDefaults;
  snapshots: VisualSnapshot[];
}

export interface LoadedVisualContract {
  contract: VisualContract;
  snapshot: VisualSnapshot;
  defaults: VisualContractDefaults | undefined;
}

const cache = new Map<string, VisualContract>();

function loadContract(feature: string): VisualContract {
  const cached = cache.get(feature);
  if (cached) return cached;

  const file = join(CONTRACTS_ROOT, `${feature}.visual.json`);
  if (!existsSync(file)) {
    throw new ClassifiedError(
      FailureBucket.VISUAL_BASELINE_MISSING,
      `Visual contract not found for feature "${feature}" (${file})`,
    );
  }
  const contract = JSON.parse(readFileSync(file, 'utf8')) as VisualContract;
  if (!Array.isArray(contract.snapshots) || contract.snapshots.length === 0) {
    throw new ClassifiedError(
      FailureBucket.VISUAL_DIFF_FAILURE,
      `Visual contract "${feature}" has no snapshots`,
    );
  }
  cache.set(feature, contract);
  return contract;
}

/** Load a feature's contract and locate one snapshot by id. */
export function loadVisualContract(feature: string, snapshotId: string): LoadedVisualContract {
  const contract = loadContract(feature);
  const snapshot = contract.snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) {
    throw new ClassifiedError(
      FailureBucket.VISUAL_DIFF_FAILURE,
      `Snapshot "${snapshotId}" not found in visual contract "${feature}"`,
    );
  }
  return { contract, snapshot, defaults: contract.defaults };
}

/** Clear the contract cache (tests / standalone scripts). */
export function resetVisualContractCache(): void {
  cache.clear();
}
