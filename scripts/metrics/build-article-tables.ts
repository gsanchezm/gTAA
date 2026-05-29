/**
 * build-article-tables.ts
 *
 * Produces the two human/machine roll-ups:
 *   - metrics/summary/article_tables.md      (markdown: coverage, durations,
 *     api, visual, performance, failure buckets)
 *   - metrics/summary/experiment_summary.json (machine roll-up incl
 *     architecture_type, batch, totals, pass_rate)
 *
 * Derives everything from the raw streams + feature files via the shared libs,
 * so it is self-contained and deterministic. Empty-input safe: tables render
 * with headers and "(no data)" placeholders; the JSON reports zeroed totals.
 * Run: tsx scripts/metrics/build-article-tables.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RAW, REPO_ROOT, SUMMARY, percentile, readJsonlDir, round, writeJson, writeText } from './lib/io';
import { ARCHITECTURE_TYPE, generatedAt, scriptIdentity } from './lib/identity';
import { normalizeStatus, num } from './lib/metrics-common';
import { readFeatureDir } from './lib/feature-parser';
import { COVERAGE_PLATFORMS, coverageFromTags } from './lib/platform-tags';
import { collapseToScenarios, loadTelemetry } from './lib/telemetry-load';

const FEATURES_DIR = join(REPO_ROOT, 'src', 'gtaa', 'test-generation', 'features');

function mdTable(headers: string[], rows: Array<Array<string | number>>): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  if (rows.length === 0) {
    const empty = `| ${headers.map(() => '(no data)').join(' | ')} |`;
    return [head, sep, empty].join('\n');
  }
  const body = rows.map((r) => `| ${r.map((c) => String(c)).join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

function loadGatling(): Record<string, unknown>[] {
  const dir = join(RAW, 'gatling');
  if (!existsSync(dir)) return [];
  const out: Record<string, unknown>[] = [];
  for (const name of readdirSync(dir)) {
    const sub = join(dir, name);
    try {
      if (!statSync(sub).isDirectory()) continue;
    } catch {
      continue;
    }
    const file = join(sub, 'summary.json');
    if (!existsSync(file)) continue;
    try {
      out.push(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function run(): { md: string; json: string } {
  const id = scriptIdentity();
  const generated = generatedAt();

  // ---- coverage ----
  const scenarios = readFeatureDir(FEATURES_DIR);
  const coverageTotals: Record<string, number> = Object.fromEntries(
    COVERAGE_PLATFORMS.map((p) => [p, 0]),
  );
  for (const s of scenarios) {
    const cov = coverageFromTags(s.tags);
    for (const p of COVERAGE_PLATFORMS) if (cov[p]) coverageTotals[p] += 1;
  }
  const coverageRows: Array<Array<string | number>> = COVERAGE_PLATFORMS.map((p) => [
    p,
    coverageTotals[p],
    scenarios.length,
  ]);

  // ---- durations (scenario-level) ----
  const tele = collapseToScenarios(loadTelemetry());
  const allDurations = tele
    .map((e) => num(e.duration_ms))
    .filter((d): d is number => d !== '');
  const durationsRows: Array<Array<string | number>> =
    allDurations.length === 0
      ? []
      : [
          ['count', allDurations.length],
          ['p50_ms', round(percentile(allDurations, 50)) ?? ''],
          ['p95_ms', round(percentile(allDurations, 95)) ?? ''],
          ['p99_ms', round(percentile(allDurations, 99)) ?? ''],
          ['mean_ms', round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length) ?? ''],
          ['min_ms', round(Math.min(...allDurations)) ?? ''],
          ['max_ms', round(Math.max(...allDurations)) ?? ''],
        ];

  // ---- api ----
  const api = readJsonlDir<Record<string, unknown>>(join(RAW, 'api'));
  const apiPass = api.filter((r) => normalizeStatus(r.status) === 'PASS').length;
  const apiRows: Array<Array<string | number>> = api.map((r) => [
    String(r.endpoint_id ?? ''),
    String(r.method ?? ''),
    String(r.path ?? ''),
    num(r.response_status) === '' ? 'NOT_AVAILABLE' : num(r.response_status),
    num(r.response_time_ms) === '' ? 'NOT_AVAILABLE' : num(r.response_time_ms),
    normalizeStatus(r.status),
  ]);

  // ---- visual ----
  const visual = readJsonlDir<Record<string, unknown>>(join(RAW, 'visual'));
  const visualPass = visual.filter((r) => normalizeStatus(r.status) === 'PASS').length;
  const visualRows: Array<Array<string | number>> = visual.map((r) => [
    String(r.snapshot_id ?? ''),
    String(r.platform ?? ''),
    String(r.viewport ?? ''),
    num(r.diff_pixels) === '' ? 'NOT_AVAILABLE' : num(r.diff_pixels),
    num(r.diff_ratio) === '' ? 'NOT_AVAILABLE' : num(r.diff_ratio),
    normalizeStatus(r.status),
  ]);

  // ---- performance ----
  const gatling = loadGatling();
  const perfRows: Array<Array<string | number>> = gatling.map((r) => [
    String(r.simulation_name ?? ''),
    num(r.request_count) === '' ? 'NOT_AVAILABLE' : num(r.request_count),
    num(r.failure_count) === '' ? 'NOT_AVAILABLE' : num(r.failure_count),
    num(r.p95_response_time_ms) === '' ? 'NOT_AVAILABLE' : num(r.p95_response_time_ms),
    normalizeStatus(r.threshold_status),
  ]);

  // ---- failure buckets ----
  const bucketCounts = new Map<string, number>();
  const countBucket = (fb: unknown) => {
    if (fb == null || fb === '') return;
    const key = String(fb);
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  };
  for (const e of loadTelemetry()) countBucket(e.failure_bucket);
  for (const r of api) countBucket(r.failure_bucket);
  for (const r of visual) countBucket(r.failure_bucket);
  for (const r of gatling) countBucket(r.failure_bucket);
  const bucketRows: Array<Array<string | number>> = [...bucketCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([b, n]) => [b, n]);

  // ---- pass-rate roll-up (scenario telemetry) ----
  const scenarioStatuses = tele.map((e) => e.status);
  const passCount = scenarioStatuses.filter((s) => s === 'PASS').length;
  const totalScenarios = scenarioStatuses.length;
  const passRate = totalScenarios === 0 ? null : round((passCount / totalScenarios) * 100, 2);

  // ---- markdown ----
  const md = [
    '# gTAA Baseline — Article Tables',
    '',
    `architecture_type: ${ARCHITECTURE_TYPE}`,
    `experiment_batch_id: ${id.experiment_batch_id}`,
    `run_index: ${id.run_index}`,
    `generated_at: ${generated}`,
    '',
    '## Platform Coverage Matrix',
    '',
    mdTable(['platform', 'scenarios_covered', 'total_scenarios'], coverageRows),
    '',
    '## Scenario Durations (aggregate)',
    '',
    mdTable(['metric', 'value'], durationsRows),
    '',
    '## API Isolated Results',
    '',
    `Pass: ${apiPass} / ${api.length}`,
    '',
    mdTable(
      ['endpoint_id', 'method', 'path', 'response_status', 'response_time_ms', 'status'],
      apiRows,
    ),
    '',
    '## Visual Comparison Results',
    '',
    `Pass: ${visualPass} / ${visual.length}`,
    '',
    mdTable(['snapshot_id', 'platform', 'viewport', 'diff_pixels', 'diff_ratio', 'status'], visualRows),
    '',
    '## Performance Summary',
    '',
    mdTable(
      ['simulation_name', 'request_count', 'failure_count', 'p95_response_time_ms', 'threshold_status'],
      perfRows,
    ),
    '',
    '## Failure Buckets',
    '',
    mdTable(['failure_bucket', 'count'], bucketRows),
    '',
  ].join('\n');

  const mdOut = join(SUMMARY, 'article_tables.md');
  writeText(mdOut, md);

  // ---- machine summary ----
  const summary = {
    architecture_type: ARCHITECTURE_TYPE,
    repository_name: id.repository_name,
    experiment_batch_id: id.experiment_batch_id,
    run_index: id.run_index,
    generated_at: generated,
    totals: {
      scenarios_in_features: scenarios.length,
      scenario_telemetry_events: totalScenarios,
      scenarios_passed: passCount,
      api_events: api.length,
      api_passed: apiPass,
      visual_events: visual.length,
      visual_passed: visualPass,
      performance_simulations: gatling.length,
      failure_events: [...bucketCounts.values()].reduce((a, b) => a + b, 0),
    },
    pass_rate_pct: passRate === null ? 'NOT_AVAILABLE' : passRate,
    coverage_by_platform: coverageTotals,
    failure_buckets: Object.fromEntries(bucketRows),
  };
  const jsonOut = join(SUMMARY, 'experiment_summary.json');
  writeJson(jsonOut, summary);

  return { md: mdOut, json: jsonOut };
}

if (require.main === module) {
  const files = run();
  // eslint-disable-next-line no-console
  console.log(`article_tables.md written: ${files.md}`);
  // eslint-disable-next-line no-console
  console.log(`experiment_summary.json written: ${files.json}`);
}
