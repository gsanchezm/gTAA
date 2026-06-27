/**
 * measure-interoperability.ts
 *
 * Emits metrics/processed/interoperability_metrics.csv — repo-level
 * interoperability quality metrics for the gTAA baseline (§15.9). Oracle types:
 * API, UI_WEB, UI_MOBILE, VISUAL_WEB, VISUAL_MOBILE, PERFORMANCE.
 *
 * Every metric is one QUALITY_COLUMNS row; uncomputable metrics still emit a row
 * with metric_value=NOT_AVAILABLE and the method/reason packed into source_file
 * (the schema has no separate note column). 0 is a valid value when input exists
 * but the genuine count is zero. Deterministic and crash-safe (per-metric
 * try/catch).
 *
 * Run: npx tsx scripts/metrics/measure-interoperability.ts
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESSED, REPO_ROOT, listFiles, readCsv, writeCsv } from './lib/io';
import { isAnalysisExcludedSnapshot } from './lib/excluded-snapshots';
import {
  QUALITY_COLUMNS,
  generatedAt,
  qualityRow,
  scriptIdentity,
  type QualityMetricRow,
} from './lib/identity';

const CATEGORY = 'interoperability';

const EXEC_ROOT = join(REPO_ROOT, 'src', 'gtaa', 'test-execution');
const CONTRACTS = join(REPO_ROOT, 'src', 'gtaa', 'test-generation', 'contracts');

function dirExists(...parts: string[]): boolean {
  return existsSync(join(EXEC_ROOT, ...parts));
}
function fileExists(path: string): boolean {
  return existsSync(path);
}

/** The 6 declared tools, detected by executor presence (expect 6). */
function toolCount(): number {
  const checks = [
    dirExists('playwright'),
    fileExists(join(EXEC_ROOT, 'appium', 'appium-android-executor.ts')),
    fileExists(join(EXEC_ROOT, 'appium', 'appium-ios-executor.ts')),
    dirExists('api'),
    dirExists('gatling'),
    dirExists('pixelmatch'),
  ];
  return checks.filter(Boolean).length;
}

/** Availability of each oracle type from executor + contract presence. */
function oracleAvailability(): {
  api: boolean;
  ui_web: boolean;
  ui_mobile: boolean;
  visual_web: boolean;
  visual_mobile: boolean;
  performance: boolean;
} {
  const apiExec = dirExists('api');
  const apiContracts = listFiles(join(CONTRACTS, 'api'), '.json').length > 0;
  const playwright = dirExists('playwright');
  const appiumAndroid = fileExists(join(EXEC_ROOT, 'appium', 'appium-android-executor.ts'));
  const appiumIos = fileExists(join(EXEC_ROOT, 'appium', 'appium-ios-executor.ts'));
  const pixelmatch = dirExists('pixelmatch');
  const visualContracts = listFiles(join(CONTRACTS, 'visual'), '.json').length > 0;
  const gatling = dirExists('gatling');

  return {
    api: apiExec && apiContracts,
    ui_web: playwright,
    ui_mobile: appiumAndroid || appiumIos,
    visual_web: pixelmatch && visualContracts,
    visual_mobile: pixelmatch && visualContracts,
    performance: gatling,
  };
}

