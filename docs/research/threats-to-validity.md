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

## TV‑2 (RESOLVED) — `profile_post_save` was a frozen‑contract divergence, now restored

**Status:** Investigated 2026‑06‑27 (three‑agent workflow + direct `diff`), then **FIXED**.

`profile_post_save`'s drift was **not** a runtime confound like TV‑1 — gTAA's
`profile.visual.json` contract had **diverged from TOM** (a frozen‑asset invariant
violation present since the initial commit `aaf2965`): gTAA left the captured
region's own `profileFullNameInput` text **unmasked** (TOM masks it) and used a 3×
tighter `0.01` threshold (TOM `0.03`). The rendered name drifted on the narrow
responsive field; desktop was pixel‑exact.

**Resolution:** `profile.visual.json` was **restored to byte‑identical with TOM**
(the correct direction — restoring the invariant, unlike TV‑1 where no fix exists)
and its baselines regenerated; the snapshot is back **in** the comparison.

The audit found the same *class* of mask omission in `login.visual.json`
(`login_screen_invalid_credentials` missing the `quickLoginUserList` /
`quickLoginLabel` masks), but there the masked content is **static** (the demo
quick‑login list) so the omission is **inert** — it never drifted. Restoring it
would require a re‑baseline the regen could not reliably produce (that snapshot's
capture is conditional, `login.usecase.ts:167,179`), so it was **left as‑is and
documented in TV‑3**, not restored.

## Asset‑parity audit (2026‑06‑27)

A systematic byte‑diff of every gTAA `test-generation` asset against its TOM
counterpart found **7 of 29 diverged** (22 byte‑identical, 0 missing). Disposition:

| Asset | Class | Disposition |
|---|---|---|
| `contracts/visual/profile.visual.json` | visual‑mask bug (gTAA masks fewer) | **Restored** to TOM (TV‑2) |
| `contracts/visual/login.visual.json` | mask omission but **inert** (masks static content) | **Kept** — TV‑3 |
| `contracts/locators/{login,navbar,profile,pizzaBuilder}.locators.json` | gTAA added mobile selectors / template keys | **Kept + documented** (TV‑3) |
| `contracts/api/login.api.contract.json` | description string only | **Kept + documented** (TV‑3) |

## TV‑3 — accepted asset divergences (locator additions + one API description)

**Decision (experiment owner, 2026‑06‑27): keep and document.** These do **not**
affect the web functional/visual comparison and are entangled with gTAA's mobile
locator resolution (the mobile suites are sim‑environment‑red in CI regardless).

- **Locator additions:** gTAA's `login.locators.json` (`marketByCode` template),
  `navbar.locators.json` (mobile `navLogo`/`navCartCount` + `navLogoutLink`),
  `profile.locators.json` (a mobile address selector), and
  `pizzaBuilder.locators.json` (`sizeByLabel`, the user‑approved `toppingByName`,
  + mobile selectors) carry mobile selectors / template keys TOM's contracts lack.
  They were added during gTAA's iOS/Android stabilization. Restoring strict
  byte‑identity would require refactoring gTAA's mobile locator resolution to match
  TOM's; it is deferred as an optional follow‑up. The divergence is confined to the
  mobile path.
- **Inert visual‑mask omission (`login.visual.json`):** the
  `login_screen_invalid_credentials` snapshot masks two fewer fields than TOM
  (`quickLoginUserList`, `quickLoginLabel`), but those cover the **static** demo
  quick‑login list, so the omission never produced drift. Restoring it cleanly is
  blocked by that snapshot's conditional capture (the baseline regen could not
  reproduce it), so it is kept as‑is — benign. Restorable later once the capture is
  made deterministic.
- **API description:** `login.api.contract.json` differs only in a human
  description that references TOM's `DAO`/`$S_0$`/"resonance" microkernel
  terminology, not meaningful for gTAA's layered design. The request/response
  contract itself is byte‑identical. Kept as an architecture‑appropriate
  description.

**Caveat:** any measure that depends on byte‑identical *locator* or
*API‑description* assets must account for TV‑3 (none of the current
visual/functional pass‑rate measures do).

---

## TV‑4 — order‑success locale‑hydration flake is symmetric with TOM → **ACCEPT as a shared limitation (no gTAA‑only fix)**

**Status:** Characterized across multiple CI runs (the 4‑run batch on `main` plus
the verify runs); root‑caused and agent‑verified against the TOM reference.

