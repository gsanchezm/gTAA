/**
 * cucumber-to-jsonl.ts
 *
 * Converts Cucumber JSON reports (results/*.json) into a flat JSONL stream at
 * metrics/raw/cucumber-jsonl/<run-id>.jsonl — one line per scenario, carrying
 * status, summed step duration (ms), tags, feature/scenario names and the run
 * identity. This decouples the (tool-specific) cucumber report shape from the
 * normalized telemetry consumed by the rest of the pipeline.
 *
 * Robust: malformed report files are skipped; missing fields degrade to null.
 * Empty/missing results dir -> writes nothing but does not crash.
 * Run: tsx scripts/metrics/cucumber-to-jsonl.ts
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAW, REPO_ROOT, ensureDir, writeText } from './lib/io';
import { ARCHITECTURE_TYPE, generatedAt, scriptIdentity } from './lib/identity';

const RESULTS_DIR = join(REPO_ROOT, 'results');

interface CucumberStep {
  result?: { status?: string; duration?: number };
}
interface CucumberTag {
  name?: string;
}
interface CucumberElement {
  name?: string;
  type?: string;
  keyword?: string;
  steps?: CucumberStep[];
  tags?: CucumberTag[];
}
interface CucumberFeature {
  name?: string;
  uri?: string;
  elements?: CucumberElement[];
  tags?: CucumberTag[];
}

/** Worst step status -> scenario status (PASS unless something failed/skipped). */
function scenarioStatus(steps: CucumberStep[]): 'PASS' | 'FAIL' | 'SKIP' | 'UNKNOWN' {
  let sawSkip = false;
  let sawPass = false;
  for (const s of steps) {
    const st = String(s.result?.status ?? '').toLowerCase();
    if (st === 'failed') return 'FAIL';
    if (st === 'undefined' || st === 'ambiguous') return 'FAIL';
    if (st === 'skipped' || st === 'pending') sawSkip = true;
    if (st === 'passed') sawPass = true;
  }
  if (sawSkip && !sawPass) return 'SKIP';
  if (sawSkip) return 'SKIP';
  if (sawPass) return 'PASS';
  return 'UNKNOWN';
}

/** Cucumber step durations are nanoseconds; sum to milliseconds (null if none). */
function totalDurationMs(steps: CucumberStep[]): number | null {
  let nanos = 0;
  let any = false;
  for (const s of steps) {
    const d = s.result?.duration;
    if (typeof d === 'number' && Number.isFinite(d)) {
      nanos += d;
      any = true;
    }
  }
  return any ? Math.round(nanos / 1e6) : null;
}

function tagNames(...groups: Array<CucumberTag[] | undefined>): string[] {
  const out = new Set<string>();
  for (const g of groups) {
    for (const t of g ?? []) {
      if (t?.name) out.add(t.name);
    }
  }
  return [...out];
}

export function run(): string | null {
  if (!existsSync(RESULTS_DIR)) {
    // Nothing to convert; the pipeline tolerates a missing cucumber report.
    return null;
  }

  const id = scriptIdentity();
  const generated = generatedAt();
  const lines: string[] = [];

  for (const name of readdirSync(RESULTS_DIR)) {
    if (!name.endsWith('.json')) continue;
    let features: CucumberFeature[];
    try {
      const parsed = JSON.parse(readFileSync(join(RESULTS_DIR, name), 'utf8'));
      features = Array.isArray(parsed) ? parsed : [];
    } catch {
      continue; // skip malformed report
    }

    for (const feature of features) {
      for (const el of feature.elements ?? []) {
        // Only scenarios/outlines carry outcomes; skip backgrounds.
        if (el.type && el.type.toLowerCase() === 'background') continue;
        const steps = el.steps ?? [];
        const record = {
          architecture_type: ARCHITECTURE_TYPE,
          repository_name: id.repository_name,
          experiment_batch_id: id.experiment_batch_id,
          run_index: id.run_index,
          workflow_run_id: id.workflow_run_id,
          workflow_attempt: id.workflow_attempt,
          run_id: process.env.GTAA_RUN_ID ?? id.run_index,
          tool_name: id.tool_name,
          platform: id.platform,
          viewport: id.viewport,
          feature: feature.name ?? feature.uri ?? null,
          scenario: el.name ?? null,
          tags: tagNames(feature.tags, el.tags),
          status: scenarioStatus(steps),
          step_count: steps.length,
          duration_ms: totalDurationMs(steps),
          source_file: name,
          generated_at: generated,
        };
        lines.push(JSON.stringify(record));
      }
    }
  }

  const runId = process.env.GTAA_RUN_ID ?? 'cucumber';
  const out = join(RAW, 'cucumber-jsonl', `${runId}.jsonl`);
  ensureDir(out);
  writeText(out, lines.length ? `${lines.join('\n')}\n` : '');
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(file ? `cucumber-jsonl written: ${file}` : 'no results/*.json to convert');
}
