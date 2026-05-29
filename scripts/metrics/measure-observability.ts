/**
 * measure-observability.ts (§15.7)
 *
 * Emits metrics/processed/observability_metrics.csv — one row per observability
 * quality metric for the gTAA baseline (telemetry volume/completeness, manifest
 * coverage, failure classification, and artifact-upload presence proxies).
 *
 * Data-integrity rule: an uncomputable metric still emits a row with
 * metric_value=null (rendered NOT_AVAILABLE) and an explanatory note placed in
 * the source_file column (there is no separate note column). A genuine zero is
 * reported as 0 when the input exists. Each metric is computed defensively so
 * one failure never aborts the script.
 *
 * Run: tsx scripts/metrics/measure-observability.ts
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESSED, RAW, REPO_ROOT, round, writeCsv } from './lib/io';
import {
  generatedAt,
  qualityRow,
  QUALITY_COLUMNS,
  scriptIdentity,
  type QualityMetricRow,
} from './lib/identity';
import { loadTelemetry } from './lib/telemetry-load';
import { readJsonDir } from './lib/io';

const CATEGORY = 'observability';

/** True when the directory exists and contains at least one entry. */
function dirNonEmpty(dir: string): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** True when the directory contains at least one entry matching the predicate. */
function dirHasFile(dir: string, pred: (name: string) => boolean): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).some(pred);
  } catch {
    return false;
  }
}

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const rows: Array<Record<string, unknown>> = [];

  const add = (metricName: string, unit: string, compute: () => QualityMetricRow): void => {
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
            metric_unit: unit,
            source_file: `computation failed: ${(err as Error).message}`,
          },
          generated,
        ),
      );
    }
  };

  const events = loadTelemetry();
  const haveEvents = events.length > 0;

  // ---- telemetry_event_count ----
  add('telemetry_event_count', 'count', () => ({
    metric_category: CATEGORY,
    metric_name: 'telemetry_event_count',
    metric_value: events.length,
    metric_unit: 'count',
    source_file: 'tool-events/*.jsonl',
  }));

  // ---- telemetry_completeness_percentage ----
  add('telemetry_completeness_percentage', 'percent', () => {
    if (!haveEvents) {
      return {
        metric_category: CATEGORY,
        metric_name: 'telemetry_completeness_percentage',
        metric_value: null,
        metric_unit: 'percent',
        source_file: 'tool-events/*.jsonl (no events)',
      };
    }
    const complete = events.filter(
      (e) =>
        e.run_id !== '' &&
        e.feature !== '' &&
        e.scenario !== '' &&
        String(e.status) !== '' &&
        e.timestamp !== '' &&
        e.platform !== '' &&
        e.tool_name !== '',
    ).length;
    return {
      metric_category: CATEGORY,
      metric_name: 'telemetry_completeness_percentage',
      metric_value: round((complete / events.length) * 100, 2),
      metric_unit: 'percent',
      source_file: 'tool-events/*.jsonl',
    };
  });

  // ---- missing_run_manifest_count: distinct run_ids with no matching manifest ----
  add('missing_run_manifest_count', 'count', () => {
    if (!haveEvents) {
      return {
        metric_category: CATEGORY,
        metric_name: 'missing_run_manifest_count',
        metric_value: 0,
        metric_unit: 'count',
        source_file: 'tool-events/*.jsonl + run-manifest/*.json (no events)',
      };
    }
    const manifests = readJsonDir<{ run_id?: unknown }>(join(RAW, 'run-manifest'));
    const manifestRunIds = new Set(
      manifests.map((m) => String(m.run_id ?? '')).filter((s) => s !== ''),
    );
    const eventRunIds = new Set(events.map((e) => e.run_id).filter((s) => s !== ''));
    let missing = 0;
    for (const rid of eventRunIds) {
      if (!manifestRunIds.has(rid)) missing += 1;
    }
    return {
      metric_category: CATEGORY,
      metric_name: 'missing_run_manifest_count',
      metric_value: missing,
      metric_unit: 'count',
      source_file: 'tool-events/*.jsonl + run-manifest/*.json',
    };
  });

  // ---- missing_scenario_duration_count: events with empty/missing duration_ms ----
  add('missing_scenario_duration_count', 'count', () => ({
    metric_category: CATEGORY,
    metric_name: 'missing_scenario_duration_count',
    metric_value: events.filter((e) => e.duration_ms === '').length,
    metric_unit: 'count',
    source_file: 'tool-events/*.jsonl',
  }));

  // ---- missing_failure_bucket_count: FAIL events with no failure_bucket ----
  add('missing_failure_bucket_count', 'count', () => ({
    metric_category: CATEGORY,
    metric_name: 'missing_failure_bucket_count',
    metric_value: events.filter((e) => e.status === 'FAIL' && e.failure_bucket === '').length,
    metric_unit: 'count',
    source_file: 'tool-events/*.jsonl',
  }));

  // ---- classified / unclassified failure percentage ----
  const failures = events.filter((e) => e.status === 'FAIL');
  const classified = failures.filter((e) => e.failure_bucket !== '').length;
  const haveFailures = failures.length > 0;
  add('classified_failure_percentage', 'percent', () => ({
    metric_category: CATEGORY,
    metric_name: 'classified_failure_percentage',
    metric_value: haveFailures ? round((classified / failures.length) * 100, 2) : null,
    metric_unit: 'percent',
    source_file: haveFailures ? 'tool-events/*.jsonl' : 'tool-events/*.jsonl (no failures observed)',
  }));
  add('unclassified_failure_percentage', 'percent', () => ({
    metric_category: CATEGORY,
    metric_name: 'unclassified_failure_percentage',
    metric_value: haveFailures
      ? round(((failures.length - classified) / failures.length) * 100, 2)
      : null,
    metric_unit: 'percent',
    source_file: haveFailures ? 'tool-events/*.jsonl' : 'tool-events/*.jsonl (no failures observed)',
  }));

  // ---- Artifact-upload presence proxies (local evidence; in CI these reflect
  // uploaded artifacts). Emitted as 1/0 booleans. ----
  const booleanRow = (name: string, present: boolean, sourceFile: string): QualityMetricRow => ({
    metric_category: CATEGORY,
    metric_name: name,
    metric_value: present ? 1 : 0,
    metric_unit: 'boolean',
    source_file: sourceFile,
  });

  add('raw_metrics_uploaded', 'boolean', () =>
    booleanRow('raw_metrics_uploaded', dirNonEmpty(RAW), 'metrics/raw (CI: uploaded artifacts)'),
  );
  add('processed_metrics_uploaded', 'boolean', () =>
    booleanRow(
      'processed_metrics_uploaded',
      dirHasFile(PROCESSED, (n) => n.endsWith('.csv')),
      'metrics/processed (CI: uploaded artifacts)',
    ),
  );
  add('logs_uploaded', 'boolean', () =>
    booleanRow(
      'logs_uploaded',
      dirNonEmpty(join(REPO_ROOT, 'logs')),
      'logs/ (CI: uploaded artifacts)',
    ),
  );
  add('artifacts_uploaded', 'boolean', () => {
    const present =
      dirNonEmpty(join(REPO_ROOT, 'results')) ||
      dirNonEmpty(join(REPO_ROOT, 'visual-results')) ||
      dirNonEmpty(join(REPO_ROOT, 'target', 'gatling'));
    return booleanRow(
      'artifacts_uploaded',
      present,
      'results/ | visual-results/ | target/gatling (CI: uploaded artifacts)',
    );
  });

  const out = join(PROCESSED, 'observability_metrics.csv');
  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`observability_metrics.csv written: ${file}`);
}
