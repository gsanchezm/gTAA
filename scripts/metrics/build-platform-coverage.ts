/**
 * build-platform-coverage.ts
 *
 * Derives, per scenario, which platforms/test-types it covers (from its Gherkin
 * tags) and writes metrics/processed/platform_coverage_matrix.csv.
 *
 * Deterministic and empty-input safe. Run: tsx scripts/metrics/build-platform-coverage.ts
 */
import { join } from 'node:path';
import { PROCESSED, REPO_ROOT, writeCsv } from './lib/io';
import { generatedAt, scriptIdentity } from './lib/identity';
import { IDENTITY_COLUMNS, identityColumns } from './lib/metrics-common';
import { readFeatureDir } from './lib/feature-parser';
import { COVERAGE_PLATFORMS, coverageFromTags, totalPlatforms } from './lib/platform-tags';

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
  ...COVERAGE_PLATFORMS,
  'totalPlatforms',
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

  const rows = scenarios.map((s) => {
    const cov = coverageFromTags(s.tags);
    return {
      featureFile: s.featureFile,
      featureName: s.featureName,
      scenarioName: s.scenarioName,
      ...Object.fromEntries(COVERAGE_PLATFORMS.map((p) => [p, cov[p]])),
      totalPlatforms: totalPlatforms(cov),
      ...identityColumns(undefined, id),
      generated_at: generated,
    };
  });

  const out = join(PROCESSED, 'platform_coverage_matrix.csv');
  writeCsv(out, COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`platform_coverage_matrix.csv written: ${file}`);
}
