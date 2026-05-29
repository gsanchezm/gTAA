/**
 * normalize-gatling-telemetry.ts
 *
 * Reads every metrics/raw/gatling/<run-id>/summary.json (GatlingSummary) into
 * metrics/processed/performance_summary.csv.
 *
 * One row per simulation summary. Empty-input safe (header only).
 * Run: tsx scripts/metrics/normalize-gatling-telemetry.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESSED, RAW, writeCsv } from './lib/io';
import { generatedAt, scriptIdentity } from './lib/identity';
import {
  IDENTITY_COLUMNS,
  bucket,
  identityColumns,
  normalizeStatus,
  num,
  str,
} from './lib/metrics-common';

const COLUMNS = [
  'run_id',
  'simulation_name',
  'request_count',
  'success_count',
  'failure_count',
  'mean_response_time_ms',
  'p95_response_time_ms',
  'max_response_time_ms',
  'threshold_status',
  'duration_ms',
  'failure_bucket',
  ...IDENTITY_COLUMNS,
  'generated_at',
];

/** Collect all <run-id>/summary.json files under metrics/raw/gatling. */
function loadSummaries(): Record<string, unknown>[] {
  const dir = join(RAW, 'gatling');
  if (!existsSync(dir)) return [];
  const out: Record<string, unknown>[] = [];
  for (const name of readdirSync(dir)) {
    const sub = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(sub).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    const file = join(sub, 'summary.json');
    if (!existsSync(file)) continue;
    try {
      out.push(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>);
    } catch {
      /* skip malformed summary; never crash */
    }
  }
  return out;
}

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const summaries = loadSummaries();

  const rows = summaries
    .map((r) => ({
      run_id: str(r.run_id),
      simulation_name: str(r.simulation_name),
      request_count: num(r.request_count),
      success_count: num(r.success_count),
      failure_count: num(r.failure_count),
      mean_response_time_ms: num(r.mean_response_time_ms),
      p95_response_time_ms: num(r.p95_response_time_ms),
      max_response_time_ms: num(r.max_response_time_ms),
      threshold_status: normalizeStatus(r.threshold_status),
      duration_ms: num(r.duration_ms),
      failure_bucket: bucket(r.failure_bucket),
      ...identityColumns(r, id),
      tool_name: str(r.tool_name) || 'gatling',
      generated_at: generated,
    }))
    .sort(
      (a, b) =>
        a.run_id.localeCompare(b.run_id) ||
        a.simulation_name.localeCompare(b.simulation_name),
    );

  const out = join(PROCESSED, 'performance_summary.csv');
  writeCsv(out, COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`performance_summary.csv written: ${file}`);
}
