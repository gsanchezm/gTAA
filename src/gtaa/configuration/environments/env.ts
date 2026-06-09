/**
 * Centralized environment configuration for the gTAA baseline.
 * All environment access goes through this module (single source of truth) so
 * tool adapters never read process.env directly — keeping configuration in the
 * Configuration / Environment Management layer.
 */
export function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export interface AppConfig {
  baseUrl: string;
  apiBaseUrl: string;
  targetEnvironment: string;
}

export interface WebConfig {
  headless: boolean;
  timeoutMs: number;
  desktop: { width: number; height: number };
  responsive: { width: number; height: number };
}

export interface MobileConfig {
  appiumHost: string;
  appiumPort: number;
  timeoutMs: number;
  /** webdriverio create-session timeout; raised for cold CI emulator/simulator boots. */
  sessionTimeoutMs: number;
  android: {
    appPath: string;
    deviceName: string;
    platformVersion: string;
    unlockType: string;
    unlockKey: string;
    /** Optional explicit ADB device target (e.g. a docker-android `localhost:5555`). */
    udid: string;
  };
  ios: {
    appPath: string;
    deviceName: string;
    platformVersion: string;
    /** Optional explicit simulator UDID so Appium attaches to the booted sim. */
    udid: string;
  };
}

export interface VisualConfig {
  updateBaseline: boolean;
  pixelRatio: number;
}

export interface PerfConfig {
  profile: string;
  users: number;
  duration: number;
}

export function appConfig(): AppConfig {
  return {
    baseUrl: str('BASE_URL', 'http://localhost:5173'),
    apiBaseUrl: str('API_BASE_URL', 'http://localhost:3000'),
    targetEnvironment: str('TARGET_ENVIRONMENT', 'local'),
  };
}

export function webConfig(): WebConfig {
  return {
    headless: bool('HEADLESS', true),
    timeoutMs: num('WEB_TIMEOUT_MS', 20000),
    desktop: { width: num('DESKTOP_WIDTH', 1440), height: num('DESKTOP_HEIGHT', 900) },
    responsive: { width: num('RESPONSIVE_WIDTH', 390), height: num('RESPONSIVE_HEIGHT', 844) },
  };
}

export function mobileConfig(): MobileConfig {
  return {
    appiumHost: str('APPIUM_HOST', '127.0.0.1'),
    appiumPort: num('APPIUM_PORT', 4723),
    timeoutMs: num('MOBILE_TIMEOUT_MS', 30000),
    sessionTimeoutMs: num('MOBILE_SESSION_TIMEOUT_MS', 240000),
    android: {
      appPath: str('ANDROID_APP_PATH'),
      deviceName: str('ANDROID_DEVICE_NAME', 'Android Emulator'),
      platformVersion: str('ANDROID_PLATFORM_VERSION'),
      unlockType: str('ANDROID_UNLOCK_TYPE'),
      unlockKey: str('ANDROID_UNLOCK_KEY'),
      udid: str('ANDROID_UDID'),
    },
    ios: {
      appPath: str('IOS_APP_PATH'),
      deviceName: str('IOS_DEVICE_NAME', 'iPhone 15'),
      platformVersion: str('IOS_PLATFORM_VERSION'),
      udid: str('IOS_UDID'),
    },
  };
}

export function visualConfig(): VisualConfig {
  return {
    updateBaseline: bool('UPDATE_VISUAL_BASELINE', false),
    pixelRatio: num('VISUAL_PIXEL_RATIO', 0.005),
  };
}

export function perfConfig(): PerfConfig {
  return {
    profile: str('PERF_PROFILE', 'smoke'),
    users: num('PERF_USERS', 5),
    duration: num('PERF_DURATION', 30),
  };
}
