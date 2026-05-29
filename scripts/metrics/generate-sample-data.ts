/**
 * SYNTHETIC sample data for pipeline validation only — NOT experimental results.
 *
 * generate-sample-data.ts
 *
 * Writes a small, clearly-labeled synthetic dataset across every metrics/raw/**
 * stream so the entire processing pipeline can be exercised offline (no app,
 * no network). It covers:
 *   - 2 runs (run_index 0 and 1) with the same scenarios so cross-run /
 *     flaky analysis has something to chew on,
 *   - one deliberately FLAKY scenario (passes in run 0, fails in run 1),
 *   - one API contract event, one visual contract event, one gatling summary,
 *   - a run-manifest per run.
 *
 * All records carry architecture_type = GTAA_BASELINE. Re-runnable: it
 * overwrites the synthetic files it owns (fixed run ids prefixed "sample-").
 * Run: tsx scripts/metrics/generate-sample-data.ts
 */
import { join } from 'node:path';
import { RAW, writeJson, writeText } from './lib/io';
import { ARCHITECTURE_TYPE } from './lib/identity';

const SAMPLE_TAG = 'SYNTHETIC sample data for pipeline validation only — NOT experimental results.';

interface Run {
  runId: string;
  runIndex: number;
}

const RUNS: Run[] = [
  { runId: 'sample-run-0', runIndex: 0 },
  { runId: 'sample-run-1', runIndex: 1 },
];

const BATCH = 'sample-batch';
const REPO = 'gTAA';

function baseIdentity(run: Run, tool: string, platform: string, viewport: string) {
  return {
    architecture_type: ARCHITECTURE_TYPE,
    repository_name: REPO,
    experiment_batch_id: BATCH,
    workflow_run_id: 'NOT_AVAILABLE',
    workflow_attempt: 'NOT_AVAILABLE',
    job_name: 'sample-job',
    tool_name: tool,
    run_id: run.runId,
    run_index: run.runIndex,
    commit_sha: 'sample0000000000000000000000000000000000',
    branch: 'sample',
    timestamp: `2026-01-0${run.runIndex + 1}T00:00:00.000Z`,
  };
}

function toolEvent(
  run: Run,
  feature: string,
  scenario: string,
  platform: string,
  status: 'PASS' | 'FAIL',
  durationMs: number,
  failureBucket: string | null,
) {
  return {
    ...baseIdentity(run, 'playwright', platform, platform),
    feature,
    scenario,
    step: null,
    platform,
    viewport: platform,
    status,
    duration_ms: durationMs,
    failure_bucket: failureBucket,
    error_message: failureBucket ? `synthetic ${failureBucket}` : null,
  };
}

function writeJsonl(file: string, records: unknown[]): void {
  const body = records.map((r) => JSON.stringify(r)).join('\n');
  writeText(file, records.length ? `${body}\n` : '');
}

