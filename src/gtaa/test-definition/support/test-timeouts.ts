/**
 * Test Definition layer — global step timeout.
 *
 * Cucumber's default per-step timeout is 5s, which is too tight for real UI
 * flows against the deployed AUT: Render free-tier cold starts (30–45s) plus
 * networkidle settling can push a single navigation/assertion past 5s. The
 * `timeout` key in cucumber.js is not a valid profile option — the step timeout
 * is only configurable here via setDefaultTimeout.
 */
import { setDefaultTimeout } from '@cucumber/cucumber';

setDefaultTimeout(120_000);
