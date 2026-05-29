/**
 * measure-performance-efficiency.ts (§15.6)
 *
 * Emits metrics/processed/performance_efficiency_metrics.csv — one row per
 * performance-efficiency quality metric for the gTAA baseline. Repo-level rows
 * use tool_name/platform = 'ALL'; a few per-platform percentile rows are also
 * emitted from platform_durations.csv.
 *
 * Data-integrity rule: an uncomputable metric still emits a row with
 * metric_value=null (rendered NOT_AVAILABLE) and an explanatory note placed in
 * the source_file column (there is no separate note column). Each metric is
 * computed defensively so one failure never aborts the script.
 *
 * Run: tsx scripts/metrics/measure-performance-efficiency.ts
 */
import { join } from 'node:path';
import { PROCESSED, percentile, readCsv, round, writeCsv } from './lib/io';
import {
  generatedAt,
  qualityRow,
  QUALITY_COLUMNS,
  scriptIdentity,
  type QualityMetricRow,
} from './lib/identity';
import { collapseToScenarios, loadTelemetry } from './lib/telemetry-load';

const CATEGORY = 'performance_efficiency';

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const rows: Array<Record<string, unknown>> = [];

  // Helper: safely compute one metric row. A throw becomes a NOT_AVAILABLE row
  // so a single failing metric never aborts the whole script.
  const add = (metricName: string, compute: () => QualityMetricRow): void => {
    try {
      rows.push(qualityRow(id, compute(), generated));
    } catch (err) {
      rows.push(
        qualityRow(
          id,
          {
            metric_category: CATEGORY,
            metric_name: metricName,
            metric_value: null,
            metric_unit: 'ms',
            source_file: `computation failed: ${(err as Error).message}`,
          },
          generated,
        ),
      );
    }
  };

  // ---- Per-scenario durations gathered from scenario_outcome_history.csv ----
  // Collapse telemetry as a fallback when the processed history is unavailable.
  const history = readCsv(join(PROCESSED, 'scenario_outcome_history.csv'));
  let durations: number[] = history
    .map((r) => Number(r.duration_ms))
    .filter((n) => Number.isFinite(n));
  let durationSource = 'scenario_outcome_history.csv';
  if (durations.length === 0) {
    const scenarios = collapseToScenarios(loadTelemetry());
    durations = scenarios
      .map((s) => (s.duration_ms === '' ? NaN : s.duration_ms))
      .filter((n) => Number.isFinite(n));
    durationSource = 'tool-events/*.jsonl (collapsed)';
  }
  const haveDurations = durations.length > 0;

  // ---- CI workflow / job timing: not present in local run-manifests ----
  add('workflow_duration_ms', () => ({
    metric_category: CATEGORY,
    metric_name: 'workflow_duration_ms',
    metric_value: null,
    metric_unit: 'ms',
    source_file: 'run-manifest/*.json (not recorded outside CI)',
  }));
  add('job_duration_ms', () => ({
    metric_category: CATEGORY,
    metric_name: 'job_duration_ms',
    metric_value: null,
    metric_unit: 'ms',
    source_file: 'run-manifest/*.json (not recorded outside CI)',
  }));

  // ---- scenario_duration_ms: repo-level mean of per-scenario durations ----
  add('scenario_duration_ms', () => {
    if (!haveDurations) {
      return {
        metric_category: CATEGORY,
        metric_name: 'scenario_duration_ms',
        metric_value: null,
        metric_unit: 'ms',
        source_file: `${durationSource} (no scenario durations)`,
      };
    }
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    return {
      metric_category: CATEGORY,
      metric_name: 'scenario_duration_ms',
      metric_value: round(mean),
      metric_unit: 'ms',
      source_file: durationSource,
    };
  });

  // ---- step_duration_ms: mean of step-level tool-events durations ----
  add('step_duration_ms', () => {
    const stepDurations = loadTelemetry()
      .filter((e) => e.step !== '' && e.duration_ms !== '')
      .map((e) => e.duration_ms as number)
      .filter((n) => Number.isFinite(n));
    if (stepDurations.length === 0) {
      return {
        metric_category: CATEGORY,
        metric_name: 'step_duration_ms',
        metric_value: null,
        metric_unit: 'ms',
        source_file: 'tool-events/*.jsonl (no step-level durations)',
      };
    }
    const mean = stepDurations.reduce((a, b) => a + b, 0) / stepDurations.length;
    return {
      metric_category: CATEGORY,
      metric_name: 'step_duration_ms',
      metric_value: round(mean),
      metric_unit: 'ms',
      source_file: 'tool-events/*.jsonl',
    };
  });

  // ---- action_duration_ms: no action-level data ----
  add('action_duration_ms', () => ({
    metric_category: CATEGORY,
    metric_name: 'action_duration_ms',
    metric_value: null,
    metric_unit: 'ms',
    source_file: 'tool-events/*.jsonl (no action-level data)',
  }));

  // ---- p50 / p95 / p99 over the per-scenario durations ----
  const percentileRow = (name: string, p: number): QualityMetricRow => ({
    metric_category: CATEGORY,
    metric_name: name,
    metric_value: haveDurations ? round(percentile(durations, p)) : null,
    metric_unit: 'ms',
    source_file: haveDurations ? durationSource : `${durationSource} (no scenario durations)`,
  });
  add('p50_scenario_duration_ms', () => percentileRow('p50_scenario_duration_ms', 50));
  add('p95_scenario_duration_ms', () => percentileRow('p95_scenario_duration_ms', 95));
  add('p99_scenario_duration_ms', () => percentileRow('p99_scenario_duration_ms', 99));

  // ---- tool_startup / telemetry_processing: not measured ----
  add('tool_startup_duration_ms', () => ({
    metric_category: CATEGORY,
    metric_name: 'tool_startup_duration_ms',
    metric_value: null,
    metric_unit: 'ms',
    source_file: 'not measured',
  }));
  add('telemetry_processing_duration_ms', () => ({
    metric_category: CATEGORY,
    metric_name: 'telemetry_processing_duration_ms',
    metric_value: null,
    metric_unit: 'ms',
    source_file: 'not measured',
  }));

  // ---- Architecture-difference markers for the paired comparison ----
  // These document that a layered architecture incurs none of these overheads;
  // emitted as NOT_AVAILABLE so the comparison dataset has the field present.
  const overheadNote = 'not applicable - layered architecture has no such overhead';
  for (const name of ['proxy_overhead_ms', 'grpc_or_ipc_latency_ms', 'plugin_action_duration_ms']) {
    add(name, () => ({
      metric_category: CATEGORY,
      metric_name: name,
      metric_value: null,
      metric_unit: 'ms',
      source_file: overheadNote,
    }));
  }

  // ---- Optional per-platform percentile rows from platform_durations.csv ----
  const platformRows = readCsv(join(PROCESSED, 'platform_durations.csv')).sort(
    (a, b) =>
      String(a.platform).localeCompare(String(b.platform)) ||
      String(a.tool_name).localeCompare(String(b.tool_name)),
  );
  for (const pr of platformRows) {
    const platform = pr.platform || 'ALL';
    const tool = pr.tool_name || 'ALL';
    const emit = (metricName: string, col: string): void => {
      add(metricName, () => {
        const v = Number(pr[col]);
        return {
          metric_category: CATEGORY,
          metric_name: metricName,
          metric_value: Number.isFinite(v) ? round(v) : null,
          metric_unit: 'ms',
          source_file: 'platform_durations.csv',
          tool_name: tool,
          platform,
        };
      });
    };
    emit('p50_scenario_duration_ms', 'p50_duration_ms');
    emit('p95_scenario_duration_ms', 'p95_duration_ms');
    emit('p99_scenario_duration_ms', 'p99_duration_ms');
  }

  const out = join(PROCESSED, 'performance_efficiency_metrics.csv');
  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`performance_efficiency_metrics.csv written: ${file}`);
}
