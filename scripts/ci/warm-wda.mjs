// CI WebDriverAgent warm-up. Creates one Appium/XCUITest session — which builds
// WebDriverAgent into the (stable) derivedDataPath — then tears it down, so the
// first real cucumber scenario reuses the built WDA instead of eating the ~5min
// cold build inside its 120s per-step budget (which would time it out). Generic:
// every input comes from the environment the workflow already exports. Best-effort:
// any failure is logged and ignored (exit 0) so it never blocks the suite.
import { remote } from 'webdriverio';

const port = Number(process.env.APPIUM_PORT || '4723');
const appPath = process.env.IOS_APP_PATH || '';
const deviceName = process.env.IOS_DEVICE_NAME || 'iPhone 15';
const platformVersion = process.env.IOS_PLATFORM_VERSION || '';
const derivedDataPath = process.env.IOS_WDA_DERIVED_DATA_PATH || '';

const caps = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': deviceName,
  'appium:bundleId': 'com.omnipizza.app',
  // A cold WDA build can take minutes; give bootstrap room.
  'appium:wdaLaunchTimeout': 600000,
  'appium:wdaConnectionTimeout': 600000,
  'appium:newCommandTimeout': 120,
};
if (appPath) caps['appium:app'] = appPath;
if (platformVersion) caps['appium:platformVersion'] = platformVersion;
if (derivedDataPath) caps['appium:derivedDataPath'] = derivedDataPath;

const t0 = Date.now();
let driver;
try {
  console.log(`[warm-wda] building WDA via one session (device="${deviceName}", app="${appPath}") ...`);
  driver = await remote({
    hostname: '127.0.0.1',
    port,
    path: '/',
    logLevel: 'error',
    connectionRetryTimeout: 720000,
    capabilities: caps,
  });
  console.log(`[warm-wda] WDA ready, session up in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} catch (e) {
  console.log(`[warm-wda] warm-up failed (non-fatal): ${e.message}`);
} finally {
  if (driver) await driver.deleteSession().catch(() => {});
  console.log(`[warm-wda] done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
