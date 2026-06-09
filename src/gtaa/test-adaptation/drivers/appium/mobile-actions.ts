/**
 * Shared mobile defensive actions — Test Adaptation layer.
 *
 * Pure, session-taking helper functions reused by every Appium executor in the
 * Test Execution layer. Centralizing the defensive behaviour here keeps the
 * executors thin (DRY) and lets Android and iOS differ only in capabilities and
 * selector/scroll nuances.
 *
 * Defensive behaviours implemented:
 *   - explicit wait (poll until displayed or timeout -> TIMEOUT_FAILURE)
 *   - safeTap (wait visible -> scroll into view if needed -> tap; retry once on
 *     stale element; classify no-such-element as LOCATOR_RESOLUTION_FAILURE)
 *   - dismissKeyboard (guarded; no-op when unsupported / no keyboard shown)
 *   - scrollIntoView (native WDIO scrollIntoView -> UiScrollable for Android, a
 *     bounded direction-swipe fallback for iOS)
 *   - stale-element handling via selector re-resolution + single retry
 *
 * Errors are classified into FailureBucket values so higher layers can react
 * uniformly. RELATIVE imports only.
 */

import { ClassifiedError, FailureBucket } from '../../../shared/failure-buckets';

/**
 * The webdriverio session is typed loosely on purpose: this shared module stays
 * decoupled from a specific webdriverio type surface (the executors own session
 * lifecycle and pass their live session in). Every method declared here is part
 * of the standard webdriverio/Appium runtime surface.
 */
export type MobileSession = {
  $(selector: string): Promise<MobileElement>;
  isKeyboardShown?(): Promise<boolean>;
  hideKeyboard?(): Promise<void>;
  /** Execute a mobile: command (e.g. 'mobile: swipe', 'mobile: scrollGesture'). */
  execute(script: string, ...args: unknown[]): Promise<unknown>;
  /** Viewport size, used to bound gesture-scroll areas. */
  getWindowSize?(): Promise<{ width: number; height: number }>;
  takeScreenshot(): Promise<string>;
  /** Native UI hierarchy dump (Appium getPageSource), for on-failure diagnostics. */
  getPageSource?(): Promise<string>;
};

/**
 * Minimal element surface used by the defensive helpers, mirroring the
 * webdriverio element shape for the methods actually called.
 */
export type MobileElement = {
  isDisplayed(): Promise<boolean>;
  click(): Promise<void>;
  setValue(value: string): Promise<void>;
  clearValue?(): Promise<void>;
  getText(): Promise<string>;
  /** Find descendant elements (used to aggregate a container's text on Android). */
  $$?(selector: string): Promise<MobileElement[]>;
  takeScreenshot(): Promise<string>;
  /**
   * webdriverio's native scroll-into-view. On Android (UiAutomator2) this is
   * backed by UiScrollable; on iOS it falls back to gesture scrolling.
   */
  scrollIntoView?(): Promise<void>;
};

/** Default explicit-wait timeout (ms) when callers do not specify one. */
export const DEFAULT_WAIT_TIMEOUT_MS = 10_000;
/** Polling interval (ms) for the explicit wait loop. */
export const DEFAULT_POLL_INTERVAL_MS = 250;

/** Platform discriminator used to pick scroll/selector nuances. */
export type MobilePlatformKind = 'android' | 'ios';

/** Recognise webdriverio/Appium stale-element errors heuristically. */
export function isStaleElementError(err: unknown): boolean {
  const msg = messageOf(err).toLowerCase();
  return msg.includes('stale') || msg.includes('staleelementreference');
}

