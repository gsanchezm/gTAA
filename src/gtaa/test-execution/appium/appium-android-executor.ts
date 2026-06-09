/**
 * Test Execution layer — Appium Android executor.
 *
 * Concrete UiDriver backend for Android via Appium + UiAutomator2. All defensive
 * interaction logic lives in the shared base (AppiumExecutorBase) and the Test
 * Adaptation mobile-actions helpers (DRY); this class contributes only the
 * Android-specific capabilities and the 'android' platform discriminator (which
 * selects UiScrollable scrolling and the android selector family).
 *
 * RELATIVE imports only.
 */

import { AppiumExecutorBase } from './appium-executor-base';
import { mobileConfig, type MobileConfig } from '../../configuration/environments/env';
import type { ExecutionContext } from '../../shared/types';
import type { MobilePlatformKind } from '../../test-adaptation/drivers/appium/mobile-actions';

export class AppiumAndroidExecutor extends AppiumExecutorBase {
  protected readonly platformKind: MobilePlatformKind = 'android';

  constructor(executionContext: ExecutionContext, config: MobileConfig = mobileConfig()) {
    super(executionContext, config);
  }

  protected buildCapabilities(): Record<string, unknown> {
    const android = this.config.android;
    const caps: Record<string, unknown> = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': android.deviceName,
    };

    if (android.platformVersion) {
      caps['appium:platformVersion'] = android.platformVersion;
    }
    if (android.appPath) {
      caps['appium:app'] = android.appPath;
    }
    // NOTE: we intentionally do NOT set appium:unlockType. On this foldable
    // Samsung it forces a per-session unlock that fails ("The device has failed
    // to be unlocked"); the device is run with NO screen lock instead.
    // Grant runtime permissions automatically so first-launch prompts don't
    // block interaction.
    caps['appium:autoGrantPermissions'] = true;
    // The AUT talks to a free-tier backend that cold-starts; a login/API call can
    // pause the node side >60s between Appium commands. Raise the server's idle
    // session timeout (default 60s) so a cold start doesn't kill the session
    // mid-scenario ("New Command Timeout ... expired").
    caps['appium:newCommandTimeout'] = 180;

    return caps;
  }
}
