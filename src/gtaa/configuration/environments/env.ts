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
  android: {
    appPath: string;
    deviceName: string;
    platformVersion: string;
    unlockType: string;
    unlockKey: string;
  };
  ios: {
    appPath: string;
    deviceName: string;
    platformVersion: string;
    /** Stable Xcode derivedDataPath so WDA is reused (incremental build) across the
     *  per-scenario sessions instead of a clean rebuild each time. Empty = Appium default. */
    derivedDataPath: string;
    /** Skip the WDA build entirely and launch the prebuilt runner (fastest, but the
     *  products must already exist at derivedDataPath). Off by default for CI. */
    usePrebuiltWDA: boolean;
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
    android: {
      appPath: str('ANDROID_APP_PATH'),
      deviceName: str('ANDROID_DEVICE_NAME', 'Android Emulator'),
      platformVersion: str('ANDROID_PLATFORM_VERSION'),
      unlockType: str('ANDROID_UNLOCK_TYPE'),
      unlockKey: str('ANDROID_UNLOCK_KEY'),
    },
    ios: {
      appPath: str('IOS_APP_PATH'),
      deviceName: str('IOS_DEVICE_NAME', 'iPhone 15'),
      platformVersion: str('IOS_PLATFORM_VERSION'),
      derivedDataPath: str('IOS_WDA_DERIVED_DATA_PATH'),
      usePrebuiltWDA: bool('IOS_USE_PREBUILT_WDA', false),
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
