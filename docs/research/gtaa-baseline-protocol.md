# gTAA Baseline Protocol

This document defines the experimental protocol for the `GTAA_BASELINE`
repository used in the article *"Quantifying Test-Oriented Microkernel
Architecture for Cross-Platform Test Automation."* The study compares two test
automation architectures on the **same** experimental assets; this repository is
the layered General Test Automation Architecture (gTAA) baseline, and the
separate TOM (Test-Oriented Microkernel Architecture) repository is the
comparison subject.

## Purpose of the baseline

The baseline is a **fair comparison object, not a weaker implementation.** Its
purpose is to provide a clean, idiomatic, well-engineered gTAA against which the
comparison architecture is measured. To keep the comparison fair, the baseline:

- implements the same scenarios, contracts, and test data;
- emits metrics with the same schemas and the same telemetry semantics;
- runs the same set of tools under the same CI structure;
- applies the same engineering discipline (SOLID, DRY, KISS) that a competent
  team would apply when building a layered automation framework.

The only intended difference between the two repositories is the **architecture
itself**. Everything that could otherwise confound the comparison is held
constant.

## Why gTAA was selected as the reference baseline

The General Test Automation Architecture (gTAA) is an established, standards-aligned
reference model for structuring test automation into well-known layers (Test
Generation, Test Definition, Test Execution, Test Adaptation, Test Reporting, and
Configuration / Environment Management). It was selected as the baseline because:

- it is widely recognized and represents the conventional "good practice"
  structure for cross-platform automation;
- its layered decomposition is tool- and platform-agnostic, which makes it a
  neutral yardstick rather than a strawman;
- it composes through direct, typed interfaces and a simple factory, so its
  behavior is transparent and its quality attributes are straightforward to
  measure.

A full description of the layers and their interactions is in
[`../architecture/gtaa-layered-architecture.md`](../architecture/gtaa-layered-architecture.md).

## Shared experimental assets

The following assets are **identical (or semantically equivalent) across both
architectures**. They are the controlled variables of the experiment.

| Shared asset | Location in this repo | Why it is shared |
| --- | --- | --- |
| Feature files, scenarios, scenario outlines | `src/gtaa/test-generation/features/` | Same behaviors are exercised by both repos. |
| Test data (parameterized, isolated) | `src/gtaa/test-generation/test-data/` | Same inputs drive both repos. |
| Locator contracts | `src/gtaa/test-generation/contracts/locators/` | Same logical UI targets. |
| API contracts | `src/gtaa/test-generation/contracts/api/` | Same endpoints, requests, assertions. |
| Visual contracts | `src/gtaa/test-generation/contracts/visual/` | Same snapshots, regions, masks. |
| Failure-bucket taxonomy | `src/gtaa/shared/failure-buckets.ts` | Identical 14-bucket classification. |
| Metric schemas | `metrics/schemas/*.json` | Records are directly comparable. |
| Metric processors | `scripts/metrics/*.ts` | Same aggregation/normalization logic. |
| Telemetry schema & semantics | `src/gtaa/shared/types.ts`, `metrics/schemas/telemetry-event.schema.json` | Same record shape, same `failure_bucket` rules. |
| CI structure | `.github/workflows/`, `.github/actions/` | Same job layout and artifact policy. |
| Non-tool-specific configuration | `src/gtaa/configuration/` | Same environment/config contract. |

The single field that distinguishes the two datasets is `architecture_type`
(`GTAA_BASELINE` vs `TOM`), stamped onto every record.

## Components intentionally NOT copied from TOM

The TOM comparison repository organizes composition around a different
architectural style. The baseline deliberately does **not** reproduce the
following TOM-specific components, because they are not part of a layered gTAA:

| TOM-specific component | Why it is absent from a layered baseline |
| --- | --- |
| TOM-specific composition layer (central microkernel/dispatcher) | A layered baseline composes via direct typed interfaces and a simple factory; there is no central composition core. |
| Central routing of abstract requests to tools | Use cases call executors directly; there is no request-routing component. |
| Dynamic tool-loading registry | Tools are wired at build time via `import` and a factory `switch`; there is no runtime registration. |
| In-process / cross-process action routing (IPC/RPC) | Actions are ordinary typed method calls; no message-passing or remote indirection. |
| Fault-injection proxy | The baseline has no interception/fault-injection component between layers. |
| TOM/AHM-specific naming and overhead concepts | Naming follows the gTAA layer vocabulary; TOM-specific overhead metrics are recorded as `NOT_AVAILABLE` (see the measurement model). |

These are recorded as architectural differences, **not defects**. The
asymmetry — for example, TOM-specific overhead metrics being unavailable here —
is a reported trade-off of the comparison, discussed under *Threats to
validity*.

## Automated Atomic Testing in this baseline

Automated Atomic Testing is a **shared, fair experimental property implemented
in both architectures** to avoid biasing the comparison toward either style.
Each scenario is an isolated, independently executable unit. In this repository
it is implemented as follows:

- **Per-scenario isolation via Before/After hooks.** Cucumber instantiates one
  `GtaaWorld` per scenario (`src/gtaa/test-definition/support/world.ts`). The
  `Before` hook records a fresh start state; the `After` hook tears down the
  driver and emits the scenario outcome
  (`src/gtaa/test-definition/support/hooks.ts`).
