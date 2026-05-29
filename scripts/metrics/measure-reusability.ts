/**
 * measure-reusability.ts (§15.4)
 *
 * Emits metrics/processed/reusability_metrics.csv — repository-level reusability
 * metrics for the GTAA_BASELINE architecture. Quantifies how much scenarios,
 * Gherkin steps, contracts and test data are shared across the seven
 * platform/tool dimensions (desktop, responsive, android, ios, api,
 * performance, visual).
 *
 * Inputs:
 *  - metrics/processed/platform_coverage_matrix.csv (scenario x tool coverage)
 *  - src/gtaa/test-generation/features/*.feature      (Gherkin steps)
 *  - src/gtaa/test-generation/contracts/{locators,api,visual}/*.json
 *  - src/gtaa/test-generation/test-data/*             (shared data files)
 *
 * Data integrity: never fabricates. An uncomputable metric still emits a row
 * with metric_value=NOT_AVAILABLE. Deterministic (inputs sorted; no random /
 * Date except generatedAt()). Each metric is wrapped so one failure cannot abort
 * the whole file.
 *
 * Run: tsx scripts/metrics/measure-reusability.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESSED, REPO_ROOT, listFiles, readCsv, round } from './lib/io';
import {
  QUALITY_COLUMNS,
  generatedAt,
  qualityRow,
  scriptIdentity,
  type ScriptIdentity,
} from './lib/identity';
import { writeCsv } from './lib/io';

const CATEGORY = 'reusability';

// The seven platform/tool columns that act as the "tools" reuse dimensions.
const TOOL_COLUMNS = [
  'desktop',
  'responsive',
  'android',
  'ios',
  'api',
  'performance',
  'visual',
] as const;

const TEST_GENERATION = join(REPO_ROOT, 'src', 'gtaa', 'test-generation');
const FEATURES_DIR = join(TEST_GENERATION, 'features');
const CONTRACTS_DIR = join(TEST_GENERATION, 'contracts');
const LOCATORS_DIR = join(CONTRACTS_DIR, 'locators');
const API_DIR = join(CONTRACTS_DIR, 'api');
const VISUAL_DIR = join(CONTRACTS_DIR, 'visual');
const TEST_DATA_DIR = join(TEST_GENERATION, 'test-data');

const COVERAGE_FILE = 'platform_coverage_matrix.csv';

/** A cell counts as covered only for genuine truthy markers (not the literal "false"). */
function isTruthy(value: string | undefined): boolean {
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

interface Metric {
  name: string;
  unit: string;
  value: string | number | null;
  source: string;
}

export function run(): string {
  const id: ScriptIdentity = scriptIdentity();
  const generated = generatedAt();
  const metrics: Metric[] = [];

  // Load coverage once; reused by the coverage-based metrics.
  const coverage = safe(() => readCsv(join(PROCESSED, COVERAGE_FILE)), []);

  // --- scenario_reuse_ratio -------------------------------------------------
  metrics.push(
    safeMetric(
      'scenario_reuse_ratio',
      'ratio',
      COVERAGE_FILE,
      () => {
        const total = coverage.length;
        if (total === 0) return null;
        let reused = 0;
        for (const row of coverage) {
          const truthyCount = TOOL_COLUMNS.filter((c) => isTruthy(row[c])).length;
          const totalPlatforms = Number(row.totalPlatforms);
          const reusedByCount = Number.isFinite(totalPlatforms) ? totalPlatforms > 1 : false;
          if (truthyCount > 1 || reusedByCount) reused += 1;
        }
        return round(reused / total, 4);
      },
    ),
  );

  // --- feature_to_tool_coverage --------------------------------------------
  // Definition: executed = number of DISTINCT (featureFile, toolColumn) pairs
  // where at least one scenario of that feature is covered by that tool;
  // expected = (#distinct featureFiles) * 7. Distinct-pair keeps the value in
  // 0..1 (a sum of truthy cells would exceed 1 when features have many scenarios).
  metrics.push(
    safeMetric(
      'feature_to_tool_coverage',
      'ratio',
      `${COVERAGE_FILE} (executed=distinct (featureFile,toolColumn) covered pairs; expected=#featureFiles*7)`,
      () => {
        if (coverage.length === 0) return null;
        const features = new Set<string>();
        const pairs = new Set<string>();
        for (const row of coverage) {
          const f = String(row.featureFile ?? '');
          if (f) features.add(f);
          for (const c of TOOL_COLUMNS) {
            if (isTruthy(row[c])) pairs.add(`${f}::${c}`);
          }
        }
        const expected = features.size * TOOL_COLUMNS.length;
        if (expected === 0) return null;
        return round(pairs.size / expected, 4);
      },
    ),
  );

  // --- shared_step_reuse_count ---------------------------------------------
  // Distinct normalized Gherkin step texts (keyword stripped, lowercased,
  // whitespace collapsed) that appear in MORE THAN ONE scenario across all
  // features. Counted by distinct step text, not total occurrences.
  metrics.push(
    safeMetric(
      'shared_step_reuse_count',
      'count',
      'src/gtaa/test-generation/features/*.feature (distinct normalized steps in >1 scenario)',
      () => countSharedSteps(),
    ),
  );

  // --- contract reuse counts ------------------------------------------------
  const locatorCount = safe(() => listFiles(LOCATORS_DIR, '.json').length, null);
  const apiCount = safe(() => listFiles(API_DIR, '.json').length, null);
  const visualCount = safe(() => listFiles(VISUAL_DIR, '.json').length, null);

  // shared_contract_reuse_count: total contract JSON files across the three
  // dirs. The single scenario set reuses each contract across multiple
  // platforms/tools, so every contract file is a shared/reused asset.
  metrics.push(
    safeMetric(
      'shared_contract_reuse_count',
      'count',
      'src/gtaa/test-generation/contracts/{locators,api,visual}/*.json (total contract files, each shared across platforms)',
      () => {
        if (locatorCount === null && apiCount === null && visualCount === null) return null;
        return (locatorCount ?? 0) + (apiCount ?? 0) + (visualCount ?? 0);
      },
    ),
  );

  metrics.push({
    name: 'locator_contract_reuse_count',
    unit: 'count',
    value: locatorCount,
    source: 'src/gtaa/test-generation/contracts/locators/*.json',
  });
  metrics.push({
    name: 'api_contract_reuse_count',
    unit: 'count',
    value: apiCount,
    source: 'src/gtaa/test-generation/contracts/api/*.json',
  });
  metrics.push({
    name: 'visual_contract_reuse_count',
    unit: 'count',
    value: visualCount,
    source: 'src/gtaa/test-generation/contracts/visual/*.json',
  });

  // --- test_data_reuse_count ------------------------------------------------
  // Number of top-level files under test-data/ (shared fixtures reused across
  // scenarios/platforms).
  metrics.push(
    safeMetric(
      'test_data_reuse_count',
      'count',
      'src/gtaa/test-generation/test-data/* (top-level data files)',
      () => {
        if (!existsSync(TEST_DATA_DIR)) return null;
        return readdirSync(TEST_DATA_DIR).filter((n) => {
          try {
            return statSync(join(TEST_DATA_DIR, n)).isFile();
          } catch {
            return false;
          }
        }).length;
      },
    ),
  );

  const rows = metrics.map((m) =>
    qualityRow(
      id,
      {
        metric_category: CATEGORY,
        metric_name: m.name,
        metric_value: m.value,
        metric_unit: m.unit,
        source_file: m.source,
        tool_name: 'ALL',
        platform: 'ALL',
      },
      generated,
    ),
  );

  const out = join(PROCESSED, 'reusability_metrics.csv');
  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

/** Count distinct normalized step texts that appear in more than one scenario. */
function countSharedSteps(): number | null {
  if (!existsSync(FEATURES_DIR)) return null;
  const files = readdirSync(FEATURES_DIR)
    .filter((n) => n.endsWith('.feature'))
    .sort();

  const stepKeywords = ['given ', 'when ', 'then ', 'and ', 'but ', '* '];
  // Map normalized step text -> set of scenario keys it appears in.
  const stepToScenarios = new Map<string, Set<string>>();

  for (const name of files) {
    let text: string;
    try {
      text = readFileSync(join(FEATURES_DIR, name), 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    let scenarioIndex = -1;
    let scenarioKey = '';
    for (const raw of lines) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      if (
        line.startsWith('Scenario:') ||
        line.startsWith('Scenario Outline:') ||
        line.startsWith('Scenario Template:')
      ) {
        scenarioIndex += 1;
        scenarioKey = `${name}#${scenarioIndex}`;
        continue;
      }
      if (line.startsWith('Background:')) {
        scenarioIndex += 1;
        scenarioKey = `${name}#bg${scenarioIndex}`;
        continue;
      }
      const lower = line.toLowerCase();
      const kw = stepKeywords.find((k) => lower.startsWith(k));
      if (!kw || !scenarioKey) continue;
      const stepText = line
        .slice(kw.length)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (!stepText) continue;
      let set = stepToScenarios.get(stepText);
      if (!set) {
        set = new Set<string>();
        stepToScenarios.set(stepText, set);
      }
      set.add(scenarioKey);
    }
  }

  let shared = 0;
  for (const scenarios of stepToScenarios.values()) {
    if (scenarios.size > 1) shared += 1;
  }
  return shared;
}

/** Run a producer, returning the fallback on any throw (never crash the file). */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Build a Metric, degrading to NOT_AVAILABLE (null) if the producer throws. */
function safeMetric(
  name: string,
  unit: string,
  source: string,
  fn: () => string | number | null,
): Metric {
  let value: string | number | null;
  try {
    value = fn();
  } catch {
    value = null;
  }
  return { name, unit, value, source };
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`reusability_metrics.csv written: ${file}`);
}
