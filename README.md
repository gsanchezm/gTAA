# gTAA — Layered Test Automation Architecture Baseline

A **General Test Automation Architecture (gTAA)** implementation of a cross‑platform
test suite for the **OmniPizza** demo app (web + API + native mobile + performance +
visual). It is the *fair baseline* arm of a research comparison against a
Test‑Oriented Microkernel Architecture (TOM); the independent variable is the
architecture, so every test asset is shared and the suites exercise the same behavior.

`architecture_type = GTAA_BASELINE` is stamped on all emitted metrics.

> **Hard constraint (acceptance‑critical):** the declarative assets — feature files,
> API contracts, locators, and visual specs under `src/gtaa/test-generation/` — are
> **byte‑identical to the reference**. All stabilization lives in the *code* layers
> (use cases / executors / adaptation clients), never in those assets.

---

## Layered architecture

```
feature (Gherkin)                      src/gtaa/test-generation/
  -> step definition                   src/gtaa/test-definition/step-definitions/
    -> use case (Test Definition)      src/gtaa/test-definition/usecases/
      -> executor (Test Execution)     src/gtaa/test-execution/{playwright,appium,api,pixelmatch,gatling}/
        -> driver/client (Adaptation)  src/gtaa/test-adaptation/{drivers,clients,locators,visual}/
          -> telemetry (Reporting)     src/gtaa/test-reporting/telemetry/
```

A use case holds a neutral `UiDriver` (web = Playwright, mobile = Appium/UiAutomator2)
and a stateless `ApiExecutor`/HTTP client; there is no central router or dynamic tool
loading. Platform/driver are selected from `world.context` (env: `GTAA_PLATFORM`,
`GTAA_DRIVER`).

## Suites & tags

| Suite | Tag | Runner |
|-------|-----|--------|
| API contracts | `@api` | api executor over `contracts/api/*.json` |
| Web desktop | `@desktop` | Playwright |
| Web responsive | `@responsive` | Playwright (small viewport) |
| Native Android | `@android` | Appium + UiAutomator2 |
| Native iOS | `@ios` | Appium + XCUITest |
| Visual regression | `@visual` | pixelmatch + pngjs |
| Performance | `@performance` | Gatling (`@gatling.io` JS bundle) |

## Prerequisites

- **Node** 20 / 22 / >=24, **pnpm** 11 (`packageManager` is pinned).
- `pnpm install` (see the *pnpm allowBuilds* note if native deps don't build).
- A **`.env`** (see `.env` keys): `BASE_URL` / `API_BASE_URL` point at the AUT
  (OmniPizza on Render), plus `HEADLESS`, viewport sizes, `APPIUM_HOST/PORT`,
  `ANDROID_APP_PATH/DEVICE_NAME`, perf + visual knobs.
- **Android only:** an Appium server on `:4723`
  (`node_modules/.bin/appium --port 4723 --relaxed-security`) and a connected device
  with its **screen lock fully disabled** + screen kept on (`adb shell svc power stayon true`).
  The networked AUT uses Node's TLS; Windows `curl` can't validate Render's cert
  (schannel revocation) — use Node `fetch` for ad‑hoc checks.

## Running

```bash
pnpm typecheck                 # tsc --noEmit
pnpm test:api                  # @api          (38 scenarios)
pnpm perf:smoke                # Gatling smoke  (PERF_SIMULATION=login-load|invalid-login-load|checkout-load)
pnpm test:web:desktop          # @desktop      (80)   — HEADLESS=true to hide the browser
pnpm test:web:responsive       # @responsive   (73)
pnpm test:android              # @android      (88)   — needs Appium + device
# subset a suite without changing tags:  cucumber-js --tags @desktop --name "<scenario-name-regex>"
```

### Visual regression

Baselines are version‑controlled under `visual-baselines/<feature>/<snapshot>/<platform>/<viewport>[/<market>][/<language>][/<scenario>]/baseline.png`.

```bash
# bootstrap (create missing baselines), then compare:
cross-env GTAA_PLATFORM=desktop GTAA_DRIVER=playwright GTAA_VISUAL=true \
  UPDATE_VISUAL_BASELINE=true  cucumber-js --tags "@desktop and @visual"   # bootstrap
cross-env GTAA_PLATFORM=desktop GTAA_DRIVER=playwright GTAA_VISUAL=true \
  UPDATE_VISUAL_BASELINE=false cucumber-js --tags "@desktop and @visual"   # compare
```

The visual oracle **records** each comparison to telemetry but does not gate the
functional scenario on a pixel drift (mirrors the reference's behavior).

### Metrics

`pnpm metrics:all` and `pnpm metrics:quality:all` normalize the raw telemetry under
`metrics/raw/` into processed CSV/JSON + the article tables (`metrics/summary/`).
One failing metric never aborts the pipeline; missing data is `NOT_AVAILABLE`.

## Stabilization status

| Suite | Status |
|-------|--------|
| API | ✅ 38/38 |
| Gatling | ✅ all simulations PASS |
| Desktop | ✅ 80/80 |
| Responsive | ✅ 73/73 |
| PixelMatch Desktop | ✅ 80/80 (60/60 comparisons) |
| PixelMatch Responsive | ✅ 73/73 |
| Android | ~58/88 — catalog/builder/navbar/profile largely green; remaining clusters (localization, checkout, order‑success, login, tall‑form scroll) need on‑device debugging |

## Repository layout

```
src/gtaa/
  test-generation/    features + contracts (api/locators/visual) — DO NOT edit (byte-identical)
  test-definition/    step-definitions, usecases, support (world, hooks, seeding)
  test-execution/     playwright, appium, api, pixelmatch, gatling executors
  test-adaptation/    drivers (ui-driver, appium mobile-actions), clients (http/auth/catalog/cart/checkout/order/profile lookups), locators resolver, visual baseline policy
  test-reporting/     telemetry writers + run identity
  configuration/      env + per-tool config
scripts/metrics/      telemetry normalizers + quality-attribute measures
visual-baselines/     committed visual fixtures
metrics/              raw telemetry + processed datasets + schemas
```
