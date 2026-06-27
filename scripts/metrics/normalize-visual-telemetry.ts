/**
 * normalize-visual-telemetry.ts
 *
 * Flattens metrics/raw/visual/*.jsonl (VisualContractEvent) into
 * metrics/processed/visual_comparison_results.csv.
 *
 * One row per visual contract event. mask_refs (an array) is joined with ';'.
 * Empty-input safe (header only). Run: tsx scripts/metrics/normalize-visual-telemetry.ts
 */
import { join } from 'node:path';
import { PROCESSED, RAW, readJsonlDir, writeCsv } from './lib/io';
import { generatedAt, scriptIdentity } from './lib/identity';
import {
  IDENTITY_COLUMNS,
  bucket,
  identityColumns,
  normalizeStatus,
  num,
  str,
} from './lib/metrics-common';
import { isAnalysisExcludedSnapshot } from './lib/excluded-snapshots';

const COLUMNS = [
  'run_id',
  'snapshot_id',
  'region_ref',
  'mask_refs',
  'platform',
  'viewport',
  'baseline_path',
  'actual_path',
  'diff_path',
  'diff_pixels',
  'diff_ratio',
  'threshold',
  'status',
  'duration_ms',
  'failure_bucket',
  // 1 when this snapshot is a documented confound excluded from architecture
  // analysis (TV-1); the row is retained here for transparency/audit. The CI
  // visual gate ignores this column (it scans only for PASS/FAIL cells).
  'analysis_excluded',
  ...IDENTITY_COLUMNS,
  'generated_at',
];

function joinMasks(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(';');
  return str(value);
}

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const raw = readJsonlDir<Record<string, unknown>>(join(RAW, 'visual'));

  const rows = raw
    .map((r) => {
      const idc = identityColumns(r, id);
      return {
        run_id: str(r.run_id),
        snapshot_id: str(r.snapshot_id),
        region_ref: str(r.region_ref),
        mask_refs: joinMasks(r.mask_refs),
        platform: idc.platform,
        viewport: idc.viewport,
        baseline_path: str(r.baseline_path),
        actual_path: str(r.actual_path),
        diff_path: str(r.diff_path),
        diff_pixels: num(r.diff_pixels),
        diff_ratio: num(r.diff_ratio),
        threshold: num(r.threshold),
        status: normalizeStatus(r.status),
        duration_ms: num(r.duration_ms),
        failure_bucket: bucket(r.failure_bucket),
        analysis_excluded: isAnalysisExcludedSnapshot(r.snapshot_id) ? 1 : 0,
        ...idc,
        tool_name: str(r.tool_name) || 'pixelmatch',
        generated_at: generated,
      };
    })
    .sort(
      (a, b) =>
        a.run_id.localeCompare(b.run_id) ||
        a.snapshot_id.localeCompare(b.snapshot_id),
    );

  const out = join(PROCESSED, 'visual_comparison_results.csv');
  writeCsv(out, COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`visual_comparison_results.csv written: ${file}`);
}
