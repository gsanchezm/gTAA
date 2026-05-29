/**
 * build-outcome-history.ts
 *
 * Emits metrics/processed/scenario_outcome_history.csv — one row per scenario
 * telemetry event (collapsed from step events) across all runs. This is the
 * append-friendly base for flaky / pass-to-fail analysis: the same
 * (feature, scenario) appears once per run_id, and rows carry experiment_batch_id
 * + run_index + run_id so outcomes can be diffed across runs.
 *
 * Empty-input safe (header only). Run: tsx scripts/metrics/build-outcome-history.ts
 */
import { join } from 'node:path';
import { PROCESSED, writeCsv } from './lib/io';
import { ARCHITECTURE_TYPE, generatedAt, scriptIdentity } from './lib/identity';
import { identityColumns } from './lib/metrics-common';
import { collapseToScenarios, loadTelemetry } from './lib/telemetry-load';

// Column order matches the task contract exactly.
const COLUMNS = [
  'architecture_type',
  'experiment_batch_id',
  'run_index',
  'run_id',
  'tool_name',
  'platform',
  'viewport',
  'feature',
  'scenario',
  'status',
  'failure_bucket',
  'duration_ms',
  'timestamp',
  'generated_at',
];

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const scenarios = collapseToScenarios(loadTelemetry()).sort(
    (a, b) =>
      a.run_id.localeCompare(b.run_id) ||
      a.feature.localeCompare(b.feature) ||
      a.scenario.localeCompare(b.scenario),
  );

  const rows = scenarios.map((e) => {
    const idc = identityColumns(e, id);
    return {
      architecture_type: ARCHITECTURE_TYPE,
      experiment_batch_id: idc.experiment_batch_id,
      run_index: idc.run_index,
      run_id: e.run_id,
      tool_name: idc.tool_name,
      platform: idc.platform,
      viewport: idc.viewport,
      feature: e.feature,
      scenario: e.scenario,
      status: e.status,
      failure_bucket: e.failure_bucket,
      duration_ms: e.duration_ms,
      timestamp: e.timestamp,
      generated_at: generated,
    };
  });

  const out = join(PROCESSED, 'scenario_outcome_history.csv');
  writeCsv(out, COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`scenario_outcome_history.csv written: ${file}`);
}
