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
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

  // On failure, capture a screenshot + native UI hierarchy BEFORE teardown (the
  // session is still alive here) so a red CI run is debuggable from the uploaded
  // results/** artifact. Fully guarded — diagnostics must never break a run.
  if (failed && this.hasDriver()) {
    await captureFailureDiagnostics(this, scenario.pickle.name).catch(() => undefined);
  }

  await this.disposeDriver().catch(() => undefined);
});

/**
 * Best-effort on-failure capture: a page/screen PNG and (mobile) the native UI
 * source, written under results/diagnostics/ which every job already uploads.
 * Every step is wrapped so a capture failure never affects the scenario outcome.
 */
async function captureFailureDiagnostics(
  world: GtaaWorld,
  scenarioName: string,
): Promise<void> {
  try {
    const ui = await world.ui();
    const dir = join(process.cwd(), 'results', 'diagnostics');
    mkdirSync(dir, { recursive: true });
    const safe = (scenarioName || 'scenario').replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
    const base = join(dir, `${world.context.platform}-${safe}-${world.runId}`);
    try {
      const png = await ui.capturePage();
      writeFileSync(`${base}.png`, png);
    } catch {
      /* screenshot best-effort */
    }
    try {
      const src = ui.dumpPageSource ? await ui.dumpPageSource() : '';
      if (src) writeFileSync(`${base}.xml`, src, 'utf8');
    } catch {
      /* page source best-effort */
    }
  } catch {
    /* diagnostics must never break teardown */
  }
}

function mapStatus(status?: (typeof Status)[keyof typeof Status]): ExecutionStatus {
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
