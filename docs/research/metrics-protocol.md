# Metrics Protocol

This document defines how metrics are produced, classified, and shaped in the
`GTAA_BASELINE` repository, and how they are paired with the TOM comparison
repository. It complements
[`gtaa-baseline-protocol.md`](gtaa-baseline-protocol.md) and
[`quality-attribute-measurement-model.md`](quality-attribute-measurement-model.md).

The pipeline is:

```
raw (metrics/raw/**)  →  processed (metrics/processed/*.csv)  →  summary (metrics/summary/*)
```

## Raw metrics

Raw records are emitted during execution by the reporting layer
(`src/gtaa/test-reporting/telemetry/telemetry-writer.ts`) and the tool
executors. Each record carries the shared run identity, so every line is
self-describing.

| Raw stream | Path | Shape (key fields) |
| --- | --- | --- |
| Run manifest | `metrics/raw/run-manifest/<run-id>.json` | Run identity + environment (see fields below). One per run, written before tests. |
| Scenario/step telemetry | `metrics/raw/tool-events/<run-id>.jsonl` | `TelemetryEvent`: `feature`, `scenario`, `step`, `platform`, `viewport`, `status`, `duration_ms`, `failure_bucket`, `error_message`. |
| API contract events | `metrics/raw/api/<run-id>.jsonl` | `ApiContractEvent`: `endpoint_id`, `method`, `path`, `response_status`, `response_time_ms`, `assertion_count`, `failed_assertions`, `extracted_keys`, `status`, `failure_bucket`. |
| Visual contract events | `metrics/raw/visual/<run-id>.jsonl` | `VisualContractEvent`: `snapshot_id`, `region_ref`, `mask_refs`, `diff_pixels`, `diff_ratio`, `threshold`, `passed`, `status`, `failure_bucket`. |
| Gatling performance summary | `metrics/raw/gatling/<run-id>/summary.json` | `GatlingSummary`: `simulation_name`, `request_count`, `success_count`, `failure_count`, `mean/p95/max_response_time_ms`, `threshold_status`, `failure_bucket`. |
| Cucumber JSONL | produced by `scripts/metrics/cucumber-to-jsonl.ts` | Normalizes Cucumber `results/*.json` into per-line records for downstream processors. |

Raw record shapes are defined by `src/gtaa/shared/types.ts` and validated
against `metrics/schemas/*.json`
(`run-manifest.schema.json`, `telemetry-event.schema.json`,
`api-contract-event.schema.json`, `visual-contract-event.schema.json`,
`scenario-inventory.schema.json`, `platform-coverage.schema.json`).

## Run manifest fields

The run manifest (`metrics/raw/run-manifest/<run-id>.json`) captures experiment
context before any test runs. Fields:

`architecture_type`, `repository_name`, `experiment_batch_id`, `run_index`,
`workflow_run_id`, `workflow_attempt`, `job_name`, `tool_name`, `run_id`,
`commit_sha`, `branch`, `timestamp`, `generated_at`, `ci_provider`, `platform`,
`viewport`, `driver`, `tags`, `environment`, `node_version`, `os`.

`architecture_type` is fixed to `GTAA_BASELINE`. The pairing fields
(`experiment_batch_id`, `run_index`, `tool_name`) are what align a baseline run
with its TOM counterpart.

## Processed metrics

`pnpm metrics:all` normalizes and aggregates the raw streams into CSVs in
`metrics/processed/`. The test-execution CSVs are:

| Processed CSV | Produced by | Content |
| --- | --- | --- |
| `scenario_inventory.csv` | `extract-scenario-inventory.ts` | Every scenario with type, tags, example rows, step count. |
| `platform_coverage_matrix.csv` | `build-platform-coverage.ts` | Per-scenario coverage across desktop/responsive/android/ios/api/performance/visual. |
| `scenario_telemetry_normalized.csv` | `normalize-telemetry.ts` | Flattened scenario/step telemetry rows. |
| `scenario_durations.csv` | `aggregate-durations.ts` | Per-scenario duration percentiles (p50/p95/p99, mean, min, max). |
| `platform_durations.csv` | `aggregate-durations.ts` | Per-platform/tool duration percentiles. |
| `api_isolated_results.csv` | `normalize-api-telemetry.ts` | API contract outcomes per endpoint. |
| `visual_comparison_results.csv` | `normalize-visual-telemetry.ts` | Visual diff outcomes per snapshot. Carries an `analysis_excluded` (0/1) column flagging documented confounds (TV‑1); the file retains **all** rows for audit. |
| `performance_summary.csv` | `normalize-gatling-telemetry.ts` | Performance simulation summaries. |
| `failure_buckets.csv` | `build-failure-buckets.ts` | Failure counts grouped by bucket/source/tool/platform. |
| `scenario_outcome_history.csv` | `build-outcome-history.ts` | Per-run scenario outcomes for reliability/flakiness analysis. |

> **Known confound — exclude before comparing.** When deriving visual‑stability
> measures from `visual_comparison_results.csv`, drop the `checkout_order_summary`
> snapshot in **both** arms: it captures the wrong (non‑deterministic) screen, so
> its drift is a test‑timing artifact, not an architecture effect. See
> [threats-to-validity.md](./threats-to-validity.md) (TV‑1).

`pnpm metrics:quality:all` then produces the quality-attribute CSVs. There are
nine per-attribute files (one per `measure-*.ts` script) plus the consolidated
summary:

| Quality CSV | Produced by |
| --- | --- |
| `maintainability_metrics.csv` | `measure-maintainability.ts` |
| `modifiability_metrics.csv` | `measure-modifiability.ts` |
| `extensibility_metrics.csv` | `measure-extensibility.ts` |
| `reusability_metrics.csv` | `measure-reusability.ts` |
| `reliability_metrics.csv` | `measure-reliability.ts` |
| `performance_efficiency_metrics.csv` | `measure-performance-efficiency.ts` |
| `observability_metrics.csv` | `measure-observability.ts` |
| `portability_metrics.csv` | `measure-portability.ts` |
| `interoperability_metrics.csv` | `measure-interoperability.ts` |
| `quality_attribute_metrics.csv` | `build-quality-attribute-summary.ts` (consolidated summary across all attributes) |

## Quality-attribute metric schema (15 columns)

Every quality `*_metrics.csv` uses the same column set, defined by
`QUALITY_COLUMNS` / `qualityRow` in `scripts/metrics/lib/identity.ts`:

```
architecture_type, repository_name, experiment_batch_id, run_index,
workflow_run_id, workflow_attempt, tool_name, platform, viewport,
metric_category, metric_name, metric_value, metric_unit, source_file,
generated_at
```

`architecture_type` is fixed to `GTAA_BASELINE`. A metric that is not tool- or
platform-specific uses `ALL` for `tool_name`/`platform`/`viewport`. A `null`
`metric_value` is written as `NOT_AVAILABLE`. The nine attributes and their
metrics are detailed in
[`quality-attribute-measurement-model.md`](quality-attribute-measurement-model.md).

## Required metric record fields and `architecture_type`

Every emitted record — raw or processed — carries the run-identity fields so it
can be classified and paired without external joins. The distinguishing field is
`architecture_type`, which is `GTAA_BASELINE` for this repository and `TOM` for
the comparison repository (the union is defined in `src/gtaa/shared/types.ts`).

## Failure buckets

Failures are classified into one of **14 standardized buckets**, defined in
`src/gtaa/shared/failure-buckets.ts` and shared with the TOM repository so
classifications are directly comparable:

1. `API_CONTRACT_FAILURE`
2. `API_RESPONSE_FAILURE`
3. `UI_ACTION_FAILURE`
4. `LOCATOR_RESOLUTION_FAILURE`
5. `VISUAL_DIFF_FAILURE`
6. `VISUAL_BASELINE_MISSING`
7. `PERFORMANCE_THRESHOLD_FAILURE`
8. `MOBILE_SESSION_FAILURE`
9. `WEB_SESSION_FAILURE`
10. `INFRASTRUCTURE_FAILURE`
11. `DATA_SETUP_FAILURE`
12. `ASSERTION_FAILURE`
13. `TIMEOUT_FAILURE`
14. `UNKNOWN_FAILURE`

Layers throw a `ClassifiedError` carrying an explicit bucket at the failure
source; the reporting hooks fall back to `classifyError()` for any unclassified
error. **Rule: on a successful outcome, `failure_bucket` is `null`** — a bucket
is only set when `status` is `FAIL`.

## Artifact upload strategy

Each tool job in `.github/workflows/gtaa-experiment.yml` uploads its metrics
with `if: always()`, so artifacts are produced even when test execution fails or
no live app/device is present. There is **one artifact per tool job**, named
`gtaa-metrics-<tool>`:

`gtaa-metrics-playwright`, `gtaa-metrics-appium-ios`,
`gtaa-metrics-appium-android`, `gtaa-metrics-api`, `gtaa-metrics-gatling`,
`gtaa-metrics-pixelmatch`.

A final `consolidate` job (`if: always()`, `needs` all six tool jobs) downloads
every `gtaa-metrics-*` artifact, re-runs `pnpm metrics:all` and
`pnpm metrics:quality:all`, and uploads the consolidated dataset as
`gtaa-metrics-consolidated`.

## Pairing strategy with TOM

Baseline and TOM records are paired by the tuple:

```
(experiment_batch_id, run_index, tool_name)
```

For a given batch, run index `i` of `tool_name` `t` in this repository
corresponds to run index `i` of `tool_name` `t` in the TOM repository. Because
the only differing identity field is `architecture_type`, every paired
comparison isolates the architecture as the independent variable.

## Metric interpretation rules

Each metric has a documented direction of "better":

- **Lower-is-better** for cost/risk metrics: change impact, modification effort,
  failure counts, flakiness/transition probabilities, durations, response times,
  and overhead.
- **Higher-is-better** for capability/coverage metrics: reuse ratios, coverage
  ratios, observability completeness, and portability/interoperability coverage.

Per-attribute directions are specified in
[`quality-attribute-measurement-model.md`](quality-attribute-measurement-model.md).

## Missing data handling

Determinism and honesty of measurement are mandatory:

- Missing values are recorded explicitly as `null` (raw) or the sentinels
  `UNKNOWN` / `NOT_AVAILABLE` (processed). `qualityRow` converts a `null`
  `metric_value` to `NOT_AVAILABLE`.
- **Data is never fabricated.** Metrics with no architectural counterpart in the
  baseline (the TOM-specific overhead metrics) are always `NOT_AVAILABLE` rather
  than estimated.
- **One failing metric never aborts the pipeline.** Steps are tolerant
  (`|| true`, `continue-on-error`, `if: always()`), and telemetry emission is
  wrapped so it can never break a run. A failed individual measurement yields a
  missing-value record, not a missing dataset.
