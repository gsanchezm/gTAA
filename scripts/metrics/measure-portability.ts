/**
 * measure-portability.ts
 *
 * Emits metrics/processed/portability_metrics.csv — repo-level portability
 * quality metrics for the gTAA baseline (§15.8). Every metric is emitted as one
 * QUALITY_COLUMNS row; an uncomputable metric still emits a row with
 * metric_value=NOT_AVAILABLE and the method/reason packed into source_file (the
 * schema has no separate note column). 0 is a valid value when the input exists
 * but the genuine count is zero.
 *
 * Deterministic and crash-safe: each metric is wrapped in its own try/catch so a
 * single failing metric degrades to NOT_AVAILABLE without aborting the file.
 *
 * Run: npx tsx scripts/metrics/measure-portability.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESSED, REPO_ROOT, readCsv, round, writeCsv } from './lib/io';
import {
  QUALITY_COLUMNS,
  generatedAt,
  qualityRow,
  scriptIdentity,
  type QualityMetricRow,
} from './lib/identity';

const CATEGORY = 'portability';

/** The 6 declared tools and how to detect their executor on disk. */
const TOOL_DETECTORS: Array<{ tool: string; check: () => boolean }> = [
  { tool: 'playwright', check: () => execFileExists('playwright') },
  { tool: 'appium-android', check: () => execFileExists('appium', 'appium-android-executor.ts') },
  { tool: 'appium-ios', check: () => execFileExists('appium', 'appium-ios-executor.ts') },
  { tool: 'api', check: () => execFileExists('api') },
  { tool: 'gatling', check: () => execFileExists('gatling') },
  { tool: 'pixelmatch', check: () => execFileExists('pixelmatch') },
];

const EXEC_ROOT = join(REPO_ROOT, 'src', 'gtaa', 'test-execution');

/** True when the tool's executor dir exists (and, if given, a specific file). */
function execFileExists(dir: string, file?: string): boolean {
  const d = join(EXEC_ROOT, dir);
  if (!existsSync(d)) return false;
  if (!file) return true;
  return existsSync(join(d, file));
}

/** Count of declared tools whose executor is present on disk (expect 6). */
function supportedToolCount(): number {
  return TOOL_DETECTORS.filter((t) => t.check()).length;
}

const PLATFORM_KEYS = ['web', 'mobile', 'android', 'ios', 'desktop', 'responsive'];

/**
 * Walk contracts/locators/*.json and count leaf locators that define MORE THAN
 * ONE platform-keyed variant (web/mobile/android/ios/desktop/responsive),
 * counting nested variants (e.g. web.{desktop,responsive}, mobile.{android,ios}).
 * A locator with a single platform variant is not platform-divergent.
 */
function platformSpecificLocatorCount(): { count: number; total: number } {
  const dir = join(REPO_ROOT, 'src', 'gtaa', 'test-generation', 'contracts', 'locators');
  let total = 0;
  let multi = 0;
  if (!existsSync(dir)) return { count: 0, total: 0 };
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    for (const loc of Object.values(obj)) {
      total += 1;
      if (!loc || typeof loc !== 'object' || Array.isArray(loc)) continue;
      const entry = loc as Record<string, unknown>;
      let variants = 0;
      for (const k of Object.keys(entry)) {
        if (!PLATFORM_KEYS.includes(k)) continue;
        const v = entry[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          variants += Object.keys(v as Record<string, unknown>).filter((kk) =>
            PLATFORM_KEYS.includes(kk),
          ).length;
        } else {
          variants += 1;
        }
      }
      if (variants > 1) multi += 1;
    }
  }
  return { count: multi, total };
}

/** Recursively collect file paths under a dir. */
function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

/**
 * Count source files that encode a platform: every file under
 * test-execution/appium/ plus any other file whose basename matches android/ios.
 */
function platformSpecificCodeCount(): number {
  const set = new Set<string>();
  for (const f of walkFiles(join(EXEC_ROOT, 'appium'))) set.add(f);
  for (const f of walkFiles(join(REPO_ROOT, 'src'))) {
    if (/android|ios/i.test(f.replace(/\\/g, '/').split('/').pop() ?? '')) set.add(f);
  }
  return set.size;
}

