/**
 * Resolves the active ExecutionContext (platform/driver/viewport) from the
 * environment. The test:* npm scripts set GTAA_PLATFORM / GTAA_DRIVER per job,
 * which keeps each tool/platform job independently executable (atomicity).
 */
import { bool, str } from '../../configuration/environments/env';
import type { ExecutionContext, Platform } from '../../shared/types';

const PLATFORMS: Platform[] = ['desktop', 'responsive', 'android', 'ios', 'api'];

export function resolveExecutionContext(): ExecutionContext {
  const platformRaw = str('GTAA_PLATFORM', 'desktop') as Platform;
  const platform: Platform = PLATFORMS.includes(platformRaw) ? platformRaw : 'desktop';

  let driver: ExecutionContext['driver'];
  const driverRaw = str('GTAA_DRIVER');
  if (driverRaw === 'playwright' || driverRaw === 'appium' || driverRaw === 'api') {
    driver = driverRaw;
  } else if (platform === 'api') {
    driver = 'api';
  } else if (platform === 'android' || platform === 'ios') {
    driver = 'appium';
  } else {
    driver = 'playwright';
  }

  const viewport =
    platform === 'desktop' || platform === 'responsive'
      ? platform
      : platform === 'android' || platform === 'ios'
        ? 'mobile'
        : null;

  return { platform, driver, viewport, visualEnabled: bool('GTAA_VISUAL', false) };
}
