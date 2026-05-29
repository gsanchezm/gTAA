/**
 * AppiumExecutorBase — Test Execution layer.
 *
 * Shared base for the Android and iOS Appium executors. It owns the webdriverio
 * session lifecycle and implements the frozen `UiDriver` contract by delegating
 * every interaction to the shared defensive helpers in the Test Adaptation layer
 * (mobile-actions). Subclasses supply only their capabilities and the platform
 * discriminator that drives selector/scroll nuances.
 *
 * This is the Test Execution layer calling the Test Adaptation layer
 * (resolveLocator + mobile-actions) DIRECTLY — there is no indirection or
 * dispatch layer between them.
 *
 * RELATIVE imports only.
 */

// `webdriverio` is the runtime dependency used to create the Appium session.
import { remote } from 'webdriverio';

import type { UiDriver, CaptureOptions } from '../../test-adaptation/drivers/ui-driver';
import { resolveLocator } from '../../test-adaptation/locators/locator-resolver';
import { mobileConfig, type MobileConfig } from '../../configuration/environments/env';
import type { ExecutionContext } from '../../shared/types';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import {
  type MobileSession,
  type MobilePlatformKind,
  safeTap,
  safeType,
  safeGetText,
  isDisplayed,
  waitForDisplayed,
  captureElement,
} from '../../test-adaptation/drivers/appium/mobile-actions';

/** webdriverio remote() options shape (kept local; tsconfig has types: ["node"]). */
type RemoteOptions = {
  hostname: string;
  port: number;
  path: string;
  capabilities: Record<string, unknown>;
  logLevel?: string;
};

export abstract class AppiumExecutorBase implements UiDriver {
  /** Public, neutral platform tag required by the UiDriver contract. */
  readonly platform: string;

  protected session: MobileSession | undefined;
  protected readonly config: MobileConfig;
  protected readonly executionContext: ExecutionContext;

  constructor(executionContext: ExecutionContext, config: MobileConfig = mobileConfig()) {
    this.executionContext = executionContext;
    this.config = config;
    this.platform = executionContext.platform;
  }

  /** Concrete platform discriminator (drives scroll/selector nuance + caps). */
  protected abstract readonly platformKind: MobilePlatformKind;

  /** Subclass-specific Appium capabilities built from the shared config. */
  protected abstract buildCapabilities(): Record<string, unknown>;

  /** Effective explicit-wait/interaction timeout from the shared mobile config. */
  protected get timeoutMs(): number {
    return this.config.timeoutMs;
  }

  // ---- UiDriver lifecycle -------------------------------------------------

  async start(): Promise<void> {
    if (this.session) return; // idempotent

    const options: RemoteOptions = {
      hostname: this.config.appiumHost,
      port: this.config.appiumPort,
      path: '/',
      logLevel: 'error',
      capabilities: this.buildCapabilities(),
    };

    try {
      // remote() returns the rich webdriverio Browser; we only consume the
      // loose MobileSession surface, so narrow through unknown.
      this.session = (await remote(options as never)) as unknown as MobileSession;
    } catch (err) {
      throw new ClassifiedError(
        FailureBucket.MOBILE_SESSION_FAILURE,
        `Failed to start Appium ${this.platform} session at ` +
          `${this.config.appiumHost}:${this.config.appiumPort}`,
        { cause: err },
      );
    }
  }

  async stop(): Promise<void> {
    const session = this.session as unknown as
      | { deleteSession?: () => Promise<void> }
      | undefined;
    if (!session) return; // safe / idempotent
    try {
      if (session.deleteSession) {
        await session.deleteSession();
      }
    } catch {
      // Teardown must never throw; best-effort cleanup.
    } finally {
      this.session = undefined;
    }
  }

  /** Mobile apps launch with the session, so navigation is a no-op. */
  async navigate(_url: string): Promise<void> {
    // Intentional no-op for mobile: the app under test is launched as part of
    // session creation via the `appium:app` capability.
    return;
  }

  // ---- UiDriver interactions (delegated to shared defensive helpers) ------

  async click(ref: string): Promise<void> {
    await safeTap(this.requireSession(), this.selectorFor(ref), this.platformKind, this.timeoutMs);
  }

  async type(ref: string, text: string): Promise<void> {
    await safeType(
      this.requireSession(),
      this.selectorFor(ref),
      text,
      this.platformKind,
      this.timeoutMs,
    );
  }

  async getText(ref: string): Promise<string> {
    return safeGetText(
      this.requireSession(),
      this.selectorFor(ref),
      this.platformKind,
      this.timeoutMs,
    );
  }

  async isVisible(ref: string): Promise<boolean> {
    // Resolve the selector first: an invalid/missing locator contract surfaces
    // as a thrown LOCATOR_RESOLUTION_FAILURE (from resolveLocator). Only the
    // runtime element query inside isDisplayed() degrades to `false` — i.e.
    // "the selector is valid but the element is not currently displayed".
    const selector = this.selectorFor(ref);
    return isDisplayed(this.requireSession(), selector);
  }

  async waitForVisible(ref: string, timeoutMs?: number): Promise<void> {
    await waitForDisplayed(
      this.requireSession(),
      this.selectorFor(ref),
      timeoutMs ?? this.timeoutMs,
    );
  }

  // ---- UiDriver captures ---------------------------------------------------

  /**
   * Capture a single element/region as PNG bytes.
   *
   * NOTE on masking: webdriverio element screenshots do not support per-region
   * masking at capture time, so `options.maskRefs` is intentionally not applied
   * here. Masking of sensitive regions is deferred to the visual-comparison
   * layer, which can overlay masks using the same element refs.
   */
  async captureRegion(ref: string, _options?: CaptureOptions): Promise<Buffer> {
    return captureElement(
      this.requireSession(),
      this.selectorFor(ref),
      this.platformKind,
      this.timeoutMs,
    );
  }

  /** Capture a full-screen PNG. (maskRefs deferred to the visual layer.) */
  async capturePage(_options?: CaptureOptions): Promise<Buffer> {
    const session = this.requireSession();
    try {
      const base64 = await session.takeScreenshot();
      return Buffer.from(base64, 'base64');
    } catch (err) {
      throw new ClassifiedError(
        FailureBucket.UI_ACTION_FAILURE,
        'Failed to capture screen',
        { cause: err },
      );
    }
  }

  // ---- helpers -------------------------------------------------------------

  /**
   * Resolve a neutral ref to a concrete Appium selector string (Test Adaptation
   * call). resolveLocator already throws a classified LOCATOR_RESOLUTION_FAILURE
   * on failure, so it is surfaced as-is.
   */
  protected selectorFor(ref: string): string {
    return resolveLocator(ref, this.executionContext.platform).selector;
  }

  /** Guard that the session has been started before interaction. */
  protected requireSession(): MobileSession {
    if (!this.session) {
      throw new ClassifiedError(
        FailureBucket.MOBILE_SESSION_FAILURE,
        'Appium session not started; call start() first',
      );
    }
    return this.session;
  }
}
