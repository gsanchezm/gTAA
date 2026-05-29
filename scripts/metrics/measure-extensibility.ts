/**
 * measure-extensibility.ts  (§15.3)
 *
 * Emits metrics/processed/extensibility_metrics.csv — extensibility metrics for
 * the gTAA baseline, in the canonical 15-column quality format.
 *
 * Source: optional tool-integration manifests in
 * metrics/raw/tool-integration/*.json. When manifests exist, one set of metric
 * rows is emitted per manifest tool_name. When the directory is empty (current
 * state) each metric is emitted once with tool_name='ALL' and metric_value=null
 * (NOT_AVAILABLE) noting "no tool-integration manifest present".
 *
 * Never throws: malformed manifests are skipped by readJsonDir; a manifest that
 * still fails to yield rows degrades to the NOT_AVAILABLE set.
 *
 * Run: tsx scripts/metrics/measure-extensibility.ts
 */
import { join } from 'node:path';
import { PROCESSED, RAW, readJsonDir, round, writeCsv } from './lib/io';
import {
  generatedAt,
  QUALITY_COLUMNS,
  qualityRow,
  scriptIdentity,
  type ScriptIdentity,
} from './lib/identity';

const CATEGORY = 'extensibility';

interface ToolManifest {
  tool_name?: unknown;
  integration_date?: unknown;
  files_added?: unknown;
  files_modified?: unknown;
  core_files_modified?: unknown;
  configuration_files_modified?: unknown;
  contract_files_modified?: unknown;
  new_action_or_adapter_count?: unknown;
  registration_changes_count?: unknown;
  loc_added?: unknown;
  loc_deleted?: unknown;
  notes?: unknown;
}

const METRIC_UNITS: Array<[string, string]> = [
  ['new_tool_files_added', 'count'],
  ['new_tool_files_modified', 'count'],
  ['new_tool_loc_added', 'loc'],
  ['existing_core_files_changed_for_new_tool', 'count'],
  ['new_action_or_adapter_count', 'count'],
  ['registration_changes_count', 'count'],
  ['integration_effort_proxy_score', 'score'],
];

const NO_MANIFEST_NOTE = 'no tool-integration manifest present';

/** Coerce to a finite number, or null when absent/non-numeric. */
function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Coerce to a finite number, defaulting to 0 (for arithmetic in the score). */
function numOrZero(value: unknown): number {
  return numOrNull(value) ?? 0;
}

function naRows(
  id: ScriptIdentity,
  generated: string,
  toolName: string,
  note: string,
): Array<Record<string, unknown>> {
  return METRIC_UNITS.map(([name, unit]) =>
    qualityRow(
      id,
      {
        metric_category: CATEGORY,
        metric_name: name,
        metric_value: null,
        metric_unit: unit,
        source_file: note,
        tool_name: toolName,
      },
      generated,
    ),
  );
}

export function run(): string {
  const id = scriptIdentity();
  const generated = generatedAt();
  const out = join(PROCESSED, 'extensibility_metrics.csv');

  let manifests: ToolManifest[] = [];
  try {
    manifests = readJsonDir<ToolManifest>(join(RAW, 'tool-integration'));
  } catch {
    manifests = [];
  }

  if (manifests.length === 0) {
    writeCsv(out, QUALITY_COLUMNS, naRows(id, generated, 'ALL', NO_MANIFEST_NOTE));
    return out;
  }

  // Deterministic order: by tool_name then integration_date.
  const sorted = [...manifests].sort((a, b) => {
    const ta = String(a.tool_name ?? '');
    const tb = String(b.tool_name ?? '');
    return (
      ta.localeCompare(tb) ||
      String(a.integration_date ?? '').localeCompare(String(b.integration_date ?? ''))
    );
  });

  const rows: Array<Record<string, unknown>> = [];
  for (const m of sorted) {
    const toolName = String(m.tool_name ?? '').trim() || 'ALL';
    const src = `metrics/raw/tool-integration manifest (${toolName})`;

    const filesAdded = numOrNull(m.files_added);
    const filesModified = numOrNull(m.files_modified);
    const locAdded = numOrNull(m.loc_added);
    const coreModified = numOrNull(m.core_files_modified);
    const newActionCount = numOrNull(m.new_action_or_adapter_count);
    const regChanges = numOrNull(m.registration_changes_count);

    // integration_effort_proxy_score uses 0-defaults for missing arithmetic inputs.
    const score = round(
      numOrZero(m.files_modified) +
        numOrZero(m.files_added) +
        numOrZero(m.core_files_modified) * 3 +
        numOrZero(m.configuration_files_modified) +
        numOrZero(m.contract_files_modified),
      2,
    );

    const values: Record<string, number | null> = {
      new_tool_files_added: filesAdded,
      new_tool_files_modified: filesModified,
      new_tool_loc_added: locAdded,
      existing_core_files_changed_for_new_tool: coreModified,
      new_action_or_adapter_count: newActionCount, // null -> NOT_AVAILABLE unless present
      registration_changes_count: regChanges, // null -> NOT_AVAILABLE unless present
      integration_effort_proxy_score: score,
    };

    for (const [name, unit] of METRIC_UNITS) {
      rows.push(
        qualityRow(
          id,
          {
            metric_category: CATEGORY,
            metric_name: name,
            metric_value: values[name],
            metric_unit: unit,
            source_file: src,
            tool_name: toolName,
          },
          generated,
        ),
      );
    }
  }

  writeCsv(out, QUALITY_COLUMNS, rows);
  return out;
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`extensibility_metrics.csv written: ${file}`);
}
