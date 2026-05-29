/**
 * Shared, architecture-neutral types for the gTAA baseline.
 *
 * These mirror the metric/telemetry schemas used by the TOM reference repository
 * so the two architectures emit comparable records. The only intentional
 * difference is the value of `architecture_type`.
 */
import type { FailureBucket } from './failure-buckets';

export const ARCHITECTURE_TYPE = 'GTAA_BASELINE' as const;
export type ArchitectureType = 'GTAA_BASELINE' | 'TOM';

export type ExecutionStatus = 'PASS' | 'FAIL' | 'SKIP' | 'UNKNOWN';

/** Logical execution platform. `api` is treated as a platform for coverage parity. */
export type Platform = 'desktop' | 'responsive' | 'android' | 'ios' | 'api';

/** Tool / adapter name used as `tool_name` in every metric record. */
export type ToolName =
  | 'playwright'
  | 'appium-android'
  | 'appium-ios'
  | 'api'
  | 'gatling'
  | 'pixelmatch';

/** Visual platform/viewport vocabulary (kept identical to the visual contracts). */
export type VisualPlatform = 'web' | 'android' | 'ios';
export type VisualViewport = 'desktop' | 'responsive' | 'mobile';

/**
 * Identity fields shared by every metric/telemetry record. Set once per run from
 * environment + git/CI context and stamped onto each emitted record. This is what
 * makes TOM and gTAA runs pairable (same experiment_batch_id + run_index + tool).
 */
export interface RunIdentity {
  architecture_type: ArchitectureType;
  repository_name: string;
  experiment_batch_id: string;
  workflow_run_id: string | null;
  workflow_attempt: string | null;
  job_name: string | null;
  tool_name: ToolName | string;
  run_id: string;
  run_index: number | null;
  commit_sha: string | null;
  branch: string | null;
  timestamp: string;
}

/** Run manifest written to metrics/raw/run-manifest/<run-id>.json */
export interface RunManifest extends RunIdentity {
  generated_at: string;
  ci_provider: string | null;
  platform: Platform | string;
  viewport: string | null;
  driver: string | null;
  tags: string[];
  environment: string | null;
  node_version: string | null;
  os: string | null;
}

/**
 * Generic scenario/step telemetry event written to
 * metrics/raw/tool-events/<run-id>.jsonl. Carries the shared RunIdentity so each
 * line is self-describing and classifiable without external joins.
 */
export interface TelemetryEvent extends RunIdentity {
  feature: string | null;
  scenario: string;
  step: string | null;
  platform: Platform | string | null;
  viewport: string | null;
  status: ExecutionStatus;
  duration_ms: number | null;
  failure_bucket: FailureBucket | null;
  error_message: string | null;
}

/** API contract execution record -> metrics/raw/api/<run-id>.jsonl */
export interface ApiContractEvent extends RunIdentity {
  schema_version: string;
  feature: string;
  contract_type: 'API';
  contract_id: string | null;
  endpoint_id: string;
  method: string;
  path: string;
  platform: string | null;
  viewport: string | null;
  status: ExecutionStatus;
  duration_ms: number | null;
  request_headers_hash: string | null;
  request_body_hash: string | null;
  response_status: number | null;
  response_time_ms: number | null;
  extracted_keys: string[];
  assertion_count: number;
  failed_assertions: number;
  failure_bucket: FailureBucket | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

/** Visual contract execution record -> metrics/raw/visual/<run-id>.jsonl */
export interface VisualContractEvent extends RunIdentity {
  schema_version: string;
  feature: string;
  contract_type: 'VISUAL';
  contract_id: string | null;
  snapshot_id: string;
  region_ref: string;
  resolved_region_strategy: string | null;
  mask_refs: string[];
  resolved_mask_count: number;
  platform: string | null;
  viewport: string | null;
  status: ExecutionStatus;
  duration_ms: number | null;
  baseline_path: string | null;
  actual_path: string | null;
  diff_path: string | null;
  diff_pixels: number | null;
  diff_ratio: number | null;
  threshold: number | null;
  passed: boolean | null;
  failure_bucket: FailureBucket | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

/** Gatling performance summary -> metrics/raw/gatling/<run-id>/summary.json */
export interface GatlingSummary extends RunIdentity {
  simulation_name: string;
  request_count: number;
  success_count: number;
  failure_count: number;
  mean_response_time_ms: number | null;
  p95_response_time_ms: number | null;
  max_response_time_ms: number | null;
  threshold_status: ExecutionStatus;
  duration_ms: number | null;
  failure_bucket: FailureBucket | null;
}

/** The active execution context resolved once per Cucumber run. */
export interface ExecutionContext {
  platform: Platform;
  driver: 'playwright' | 'appium' | 'api';
  viewport: string | null;
  visualEnabled: boolean;
}