**Decision (experiment owner):** **Accept and document** as a shared, low‑rate
known limitation. Do **not** add a gTAA‑only retry or settle/poll, and do **not**
change the visual/CI gate. Adding either would make gTAA *more* robust than its
frozen reference and bias the comparison toward gTAA.

### Symptom
On the order‑success screen for non‑English markets (most often JP/ja, sometimes
MX/CH‑fr) the status title is occasionally read in **English**
(`expected status "配達中" but got "Out for delivery"`). It is **intermittent**
(seen on Playwright Responsive ~1 run in 4; desktop usually wins the same‑run
race) and is **not** the cold‑backend flake — the "open success screen" step
passes first, so the page has mounted; the title is read before the `ja` locale
finishes hydrating.

### Why it is symmetric with TOM (not an architecture effect)
- gTAA's `seedWebPersistedStores` is byte‑equivalent to TOM's for the affected
  markets (same five keys; `language:'ja'` + `locale:'ja-JP'` in
  `omnipizza-country`).
- TOM's order‑success path **also reads the localized status exactly once with no
  settle** (`route.ts:147‑148`, `molecule.ts:180‑188`, immediate `ReadText.ts`) and
  carries no flake note — the read‑once timing is **structurally identical in both
  arms**, so gTAA's read‑once `assertScreenWithStatus` is a faithful mirror.
- TOM's order placement sends **no locale signal** beyond `x-country-code` (which
  gTAA already sends) — there is no placement‑side field gTAA is missing. The real
  localization source (OrderSuccess.jsx / i18n) lives in the **un‑vendored app
  code**, identical for both arms via the shared `BASE_URL` deploy.

### Why no gTAA‑only mitigation
- A localized‑title settle/poll, or a Cucumber `retry` for the scenario, would make
  gTAA pass where TOM intermittently fails → **asymmetric robustness**, and a
  `retry` additionally **pollutes the per‑scenario reliability metrics**. Both are
  fairness‑gated and were rejected.
- A lockstep fix in *both* arms is possible in principle but would require
  re‑running TOM's frozen 50× campaign; not worth it for a noise‑level flake.

### How it is handled in analysis
- It is **not** excluded from the functional pass‑rate (unlike the visual confound
  TV‑1): it is a genuine, symmetric intermittent outcome that both architectures
  are equally exposed to, so it belongs in the reliability distribution. It is
  expected to appear at a **comparable low rate** in both arms across the batch and
  should be read as shared noise, not a gTAA defect.

### Other residual functional flakes (noise‑level, 1/4)
The same characterization saw two more single‑occurrence flakes — the catalog
"Margarita" search race and the place‑delivery backend cold‑start (Render
free‑tier ~30–45 s cold start, mitigated by the shared `warmUpServices()` +
90 s order budgets). Each appeared in only **1/4** runs, is not a systematic
architecture difference, and is left as shared noise.

---

## TV‑5 — mobile CI‑environment artifacts (iOS Xcode‑default drift + Android SystemUI ANR) → **CI‑infra fixes, gTAA‑only, not architecture effects**

**Status:** Diagnosed 2026‑06‑27 from validation run `28302207290` (two‑agent
investigation against the CI logs + the Android failure screenshot/page‑source).
Both mobile suites failed **0/88** in CI; in **both** cases the app and the test
code are correct (the suites are 88/88 locally) — the failures are GitHub‑runner
environment artifacts, independent of the layered‑vs‑microkernel architecture.

| | iOS (`appium-ios`, macos‑14) | Android (`appium-android`, docker emulator) |
|---|---|---|
| Symptom | 0/88 — no XCUITest session ever starts | 0/88 — login field `~input-username` never displayed |
| Root cause | The `macos‑14` image (rebuilt 2026‑06‑08) **default‑selects the stale Xcode 15.4** while its sim runtimes are iOS 18.x; `appium-xcuitest`'s `xcrun --sdk iphonesimulator --show-sdk-version` probe (hard 15 s cap, SIGKILLed) never primes the cold SDK cache → "Could not determine iOS SDK version" on every session | A **SystemUI ANR modal** ("System UI isn't responding") overlays the **correctly‑rendered** login screen, occluding `~input-username`; every scenario then burns its 60 s element wait. The app launched (`com.omnipizza.app/.MainActivity` focused) and the backend was reachable |
| Fix (CI infra only) | Pin the newest installed **Xcode 16.x** + pre‑warm the `xcrun` SDK query before Appium; make `bootstatus -b` block (parity with TOM) | `adb shell settings put global hide_error_dialogs 1` (stop the OS drawing crash/ANR modals; same category as the existing `DISABLE_ANIMATION` emulator flags) |

