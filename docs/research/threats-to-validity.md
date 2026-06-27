# Threats to Validity & Known Confounds

This document records measurement confounds discovered during the paired
gTAA ↔ TOM experiment that must be accounted for before a measure is read as a
result. A *confound* here is a metric whose observed gTAA↔TOM difference is
driven by something other than the independent variable (the **architecture**,
layered gTAA vs microkernel TOM).

---

## TV‑1 — `checkout_order_summary` visual snapshot is a capture confound → **EXCLUDE from visual‑stability comparison**

**Status:** Confirmed 2026‑06‑27 via a three‑agent investigation against the
committed baselines and `diff_ratio` telemetry in **both** arms.

**Decision:** Drop `snapshot_id == 'checkout_order_summary'` from **both** arms
before computing any visual‑stability / visual pass‑rate measure. Its drift is a
test‑design artifact, **not** an architecture effect, and it does not capture the
UI the contract names.

### What it is supposed to capture
The order‑summary panel (items, subtotal, tax, delivery, total). Contract
`src/gtaa/test-generation/contracts/visual/checkout.visual.json`
(`regionRef: orderDetailsList`, `maskRefs: ["orderTotalValue"]`, threshold
`0.005`). The visual contract is **byte‑identical** across the two arms.

### What it actually captures — neither arm captures the panel
| | gTAA | TOM |
|---|---|---|
| Captured surface | **Dynamic "Out for delivery" live‑tracking screen** (animated map + courier marker, ETA, order‑id, courier card) | **Static "Welcome back!" login screen** |
| Baseline dimensions | full‑page (1440×964 / 390×908) | element‑sized (800×690 / 390×844) |
| Outcome over runs | **drifts ≈ 3/4 runs** | **green 50/50** |

- gTAA fires `runVisualCheck(..., 'checkout_order_summary')` as the **last line of
  `assertOrderAccepted`** (`src/gtaa/test-definition/usecases/checkout.usecase.ts:270`),
  **after** `waitForVisible(orderSuccessScreen)`. By then the UI has left
  `/checkout`; the region `orderDetailsList` = `div[data-testid^='order-']`
  (`contracts/locators/checkout.locators.json`) is absent → `captureRegion`
  throws → the executor **falls back to a full‑page screenshot**
  (`src/gtaa/test-execution/pixelmatch/pixelmatch-visual-executor.ts:155-160`) of
  the animated tracking screen.
- TOM fires the same snapshot in an `After({ tags: '@visual' })` hook against a
  different (static login) surface.

### Why it is a confound, not an architecture signal
- **Drift driver = the animated map.** `diff_ratio` is bimodal (PASS ≈ 0.001,
  FAIL ≈ 0.017; never between) and the differing pixel area **scales with the
  viewport size, not with text** (desktop/responsive FAIL ratio ≈ 3.7× ≈ the
  region‑area ratio) — which excludes the order‑id glyphs and anti‑aliasing and
  points at the region‑wide re‑render of the animated map.
- **Pixel mechanics are equivalent** between arms: `stabilize()`
  (`networkidle` + `document.fonts.ready`), pixelmatch options
  (`threshold:0.1`, `includeAA:false`), and the `0.005` pass rule all match; the
  `orderTotalValue` mask is **inert** because the region never resolves.
- The gTAA↔TOM difference is therefore **trigger‑timing + committed‑baseline
  provenance** — both code/CI‑layer accidents — **not** the layered‑vs‑microkernel
  architecture.

### Why it was deliberately NOT "fixed"
- *Capture the real panel on `/checkout`* (move the trigger before `placeOrder`
  navigates away) would make gTAA capture the order panel while **TOM still
  captures login** — an apples‑to‑oranges content asymmetry — and TOM's assets and
  recorded runs are frozen. Fixing only one arm trades a timing confound for a
  content confound.
- *Widen the threshold* (the abandoned `feat/ci-real-cross-platform-execution`
  branch set `0.025` + a global pixel‑ratio floor) **diverges from TOM's frozen
  `0.005` contract** and merely hides the confound.
- The methodologically clean action is to **exclude the snapshot** and leave both
  arms' behaviour untouched. (If both arms are ever fixed in lockstep — capture
  the actual order‑summary panel with matching baseline provenance — the confound
  resolves and the snapshot can re‑enter the comparison.)

### How to apply the exclusion
- When computing the visual‑stability / pass‑rate measures (see
  [metrics-protocol.md](./metrics-protocol.md) → `visual_comparison_results.csv`;
  [quality-attribute-measurement-model.md](./quality-attribute-measurement-model.md)
  → automation stability), **filter out rows where
  `snapshot_id == 'checkout_order_summary'` in BOTH arms** before any comparison.
- **CI:** the Pixelmatch visual gate is intentionally left unchanged, so a red
  `checkout_order_summary` will continue to appear. It is a **known confound, not
  a regression** — do not re‑baseline it (the animated map re‑drifts) and do not
  widen its threshold (frozen‑asset divergence).

### Evidence
- gTAA baseline: `visual-baselines/checkout/checkout_order_summary/web/desktop/place-a-delivery-order-in-jp-paying-with-credit-card/baseline.png` (live‑tracking screen).
- TOM baseline: `…/visual-baselines/checkout/checkout_order_summary/web/desktop/jp/baseline.png` (login screen).
- Telemetry: `metrics/processed/visual_comparison_results.csv` — bimodal `diff_ratio`.
- Characterization batch (4 runs on `main`): `checkout_order_summary` drifted in 3/4.

---

## TV‑2 (candidate, not yet confirmed) — `profile_post_save` responsive drift

`profile_post_save` drifted **2/4 runs, responsive only** in the same
characterization batch. It has **not** been investigated to the depth of TV‑1; it
is plausibly the same wrong‑surface/timing class or a genuine inherent‑AA case on
the dense responsive viewport. **Flag for the same exclude‑or‑investigate
decision** before its pass‑rate is read as an architecture result.

---

## Note — functional intermittent flakes (low rate, near TOM)

The same 4‑run characterization showed the functional suite (Playwright) green in
3/4 runs; the residual functional flakes (order‑success locale‑hydration race;
catalog "Margarita" search race; the place‑delivery backend cold‑start) each
appeared in only **1/4** runs — noise‑level and not a systematic architecture
difference. The order‑success locale race in particular is **symmetric** with TOM
(both arms read the localized status once, with no settle; see the JP/ja analysis
in the project memory) and is accepted as a shared known limitation.
