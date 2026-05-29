/**
 * Run identity for standalone metrics/quality scripts. Derived from the
 * environment (CI sets these) with a deterministic fallback so scripts never
 * fabricate data. The architecture_type is fixed to GTAA_BASELINE — this is the
 * single field that distinguishes this repo's metrics from the TOM reference.
 */
export const ARCHITECTURE_TYPE = 'GTAA_BASELINE';

export interface ScriptIdentity {
  architecture_type: string;
  repository_name: string;
  experiment_batch_id: string;
  run_index: string;
  workflow_run_id: string;
  workflow_attempt: string;
  tool_name: string;
  platform: string;
  viewport: string;
}

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

/** A frozen ISO timestamp for a single script invocation (deterministic within a run). */
export function generatedAt(): string {
  return env('GTAA_GENERATED_AT', new Date().toISOString());
}

/**
 * Repository-level identity. Per-metric scripts override tool_name/platform when
 * a metric is tool- or platform-specific; otherwise they use "ALL".
 */
export function scriptIdentity(overrides: Partial<ScriptIdentity> = {}): ScriptIdentity {
  return {
    architecture_type: ARCHITECTURE_TYPE,
    repository_name: env('REPOSITORY_NAME', 'gTAA'),
    experiment_batch_id: env('EXPERIMENT_BATCH_ID', 'local-batch'),
    run_index: env('RUN_INDEX', '0'),
    workflow_run_id: env('GITHUB_RUN_ID', 'NOT_AVAILABLE'),
    workflow_attempt: env('GITHUB_RUN_ATTEMPT', 'NOT_AVAILABLE'),
    tool_name: 'ALL',
    platform: 'ALL',
    viewport: 'ALL',
    ...overrides,
  };
}

/** Standard column set for every quality_attribute metric CSV. */
export const QUALITY_COLUMNS = [
  'architecture_type',
  'repository_name',
  'experiment_batch_id',
  'run_index',
  'workflow_run_id',
  'workflow_attempt',
  'tool_name',
  'platform',
  'viewport',
  'metric_category',
  'metric_name',
  'metric_value',
  'metric_unit',
  'source_file',
  'generated_at',
];

export interface QualityMetricRow {
  metric_category: string;
  metric_name: string;
  metric_value: string | number | null;
  metric_unit: string;
  source_file: string;
  tool_name?: string;
  platform?: string;
  viewport?: string;
}

/** Build a full quality metric record from a partial row + identity. */
export function qualityRow(
  id: ScriptIdentity,
  row: QualityMetricRow,
  generated: string,
): Record<string, unknown> {
  return {
    architecture_type: id.architecture_type,
    repository_name: id.repository_name,
    experiment_batch_id: id.experiment_batch_id,
    run_index: id.run_index,
    workflow_run_id: id.workflow_run_id,
    workflow_attempt: id.workflow_attempt,
    tool_name: row.tool_name ?? 'ALL',
    platform: row.platform ?? 'ALL',
    viewport: row.viewport ?? 'ALL',
    metric_category: row.metric_category,
    metric_name: row.metric_name,
    metric_value: row.metric_value === null ? 'NOT_AVAILABLE' : row.metric_value,
    metric_unit: row.metric_unit,
    source_file: row.source_file,
    generated_at: generated,
  };
}
