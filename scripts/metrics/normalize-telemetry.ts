/**
 * normalize-telemetry.ts
 *
 * Normalizes raw scenario/step telemetry (metrics/raw/tool-events/*.jsonl) into
 * a flat, deterministic CSV (metrics/processed/scenario_telemetry_normalized.csv)
 * that downstream aggregation + outcome-history scripts reuse via lib/telemetry-load.
 *
 * One row per raw telemetry event (step-level preserved). Empty-input safe.
 * Run: tsx scripts/metrics/normalize-telemetry.ts
 */
import { join } from 'node:path';
import { PROCESSED, writeCsv } from './lib/io';
import { generatedAt, scriptIdentity } from './lib/identity';
import { IDENTITY_COLUMNS, identityColumns } from './lib/metrics-common';
import { loadTelemetry } from './lib/telemetry-load';

const COLUMNS = [
  'run_id',
  'feature',
  'scenario',
  'step',
  'status',
  'duration_ms',
  'failure_bucket',
  'error_message',
  'timestamp',
  ...IDENTITY_COLUMNS,
  'generated_at',
];

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const events = loadTelemetry().sort(
    (a, b) =>
      a.run_id.localeCompare(b.run_id) ||
      a.feature.localeCompare(b.feature) ||
      a.scenario.localeCompare(b.scenario) ||
      a.timestamp.localeCompare(b.timestamp) ||
      a.step.localeCompare(b.step),
  );

  const rows = events.map((e) => ({
    run_id: e.run_id,
    feature: e.feature,
    scenario: e.scenario,
    step: e.step,
    status: e.status,
    duration_ms: e.duration_ms,
    failure_bucket: e.failure_bucket,
    error_message: e.error_message,
    timestamp: e.timestamp,
    ...identityColumns(e, id),
  }));

  const out = join(PROCESSED, 'scenario_telemetry_normalized.csv');
  writeCsv(out, COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`scenario_telemetry_normalized.csv written: ${file}`);
}
