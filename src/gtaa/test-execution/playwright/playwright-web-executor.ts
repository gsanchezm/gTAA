/**
 * Test Execution layer — Playwright web executor (desktop + responsive).
 *
 * Concrete implementation of the Test Adaptation `UiDriver` contract for the
 * web. This class lives in the Test Execution layer and calls the Test
 * Adaptation locator resolver (`resolveLocator`) DIRECTLY — there is no
 * indirection layer between the two. Everything above this file only ever sees
 * the neutral `UiDriver` interface, so swapping the automation tool never
 * leaks upward (KISS / dependency inversion).
 */
import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';

import type { CaptureOptions, UiDriver } from '../../test-adaptation/drivers/ui-driver';
import { resolveLocator } from '../../test-adaptation/locators/locator-resolver';
import { webConfig } from '../../configuration/environments/env';
import { webToolConfig } from '../../configuration/tools/playwright.config';
import type { ExecutionContext } from '../../shared/types';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';

export class PlaywrightWebExecutor implements UiDriver {
  readonly platform: string;

  private browser?: Browser;
  private browserContext?: BrowserContext;
  private currentPage?: Page;

  constructor(private readonly context: ExecutionContext) {
    this.platform = context.platform;
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    const web = webConfig();
    const tool = webToolConfig();
    try {
      this.browser = await chromium.launch({
        headless: web.headless,
        channel: tool.channel,
        args: tool.args,
        slowMo: tool.slowMo,
      });
      this.browserContext = await this.browser.newContext({
        viewport: this.viewportForPlatform(),
      });
      this.currentPage = await this.browserContext.newPage();
    } catch (error) {
      // Best-effort cleanup so a half-started session never leaks resources.
      await this.stop();
      throw new ClassifiedError(
        FailureBucket.WEB_SESSION_FAILURE,
        'Failed to launch Playwright web session',
        { cause: error },
      );
    }
  }

