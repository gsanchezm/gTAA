/**
 * normalize-api-telemetry.ts
 *
 * Flattens metrics/raw/api/*.jsonl (ApiContractEvent) into
 * metrics/processed/api_isolated_results.csv.
 *
 * One row per API contract event. Empty-input safe (header only).
 * Run: tsx scripts/metrics/normalize-api-telemetry.ts
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

const COLUMNS = [
  'run_id',
  'endpoint_id',
  'method',
  'path',
  'response_status',
  'response_time_ms',
  'assertion_count',
  'failed_assertions',
  'status',
  'duration_ms',
  'failure_bucket',
  ...IDENTITY_COLUMNS,
  'generated_at',
];

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const raw = readJsonlDir<Record<string, unknown>>(join(RAW, 'api'));

  const rows = raw
    .map((r) => ({
      run_id: str(r.run_id),
      endpoint_id: str(r.endpoint_id),
      method: str(r.method),
      path: str(r.path),
      response_status: num(r.response_status),
      response_time_ms: num(r.response_time_ms),
      assertion_count: num(r.assertion_count),
      failed_assertions: num(r.failed_assertions),
      status: normalizeStatus(r.status),
      duration_ms: num(r.duration_ms),
      failure_bucket: bucket(r.failure_bucket),
      ...identityColumns(r, id),
      // api events are tool_name 'api' by construction; honor record then default
      tool_name: str(r.tool_name) || 'api',
      generated_at: generated,
    }))
    .sort(
      (a, b) =>
        a.run_id.localeCompare(b.run_id) ||
        a.endpoint_id.localeCompare(b.endpoint_id) ||
        a.method.localeCompare(b.method) ||
        a.path.localeCompare(b.path),
    );

  const out = join(PROCESSED, 'api_isolated_results.csv');
  writeCsv(out, COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`api_isolated_results.csv written: ${file}`);
}
