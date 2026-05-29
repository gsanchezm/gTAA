# gTAA Baseline — Quality Attribute Summary

architecture_type: GTAA_BASELINE
experiment_batch_id: local-batch
run_index: 0
generated_at: 2026-05-29T06:20:28.689Z

One table per quality attribute. Values are drawn from the per-attribute
metric CSVs; `NOT_AVAILABLE` denotes a metric that could not be computed
from available evidence (never fabricated).

## Maintainability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Maintainability | duplicated_loc | 1216 | count | ALL | src+scripts TS; normalized-line proxy |
| Maintainability | duplicated_code_percentage | 18.57 | percent | ALL | src+scripts TS; normalized-line proxy (dup_loc/counted_lines) |
| Maintainability | files_touched_per_change | NOT_AVAILABLE | count | ALL | not meaningful with 1 commit(s); needs >=2 commits |
| Maintainability | average_file_size_loc | 130.97 | loc | ALL | src+scripts TS over 89 files |
| Maintainability | max_file_size_loc | 434 | loc | ALL | src+scripts TS over 89 files |
| Maintainability | cyclomatic_complexity_if_available | NOT_AVAILABLE | count | ALL | no static-analysis tool available in baseline |
| Maintainability | failure_bucket_coverage_percentage | 7.14 | percent | ALL | 1/14 buckets referenced (failure_buckets.csv + tool-events) |
| Maintainability | telemetry_completeness_percentage | 100 | percent | ALL | 6/6 records have all required fields |

## Modifiability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Modifiability | core_files_modified | NOT_AVAILABLE | count | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | execution_layer_files_modified | NOT_AVAILABLE | count | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | adapter_files_modified | NOT_AVAILABLE | count | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | reporting_files_modified | NOT_AVAILABLE | count | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | configuration_files_modified | NOT_AVAILABLE | count | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | loc_added | NOT_AVAILABLE | loc | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | loc_deleted | NOT_AVAILABLE | loc | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | loc_modified | NOT_AVAILABLE | loc | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |
| Modifiability | change_impact_score | NOT_AVAILABLE | score | ALL | no baseline git diff available (single-commit repo) (GTAA_DIFF_BASE unset) |

## Extensibility

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Extensibility | new_tool_files_added | NOT_AVAILABLE | count | ALL | no tool-integration manifest present |
| Extensibility | new_tool_files_modified | NOT_AVAILABLE | count | ALL | no tool-integration manifest present |
| Extensibility | new_tool_loc_added | NOT_AVAILABLE | loc | ALL | no tool-integration manifest present |
| Extensibility | existing_core_files_changed_for_new_tool | NOT_AVAILABLE | count | ALL | no tool-integration manifest present |
| Extensibility | new_action_or_adapter_count | NOT_AVAILABLE | count | ALL | no tool-integration manifest present |
| Extensibility | registration_changes_count | NOT_AVAILABLE | count | ALL | no tool-integration manifest present |
| Extensibility | integration_effort_proxy_score | NOT_AVAILABLE | score | ALL | no tool-integration manifest present |

