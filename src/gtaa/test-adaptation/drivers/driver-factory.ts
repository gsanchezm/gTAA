/**
 * Test Adaptation layer — direct UI driver factory.
 *
 * Constructs the concrete executor for the active ExecutionContext. This is a
 * plain layered factory (a switch over normal services), NOT a plugin registry
 * and NOT a microkernel — there is no dynamic registration, no process spawning,
 * and no proxy. Adding a tool means adding a case here and an executor service.
 */
import { PlaywrightWebExecutor } from '../../test-execution/playwright/playwright-web-executor';
import { AppiumAndroidExecutor } from '../../test-execution/appium/appium-android-executor';
import { AppiumIosExecutor } from '../../test-execution/appium/appium-ios-executor';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import type { ExecutionContext } from '../../shared/types';
import type { UiDriver } from './ui-driver';

export function createUiDriver(context: ExecutionContext): UiDriver {
  switch (context.platform) {
    case 'desktop':
    case 'responsive':
      return new PlaywrightWebExecutor(context);
    case 'android':
      return new AppiumAndroidExecutor(context);
    case 'ios':
      return new AppiumIosExecutor(context);
    case 'api':
      throw new ClassifiedError(
        FailureBucket.UI_ACTION_FAILURE,
        'No UI driver for the API platform — API scenarios use the ApiExecutor directly.',
      );
    default:
      throw new ClassifiedError(
        FailureBucket.INFRASTRUCTURE_FAILURE,
        `Unsupported platform: ${context.platform}`,
      );
  }
}
