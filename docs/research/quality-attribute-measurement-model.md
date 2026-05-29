# Quality Attribute Measurement Model

This document defines the quality-attribute measurement model for the
`GTAA_BASELINE` repository. It specifies *what* is measured, *how* each metric
is operationally defined, and *which direction* is better. The metrics are
emitted by the `measure-*.ts` scripts and consolidated by
`build-quality-attribute-summary.ts`, all using the 15-column schema defined in
`scripts/metrics/lib/identity.ts` (see
[`metrics-protocol.md`](metrics-protocol.md)).

## What is being measured: the architecture, not the application

The study evaluates the quality of the **test automation architecture**, not the
quality of the application under test (the OmniPizza demo application). The
application is only a fixed, shared stimulus that both architectures exercise
identically. Conclusions are drawn about how each architecture behaves —
maintainability, modifiability, reliability of the automation, and so on — and
never about OmniPizza's own quality. Because both repositories drive the same
application with the same scenarios and contracts, the application is held
constant and cannot confound the architecture comparison.

## Selected quality attributes

Nine quality attributes are evaluated. They align with established
product-quality attributes, adapted to a test automation architecture:

1. Maintainability
2. Modifiability
3. Extensibility
4. Reusability
5. Reliability
6. Performance Efficiency
7. Observability
8. Portability
9. Interoperability

**Security is explicitly excluded.** A test automation architecture is not a
security boundary of the application, and the experiment does not exercise
security properties; including it would measure the harness or the application
rather than the architecture, so it is out of scope.

## Attribute definitions, metrics, and interpretation

Each attribute is measured by a `measure-*.ts` script that emits rows into the
corresponding `*_metrics.csv` with `metric_category`, `metric_name`,
`metric_value`, and `metric_unit`. Where the implementation defines an exact
formula it is reproduced verbatim; otherwise the operational definition and the
direction of "better" are given, and exact coefficients are left to the
implementing script (they are not invented here).

### 1. Maintainability — `measure-maintainability.ts`

- **Operational definition.** How much code and how many layers a typical
  change touches, and how readable/cohesive the layered structure is. A
  well-maintained layered architecture keeps changes localized.
- **Metrics.** `change_impact_score` and supporting structural counts.
  The change-impact score weights the layers a change touches:

  ```
  change_impact_score = core*3 + execution*2 + adapter
                        + reporting + configuration + loc_modified/100
  ```

  where each term is the number of files/units touched in that layer for a
  representative change, and `loc_modified` is the lines of code modified.
- **Interpretation.** Lower is better (less code and fewer layers disturbed per
  change).

### 2. Modifiability — `measure-modifiability.ts`

- **Operational definition.** The effort and ripple of modifying existing
  behavior (e.g. changing a locator, a contract, or a step) without adding new
  capability.
- **Metrics.** Modification-effort / ripple metrics: number of layers and files
  affected by a representative modification, and modified lines of code.
- **Interpretation.** Lower is better (a modification stays contained).

### 3. Extensibility — `measure-extensibility.ts`

- **Operational definition.** The cost of adding a new capability — most
  importantly, adding a new tool/platform — measured against the expectation
  that a layered baseline adds one executor service plus one factory case.
- **Metrics.** Extension-cost metrics: files/units added or touched to introduce
  a new tool or platform, and whether the change is additive (new units) versus
  invasive (edits to existing units).
- **Interpretation.** Lower added/touched cost is better; a higher additive-to-invasive
  ratio is better.

> **Change-event metrics and fairness.** Modifiability and Extensibility are the
> only two attributes that measure a *change event* rather than the static
> repository state. They are computed from a git diff between a baseline ref
> (`GTAA_DIFF_BASE`) and `HEAD`, or from an optional tool-integration manifest
> (`metrics/raw/tool-integration/*.json`). On a static snapshot with no such
> change recorded, both metrics are emitted as `NOT_AVAILABLE` — and this is by
> design. To keep the comparison fair, the change event (e.g. "add tool X",
> "modify locator Y") must be recorded **identically on both arms**: the same
> diff base or the same manifest schema on the gTAA baseline and on the
> comparison repository. A metric that is `NOT_AVAILABLE` on one arm must be
> `NOT_AVAILABLE` on the other unless the same change event is measured on both.

### 4. Reusability — `measure-reusability.ts`

- **Operational definition.** The degree to which assets (scenarios, contracts,
  test data, locators) are reused across platforms/tools rather than duplicated.
- **Metrics.** `scenario_reuse_ratio` and related reuse ratios — the proportion
  of scenarios/contracts/locators reused across multiple platforms relative to
  the total.
- **Interpretation.** Higher is better (more reuse, less duplication).

