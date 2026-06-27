/**
 * excluded-snapshots.ts — single source of truth for visual snapshots that are
 * DOCUMENTED MEASUREMENT CONFOUNDS and must be dropped from every architecture
 * comparison the paper reads (visual pass-rate, failure-bucket distribution, and
 * the quality-attribute summary that consumes failure_buckets.csv).
 *
 * A confound here is a snapshot whose gTAA↔TOM difference is driven by something
 * other than the independent variable (the architecture) — see
 * docs/research/threats-to-validity.md → TV-1 (`checkout_order_summary`), whose
 * drift is a capture/trigger-timing artifact, not a layered-vs-microkernel effect.
 *
 * Scope of the exclusion (deliberately narrow):
 *  - It removes the confound from ANALYSIS AGGREGATES only. The raw rows are
 *    retained verbatim in metrics/processed/visual_comparison_results.csv (each
 *    row flagged `analysis_excluded=1`) and are still shown — marked EXCLUDED —
 *    in metrics/summary/article_tables.md, so nothing is silently deleted and the
 *    exclusion is fully auditable.
 *  - It does NOT touch the CI Pixelmatch visual gate (scripts/metrics/visual-gate.ts).
 *    TV-1's decision is to leave the gate unchanged, so a red `checkout_order_summary`
 *    keeps appearing in CI as a known confound, not a regression.
 *
 * Cross-arm symmetry (TV-1 requirement): the paired TOM reference analysis must
 * apply the IDENTICAL exclusion before any gTAA↔TOM visual comparison. This module
 * enforces it only for the gTAA arm; the TOM-side filter is the experiment owner's
 * responsibility (TOM's runs/assets are frozen).
 */

/** Visual snapshot_ids excluded from architecture-comparison aggregates (TV-1). */
export const ANALYSIS_EXCLUDED_SNAPSHOTS: ReadonlySet<string> = new Set<string>([
  // TV-1: fires after the UI has left /checkout, so the order-summary region is
  // absent and the executor falls back to a full-page shot of the ANIMATED
  // live-tracking screen (gTAA) / static login screen (TOM) — the animated map
  // drives the drift, not the architecture. Excluded from both arms.
  'checkout_order_summary',
]);

/**
 * True when a visual snapshot_id is a documented confound that must be excluded
 * from analysis aggregates. Coerces non-string input and trims surrounding
 * whitespace; the comparison is case-SENSITIVE on purpose, so it can only match
 * the exact configured ids and never over-matches a genuine snapshot (invariant 3).
 */
export function isAnalysisExcludedSnapshot(snapshotId: unknown): boolean {
  return ANALYSIS_EXCLUDED_SNAPSHOTS.has(String(snapshotId ?? '').trim());
}
