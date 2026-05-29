/**
 * Minimal, dependency-free Gherkin reader for the metrics pipeline.
 *
 * We only need structural facts (feature name, scenarios, outlines, tags, step
 * counts, example-row counts) for inventory + platform-coverage. Parsing is
 * deliberately lenient: malformed lines are skipped, never thrown.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export type ScenarioType = 'scenario' | 'scenario_outline';

export interface ParsedScenario {
  featureFile: string;
  featureName: string;
  scenarioName: string;
  scenarioType: ScenarioType;
  /** Effective tags = feature-level tags + scenario-level tags (deduped). */
  tags: string[];
  /** Number of data rows in the first Examples table (0 for plain scenarios). */
  exampleRows: number;
  stepCount: number;
}

const STEP_KEYWORDS = ['Given ', 'When ', 'Then ', 'And ', 'But ', '* '];

function isStep(line: string): boolean {
  return STEP_KEYWORDS.some((k) => line.startsWith(k));
}

/** Parse a single .feature file's text into scenario records. */
export function parseFeatureText(text: string, featureFile: string): ParsedScenario[] {
  const lines = text.split(/\r?\n/);
  const scenarios: ParsedScenario[] = [];

  let featureName = '';
  let featureTags: string[] = [];
  let pendingTags: string[] = [];

  // Current scenario being accumulated.
  let cur: ParsedScenario | null = null;
  let inExamples = false;
  let examplesHeaderSeen = false;

  const pushCur = () => {
    if (cur) scenarios.push(cur);
    cur = null;
    inExamples = false;
    examplesHeaderSeen = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('@')) {
      const tags = line.split(/\s+/).filter((t) => t.startsWith('@'));
      pendingTags.push(...tags);
      continue;
    }

    if (line.startsWith('Feature:')) {
      featureName = line.slice('Feature:'.length).trim();
      featureTags = dedupe(pendingTags);
      pendingTags = [];
      continue;
    }

    const outlineMatch =
      line.startsWith('Scenario Outline:') || line.startsWith('Scenario Template:');
    const scenarioMatch = line.startsWith('Scenario:');

    if (outlineMatch || scenarioMatch) {
      pushCur();
      const kw = outlineMatch
        ? line.startsWith('Scenario Outline:')
          ? 'Scenario Outline:'
          : 'Scenario Template:'
        : 'Scenario:';
      cur = {
        featureFile,
        featureName,
        scenarioName: line.slice(kw.length).trim(),
        scenarioType: outlineMatch ? 'scenario_outline' : 'scenario',
        tags: dedupe([...featureTags, ...pendingTags]),
        exampleRows: 0,
        stepCount: 0,
      };
      pendingTags = [];
      continue;
    }

    if (line.startsWith('Background:')) {
      // Background steps are not attributed to a scenario; reset pending tags.
      pushCur();
      pendingTags = [];
      continue;
    }

    if (line.startsWith('Examples:') || line.startsWith('Scenarios:')) {
      inExamples = true;
      examplesHeaderSeen = false;
      continue;
    }

    if (cur && inExamples && line.startsWith('|')) {
      if (!examplesHeaderSeen) {
        examplesHeaderSeen = true; // first row is the header
      } else {
        cur.exampleRows += 1;
      }
      continue;
    }

    if (cur && !inExamples && isStep(line)) {
      cur.stepCount += 1;
      continue;
    }
  }

  pushCur();
  return scenarios;
}

function dedupe(tags: string[]): string[] {
  return [...new Set(tags)];
}

/** Read + parse every *.feature file in a directory (recursively one level). */
export function readFeatureDir(dir: string): ParsedScenario[] {
  if (!existsSync(dir)) return [];
  const out: ParsedScenario[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.feature')) continue;
    const full = join(dir, name);
    try {
      const text = readFileSync(full, 'utf8');
      out.push(...parseFeatureText(text, basename(name)));
    } catch {
      /* skip unreadable feature file; never crash */
    }
  }
  return out;
}