export function run(): string[] {
  const written: string[] = [];

  for (const r of RUNS) {
    // --- tool-events: 3 scenarios; one is flaky across runs ---
    // "Customize a pizza" — flaky: PASS in run 0, FAIL in run 1.
    const flakyStatus = r.runIndex === 0 ? 'PASS' : 'FAIL';
    const flakyBucket = r.runIndex === 0 ? null : 'UI_ACTION_FAILURE';
    const events = [
      toolEvent(r, 'Browse Catalog', 'View the pizza catalog', 'desktop', 'PASS', 1200 + r.runIndex * 50, null),
      toolEvent(
        r,
        'Customize Pizza',
        'Customize a pizza',
        'responsive',
        flakyStatus,
        1800 + r.runIndex * 120,
        flakyBucket,
      ),
      toolEvent(r, 'Place Delivery Order', 'Place a delivery order', 'android', 'PASS', 2600 + r.runIndex * 75, null),
    ];
    const teFile = join(RAW, 'tool-events', `${r.runId}.jsonl`);
    writeJsonl(teFile, events);
    written.push(teFile);

    // --- run manifest per run ---
    const manifest = {
      ...baseIdentity(r, 'playwright', 'desktop', 'desktop'),
      generated_at: `2026-01-0${r.runIndex + 1}T00:00:00.000Z`,
      ci_provider: null,
      platform: 'desktop',
      viewport: 'desktop',
      driver: 'playwright',
      tags: ['@sample'],
      environment: 'local',
      node_version: 'v20.0.0',
      os: 'sample-os',
    };
    const manifestFile = join(RAW, 'run-manifest', `${r.runId}.json`);
    writeJson(manifestFile, manifest);
    written.push(manifestFile);
  }

  // --- one API contract event (run 0) ---
  const apiEvent = {
    ...baseIdentity(RUNS[0], 'api', 'api', 'api'),
    schema_version: '1.0.0',
    feature: 'Place Delivery Order',
    contract_type: 'API',
    contract_id: 'sample-contract-1',
    endpoint_id: 'createOrder',
    method: 'POST',
    path: '/api/orders',
    platform: 'api',
    viewport: 'api',
    status: 'PASS',
    duration_ms: 240,
    request_headers_hash: 'sha256:sample',
    request_body_hash: 'sha256:sample',
    response_status: 201,
    response_time_ms: 198,
    extracted_keys: ['orderId'],
    assertion_count: 4,
    failed_assertions: 0,
    failure_bucket: null,
    error_message: null,
    metadata: { synthetic: true },
  };
  const apiFile = join(RAW, 'api', `${RUNS[0].runId}.jsonl`);
  writeJsonl(apiFile, [apiEvent]);
  written.push(apiFile);

  // --- one visual contract event (run 0) ---
  const visualEvent = {
    ...baseIdentity(RUNS[0], 'pixelmatch', 'desktop', 'desktop'),
    schema_version: '1.0.0',
    feature: 'Browse Catalog',
    contract_type: 'VISUAL',
    contract_id: 'sample-visual-1',
    snapshot_id: 'catalog-grid',
    region_ref: 'main-content',
    resolved_region_strategy: 'selector',
    mask_refs: ['promo-banner', 'cart-badge'],
    resolved_mask_count: 2,
    platform: 'desktop',
    viewport: 'desktop',
    status: 'PASS',
    duration_ms: 320,
    baseline_path: 'visual-baselines/catalog-grid.png',
    actual_path: 'results/visual/catalog-grid.png',
    diff_path: 'results/visual/catalog-grid.diff.png',
    diff_pixels: 12,
    diff_ratio: 0.0004,
    threshold: 0.01,
    passed: true,
    failure_bucket: null,
    error_message: null,
    metadata: { synthetic: true },
  };
  const visualFile = join(RAW, 'visual', `${RUNS[0].runId}.jsonl`);
  writeJsonl(visualFile, [visualEvent]);
  written.push(visualFile);

  // --- one gatling summary (run 0) ---
  const gatling = {
    ...baseIdentity(RUNS[0], 'gatling', 'performance', 'performance'),
    simulation_name: 'OrderLoadSimulation',
    request_count: 1000,
    success_count: 994,
    failure_count: 6,
    mean_response_time_ms: 142,
    p95_response_time_ms: 410,
    max_response_time_ms: 980,
    threshold_status: 'PASS',
    duration_ms: 60000,
    failure_bucket: null,
  };
  const gatlingFile = join(RAW, 'gatling', RUNS[0].runId, 'summary.json');
  writeJson(gatlingFile, gatling);
  written.push(gatlingFile);

  return written;
}

if (require.main === module) {
  const files = run();
  // eslint-disable-next-line no-console
  console.log(`# ${SAMPLE_TAG}`);
  for (const f of files) {
    // eslint-disable-next-line no-console
    console.log(`sample written: ${f}`);
  }
}