### 5. Reliability — `measure-reliability.ts`

- **Operational definition.** The stability of the automation itself across
  repeated runs — its tendency to flip outcomes (flakiness) independent of the
  application.
- **Metrics.** `pass_to_fail_probability` and related transition probabilities,
  derived from `scenario_outcome_history.csv` across runs, plus failure-bucket
  distributions from `failure_buckets.csv`.
- **Interpretation.** Lower transition probabilities and lower failure counts
  are better.

### 6. Performance Efficiency — `measure-performance-efficiency.ts`

- **Operational definition.** The time/resource cost the architecture imposes to
  execute the suite — scenario and platform durations and performance-test
  response times — attributable to the architecture, not the application.
- **Metrics.** Duration percentiles (p50/p95/p99, mean) from
  `scenario_durations.csv` / `platform_durations.csv`, and response-time
  summaries from `performance_summary.csv`.
- **Interpretation.** Lower durations and response times are better.

### 7. Observability — `measure-observability.ts`

- **Operational definition.** How completely and consistently the architecture
  records what happened — telemetry coverage at scenario/step/tool level and
  completeness of failure classification.
- **Metrics.** Observability-completeness metrics: fraction of
  scenarios/steps/tool executions that produced telemetry, and fraction of
  failures with a non-`UNKNOWN` failure bucket.
- **Interpretation.** Higher is better (more complete, better-classified
  telemetry).

### 8. Portability — `measure-portability.ts`

- **Operational definition.** How readily the same automation runs across
  platforms (desktop, responsive, android, ios, api) without per-platform forks
  of logic.
- **Metrics.** Platform-coverage metrics from `platform_coverage_matrix.csv`:
  number of platforms each scenario covers and overall cross-platform coverage
  ratio.
- **Interpretation.** Higher coverage is better.

### 9. Interoperability — `measure-interoperability.ts`

- **Operational definition.** How well the architecture integrates heterogeneous
  tools (Playwright, Appium, API, Gatling, Pixelmatch) under a common contract
  and emits comparable, schema-conformant records.
- **Metrics.** Interoperability metrics: number of tools integrated under the
  shared interfaces, and the fraction of records conforming to the shared
  schemas / shared failure-bucket taxonomy.
- **Interpretation.** Higher is better (more tools integrated cleanly, higher
  schema conformance).

## Summary of interpretation directions

| Attribute | Better direction |
| --- | --- |
| Maintainability | Lower (change impact) |
| Modifiability | Lower (modification effort/ripple) |
| Extensibility | Lower extension cost; higher additive ratio |
| Reusability | Higher (reuse ratios) |
| Reliability | Lower (transition probabilities, failure counts) |
| Performance Efficiency | Lower (durations, response times) |
| Observability | Higher (telemetry/classification completeness) |
| Portability | Higher (platform coverage) |
| Interoperability | Higher (tools integrated, schema conformance) |

## TOM-specific overhead metrics in this baseline

The TOM comparison architecture defines overhead metrics that arise from its
composition style and have **no architectural counterpart** in a layered
baseline:

| Metric | Value in this repository |
| --- | --- |
| `proxy_overhead_ms` | `NOT_AVAILABLE` |
| `grpc_or_ipc_latency_ms` | `NOT_AVAILABLE` |
| `plugin_action_duration_ms` | `NOT_AVAILABLE` |

These are emitted as `NOT_AVAILABLE` to **document the architectural
difference**: the baseline composes through direct, typed method calls and a
simple factory, so there is no interception, no remote/inter-process action
path, and no dynamically loaded action to time. Recording them as
`NOT_AVAILABLE` (rather than zero or estimated) makes the asymmetry explicit in
the dataset. This asymmetry is a **reported trade-off** of comparing two
architectural styles, not a defect of either implementation.

## No fabrication, determinism, and reproducibility

- **Missing data is never fabricated.** Unmeasured or non-applicable values are
  recorded as `null` / `UNKNOWN` / `NOT_AVAILABLE`, never as invented numbers.
  `qualityRow` in `scripts/metrics/lib/identity.ts` writes a `null`
  `metric_value` as `NOT_AVAILABLE`.
- **Determinism.** Run identity is resolved once from the environment/CI context
  with deterministic fallbacks, and `GTAA_GENERATED_AT` can pin the timestamp,
  so a given input dataset yields the same metric records.
- **Reproducibility.** Every metric record carries the full run identity
  (`architecture_type`, `experiment_batch_id`, `run_index`, `tool_name`, ...),
  so any reported number can be traced back to the exact run and source file
  (`source_file`) that produced it, and a baseline run can be paired with its
  TOM counterpart for comparison.
