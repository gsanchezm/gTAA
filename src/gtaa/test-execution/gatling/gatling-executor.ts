/**
 * Test Execution layer — Gatling performance executor.
 *
 * Runs a Gatling simulation via the Gatling JS bundle, parses the resulting
 * stats, and returns a normalized GatlingSummary. Direct service invocation —
 * the executor talks to the performance tool itself with no indirection layer.
 *
 * The executor is a thin façade over the run-simulation orchestrator: it keeps
 * the frozen public signature stable while delegating the JVM/CLI-bound work and
 * the (pure, testable) summary building to run-simulation.ts.
 */
import type { GatlingSummary } from '../../shared/types';
import { normalizeProfile } from '../../configuration/tools/gatling.config';
import { runSimulation } from './run-simulation';

export interface GatlingRunOptions {
  simulationName: string;
  profile: string;
}

export class GatlingExecutor {
  async run(options: GatlingRunOptions): Promise<GatlingSummary> {
    // run-simulation never throws — it captures run/parse failures into the
    // summary's threshold_status (UNKNOWN) and failure_bucket so metrics are
    // never lost.
    return runSimulation({
      simulationName: options.simulationName,
      profile: normalizeProfile(options.profile),
    });
  }
}