/** Recognise webdriverio/Appium no-such-element errors heuristically. */
export function isNoSuchElementError(err: unknown): boolean {
  const msg = messageOf(err).toLowerCase();
  return (
    msg.includes('no such element') ||
    msg.includes('nosuchelement') ||
    msg.includes('could not be located') ||
    msg.includes('unable to find') ||
    msg.includes('unable to locate')
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve a selector to an element via the session. webdriverio's `$` resolves
 * lazily, so this rarely throws no-such-element here (that surfaces on the first
 * interaction), but failures are classified defensively regardless.
 */
export async function resolveElement(
  session: MobileSession,
  selector: string,
): Promise<MobileElement> {
  try {
    return await session.$(selector);
  } catch (err) {
    if (isNoSuchElementError(err)) {
      throw new ClassifiedError(
        FailureBucket.LOCATOR_RESOLUTION_FAILURE,
        `Element not found for selector: ${selector}`,
        { cause: err },
      );
    }
    throw new ClassifiedError(
      FailureBucket.UI_ACTION_FAILURE,
      `Failed to resolve selector: ${selector}`,
      { cause: err },
    );
  }
}

/**
 * Explicit wait: poll until the element resolved from `selector` reports
 * displayed, or throw TIMEOUT_FAILURE once the budget is exhausted.
 *
 * Re-resolves the element on each poll so transient stale references during the
 * wait do not abort it.
 */
export async function waitForDisplayed(
  session: MobileSession,
  selector: string,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
): Promise<MobileElement> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  let lastError: unknown;

  for (;;) {
    try {
      const element = await resolveElement(session, selector);
      if (await element.isDisplayed()) {
        return element;
      }
    } catch (err) {
      // Hard locator failures are terminal; surface them immediately.
      if (
        err instanceof ClassifiedError &&
        err.bucket === FailureBucket.LOCATOR_RESOLUTION_FAILURE
      ) {
        throw err;
      }
      lastError = err;
    }
    if (Date.now() >= deadline) break;
    await sleep(pollIntervalMs);
  }

  throw new ClassifiedError(
    FailureBucket.TIMEOUT_FAILURE,
    `Timed out after ${timeoutMs}ms waiting for element to be displayed: ${selector}`,
    { cause: lastError },
  );
}

/** Whether the element resolved from `selector` is currently displayed. */
export async function isDisplayed(
  session: MobileSession,
  selector: string,
): Promise<boolean> {
  try {
    const element = await resolveElement(session, selector);
    return await element.isDisplayed();
  } catch {
    // Any resolution/visibility failure means "not visible" for this query.
    return false;
  }
}

/**
 * Scroll the element identified by `selector` into view.
 *
 * Android uses UiAutomator2's UiScrollable via webdriverio's native
 * element.scrollIntoView(), which generates a `new UiScrollable(...)` gesture
 * under the hood. iOS has no UiScrollable equivalent, so a bounded
 * direction-based swipe fallback is used (XCUITest's `mobile: swipe` accepts a
 * `direction`). Failures here are non-fatal: the caller's subsequent
 * wait/interaction surfaces a precise classified error.
 */
export async function scrollIntoView(
  session: MobileSession,
  selector: string,
  platform: MobilePlatformKind,
): Promise<void> {
  try {
    if (platform === 'android') {
      // Native WDIO scrollIntoView -> UiScrollable on UiAutomator2. This assumes
      // an `android.widget.ScrollView`; React-Native screens often have no such
      // container, so the call throws ("scrollable element"/"ScrollView"/"not
      // found"). Swallow that and fall through to a class-agnostic gesture scroll.
      const element = await resolveElement(session, selector);
      if (element.scrollIntoView) {
        try {
          await element.scrollIntoView();
        } catch {
          // Fall through to the gesture fallback below.
        }
      }
      if (!(await isDisplayed(session, selector))) {
        await androidGestureScroll(session, selector);
      }
      return;
    }
    await swipeUntilDisplayed(session, selector);
  } catch {
    // Non-fatal: leave it to the explicit wait / interaction to classify.
  }
}

/**
 * Android gesture-scroll fallback for RN screens with no recognised ScrollView.
 * Performs a screen-level `mobile: scrollGesture` (class-agnostic) over a bounded
 * central area, re-checking visibility between scrolls. Mirrors the reference's
 * gesture fallback.
 */
async function androidGestureScroll(
  session: MobileSession,
  selector: string,
  maxScrolls = 10,
): Promise<void> {
  // A raised IME shrinks the scrollable viewport and can hide the very element
  // we are scrolling to (the bottom-of-form CTAs: place-order / save-profile /
  // card-holder). Dismiss it first; this must never fail the scroll.
  await dismissKeyboard(session).catch(() => undefined);
  if (!session.getWindowSize) return;
  const { width, height } = await session.getWindowSize();
  const area = {
    left: Math.round(width * 0.1),
    top: Math.round(height * 0.25),
    width: Math.round(width * 0.8),
    height: Math.round(height * 0.5),
  };
  for (let attempt = 0; attempt < maxScrolls; attempt += 1) {
    if (await isDisplayed(session, selector)) return;
    try {
      await session.execute('mobile: scrollGesture', { ...area, direction: 'down', percent: 0.85 });
    } catch {
      return; // gesture unsupported -> let the caller's wait classify it
    }
  }
}

/**
 * iOS swipe-based fallback: swipe up a bounded number of times until the element
 * is displayed. XCUITest's `mobile: swipe` takes a `direction`; coordinate-based
 * dragging would require `mobile: dragFromToForDuration`, which is intentionally
 * not used here to keep the fallback simple and robust.
 */
async function swipeUntilDisplayed(
  session: MobileSession,
  selector: string,
  maxSwipes = 6,
): Promise<void> {
  for (let attempt = 0; attempt < maxSwipes; attempt += 1) {
    if (await isDisplayed(session, selector)) return;
    await session.execute('mobile: swipe', { direction: 'up' });
  }
}

/**
 * Best-effort dismissal of the native Android "Profile saved" AlertDialog
 * (OK button = `android:id/button1`) that OmniPizza pops after a successful save.
 * Left open it overlays the form so the inputs read as not-displayed. The dialog
 * can appear a beat after the save PATCH resolves, so poll briefly: each miss
 * throws no-such-element and we retry until it shows or we give up. Never throws.
 *
 * NOTE: `android:id/button1` is an Android UiSelector — an INVALID locator
 * strategy on iOS that crashes the plugin session — so callers MUST gate this on
 * the Android platform.
 */
export async function dismissNativeAlert(session: MobileSession): Promise<void> {
  const okButton = 'android=new UiSelector().resourceId("android:id/button1")';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const el = await session.$(okButton);
      await el.click();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

/**
 * Guarded keyboard dismissal. Checks isKeyboardShown when available and calls
 * hideKeyboard, swallowing any error: the keyboard API is platform/state
 * dependent and must never fail an interaction.
 */
export async function dismissKeyboard(session: MobileSession): Promise<void> {
  try {
    const shown = session.isKeyboardShown ? await session.isKeyboardShown() : true;
    if (shown && session.hideKeyboard) {
      await session.hideKeyboard();
    }
  } catch {
    // Keyboard dismissal is best-effort; never propagate.
  }
}

/**
 * safeTap: wait until visible (scrolling into view if needed), then tap.
 * Retries exactly once on a stale element by re-resolving the selector.
 * Classifies no-such-element as LOCATOR_RESOLUTION_FAILURE.
 */
export async function safeTap(
  session: MobileSession,
  selector: string,
  platform: MobilePlatformKind,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<void> {
  await withStaleRetry(session, selector, platform, timeoutMs, async (element) => {
    await element.click();
  });
}

/**
 * safeType: wait visible (scroll into view if needed), dismiss any obscuring
 * keyboard, optionally clear, set the value, then dismiss the keyboard raised by
 * typing. Retries once on stale element.
 */
export async function safeType(
  session: MobileSession,
  selector: string,
  text: string,
  platform: MobilePlatformKind,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<void> {
  await withStaleRetry(session, selector, platform, timeoutMs, async (element) => {
    // Dismiss any keyboard that might obscure the target before tapping in.
    await dismissKeyboard(session);
    if (element.clearValue) {
      try {
        await element.clearValue();
      } catch {
        // Clearing is best-effort; proceed to set the value regardless.
      }
    }
    await element.setValue(text);
    // Dismiss the keyboard raised by typing so it does not obscure later steps.
    await dismissKeyboard(session);
  });
}

/** Read visible text with defensive wait + single stale retry. */
export async function safeGetText(
  session: MobileSession,
  selector: string,
  platform: MobilePlatformKind,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<string> {
  let result = '';
  await withStaleRetry(session, selector, platform, timeoutMs, async (element) => {
    result = await element.getText();
    // Android containers do not aggregate descendant text the way web innerText
    // does, so a layout container reports an empty string. When that happens,
    // join the text of the container's descendant TextViews so "is X visible in
    // this region" assertions work the same as on web.
    if (platform === 'android' && result.trim() === '' && element.$$) {
      try {
        const nodes = await element.$$('.//android.widget.TextView');
        const texts: string[] = [];
        for (const node of nodes) {
          const t = await node.getText();
          if (t && t.trim()) texts.push(t.trim());
        }
        result = texts.join(' ');
      } catch {
        // Best-effort aggregation; fall back to the (empty) container text.
      }
    }
  });
  return result;
}

/** Capture a single element as PNG bytes, with defensive wait + stale retry. */
export async function captureElement(
  session: MobileSession,
  selector: string,
  platform: MobilePlatformKind,
  timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<Buffer> {
  let png: Buffer = Buffer.alloc(0);
  await withStaleRetry(session, selector, platform, timeoutMs, async (element) => {
    const base64 = await element.takeScreenshot();
    png = Buffer.from(base64, 'base64');
  });
  return png;
}

/**
 * Core defensive wrapper: wait for the element (scrolling into view if the first
 * wait times out), run the action, and retry once if a stale-element error is
 * raised by re-resolving the selector. no-such-element maps to
 * LOCATOR_RESOLUTION_FAILURE; other action errors map to UI_ACTION_FAILURE.
 */
async function withStaleRetry(
  session: MobileSession,
  selector: string,
  platform: MobilePlatformKind,
  timeoutMs: number,
  action: (element: MobileElement) => Promise<void>,
): Promise<void> {
  const acquire = async (): Promise<MobileElement> => {
    try {
      return await waitForDisplayed(session, selector, timeoutMs);
    } catch (err) {
      // If it never became visible, try to scroll it into view and wait again.
      if (err instanceof ClassifiedError && err.bucket === FailureBucket.TIMEOUT_FAILURE) {
        await scrollIntoView(session, selector, platform);
        return await waitForDisplayed(session, selector, timeoutMs);
      }
      throw err;
    }
  };

  try {
    const element = await acquire();
    await action(element);
  } catch (err) {
    // Already classified (timeout / locator) — propagate as-is.
    if (err instanceof ClassifiedError) throw err;

    if (isStaleElementError(err)) {
      // Re-resolve once and retry the action.
      try {
        const fresh = await acquire();
        await action(fresh);
        return;
      } catch (retryErr) {
        throw classifyActionError(retryErr, selector, ' after stale retry');
      }
    }
    throw classifyActionError(err, selector, '');
  }
}

/** Map a raw action error onto a ClassifiedError (locator vs generic action). */
function classifyActionError(err: unknown, selector: string, phase: string): ClassifiedError {
  if (err instanceof ClassifiedError) return err;
  if (isNoSuchElementError(err)) {
    return new ClassifiedError(
      FailureBucket.LOCATOR_RESOLUTION_FAILURE,
      `Element not found for selector${phase}: ${selector}`,
      { cause: err },
    );
  }
  return new ClassifiedError(
    FailureBucket.UI_ACTION_FAILURE,
    `Action failed on selector${phase}: ${selector}`,
    { cause: err },
  );
}
