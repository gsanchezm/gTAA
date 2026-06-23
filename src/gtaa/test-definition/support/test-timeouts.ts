/**
 * Test Definition layer — global step timeout.
 *
 * Cucumber's default per-step timeout is 5s, which is too tight for real UI
 * flows against the deployed AUT: Render free-tier cold starts (30–45s) plus
 * networkidle settling can push a single navigation/assertion past 5s. The
 * `timeout` key in cucumber.js is not a valid profile option — the step timeout
 * is only configurable here via setDefaultTimeout.
 *
 * 600s matches the TOM reference's step budget (the controlled measurement
 * parameter must be equal across both arms). gTAA needs the full budget on cold
 * CI runners specifically: its Automated-Atomic-Testing model creates a FRESH
 * Appium session per scenario, so each scenario's first step also pays cold
 * session creation + app reset (+ a cold WebDriverAgent build on the very first).
 * At 120s those costs tripped a ~120s timeout on the slowest cold-runner
 * scenarios (false failures); local-healthy runs finish each step in well under
 * a minute, so the higher ceiling never masks a real hang.
 */
import { setDefaultTimeout } from '@cucumber/cucumber';

setDefaultTimeout(600_000);