## Reusability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Reusability | scenario_reuse_ratio | 0.9545 | ratio | ALL | platform_coverage_matrix.csv |
| Reusability | feature_to_tool_coverage | 0.7857 | ratio | ALL | platform_coverage_matrix.csv (executed=distinct (featureFile,toolColumn) covered pairs; expected=#featureFiles*7) |
| Reusability | shared_step_reuse_count | 14 | count | ALL | src/gtaa/test-generation/features/*.feature (distinct normalized steps in >1 scenario) |
| Reusability | shared_contract_reuse_count | 20 | count | ALL | src/gtaa/test-generation/contracts/{locators,api,visual}/*.json (total contract files, each shared across platforms) |
| Reusability | locator_contract_reuse_count | 7 | count | ALL | src/gtaa/test-generation/contracts/locators/*.json |
| Reusability | api_contract_reuse_count | 6 | count | ALL | src/gtaa/test-generation/contracts/api/*.json |
| Reusability | visual_contract_reuse_count | 7 | count | ALL | src/gtaa/test-generation/contracts/visual/*.json |
| Reusability | test_data_reuse_count | 2 | count | ALL | src/gtaa/test-generation/test-data/* (top-level data files) |

## Reliability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Reliability | pass_rate | 0.8333 | ratio | ALL | scenario_outcome_history.csv |
| Reliability | fail_rate | 0.1667 | ratio | ALL | scenario_outcome_history.csv |
| Reliability | flaky_scenario_count | 1 | count | ALL | scenario_outcome_history.csv |
| Reliability | pass_to_fail_probability | 0.3333 | ratio | ALL | scenario_outcome_history.csv |
| Reliability | fail_to_pass_probability | NOT_AVAILABLE | ratio | ALL | scenario_outcome_history.csv (no FAIL-origin transitions) |
| Reliability | retry_count | NOT_AVAILABLE | count | ALL | scenario_outcome_history.csv (no retry data in inputs) |
| Reliability | failure_bucket_distribution:API_CONTRACT_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:API_RESPONSE_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:ASSERTION_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:DATA_SETUP_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:INFRASTRUCTURE_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:LOCATOR_RESOLUTION_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:MOBILE_SESSION_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:PERFORMANCE_THRESHOLD_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:TIMEOUT_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:UI_ACTION_FAILURE | 1 | count | playwright | failure_buckets.csv |
| Reliability | failure_bucket_distribution:UNKNOWN_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:VISUAL_BASELINE_MISSING | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:VISUAL_DIFF_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | failure_bucket_distribution:WEB_SESSION_FAILURE | 0 | count | ALL | failure_buckets.csv |
| Reliability | infrastructure_failure_rate | 0 | ratio | ALL | failure_buckets.csv |
| Reliability | tool_failure_rate | 0.1667 | ratio | playwright | scenario_outcome_history.csv |

## Performance Efficiency

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Performance Efficiency | workflow_duration_ms | NOT_AVAILABLE | ms | ALL | run-manifest/*.json (not recorded outside CI) |
| Performance Efficiency | job_duration_ms | NOT_AVAILABLE | ms | ALL | run-manifest/*.json (not recorded outside CI) |
| Performance Efficiency | scenario_duration_ms | 1907.5 | ms | ALL | scenario_outcome_history.csv |
| Performance Efficiency | step_duration_ms | NOT_AVAILABLE | ms | ALL | tool-events/*.jsonl (no step-level durations) |
| Performance Efficiency | action_duration_ms | NOT_AVAILABLE | ms | ALL | tool-events/*.jsonl (no action-level data) |
| Performance Efficiency | p50_scenario_duration_ms | 1860 | ms | ALL | scenario_outcome_history.csv |
| Performance Efficiency | p95_scenario_duration_ms | 2656.25 | ms | ALL | scenario_outcome_history.csv |
| Performance Efficiency | p99_scenario_duration_ms | 2671.25 | ms | ALL | scenario_outcome_history.csv |
| Performance Efficiency | tool_startup_duration_ms | NOT_AVAILABLE | ms | ALL | not measured |
| Performance Efficiency | telemetry_processing_duration_ms | NOT_AVAILABLE | ms | ALL | not measured |
| Performance Efficiency | proxy_overhead_ms | NOT_AVAILABLE | ms | ALL | not applicable - layered architecture has no such overhead |
| Performance Efficiency | grpc_or_ipc_latency_ms | NOT_AVAILABLE | ms | ALL | not applicable - layered architecture has no such overhead |
| Performance Efficiency | plugin_action_duration_ms | NOT_AVAILABLE | ms | ALL | not applicable - layered architecture has no such overhead |
| Performance Efficiency | p50_scenario_duration_ms | 2637.5 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p95_scenario_duration_ms | 2671.25 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p99_scenario_duration_ms | 2674.25 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p50_scenario_duration_ms | 1225 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p95_scenario_duration_ms | 1247.5 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p99_scenario_duration_ms | 1249.5 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p50_scenario_duration_ms | 1860 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p95_scenario_duration_ms | 1914 | ms | playwright | platform_durations.csv |
| Performance Efficiency | p99_scenario_duration_ms | 1918.8 | ms | playwright | platform_durations.csv |

## Observability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Observability | telemetry_event_count | 6 | count | ALL | tool-events/*.jsonl |
| Observability | telemetry_completeness_percentage | 100 | percent | ALL | tool-events/*.jsonl |
| Observability | missing_run_manifest_count | 0 | count | ALL | tool-events/*.jsonl + run-manifest/*.json |
| Observability | missing_scenario_duration_count | 0 | count | ALL | tool-events/*.jsonl |
| Observability | missing_failure_bucket_count | 0 | count | ALL | tool-events/*.jsonl |
| Observability | classified_failure_percentage | 100 | percent | ALL | tool-events/*.jsonl |
| Observability | unclassified_failure_percentage | 0 | percent | ALL | tool-events/*.jsonl |
| Observability | raw_metrics_uploaded | 1 | boolean | ALL | metrics/raw (CI: uploaded artifacts) |
| Observability | processed_metrics_uploaded | 1 | boolean | ALL | metrics/processed (CI: uploaded artifacts) |
| Observability | logs_uploaded | 0 | boolean | ALL | logs/ (CI: uploaded artifacts) |
| Observability | artifacts_uploaded | 0 | boolean | ALL | results/ \| visual-results/ \| target/gatling (CI: uploaded artifacts) |

## Portability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Portability | environment_specific_config_count | 31 | count | ALL | .env.example \| method=count of KEY= configuration entries (environment config surface) |
| Portability | failed_tool_count | 0 | count | ALL | metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv \| tools with results but no PASS: none |
| Portability | platform_coverage_percentage | 64.94 | percent | ALL | metrics/processed/platform_coverage_matrix.csv \| truthy_cells=100 / expected=(scenarios=22 x 7 dims)=154 |
| Portability | platform_specific_code_count | 3 | count | ALL | src/gtaa/test-execution/appium/* U src/**/*{android,ios}* \| method=files under appium executor dir plus any file whose name encodes android/ios |
| Portability | platform_specific_locator_count | 89 | count | ALL | src/gtaa/test-generation/contracts/locators/*.json \| method=leaf locators with >1 platform variant (web/mobile/android/ios/desktop/responsive); of 155 total locators |
| Portability | successful_platform_matrix_percentage | NOT_AVAILABLE | percent | ALL | metrics/processed result CSVs \| result rows are not keyed to scenario x tool matrix cells; per-cell success rate not computable |
| Portability | successful_tool_count | 3 | count | ALL | metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv \| tools with >=1 PASS: api+gatling+pixelmatch |
| Portability | supported_tool_count | 6 | count | ALL | src/gtaa/test-execution/{playwright,appium(android+ios),api,gatling,pixelmatch} \| method=executor presence; appium counts android+ios separately |

## Interoperability

| Quality Attribute | Metric | Value | Unit | Tool | Source |
| --- | --- | --- | --- | --- | --- |
| Interoperability | api_oracle_available | 1 | boolean | ALL | src/gtaa/test-execution/api + src/gtaa/test-generation/contracts/api/*.json |
| Interoperability | oracle_composition_count | 11 | count | ALL | architecture-supported compositions (component oracles all available) of 11 spec-listed; supported=11 |
| Interoperability | oracle_count | 6 | count | ALL | oracle types {API<-api+contracts/api, UI_WEB<-playwright, UI_MOBILE<-appium, VISUAL_WEB/VISUAL_MOBILE<-pixelmatch+contracts/visual, PERFORMANCE<-gatling} \| count of available types |
| Interoperability | performance_oracle_available | 1 | boolean | ALL | src/gtaa/test-execution/gatling |
| Interoperability | successful_oracle_composition_count | 3 | count | ALL | metrics/processed/{api_isolated_results,visual_comparison_results,performance_summary}.csv \| single-oracle compositions with PASS evidence: API only; Performance only; Visual Web only; no multi-oracle chaining evidence |
| Interoperability | tool_count | 6 | count | ALL | src/gtaa/test-execution/{playwright,appium(android+ios),api,gatling,pixelmatch} \| method=executor presence; appium counts android+ios separately |
| Interoperability | ui_oracle_available | 1 | boolean | ALL | src/gtaa/test-execution/{playwright,appium} \| UI web and/or mobile executor present |
| Interoperability | visual_oracle_available | 1 | boolean | ALL | src/gtaa/test-execution/pixelmatch + src/gtaa/test-generation/contracts/visual/*.json |
