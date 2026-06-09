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
    };

    if (ios.platformVersion) {
      caps['appium:platformVersion'] = ios.platformVersion;
    }
    if (ios.appPath) {
      caps['appium:app'] = ios.appPath;
    }
    // Attach to the exact simulator the runner booted (UDID), so XCUITest does
    // not match by name and risk targeting/booting a different sim. Unset for
    // local deviceName-only runs.
    if (ios.udid) {
      caps['appium:udid'] = ios.udid;
    }
    // The AUT talks to a free-tier backend that cold-starts; a login/API call can
    // pause the node side >60s between commands. Raise the server's idle session
    // timeout (default 60s) so a cold start doesn't kill the session mid-scenario
    // — mirrors the Android executor.
    caps['appium:newCommandTimeout'] = 180;

    return caps;
  }
}
