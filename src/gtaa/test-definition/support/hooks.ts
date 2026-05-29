/**
 * Atomic per-scenario lifecycle + scenario/step telemetry emission.
 *
 * - BeforeAll writes the run manifest once.
 * - Before/After give each scenario isolated setup and guaranteed teardown.
 * - AfterStep records step duration.
 * - After classifies the outcome (PASS/FAIL/SKIP) into a failure bucket and
 *   emits a TelemetryEvent — even on failure — so metrics are never lost.
 */
import {
  After,
  AfterStep,
  Before,
  BeforeAll,
  Status,
  type ITestCaseHookParameter,
  type ITestStepHookParameter,
} from '@cucumber/cucumber';
import { GtaaWorld } from './world';
import { runIdentity } from '../../test-reporting/telemetry/run-context';
import { emitToolEvent, writeRunManifest } from '../../test-reporting/telemetry/telemetry-writer';
import { classifyError, errorMessage, FailureBucket } from '../../shared/failure-buckets';
import type { ExecutionStatus, TelemetryEvent } from '../../shared/types';

BeforeAll(function () {
  try {
    writeRunManifest();
  } catch {
    /* manifest is best-effort; never block execution */
  }
});

Before(function (this: GtaaWorld, scenario: ITestCaseHookParameter) {
  this.state.__scenarioStart = Date.now();
  this.state.__featureName = scenario.gherkinDocument.feature?.name ?? null;
  this.state.__scenarioName = scenario.pickle.name;
});

AfterStep(function (this: GtaaWorld, step: ITestStepHookParameter) {
  const id = runIdentity();
  const duration = step.result.duration
    ? step.result.duration.seconds * 1000 + step.result.duration.nanos / 1e6
    : null;
  const status = mapStatus(step.result.status);
  const event: TelemetryEvent = {
    ...id,
    feature: (this.state.__featureName as string | null) ?? null,
    scenario: (this.state.__scenarioName as string) ?? 'unknown',
    step: stepText(step),
    platform: this.context.platform,
    viewport: this.context.viewport,
    status,
    duration_ms: duration,
    failure_bucket:
      status === 'FAIL'
        ? step.result.message
          ? classifyError(step.result.message)
          : FailureBucket.UNKNOWN_FAILURE
        : null,
    error_message: status === 'FAIL' ? sanitize(step.result.message) : null,
  };
  safeEmit(event);
});

After(async function (this: GtaaWorld, scenario: ITestCaseHookParameter) {
  const id = runIdentity();
  const start = (this.state.__scenarioStart as number) ?? Date.now();
  const status = mapStatus(scenario.result?.status);
  const failed = status === 'FAIL';

  const event: TelemetryEvent = {
    ...id,
    feature: scenario.gherkinDocument.feature?.name ?? null,
    scenario: scenario.pickle.name,
    step: null,
    platform: this.context.platform,
    viewport: this.context.viewport,
    status,
    duration_ms: Date.now() - start,
    failure_bucket: failed
      ? scenario.result?.message
        ? classifyError(scenario.result.message)
        : FailureBucket.UNKNOWN_FAILURE
      : null,
    error_message: failed ? sanitize(scenario.result?.message) : null,
  };
  safeEmit(event);

  await this.disposeDriver().catch(() => undefined);
});

function mapStatus(status?: Status): ExecutionStatus {
  switch (status) {
    case Status.PASSED:
      return 'PASS';
    case Status.FAILED:
    case Status.AMBIGUOUS:
      return 'FAIL';
    case Status.SKIPPED:
    case Status.PENDING:
    case Status.UNDEFINED:
      return 'SKIP';
    default:
      return 'UNKNOWN';
  }
}

function stepText(step: ITestStepHookParameter): string | null {
  const pickleStep = step.pickleStep;
  return pickleStep ? pickleStep.text : null;
}

function sanitize(message?: string): string | null {
  if (!message) return null;
  // Trim and cap to avoid leaking large payloads into telemetry.
  return errorMessage(message).split('\n').slice(0, 3).join(' ').slice(0, 500);
}

function safeEmit(event: TelemetryEvent): void {
  try {
    emitToolEvent(event);
  } catch {
    /* telemetry must never break a test run */
  }
}