### Why the fixes are fair (applied to gTAA only; TOM NOT edited)
- Both fixes touch **CI provisioning only** — Xcode selection / toolchain pre‑warm
  / simulator boot ordering (iOS) and an emulator OS setting (Android). **No
  test‑layer behaviour changes**: element‑wait budgets, retries, locators, and
  capabilities are untouched, so gTAA's mobile suite is **not** made more tolerant
  of app/UI slowness than TOM's (the experiment's [fairness rule 3](../../) —
  never make gTAA exceed TOM).
- TOM's frozen 50× mobile runs **predate the 2026‑06‑08 macos image drift** and
  were **ANR‑clean** (green except an occasional Android `~btn-topping-mushrooms`
  topping flake). So these fixes bring gTAA **to the environment parity TOM
  already had**, rather than granting gTAA an advantage TOM lacked. TOM is frozen
  and is **not** re‑run, so no TOM‑side mirror is applied (experiment‑owner
  decision, 2026‑06‑27). The Android suppression also **cannot mask a genuine app
  failure** — a real app ANR shows a different signature (missing app content, not
  an OS modal over a rendered screen).
- These are **CI‑environment confounds**, not architecture signals: read a mobile
  CI failure of this shape as runner/emulator noise, not a gTAA defect.

### Caveat — a fully‑green iOS round is not guaranteed in one run
Historically gTAA's CI iOS was **68/88** (element‑render flakes beyond the
session‑start bug); the Xcode fix unblocks session creation (0/88 → sessions
start) but the job runs without `|| true`, so a *fully* green iOS job may need a
few CI cycles or may remain intermittently short of 88/88 — a runner‑side limit,
not an architecture difference. Android is expected to green more reliably once
the ANR modal is suppressed.

### Resolution (experiment owner, 2026‑06‑28): mobile is OUT OF SCOPE for the comparison — CI‑environment instability, unfixable within fairness
Three further CI cycles (runs `28311249516`, `28313147720`, `28316969010`) with
the infra fixes above established that **a reliably green mobile round is not
achievable in this CI without breaking the experiment's fairness rules**, on
*both* platforms, for reasons independent of the architecture:

- **Android — the AUT is killed mid‑session.** With the ANR suppressed and the
  150‑min budget, Android ran the full suite but plateaued at **59/88**. The
  failure screenshots + page‑source dumps are decisive: **23 of 24** failure
  captures show the **Android launcher/home screen** — the OmniPizza app had been
  **killed/backgrounded** on the resource‑constrained docker emulator
  (`MEMORY=4096/CORES=2`, byte‑identical to TOM), so every subsequent element
  lookup failed. It is *not* a scroll or locator bug (the `~btn-add-pizza-p06`
  "CH/Marinara" cluster and the bottom‑of‑form CTAs were red because the app was
  gone, not below the fold), and *not* architecture‑related.
- **iOS — the host Xcode toolchain hangs intermittently.** Even with Xcode pinned
  and pre‑warmed, `xcrun --sdk iphonesimulator --show-sdk-version` is
  *intermittently and unrecoverably wedged* on the `macos‑14` image (warmed in 21 s
  on one run, hung through 6×60 s retries on another → 0 sessions). When the
  toolchain does cooperate, 88 XCUITest scenarios exceed the 150‑min budget.

Neither is fixable without violating fairness: raising the emulator's
memory/cores would **exceed TOM's frozen config**, and adding a gTAA‑only
"relaunch the app if it fell to the launcher" recovery would make gTAA **more
robust than TOM** (which has no such recovery) — either biases the paired
comparison. The methodologically clean action is therefore to **treat the mobile
(`@android`/`@ios`) suites as out of scope** for the gTAA↔TOM comparison — a
shared CI‑environment limitation, not an architecture signal — and read the
experiment on the **web / API / visual / performance** core.

The CI‑infra fixes (Xcode pin + pre‑warm, ANR suppression, the
`mobile: scrollGesture`→W3C‑swipe correction and scroll‑before‑wait order — both
genuine alignments to TOM's mobile interaction) are **kept**: they are fair,
move gTAA toward TOM, and took Android from 0/88 to 59/88. They simply cannot
overcome the emulator killing the app or the runner's wedged toolchain.
