/**
 * Visual gate — fail the CI job if any visual snapshot drifted.
 *
 * The pixelmatch oracle deliberately RECORDS each comparison to telemetry but
 * does not fail the functional scenario on pixel drift (so a drift never masks a
 * functional regression). This gate makes the drift a separate, explicit job
 * failure — mirroring the TOM reference's `scripts/visual-gate.js` so both arms
 * apply the same visual pass/fail policy.
 *
 * Reads metrics/processed/visual_comparison_results.csv (produced by
 * `pnpm metrics:all` → normalize-visual-telemetry.ts) and exits:
 *   0 — every snapshot PASS, or no snapshots at all (nothing to gate)
 *   1 — at least one snapshot in FAIL status (drift beyond its threshold)
 *
 * Best-effort on read errors: a missing/empty CSV exits 0 (nothing captured this
 * run is not a drift). Only a real FAIL row fails the job.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CSV = join(process.cwd(), 'metrics', 'processed', 'visual_comparison_results.csv');

function parseCsvLine(line: string): string[] {
  // The CSV has no embedded commas inside quoted fields for the columns we read
  // (paths use '/'), so a plain split is sufficient and dependency-free.
  return line.split(',');
}

function main(): void {
  if (!existsSync(CSV)) {
    console.log(`[visual-gate] no comparison CSV at ${CSV} — nothing to gate (PASS).`);
    process.exit(0);
  }

  const text = readFileSync(CSV, 'utf8').trim();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length <= 1) {
    console.log('[visual-gate] no snapshot rows — nothing to gate (PASS).');
    process.exit(0);
  }

  const header = parseCsvLine(lines[0]);
  const snapshotIdx = header.indexOf('snapshot_id');

  // The `status` column index is unreliable: some rows carry comma-bearing fields
  // (e.g. multi-ref mask_refs) and the header has duplicate platform/viewport
  // columns, so a positional read drifts. Instead scan each row for a field that
  // is EXACTLY "PASS" or "FAIL" — both are distinctive (note: this won't match the
  // failure_bucket value "VISUAL_DIFF_FAILURE", which is not exactly "FAIL").
  const failed: string[] = [];
  let passed = 0;
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line).map((c) => c.trim());
    const upper = cols.map((c) => c.toUpperCase());
    if (upper.includes('FAIL')) {
      const id = snapshotIdx >= 0 ? cols[snapshotIdx] : '?';
      failed.push(`${id} :: ${line.slice(0, 120)}`);
    } else if (upper.includes('PASS')) {
      passed += 1;
    }
  }

  console.log(`[visual-gate] ${passed} passed, ${failed.length} drifted.`);
  if (failed.length > 0) {
    console.log('[visual-gate] DRIFTED snapshots:');
    for (const f of failed) console.log(`  - ${f}`);
    console.error(`[visual-gate] FAIL — ${failed.length} snapshot(s) drifted beyond threshold.`);
    process.exit(1);
  }
  console.log('[visual-gate] PASS — no drift.');
  process.exit(0);
}

main();