/** Count of declared config keys in .env.example (the environment config surface). */
function environmentConfigCount(): number {
  const p = join(REPO_ROOT, '.env.example');
  if (!existsSync(p)) return 0;
  const text = readFileSync(p, 'utf8');
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) n += 1;
  }
  return n;
}

/** Tools that have at least one successful status-bearing result. */
function successAndFailureTools(): {
  success: Set<string>;
  withResults: Set<string>;
  hasData: boolean;
} {
  const success = new Set<string>();
  const withResults = new Set<string>();

  const api = readCsv(join(PROCESSED, 'api_isolated_results.csv'));
  for (const r of api) {
    withResults.add('api');
    if (String(r.status).toUpperCase() === 'PASS') success.add('api');
  }
  const visual = readCsv(join(PROCESSED, 'visual_comparison_results.csv'));
  for (const r of visual) {
    withResults.add('pixelmatch');
    if (String(r.status).toUpperCase() === 'PASS') success.add('pixelmatch');
  }
  const perf = readCsv(join(PROCESSED, 'performance_summary.csv'));
  for (const r of perf) {
    withResults.add('gatling');
    const s = String(r.threshold_status).toUpperCase();
    if (s === 'PASS' || s === 'OK') success.add('gatling');
  }

  const hasData = api.length + visual.length + perf.length > 0;
  return { success, withResults, hasData };
}

