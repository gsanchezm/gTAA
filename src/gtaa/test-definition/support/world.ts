/**
 * Cucumber World for the gTAA baseline.
 *
 * Cucumber instantiates one World per scenario, which is the core of Automated
 * Atomic Testing in this architecture: every scenario gets isolated state, its
 * own UI session (created on demand), and emits its own telemetry. No state is
 * shared between scenarios.
 */
import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import { resolveExecutionContext } from '../../test-adaptation/drivers/execution-context';
import { createUiDriver } from '../../test-adaptation/drivers/driver-factory';
import type { UiDriver } from '../../test-adaptation/drivers/ui-driver';
import type { ExecutionContext } from '../../shared/types';
import { runIdentity } from '../../test-reporting/telemetry/run-context';

export class GtaaWorld extends World {
  readonly context: ExecutionContext;
  readonly runId: string;

  /** Per-scenario scratch state (kept isolated; never shared across scenarios). */
  readonly state: Record<string, unknown> = {};

  private driver: UiDriver | null = null;
  private driverStarted = false;

  constructor(options: IWorldOptions) {
    super(options);
    this.context = resolveExecutionContext();
    this.runId = runIdentity().run_id;
  }

  /** Lazily create and start the UI driver for UI platforms. */
  async ui(): Promise<UiDriver> {
    if (this.context.driver === 'api') {
      throw new Error('UI driver requested in an API-only execution context');
    }
    if (!this.driver) {
      this.driver = createUiDriver(this.context);
    }
    if (!this.driverStarted) {
      await this.driver.start();
      this.driverStarted = true;
    }
    return this.driver;
  }

  hasDriver(): boolean {
    return this.driver !== null && this.driverStarted;
  }

  async disposeDriver(): Promise<void> {
    if (this.driver && this.driverStarted) {
      await this.driver.stop();
    }
    this.driver = null;
    this.driverStarted = false;
  }
}

setWorldConstructor(GtaaWorld);
