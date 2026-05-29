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

    return caps;
  }
}