const b = (v: boolean): number => (v ? 1 : 0);

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const partials: QualityMetricRow[] = [];
  const add = (r: QualityMetricRow) => partials.push(r);

  // tool_count
  try {
    add({
      metric_category: CATEGORY,
      metric_name: 'tool_count',
      metric_value: toolCount(),
      metric_unit: 'count',
      source_file:
        'src/gtaa/test-execution/{playwright,appium(android+ios),api,gatling,pixelmatch} | method=executor presence; appium counts android+ios separately',
    });
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'tool_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: 'src/gtaa/test-execution | error',
    });
  }

  // oracle availability + counts + compositions
  try {
    const a = oracleAvailability();

    // oracle_count: distinct oracle TYPES available (6 types)
    const typesAvailable =
      b(a.api) +
      b(a.ui_web) +
      b(a.ui_mobile) +
      b(a.visual_web) +
      b(a.visual_mobile) +
      b(a.performance);
    add({
      metric_category: CATEGORY,
      metric_name: 'oracle_count',
      metric_value: typesAvailable,
      metric_unit: 'count',
      source_file:
        'oracle types {API<-api+contracts/api, UI_WEB<-playwright, UI_MOBILE<-appium, VISUAL_WEB/VISUAL_MOBILE<-pixelmatch+contracts/visual, PERFORMANCE<-gatling} | count of available types',
    });

    add({
      metric_category: CATEGORY,
      metric_name: 'api_oracle_available',
      metric_value: b(a.api),
      metric_unit: 'boolean',
      source_file: 'src/gtaa/test-execution/api + src/gtaa/test-generation/contracts/api/*.json',
    });
    add({
      metric_category: CATEGORY,
      metric_name: 'ui_oracle_available',
      metric_value: b(a.ui_web || a.ui_mobile),
      metric_unit: 'boolean',
      source_file: 'src/gtaa/test-execution/{playwright,appium} | UI web and/or mobile executor present',
    });
    add({
      metric_category: CATEGORY,
      metric_name: 'visual_oracle_available',
      metric_value: b(a.visual_web || a.visual_mobile),
      metric_unit: 'boolean',
      source_file: 'src/gtaa/test-execution/pixelmatch + src/gtaa/test-generation/contracts/visual/*.json',
    });
    add({
      metric_category: CATEGORY,
      metric_name: 'performance_oracle_available',
      metric_value: b(a.performance),
      metric_unit: 'boolean',
      source_file: 'src/gtaa/test-execution/gatling',
    });

    // oracle_composition_count: of the 11 spec-listed compositions, count those
    // whose component oracles are all available.
    const compositions: Array<{ name: string; ok: boolean }> = [
      { name: 'API only', ok: a.api },
      { name: 'UI Web only', ok: a.ui_web },
      { name: 'UI Mobile only', ok: a.ui_mobile },
      { name: 'Visual Web only', ok: a.visual_web },
      { name: 'Visual Mobile only', ok: a.visual_mobile },
      { name: 'Performance only', ok: a.performance },
      { name: 'API->UI Web', ok: a.api && a.ui_web },
      { name: 'API->UI Mobile', ok: a.api && a.ui_mobile },
      { name: 'API->Visual Web', ok: a.api && a.visual_web },
      { name: 'API->Visual Mobile', ok: a.api && a.visual_mobile },
      { name: 'API->UI->Visual', ok: a.api && (a.ui_web || a.ui_mobile) && (a.visual_web || a.visual_mobile) },
    ];
    const supported = compositions.filter((c) => c.ok);
    add({
      metric_category: CATEGORY,
      metric_name: 'oracle_composition_count',
      metric_value: supported.length,
      metric_unit: 'count',
      source_file: `architecture-supported compositions (component oracles all available) of 11 spec-listed; supported=${supported.length}`,
    });
  } catch {
    for (const name of [
      'oracle_count',
      'api_oracle_available',
      'ui_oracle_available',
      'visual_oracle_available',
      'performance_oracle_available',
      'oracle_composition_count',
    ]) {
      add({
        metric_category: CATEGORY,
        metric_name: name,
        metric_value: null,
        metric_unit: name.endsWith('_available') ? 'boolean' : 'count',
        source_file: 'src/gtaa | error inspecting executors/contracts',
      });
    }
  }

  // successful_oracle_composition_count: single-oracle compositions with PASS
  // execution evidence. No multi-oracle chaining evidence exists locally.
  try {
    const api = readCsv(join(PROCESSED, 'api_isolated_results.csv'));
    // Exclude documented confounds (TV-1) uniformly wherever visual results are read.
    const visual = readCsv(join(PROCESSED, 'visual_comparison_results.csv')).filter(
      (r) => !isAnalysisExcludedSnapshot(r.snapshot_id),
    );
    const perf = readCsv(join(PROCESSED, 'performance_summary.csv'));
    const hasData = api.length + visual.length + perf.length > 0;

    if (!hasData) {
      add({
        metric_category: CATEGORY,
        metric_name: 'successful_oracle_composition_count',
        metric_value: null,
        metric_unit: 'count',
        source_file: 'metrics/processed result CSVs | no execution evidence locally',
      });
    } else {
      const exercised = new Set<string>();
      if (api.some((r) => String(r.status).toUpperCase() === 'PASS')) exercised.add('API only');
      if (visual.some((r) => String(r.status).toUpperCase() === 'PASS')) {
        // visual results carry platform; treat web/desktop+responsive as Visual Web
        const anyWeb = visual.some(
          (r) =>
            String(r.status).toUpperCase() === 'PASS' &&
            ['desktop', 'responsive', 'web'].includes(String(r.platform).toLowerCase()),
        );
        const anyMobile = visual.some(
          (r) =>
            String(r.status).toUpperCase() === 'PASS' &&
            ['android', 'ios', 'mobile'].includes(String(r.platform).toLowerCase()),
        );
        if (anyWeb) exercised.add('Visual Web only');
        if (anyMobile) exercised.add('Visual Mobile only');
      }
      if (
        perf.some((r) => {
          const s = String(r.threshold_status).toUpperCase();
          return s === 'PASS' || s === 'OK';
        })
      ) {
        exercised.add('Performance only');
      }
      add({
        metric_category: CATEGORY,
        metric_name: 'successful_oracle_composition_count',
        metric_value: exercised.size,
        metric_unit: 'count',
        source_file: `metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv | single-oracle compositions with PASS evidence: ${[...exercised].sort().join('; ') || 'none'}; no multi-oracle chaining evidence`,
      });
    }
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'successful_oracle_composition_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: 'metrics/processed result CSVs | error',
    });
  }

  const rows = partials
    .map((p) => qualityRow(id, p, generated))
    .sort((a, b2) => String(a.metric_name).localeCompare(String(b2.metric_name)));

  const out = join(PROCESSED, 'interoperability_metrics.csv');
  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`interoperability_metrics.csv written: ${file}`);
}
