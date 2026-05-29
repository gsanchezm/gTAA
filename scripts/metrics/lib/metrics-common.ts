/**
 * Shared helpers for the metrics PROCESSING scripts (inventory, coverage,
 * telemetry normalization, aggregation, article tables, sample data).
 *
 * These build on lib/io.ts + lib/identity.ts and keep the identity-column
 * handling DRY so every emitted CSV row carries the same identity fields,
 * pulled from the raw record when present and falling back to scriptIdentity().
 *
 * Data-integrity rule: missing numeric values become '' or 'NOT_AVAILABLE';
 * we never fabricate values. architecture_type is always GTAA_BASELINE.
 */
import { ARCHITECTURE_TYPE, scriptIdentity, type ScriptIdentity } from './identity';

/** The identity columns every applicable CSV row must carry, in fixed order. */
export const IDENTITY_COLUMNS = [
  'architecture_type',
  'repository_name',
  'experiment_batch_id',
  'run_index',
  'workflow_run_id',
  'workflow_attempt',
  'tool_name',
  'platform',
  'viewport',
] as const;

export const NOT_AVAILABLE = 'NOT_AVAILABLE';

/** A raw record may carry any subset of these identity-ish fields. */
export interface RawIdentityish {
  architecture_type?: unknown;
  repository_name?: unknown;
  experiment_batch_id?: unknown;
  run_index?: unknown;
  run_id?: unknown;
  workflow_run_id?: unknown;
  workflow_attempt?: unknown;
  tool_name?: unknown;
  platform?: unknown;
  viewport?: unknown;
}

function coalesce(value: unknown, fallback: string): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

/**
 * Build the nine identity column values for a row. Prefers the raw record's own
 * identity fields; falls back to the process-level scriptIdentity(). The
 * architecture_type is forced to GTAA_BASELINE regardless of input.
 */
export function identityColumns(
  raw: RawIdentityish | undefined,
  base: ScriptIdentity = scriptIdentity(),
): Record<string, string> {
  const r = raw ?? {};
  return {
    architecture_type: ARCHITECTURE_TYPE,
    repository_name: coalesce(r.repository_name, base.repository_name),
    experiment_batch_id: coalesce(r.experiment_batch_id, base.experiment_batch_id),
    run_index: coalesce(r.run_index, base.run_index),
    workflow_run_id: coalesce(r.workflow_run_id, base.workflow_run_id),
    workflow_attempt: coalesce(r.workflow_attempt, base.workflow_attempt),
    tool_name: coalesce(r.tool_name, base.tool_name),
    platform: coalesce(r.platform, base.platform),
    viewport: coalesce(r.viewport, base.viewport),
  };
}

/** Numeric cell: returns the number, or '' for null/undefined/non-finite. */
export function num(value: unknown): number | '' {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : '';
}

/** Numeric cell with NOT_AVAILABLE fallback (for required-but-missing fields). */
export function numOrNa(value: unknown): number | string {
  const n = num(value);
  return n === '' ? NOT_AVAILABLE : n;
}

/** String cell with empty fallback. */
export function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Normalize a status to PASS/FAIL/SKIP/UNKNOWN. */
export function normalizeStatus(value: unknown): 'PASS' | 'FAIL' | 'SKIP' | 'UNKNOWN' {
  const s = String(value ?? '').toUpperCase();
  if (s === 'PASS' || s === 'PASSED') return 'PASS';
  if (s === 'FAIL' || s === 'FAILED') return 'FAIL';
  if (s === 'SKIP' || s === 'SKIPPED' || s === 'PENDING' || s === 'UNDEFINED') return 'SKIP';
  return 'UNKNOWN';
}

/** A failure_bucket cell — passthrough string or '' when absent. */
export function bucket(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}
