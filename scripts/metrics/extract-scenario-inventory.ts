/**
 * extract-scenario-inventory.ts
 *
 * Reads every src/gtaa/test-generation/features/*.feature and emits one row per
 * scenario / scenario outline to metrics/processed/scenario_inventory.csv.
 *
 * Deterministic (rows sorted by featureFile, then scenarioName) and safe on an
 * empty features dir (writes header only). Run: tsx scripts/metrics/extract-scenario-inventory.ts
 */
import { join } from 'node:path';
import { PROCESSED, REPO_ROOT, writeCsv } from './lib/io';
import { generatedAt, scriptIdentity } from './lib/identity';
import { IDENTITY_COLUMNS, identityColumns } from './lib/metrics-common';
import { readFeatureDir } from './lib/feature-parser';

const FEATURES_DIR = join(
  REPO_ROOT,
  'src',
  'gtaa',
  'test-generation',
  'features',
);

const COLUMNS = [
  'featureFile',
  'featureName',
  'scenarioName',
  'scenarioType',
  'tags',
  'exampleRows',
  'stepCount',
  ...IDENTITY_COLUMNS,
  'generated_at',
];

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const scenarios = readFeatureDir(FEATURES_DIR).sort(
    (a, b) =>
      a.featureFile.localeCompare(b.featureFile) ||
      a.scenarioName.localeCompare(b.scenarioName),
  );

  const rows = scenarios.map((s) => ({
    featureFile: s.featureFile,
    featureName: s.featureName,
    scenarioName: s.scenarioName,
    scenarioType: s.scenarioType,
    tags: s.tags.join(' '),
    exampleRows: s.exampleRows,
    stepCount: s.stepCount,
    ...identityColumns(undefined, id),
    generated_at: generated,
  }));

  const out = join(PROCESSED, 'scenario_inventory.csv');
  writeCsv(out, COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`scenario_inventory.csv written: ${file}`);
}
