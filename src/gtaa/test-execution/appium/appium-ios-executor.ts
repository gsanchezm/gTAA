/**
 * Test Execution layer — Appium iOS executor.
 *
 * Concrete UiDriver backend for iOS via Appium + XCUITest. It reuses the shared
 * AppiumExecutorBase and the Test Adaptation mobile-actions defensive helpers
 * wholesale (DRY); the only differences from Android are:
 *   - capabilities (XCUITest automationName, platformName 'iOS')
 *   - the 'ios' platform discriminator, which makes the shared scrollIntoView
 *     helper use the swipe-based fallback (there is no UiScrollable on iOS) and
 *     selects the iOS selector family (e.g. '-ios class chain:', '-ios predicate
 *     string:', '~accessibilityId').
 *
 * RELATIVE imports only.
 */

import { AppiumExecutorBase } from './appium-executor-base';
import { mobileConfig, type MobileConfig } from '../../configuration/environments/env';
import type { ExecutionContext } from '../../shared/types';
import type { MobilePlatformKind } from '../../test-adaptation/drivers/appium/mobile-actions';

export class AppiumIosExecutor extends AppiumExecutorBase {
  protected readonly platformKind: MobilePlatformKind = 'ios';

  constructor(executionContext: ExecutionContext, config: MobileConfig = mobileConfig()) {
    super(executionContext, config);
  }

  protected buildCapabilities(): Record<string, unknown> {
    const ios = this.config.ios;
    const caps: Record<string, unknown> = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': ios.deviceName,
      // AUT identity. Mirrors the Android base's hardcoded com.omnipizza.app so
      // XCUITest knows which app to (re)launch when attaching to the simulator.
      'appium:bundleId': 'com.omnipizza.app',
    };

    if (ios.platformVersion) {
      caps['appium:platformVersion'] = ios.platformVersion;
    }
    if (ios.appPath) {
      caps['appium:app'] = ios.appPath;
    }

    // The AUT talks to a free-tier backend that cold-starts; a login/API call can
    // pause the node side >60s between Appium commands. Raise the idle session
    // timeout (default 60s) so a cold start doesn't kill the session mid-scenario
    // ("New Command Timeout ... expired"). Mirrors the Android sibling.
    caps['appium:newCommandTimeout'] = 180;
    // First-run WebDriverAgent build/launch on a cold simulator is slow; give it
    // room rather than failing session bootstrap (matches TOM's iOS profile).
    caps['appium:wdaLaunchTimeout'] = 240000;
    caps['appium:wdaConnectionTimeout'] = 240000;
    // The AUT is React-Native: it never reaches the "idle" state XCUITest waits
    // for before each accessibility snapshot, so the default idle wait is dead
    // time that also drags the snapshot past its limit ("Timed out while fetching
    // snapshot from testmanagerd"), failing element lookups. Zero disables the
    // wait at bootstrap; lookups then resolve in ~1s. Pairs with the snapshot
    // settings applied in afterStart() (customSnapshotTimeout/useJSONSource).
    caps['appium:waitForIdleTimeout'] = 0;
    // Reuse WDA across the per-scenario sessions: a stable derivedDataPath makes
    // Appium's build incremental (near-instant after the first), and usePrebuiltWDA
    // skips the build entirely when the products already exist. Both are opt-in via
    // env (IOS_WDA_DERIVED_DATA_PATH / IOS_USE_PREBUILT_WDA) so CI — which has no
    // prebuilt WDA — keeps the default clean-build behavior.
    if (ios.derivedDataPath) {
      caps['appium:derivedDataPath'] = ios.derivedDataPath;
    }
    caps['appium:usePrebuiltWDA'] = ios.usePrebuiltWDA;
    // NOTE: deliberately NOT setting appium:noReset. gTAA creates a fresh Appium
    // session per scenario (atomic World), so the app must reset per session;
    // otherwise the Expo app's AsyncStorage-persisted login would bleed across
    // scenarios. (TOM sets noReset:true only because its microkernel holds ONE
    // long-lived session — a different lifecycle.) autoAcceptAlerts is likewise
    // omitted unless a launch dialog proves to block interaction.

    return caps;
  }

  /**
   * iOS-only post-bootstrap tuning for the React-Native AUT. The waitForIdleTimeout:0
   * capability already removes the idle wait before each snapshot; here we give the
   * snapshot itself headroom (customSnapshotTimeout) and use the faster JSON source
   * path so a targeted findElement resolves in ~1s instead of timing out against
   * testmanagerd. Best-effort: the cap carries the core fix, so a settings failure
   * (or a runtime without updateSettings) must not abort a healthy session.
   */
  protected async afterStart(): Promise<void> {
    const session = this.session;
    if (!session) return;
    if (session.updateSettings) {
      try {
        await session.updateSettings({
          customSnapshotTimeout: 60,
          useJSONSource: true,
        });
      } catch {
        // Best-effort tuning; waitForIdleTimeout:0 (a capability) already applies.
      }
    }
    // Clear any stray system alert left on the simulator (a SpringBoard "Open in
    // app?" deep-link confirmation survives the per-scenario app reset and would
    // otherwise overlay the next scenario's screen, blocking every tap). Accepting
    // at session start — before any interaction — cannot swallow a mid-scenario
    // dialog a step asserts on, so it is safe and self-heals the suite against this
    // bleed. No-op (throws, swallowed) when there is no alert, which is the norm.
    if (session.acceptAlert) {
      try {
        await session.acceptAlert();
      } catch {
        // No alert present (the common case) — nothing to clear.
      }
    }
  }
}
