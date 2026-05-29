/**
 * measure-modifiability.ts  (§15.2)
 *
 * Emits metrics/processed/modifiability_metrics.csv — one row per modifiability
 * metric for the gTAA baseline, in the canonical 15-column quality format.
 *
 * Source: a git diff between an optional baseline ref (env GTAA_DIFF_BASE) and
 * HEAD, classified per gTAA layer. When no baseline is available (env unset, or
 * fewer than 2 commits, or git fails) every metric degrades to NOT_AVAILABLE
 * with an explanatory note — the script never throws.
 *
 * loc_modified convention: min(added, deleted) per the spec (a conservative
 * proxy for in-place edits, less misleading than added+deleted).
 *
 * Run: tsx scripts/metrics/measure-modifiability.ts
 */
import { join } from 'node:path';
import { PROCESSED, round, writeCsv } from './lib/io';
import {
  generatedAt,
  QUALITY_COLUMNS,
  qualityRow,
  scriptIdentity,
  type ScriptIdentity,
} from './lib/identity';
import { commitCount, diffNumstat, type NumstatEntry } from './lib/git-evidence';

const CATEGORY = 'modifiability';

type Layer =
  | 'core'
  | 'execution_layer'
  | 'adapter'
  | 'reporting'
  | 'configuration'
  | 'other';

/**
 * Classify a (forward-slash) path into a gTAA layer. First match wins, so the
 * order below encodes precedence for overlapping prefixes. The reporting and
 * adaptation layers are matched before the broad configuration prefix; the
 * shared/lib "core" buckets are matched first since they are the most specific.
 */
function classify(path: string): Layer {
  const p = path.replace(/\\/g, '/');
  // core: shared foundation + the metrics lib (most specific first).
  if (
    p.startsWith('src/gtaa/shared/') ||
    p.startsWith('scripts/metrics/lib/')
  ) {
    return 'core';
  }
  if (p.startsWith('src/gtaa/test-execution/')) return 'execution_layer';
  if (p.startsWith('src/gtaa/test-adaptation/')) return 'adapter';
  if (p.startsWith('src/gtaa/test-reporting/')) return 'reporting';
  if (
    p.startsWith('src/gtaa/configuration/') ||
    p.startsWith('.github/') ||
    p.endsWith('.config.ts') ||
    p === 'cucumber.js' ||
    p === 'tsconfig.json'
  ) {
    return 'configuration';
  }
  return 'other';
}

const METRIC_UNITS: Record<string, string> = {
  core_files_modified: 'count',
  execution_layer_files_modified: 'count',
  adapter_files_modified: 'count',
  reporting_files_modified: 'count',
  configuration_files_modified: 'count',
  loc_added: 'loc',
  loc_deleted: 'loc',
  loc_modified: 'loc',
  change_impact_score: 'score',
};

const NA_NOTE = 'no baseline git diff available (single-commit repo)';

/** Emit every metric as NOT_AVAILABLE with the same note (degraded state). */
function naRows(
  id: ScriptIdentity,
  generated: string,
  note: string,
): Array<Record<string, unknown>> {
  return Object.entries(METRIC_UNITS).map(([name, unit]) =>
    qualityRow(
      id,
      {
        metric_category: CATEGORY,
        metric_name: name,
        metric_value: null,
        metric_unit: unit,
        source_file: note,
      },
      generated,
    ),
  );
}

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const out = join(PROCESSED, 'modifiability_metrics.csv');

  const base = (process.env.GTAA_DIFF_BASE ?? '').trim();
  let entries: NumstatEntry[] | null = null;
  let degradeNote = NA_NOTE;

  try {
    if (!base) {
      degradeNote = `${NA_NOTE} (GTAA_DIFF_BASE unset)`;
    } else if (commitCount() < 2) {
      degradeNote = NA_NOTE;
    } else {
      entries = diffNumstat(base);
      if (entries === null) {
        degradeNote = `git diff against '${base}' failed`;
      }
    }
  } catch {
    entries = null;
    degradeNote = `${NA_NOTE} (git error)`;
  }

  if (entries === null) {
    writeCsv(out, QUALITY_COLUMNS, naRows(id, generated, degradeNote));
    return out;
  }

  // Real computation from the numstat entries.
  const layerCounts: Record<Layer, number> = {
    core: 0,
    execution_layer: 0,
    adapter: 0,
    reporting: 0,
    configuration: 0,
    other: 0,
  };
  let added = 0;
  let deleted = 0;
  for (const e of entries) {
    layerCounts[classify(e.path)] += 1;
    added += e.added;
    deleted += e.deleted;
  }
  const locModified = Math.min(added, deleted);
  const impact =
    layerCounts.core * 3 +
    layerCounts.execution_layer * 2 +
    layerCounts.adapter +
    layerCounts.reporting +
    layerCounts.configuration +
    locModified / 100;

  const src = `git diff --numstat ${base} HEAD (${entries.length} files)`;
  const values: Record<string, number> = {
    core_files_modified: layerCounts.core,
    execution_layer_files_modified: layerCounts.execution_layer,
    adapter_files_modified: layerCounts.adapter,
    reporting_files_modified: layerCounts.reporting,
    configuration_files_modified: layerCounts.configuration,
    loc_added: added,
    loc_deleted: deleted,
    loc_modified: locModified,
    change_impact_score: round(impact, 2) ?? 0,
  };

  const rows = Object.entries(METRIC_UNITS).map(([name, unit]) =>
    qualityRow(
      id,
      {
        metric_category: CATEGORY,
        metric_name: name,
        metric_value: values[name],
        metric_unit: unit,
        source_file: src,
      },
      generated,
    ),
  );

  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`modifiability_metrics.csv written: ${file}`);
}
