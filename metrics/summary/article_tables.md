# gTAA Baseline — Article Tables

architecture_type: GTAA_BASELINE
experiment_batch_id: local-batch
run_index: 0
generated_at: 2026-05-29T05:10:10.863Z

## Platform Coverage Matrix

| platform | scenarios_covered | total_scenarios |
| --- | --- | --- |
| desktop | 17 | 22 |
| responsive | 15 | 22 |
| android | 18 | 22 |
| ios | 18 | 22 |
| api | 8 | 22 |
| performance | 3 | 22 |
| visual | 21 | 22 |

## Scenario Durations (aggregate)

| metric | value |
| --- | --- |
| count | 6 |
| p50_ms | 1860 |
| p95_ms | 2656.25 |
| p99_ms | 2671.25 |
| mean_ms | 1907.5 |
| min_ms | 1200 |
| max_ms | 2675 |

## API Isolated Results

Pass: 1 / 1

| endpoint_id | method | path | response_status | response_time_ms | status |
| --- | --- | --- | --- | --- | --- |
| createOrder | POST | /api/orders | 201 | 198 | PASS |

## Visual Comparison Results

Pass: 1 / 1

| snapshot_id | platform | viewport | diff_pixels | diff_ratio | status |
| --- | --- | --- | --- | --- | --- |
| catalog-grid | desktop | desktop | 12 | 0.0004 | PASS |

## Performance Summary

| simulation_name | request_count | failure_count | p95_response_time_ms | threshold_status |
| --- | --- | --- | --- | --- |
| OrderLoadSimulation | 1000 | 6 | 410 | PASS |

## Failure Buckets

| failure_bucket | count |
| --- | --- |
| UI_ACTION_FAILURE | 1 |
