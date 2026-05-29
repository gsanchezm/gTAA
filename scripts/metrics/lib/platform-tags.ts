/**
 * Maps Gherkin tags to the coverage platform columns used in the article tables.
 * The platform vocabulary mirrors the foundation Platform type plus the
 * test-type axes (performance, visual) tracked for coverage parity.
 *
 * Tag matching is case-insensitive and tolerant of common aliases so a missing
 * or differently-spelled tag never silently drops coverage.
 */
export const COVERAGE_PLATFORMS = [
  'desktop',
  'responsive',
  'android',
  'ios',
  'api',
  'performance',
  'visual',
] as const;

export type CoveragePlatform = (typeof COVERAGE_PLATFORMS)[number];

/** Alias tag (without leading @, lowercased) -> coverage platform column. */
const ALIASES: Record<string, CoveragePlatform> = {
  desktop: 'desktop',
  web: 'desktop',
  responsive: 'responsive',
  mobileweb: 'responsive',
  'mobile-web': 'responsive',
  android: 'android',
  ios: 'ios',
  api: 'api',
  performance: 'performance',
  perf: 'performance',
  gatling: 'performance',
  load: 'performance',
  visual: 'visual',
  pixelmatch: 'visual',
  snapshot: 'visual',
};

/** Derive the boolean coverage map for a scenario from its tags. */
export function coverageFromTags(tags: string[]): Record<CoveragePlatform, boolean> {
  const map: Record<CoveragePlatform, boolean> = {
    desktop: false,
    responsive: false,
    android: false,
    ios: false,
    api: false,
    performance: false,
    visual: false,
  };
  for (const tag of tags) {
    const key = tag.replace(/^@/, '').toLowerCase();
    const platform = ALIASES[key];
    if (platform) map[platform] = true;
  }
  return map;
}

/** Count the number of platforms covered. */
export function totalPlatforms(map: Record<CoveragePlatform, boolean>): number {
  return COVERAGE_PLATFORMS.reduce((acc, p) => acc + (map[p] ? 1 : 0), 0);
}
