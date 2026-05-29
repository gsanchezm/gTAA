# Quality Attributes — Architecture Measurement Model

This table evaluates the **test automation architecture**, not the
application under test. The same attributes and schema are emitted by both
the gTAA baseline (`architecture_type = GTAA_BASELINE`) and the comparison
repository, so the architecture is the independent variable.

| Quality Attribute | Operational Definition | Example Metrics | Interpretation |
| --- | --- | --- | --- |
| Maintainability | Ability to understand, modify, debug, and maintain the automation architecture. | duplicated LOC, file size, telemetry completeness, failure bucket coverage. | Lower duplication and higher telemetry completeness indicate better maintainability. |
| Modifiability | Amount of existing architecture code affected by a change. | core files modified, adapter files modified, LOC modified, change impact score. | Lower change impact indicates better modifiability. |
| Extensibility | Ability to add new tools, oracles, or execution capabilities with localized changes. | new tool files added, existing core files changed, integration effort proxy score. | Lower core modification and lower integration impact indicate better extensibility. |
| Reusability | Reuse of scenarios, contracts, test data, and steps across tools/platforms. | scenario reuse ratio, contract reuse count, feature-to-tool coverage. | Higher reuse indicates stronger cross-platform architecture. |
| Reliability | Stability of repeated automation executions. | pass rate, fail rate, pass-to-fail probability, flaky scenario count. | Higher pass rate and lower pass-to-fail probability indicate better reliability. |
| Performance Efficiency | Execution efficiency under equivalent tool and CI conditions. | workflow duration, job duration, p50/p95/p99 scenario duration. | Lower duration under equivalent coverage indicates better performance efficiency. |
| Observability | Ability to explain execution behavior and classify failures. | telemetry completeness, classified failure percentage, logs/artifacts uploaded. | Higher telemetry completeness and classified failure coverage indicate better observability. |
| Portability | Ability to execute consistently across tools, platforms, and environments. | successful tool count, platform coverage percentage, environment-specific config count. | Higher successful platform coverage indicates better portability. |
| Interoperability | Ability to integrate heterogeneous testing tools and composable oracles. | tool count, oracle count, successful oracle composition count. | Higher successful oracle composition indicates better interoperability. |
