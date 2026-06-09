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
  scrollIntoView,
  dismissNativeAlert,
} from '../../test-adaptation/drivers/appium/mobile-actions';

/** webdriverio remote() options shape (kept local; tsconfig has types: ["node"]). */
type RemoteOptions = {
  hostname: string;
  port: number;
  path: string;
  capabilities: Record<string, unknown>;
  logLevel?: string;
};

/** Transient Appium session-bootstrap failures that are worth a retry. */
const TRANSIENT_SESSION_REGEX =
  /never started|socket hang up|econnrefused|econnreset|cannot start|unable to|could not start|instrumentation process|not responding|timed? ?out/i;

function isTransientSessionError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return TRANSIENT_SESSION_REGEX.test(msg);
}

/**
 * AUT application id. The OmniPizza APK registers the `omnipizza://` scheme on
 * this package's MainActivity; deep links are targeted at it to apply a CH
 * language override the bottom-nav tap cannot carry.
 */
const AUT_ANDROID_PACKAGE = 'com.omnipizza.app';

/** Extract the `lang` query-param value from a URL query string ('' if absent). */
function langParamOf(query: string): string {
  const m = query.match(/(?:^|&)lang=([^&]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

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

    // Retry the session bootstrap on transient hiccups (a freshly-reset app can
    // briefly fail to start its main activity, the UIAutomator2 socket can hang
    // up, etc.). Mirrors the reference's session-bootstrap resilience.
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // remote() returns the rich webdriverio Browser; we only consume the
        // loose MobileSession surface, so narrow through unknown.
        this.session = (await remote(options as never)) as unknown as MobileSession;
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts && isTransientSessionError(err)) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }
        break;
      }
    }
    throw new ClassifiedError(
      FailureBucket.MOBILE_SESSION_FAILURE,
      `Failed to start Appium ${this.platform} session at ` +
        `${this.config.appiumHost}:${this.config.appiumPort}`,
      { cause: lastErr },
    );
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

  /**
   * Mobile has no URL routing — map the known app routes to a bottom-nav tap so
   * a use case that "navigates" to a section reaches it the way a user would.
   * `catalog` is the post-login default; `profile`/`checkout` are bottom-nav
   * tabs (`~nav-*`). Routes without a tab (e.g. order-success, reached via its
   * own flow) are a no-op.
   */
  async navigate(url: string): Promise<void> {
    const [path, query = ''] = url.split('?');
    const section = path.replace(/^\/+/, '').split('/')[0];
    const navTestId: Record<string, string> = {
      catalog: 'nav-catalog',
      checkout: 'nav-checkout',
      profile: 'nav-profile',
    };
    const target = navTestId[section];
    if (target) {
      try {
        await safeTap(this.requireSession(), `~${target}`, this.platformKind, this.timeoutMs);
      } catch {
        // Best-effort: the app may already be on the target section.
      }
    }
    // A bottom-nav tap cannot carry the `?lang=` the web path uses to switch the
    // CH market between German and French. The AUT applies a `lang` override only
    // through its deep-link handler (and the store guards it to CH), so deliver an
    // `omnipizza://<route>?lang=<lang>` deep link for de/fr. Other languages ride
    // along with the market the login already selected (and the AUT handler
    // ignores them), so en/es/ja are skipped — leaving the market path untouched.
    const lang = langParamOf(query);
    if (lang === 'fr' || lang === 'de') {
      await this.applyMobileLanguage(section || 'catalog', lang);
    }
  }

  /**
   * Apply a CH language override (de/fr) that the bottom-nav tap cannot carry, by
   * delivering an `omnipizza://<route>?lang=<lang>` deep link to the running app.
   * The AUT's deep-link handler calls the store's CH-guarded setLanguage, which
   * the live session picks up warmly (onNewIntent), so the screen re-renders in
   * the chosen language without losing the logged-in session. Android only (the
   * deep-link command takes a `package`); best-effort — the override only matters
   * for CH, so a failure here must never break navigation.
   */
  protected async applyMobileLanguage(route: string, lang: string): Promise<void> {
    if (this.platformKind !== 'android') return;
    const url = `omnipizza://${route}?lang=${encodeURIComponent(lang)}`;
    try {
      await this.requireSession().execute('mobile: deepLink', {
        url,
        package: AUT_ANDROID_PACKAGE,
      });
    } catch {
      // Best-effort: never fail navigation on the language override.
    }
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

  /**
   * Native mobile has no page context for arbitrary JS evaluation. Only the
   * web flows (localStorage seeding, login sentinel) use this; they are guarded
   * by a platform check upstream and never reach a native executor.
   */
  async evaluate(_script: string): Promise<string> {
    throw new ClassifiedError(
      FailureBucket.UI_ACTION_FAILURE,
      'evaluate() is web-only; native mobile executors do not support script evaluation',
    );
  }

  /** Scroll a below-the-fold element into view (UiScrollable on Android). */
  async scrollTo(ref: string): Promise<void> {
    await scrollIntoView(this.requireSession(), this.selectorFor(ref), this.platformKind);
  }

  /**
   * Dismiss the native "Profile saved" AlertDialog OmniPizza pops after a save.
   * Android-only: the `android:id/button1` selector is invalid on iOS (it crashes
   * the plugin session), so it is gated on the android platform; best-effort and
   * never throws so a missing dialog cannot fail the flow.
   */
  async dismissNativeDialog(): Promise<void> {
    if (this.platformKind !== 'android') return;
    await dismissNativeAlert(this.requireSession());
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