- **Deterministic setup data.** Test data is loaded from
  `src/gtaa/test-generation/test-data/` so each scenario starts from a known
  state.
- **No shared execution state.** The World's `state` object is per-scenario
  scratch space and is never shared across scenarios; UI sessions are created on
  demand and disposed in teardown.
- **Parameterized / isolated test data.** Scenario outlines draw from Examples
  tables and the shared test-data files, keeping inputs explicit and isolated.
- **Independently executable tool jobs.** The six tool jobs in CI run
  independently, with no execution dependency between them.
- **Scenario- and tool-level telemetry.** Every scenario, step, and tool
  execution emits a self-describing telemetry record.

Because the same atomic-testing discipline is applied in both repositories, it
does not advantage either architecture in the measured quality attributes.

## Tool → layer mapping

| Tool | Test Execution (executor) | Test Adaptation (driver / client) | Platform(s) |
| --- | --- | --- | --- |
| Playwright (web) | `PlaywrightWebExecutor` | `UiDriver` via `createUiDriver`; locator resolver | desktop, responsive |
| Appium (Android) | `AppiumAndroidExecutor` | `UiDriver` via `createUiDriver`; `mobile-actions`; locator resolver | android |
| Appium (iOS) | `AppiumIosExecutor` | `UiDriver` via `createUiDriver`; `mobile-actions`; locator resolver | ios |
| API | `ApiExecutor` | `http-client`; API contract loader | api |
| Gatling (performance) | `GatlingExecutor` | simulations + feeder (typed entry point) | perf |
| Pixelmatch (visual) | `PixelmatchVisualExecutor` | visual contract / region / mask resolution; locator resolver | desktop, responsive (visual) |

## How metrics are emitted

Metrics flow through a fixed pipeline:

```
executors + hooks  →  telemetry-writer  →  metrics/raw/** (jsonl/json + manifest)
                                         →  scripts/metrics/*.ts (normalize/aggregate)
                                         →  metrics/processed/*.csv
                                         →  metrics/summary/* (article tables, summary)
```

1. **Emission.** The reporting layer (`telemetry-writer.ts`) writes the run
   manifest and appends raw records to `metrics/raw/**`. Writes are append-only
   and crash-safe so data survives failing scenarios.
2. **Processing.** `pnpm metrics:all` runs the normalization/aggregation scripts
   in `scripts/metrics/`, producing the CSVs in `metrics/processed/`.
3. **Quality summary.** `pnpm metrics:quality:all` runs the per-attribute
   measurement scripts and the quality-attribute summary.
4. **Summaries.** Article tables and the experiment summary are written to
   `metrics/summary/`.

The full metrics contract is documented in
[`metrics-protocol.md`](metrics-protocol.md), and the quality measurement model
in [`quality-attribute-measurement-model.md`](quality-attribute-measurement-model.md).

## How the baseline supports objective comparison

Because every confounding factor — scenarios, data, contracts, schemas,
processors, telemetry semantics, CI structure, and configuration — is held
constant across both repositories, the **architecture is the independent
variable**. The dependent variables are the quality-attribute metrics. Records
from the two repositories are paired by `(experiment_batch_id, run_index,
tool_name)`, so the comparison reduces to "same input, same measurement,
different architecture."

## Running the 100 experimental executions

The experiment is driven by `.github/workflows/gtaa-experiment.yml`, dispatched
once per run index. The workflow-dispatch inputs are:

| Input | Purpose |
| --- | --- |
| `experiment_batch_id` | Groups all runs of one batch. |
| `run_index` | Index of this run within the batch (1..N). |
| `update_visual_baseline` | Refresh visual baselines instead of comparing. |
| `target_environment` | `local` / `staging` / `prod`. |

For statistically independent data points, prefer one workflow run (one dataset)
per index via a `gh workflow run` loop. The full driver scripts and result
collection commands are in [`../experiment-runs.md`](../experiment-runs.md).

## Threats to validity

- **Architectural asymmetry of metrics.** TOM-specific overhead metrics
  (`proxy_overhead_ms`, `grpc_or_ipc_latency_ms`, `plugin_action_duration_ms`)
  have no counterpart in a layered baseline and are recorded as
  `NOT_AVAILABLE`. This is an inherent, reported trade-off of comparing two
  different styles, not a measurement defect, and missing values are never
  fabricated.
- **Environment variability in CI.** Tool jobs are resilient and collect metrics
  even without a live app or device. Runs intended for live measurement must
  target a real environment via `target_environment`; CI-sanity runs are not
  used as experimental data points.
- **Implementer bias.** Both repositories share scenarios, contracts, data,
  schemas, processors, and CI structure to minimize the chance that one
  architecture is implemented more favorably than the other.
- **Tool / platform coverage gaps.** Not every scenario applies to every
  platform; coverage is recorded explicitly in the platform coverage matrix so
  comparisons are made on like-for-like coverage.
- **Run independence.** Each `run_index` is an independent workflow run; the
  matrix fan-out example is disabled by default precisely because it shares a
  single workflow run and would weaken independence.
