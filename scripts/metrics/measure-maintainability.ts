/**
 * measure-maintainability.ts  (§15.1)
 *
 * Emits metrics/processed/maintainability_metrics.csv — one row per
 * maintainability metric for the gTAA baseline, in the canonical 15-column
 * quality format.
 *
 * Data-integrity: every metric is computed inside its own try/catch; a failing
 * metric still emits a NOT_AVAILABLE row (metric_value=null) with a source_file
 * note explaining why, and never aborts the script. All file/input ordering is
 * sorted for determinism; no Date/random except generatedAt().
 *
 * Run: tsx scripts/metrics/measure-maintainability.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROCESSED, REPO_ROOT, readCsv, round, writeCsv } from './lib/io';
import {
  generatedAt,
  QUALITY_COLUMNS,
  qualityRow,
  scriptIdentity,
  type QualityMetricRow,
  type ScriptIdentity,
} from './lib/identity';
import { loadTelemetry } from './lib/telemetry-load';
import { commitCount } from './lib/git-evidence';
import { ALL_FAILURE_BUCKETS } from '../../src/gtaa/shared/failure-buckets';

const CATEGORY = 'maintainability';

/** Recursively collect *.ts files under a directory, sorted for determinism. */
function walkTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      out.push(...walkTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The TS source corpus: src/ + scripts/, sorted, deduped. */
function sourceCorpus(): string[] {
  const files = [
    ...walkTsFiles(join(REPO_ROOT, 'src')),
    ...walkTsFiles(join(REPO_ROOT, 'scripts')),
  ];
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

/** Build a metric row, isolating failures so one metric can't abort the script. */
function safeMetric(
  id: ScriptIdentity,
  generated: string,
  name: string,
  unit: string,
  defaultNote: string,
  compute: () => Pick<QualityMetricRow, 'metric_value' | 'source_file'> &
    Partial<Pick<QualityMetricRow, 'tool_name' | 'platform' | 'viewport'>>,
): Record<string, unknown> {
  try {
    const r = compute();
    return qualityRow(
      id,
      {
        metric_category: CATEGORY,
        metric_name: name,
        metric_value: r.metric_value,
        metric_unit: unit,
        source_file: r.source_file,
        tool_name: r.tool_name,
        platform: r.platform,
        viewport: r.viewport,
      },
      generated,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return qualityRow(
      id,
      {
        metric_category: CATEGORY,
        metric_name: name,
        metric_value: null,
        metric_unit: unit,
        source_file: `${defaultNote} (compute failed: ${reason})`,
      },
      generated,
    );
  }
}

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const rows: Array<Record<string, unknown>> = [];

  // --- Duplicated-line proxy over the TS corpus (deterministic) -------------
  // Normalize each non-blank line (trim); ignore trivial lines (< 20 chars or
  // pure punctuation like `}`). A normalized form occurring >1 time contributes
  // (occurrences - 1) duplicated lines. Percentage is over counted lines.
  let dupComputed: { dupLoc: number; counted: number } | null = null;
  const dupCompute = () => {
    if (dupComputed) return dupComputed;
    const corpus = sourceCorpus();
    const freq = new Map<string, number>();
    let counted = 0;
    for (const file of corpus) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.length < 20) continue; // skip blank/short/trivial lines
        if (/^[\p{P}\p{S}]+$/u.test(line)) continue; // pure punctuation/symbols
        counted += 1;
        freq.set(line, (freq.get(line) ?? 0) + 1);
      }
    }
    let dupLoc = 0;
    for (const c of freq.values()) if (c > 1) dupLoc += c - 1;
    dupComputed = { dupLoc, counted };
    return dupComputed;
  };

  rows.push(
    safeMetric(
      id,
      generated,
      'duplicated_loc',
      'count',
      'src+scripts TS; normalized-line proxy',
      () => {
        const { dupLoc } = dupCompute();
        return { metric_value: dupLoc, source_file: 'src+scripts TS; normalized-line proxy' };
      },
    ),
  );
  rows.push(
    safeMetric(
      id,
      generated,
      'duplicated_code_percentage',
      'percent',
      'src+scripts TS; normalized-line proxy',
      () => {
        const { dupLoc, counted } = dupCompute();
        const pct = counted > 0 ? round((dupLoc / counted) * 100, 2) : null;
        return {
          metric_value: pct,
          source_file:
            counted > 0
              ? 'src+scripts TS; normalized-line proxy (dup_loc/counted_lines)'
              : 'no counted source lines found',
        };
      },
    ),
  );

  // --- files_touched_per_change: avg files changed per commit ---------------
  rows.push(
    safeMetric(
      id,
      generated,
      'files_touched_per_change',
      'count',
      'git history',
      () => {
        const commits = commitCount();
        if (commits < 2) {
          return {
            metric_value: null,
            source_file: `not meaningful with ${commits} commit(s); needs >=2 commits`,
          };
        }
        // With >=2 commits, average files touched across commits.
        // (Computed only when history exists; current repo has a single commit.)
        return {
          metric_value: null,
          source_file: 'git per-commit file churn not yet captured',
        };
      },
    ),
  );

  // --- File-size metrics over the TS corpus ---------------------------------
  let sizeComputed: { sizes: number[] } | null = null;
  const sizeCompute = () => {
    if (sizeComputed) return sizeComputed;
    const corpus = sourceCorpus();
    const sizes: number[] = [];
    for (const file of corpus) {
      try {
        if (!statSync(file).isFile()) continue;
        const text = readFileSync(file, 'utf8');
        // Physical lines; ignore a single trailing empty line from final newline.
        const lines = text.split('\n');
        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
        sizes.push(lines.length);
      } catch {
        /* skip unreadable file */
      }
    }
    sizeComputed = { sizes };
    return sizeComputed;
  };

  rows.push(
    safeMetric(id, generated, 'average_file_size_loc', 'loc', 'src+scripts TS', () => {
      const { sizes } = sizeCompute();
      if (sizes.length === 0)
        return { metric_value: null, source_file: 'no TS source files found' };
      const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      return {
        metric_value: round(avg, 2),
        source_file: `src+scripts TS over ${sizes.length} files`,
      };
    }),
  );
  rows.push(
    safeMetric(id, generated, 'max_file_size_loc', 'loc', 'src+scripts TS', () => {
      const { sizes } = sizeCompute();
      if (sizes.length === 0)
        return { metric_value: null, source_file: 'no TS source files found' };
      return {
        metric_value: Math.max(...sizes),
        source_file: `src+scripts TS over ${sizes.length} files`,
      };
    }),
  );

  // --- Cyclomatic complexity: no analyzer available -------------------------
  rows.push(
    safeMetric(id, generated, 'cyclomatic_complexity_if_available', 'count', '', () => ({
      metric_value: null,
      source_file: 'no static-analysis tool available in baseline',
    })),
  );

  // --- failure_bucket_coverage_percentage -----------------------------------
  // Distinct buckets actually referenced (count>0 in failure_buckets.csv UNION
  // non-empty failure_bucket in scenario telemetry) / total defined buckets.
  // Zero is a real value here. NOT_AVAILABLE only if the bucket enum is missing.
  rows.push(
    safeMetric(
      id,
      generated,
      'failure_bucket_coverage_percentage',
      'percent',
      'failure-buckets enum',
      () => {
        const totalDefined = ALL_FAILURE_BUCKETS.length;
        if (!totalDefined) {
          return {
            metric_value: null,
            source_file: 'failure-buckets enum unreadable/empty',
          };
        }
        const referenced = new Set<string>();
        // From processed failure_buckets.csv: any bucket with numeric count>0.
        try {
          const fbCsv = join(PROCESSED, 'failure_buckets.csv');
          for (const r of readCsv(fbCsv)) {
            const name = (r.failure_bucket ?? '').trim();
            const count = Number(r.count);
            if (name && Number.isFinite(count) && count > 0) referenced.add(name);
          }
        } catch {
          /* ignore csv read issues; telemetry may still contribute */
        }
        // From scenario telemetry: any non-empty failure_bucket.
        try {
          for (const e of loadTelemetry()) {
            const b = (e.failure_bucket ?? '').trim();
            if (b) referenced.add(b);
          }
        } catch {
          /* ignore */
        }
        const pct = round((referenced.size / totalDefined) * 100, 2);
        return {
          metric_value: pct,
          source_file: `${referenced.size}/${totalDefined} buckets referenced (failure_buckets.csv + tool-events)`,
        };
      },
    ),
  );

  // --- telemetry_completeness_percentage ------------------------------------
  // Fraction of tool-events records with all required fields present/non-empty.
  rows.push(
    safeMetric(
      id,
      generated,
      'telemetry_completeness_percentage',
      'percent',
      'metrics/raw/tool-events/*.jsonl',
      () => {
        const events = loadTelemetry();
        if (events.length === 0) {
          return {
            metric_value: null,
            source_file: 'no tool-events telemetry present',
          };
        }
        const required: Array<keyof (typeof events)[number]> = [
          'run_id',
          'feature',
          'scenario',
          'status',
          'timestamp',
          'platform',
          'tool_name',
        ];
        let complete = 0;
        for (const e of events) {
          const ok = required.every((f) => {
            const v = e[f];
            return v !== undefined && v !== null && String(v).trim() !== '';
          });
          if (ok) complete += 1;
        }
        const pct = round((complete / events.length) * 100, 2);
        return {
          metric_value: pct,
          source_file: `${complete}/${events.length} records have all required fields`,
        };
      },
    ),
  );

  const out = join(PROCESSED, 'maintainability_metrics.csv');
  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`maintainability_metrics.csv written: ${file}`);
}