  /** Safe to call repeatedly; tears down everything that was opened. */
  async stop(): Promise<void> {
    try {
      await this.currentPage?.close();
    } catch {
      /* idempotent: ignore close errors */
    } finally {
      this.currentPage = undefined;
    }

    try {
      await this.browserContext?.close();
    } catch {
      /* idempotent: ignore close errors */
    } finally {
      this.browserContext = undefined;
    }

    try {
      await this.browser?.close();
    } catch {
      /* idempotent: ignore close errors */
    } finally {
      this.browser = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation + actions
  // ---------------------------------------------------------------------------

  async navigate(url: string): Promise<void> {
    const page = this.requirePage();
    try {
      await page.goto(url, { timeout: webConfig().timeoutMs });
    } catch (error) {
      throw this.classify(error, FailureBucket.UI_ACTION_FAILURE, `Failed to navigate to "${url}"`);
    }
  }

  async click(ref: string): Promise<void> {
    const timeout = webConfig().timeoutMs;
    const locator = this.locate(ref);
    try {
      await locator.waitFor({ state: 'visible', timeout });
      await locator.click({ timeout });
    } catch (error) {
      throw this.classify(error, FailureBucket.UI_ACTION_FAILURE, `Failed to click "${ref}"`);
    }
  }

  async type(ref: string, text: string): Promise<void> {
    const timeout = webConfig().timeoutMs;
    const locator = this.locate(ref);
    try {
      await locator.waitFor({ state: 'visible', timeout });
      await locator.fill(text, { timeout });
    } catch (error) {
      throw this.classify(error, FailureBucket.UI_ACTION_FAILURE, `Failed to type into "${ref}"`);
    }
  }

  async getText(ref: string): Promise<string> {
    const timeout = webConfig().timeoutMs;
    const locator = this.locate(ref);
    try {
      await locator.waitFor({ state: 'visible', timeout });
      return (await locator.textContent({ timeout })) ?? '';
    } catch (error) {
      throw this.classify(error, FailureBucket.UI_ACTION_FAILURE, `Failed to read text of "${ref}"`);
    }
  }

  async isVisible(ref: string): Promise<boolean> {
    const locator = this.locate(ref);
    try {
      return await locator.isVisible();
    } catch (error) {
      throw this.classify(
        error,
        FailureBucket.UI_ACTION_FAILURE,
        `Failed to read visibility of "${ref}"`,
      );
    }
  }

  async waitForVisible(ref: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? webConfig().timeoutMs;
    const locator = this.locate(ref);
    try {
      await locator.waitFor({ state: 'visible', timeout });
    } catch (error) {
      throw this.classify(error, FailureBucket.UI_ACTION_FAILURE, `"${ref}" never became visible`);
    }
  }

  // ---------------------------------------------------------------------------
  // Visual capture (consumed by the visual executor through UiDriver methods
  // ONLY — no Playwright types cross this boundary).
  // ---------------------------------------------------------------------------

  /**
   * Capture a single element region as PNG bytes.
   *
   * Playwright's `Locator.screenshot()` does not support masking, so when masks
   * are requested we take a page screenshot clipped to the element's bounding
   * box and apply masks there. With no masks we use the cheaper element
   * screenshot directly.
   */
  async captureRegion(ref: string, options?: CaptureOptions): Promise<Buffer> {
    const timeout = webConfig().timeoutMs;
    const page = this.requirePage();
    const locator = this.locate(ref);
    const masks = this.resolveMasks(options);
    try {
      await locator.waitFor({ state: 'visible', timeout });

      if (masks.length === 0) {
        return await locator.screenshot({ type: 'png' });
      }

      const box = await locator.boundingBox();
      if (!box) {
        // Cannot clip without a bounding box; fall back to an unmasked element shot.
        return await locator.screenshot({ type: 'png' });
      }
      return await page.screenshot({
        type: 'png',
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
        mask: masks,
      });
    } catch (error) {
      throw this.classify(error, FailureBucket.UI_ACTION_FAILURE, `Failed to capture region "${ref}"`);
    }
  }

  /** Capture a full-page PNG, masking any requested regions. */
  async capturePage(options?: CaptureOptions): Promise<Buffer> {
    const page = this.requirePage();
    const masks = this.resolveMasks(options);
    try {
      return await page.screenshot({ type: 'png', fullPage: true, mask: masks });
    } catch (error) {
      throw this.classify(error, FailureBucket.UI_ACTION_FAILURE, 'Failed to capture page');
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers (DRY: one place to resolve locators, one place to classify)
  // ---------------------------------------------------------------------------

  /** Resolve a neutral ref to a live Playwright Locator on the current page. */
  private locate(ref: string): Locator {
    const page = this.requirePage();
    return page.locator(this.resolveSelector(ref));
  }

  /**
   * Resolve a neutral ref to a concrete web selector via the Test Adaptation
   * locator resolver. The resolver returns strategy 'web' for desktop and
   * responsive platforms; this executor only ever runs on those, so the
   * selector is always a CSS/Playwright selector string.
   */
  private resolveSelector(ref: string): string {
    try {
      const { selector } = resolveLocator(ref, this.context.platform);
      return selector;
    } catch (error) {
      if (error instanceof ClassifiedError) {
        return this.rethrow(error);
      }
      throw new ClassifiedError(
        FailureBucket.LOCATOR_RESOLUTION_FAILURE,
        `Could not resolve locator "${ref}"`,
        { cause: error },
      );
    }
  }

  /** Resolve each maskRef to a Locator; empty/undefined yields no masks. */
  private resolveMasks(options?: CaptureOptions): Locator[] {
    const refs = options?.maskRefs;
    if (!refs || refs.length === 0) {
      return [];
    }
    const page = this.requirePage();
    return refs.map((ref) => page.locator(this.resolveSelector(ref)));
  }

  /** Choose the context viewport from the platform; non-responsive => desktop. */
  private viewportForPlatform(): { width: number; height: number } {
    const web = webConfig();
    return this.context.platform === 'responsive' ? web.responsive : web.desktop;
  }

  /** Return the live page or fail loudly if start() was not called. */
  private requirePage(): Page {
    if (!this.currentPage) {
      throw new ClassifiedError(
        FailureBucket.WEB_SESSION_FAILURE,
        'No active web page; call start() before interacting',
      );
    }
    return this.currentPage;
  }

  /**
   * Single classification point: re-throw ClassifiedErrors untouched, map
   * Playwright timeouts to TIMEOUT_FAILURE, and bucket everything else under
   * the provided default bucket.
   */
  private classify(error: unknown, fallback: FailureBucket, message: string): ClassifiedError {
    if (error instanceof ClassifiedError) {
      return error;
    }
    const isTimeout =
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'TimeoutError';
    return new ClassifiedError(isTimeout ? FailureBucket.TIMEOUT_FAILURE : fallback, message, {
      cause: error,
    });
  }

  /** Narrow helper so a caught ClassifiedError keeps its original bucket. */
  private rethrow(error: ClassifiedError): never {
    throw error;
  }
}