/** Coverage matrix: truthy platform cells / (scenarios * 7) * 100. */
function platformCoveragePercentage(): {
  pct: number | null;
  truthy: number;
  scenarios: number;
  hasData: boolean;
} {
  const rows = readCsv(join(PROCESSED, 'platform_coverage_matrix.csv'));
  if (rows.length === 0) return { pct: null, truthy: 0, scenarios: 0, hasData: false };
  const dims = ['desktop', 'responsive', 'android', 'ios', 'api', 'performance', 'visual'];
  let truthy = 0;
  for (const r of rows) {
    for (const d of dims) {
      const v = String(r[d] ?? '')
        .trim()
        .toLowerCase();
      if (v && v !== 'false' && v !== '0' && v !== 'no') truthy += 1;
    }
  }
  const expected = rows.length * dims.length;
  return {
    pct: round((truthy / expected) * 100, 2),
    truthy,
    scenarios: rows.length,
    hasData: true,
  };
}

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const partials: QualityMetricRow[] = [];

  const add = (r: QualityMetricRow) => partials.push(r);

  // supported_tool_count
  try {
    add({
      metric_category: CATEGORY,
      metric_name: 'supported_tool_count',
      metric_value: supportedToolCount(),
      metric_unit: 'count',
      source_file:
        'src/gtaa/test-execution/{playwright,appium(android+ios),api,gatling,pixelmatch} | method=executor presence; appium counts android+ios separately',
    });
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'supported_tool_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: 'src/gtaa/test-execution | error inspecting executor dirs',
    });
  }

  // success/failed tool counts (shared computation)
  try {
    const { success, withResults, hasData } = successAndFailureTools();
    if (!hasData) {
      add({
        metric_category: CATEGORY,
        metric_name: 'successful_tool_count',
        metric_value: null,
        metric_unit: 'count',
        source_file: 'metrics/processed/{api_isolated,visual_comparison,performance_summary} | no run results locally',
      });
      add({
        metric_category: CATEGORY,
        metric_name: 'failed_tool_count',
        metric_value: null,
        metric_unit: 'count',
        source_file: 'metrics/processed/{api_isolated,visual_comparison,performance_summary} | no run results locally',
      });
    } else {
      const failed = [...withResults].filter((t) => !success.has(t));
      add({
        metric_category: CATEGORY,
        metric_name: 'successful_tool_count',
        metric_value: success.size,
        metric_unit: 'count',
        source_file: `metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv | tools with >=1 PASS: ${[...success].sort().join('+') || 'none'}`,
      });
      add({
        metric_category: CATEGORY,
        metric_name: 'failed_tool_count',
        metric_value: failed.length,
        metric_unit: 'count',
        source_file: `metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv | tools with results but no PASS: ${failed.sort().join('+') || 'none'}`,
      });
    }
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'successful_tool_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: 'metrics/processed result CSVs | error',
    });
    add({
      metric_category: CATEGORY,
      metric_name: 'failed_tool_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: 'metrics/processed result CSVs | error',
    });
  }

  // platform_coverage_percentage
  try {
    const cov = platformCoveragePercentage();
    if (!cov.hasData) {
      add({
        metric_category: CATEGORY,
        metric_name: 'platform_coverage_percentage',
        metric_value: null,
        metric_unit: 'percent',
        source_file: 'metrics/processed/platform_coverage_matrix.csv | empty/missing',
      });
    } else {
      add({
        metric_category: CATEGORY,
        metric_name: 'platform_coverage_percentage',
        metric_value: cov.pct,
        metric_unit: 'percent',
        source_file: `metrics/processed/platform_coverage_matrix.csv | truthy_cells=${cov.truthy} / expected=(scenarios=${cov.scenarios} x 7 dims)=${cov.scenarios * 7}`,
      });
    }
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'platform_coverage_percentage',
      metric_value: null,
      metric_unit: 'percent',
      source_file: 'metrics/processed/platform_coverage_matrix.csv | error',
    });
  }

  // environment_specific_config_count
  try {
    add({
      metric_category: CATEGORY,
      metric_name: 'environment_specific_config_count',
      metric_value: environmentConfigCount(),
      metric_unit: 'count',
      source_file: '.env.example | method=count of KEY= configuration entries (environment config surface)',
    });
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'environment_specific_config_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: '.env.example | error',
    });
  }

  // platform_specific_locator_count
  try {
    const loc = platformSpecificLocatorCount();
    add({
      metric_category: CATEGORY,
      metric_name: 'platform_specific_locator_count',
      metric_value: loc.count,
      metric_unit: 'count',
      source_file: `src/gtaa/test-generation/contracts/locators/*.json | method=leaf locators with >1 platform variant (web/mobile/android/ios/desktop/responsive); of ${loc.total} total locators`,
    });
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'platform_specific_locator_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: 'src/gtaa/test-generation/contracts/locators/*.json | error',
    });
  }

  // platform_specific_code_count
  try {
    add({
      metric_category: CATEGORY,
      metric_name: 'platform_specific_code_count',
      metric_value: platformSpecificCodeCount(),
      metric_unit: 'count',
      source_file: 'src/gtaa/test-execution/appium/* U src/**/*{android,ios}* | method=files under appium executor dir plus any file whose name encodes android/ios',
    });
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'platform_specific_code_count',
      metric_value: null,
      metric_unit: 'count',
      source_file: 'src/gtaa/test-execution | error',
    });
  }

  // successful_platform_matrix_percentage
  try {
    const { hasData } = successAndFailureTools();
    // Sparse status-bearing result rows cannot be mapped onto the full
    // scenario x tool matrix, so a per-cell success rate is not computable.
    add({
      metric_category: CATEGORY,
      metric_name: 'successful_platform_matrix_percentage',
      metric_value: null,
      metric_unit: 'percent',
      source_file: hasData
        ? 'metrics/processed result CSVs | result rows are not keyed to scenario x tool matrix cells; per-cell success rate not computable'
        : 'metrics/processed result CSVs | no execution data locally',
    });
  } catch {
    add({
      metric_category: CATEGORY,
      metric_name: 'successful_platform_matrix_percentage',
      metric_value: null,
      metric_unit: 'percent',
      source_file: 'metrics/processed result CSVs | error',
    });
  }

  const rows = partials
    .map((p) => qualityRow(id, p, generated))
    .sort((a, b) => String(a.metric_name).localeCompare(String(b.metric_name)));

  const out = join(PROCESSED, 'portability_metrics.csv');
  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`portability_metrics.csv written: ${file}`);
}
