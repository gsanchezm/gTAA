// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no
// tsconfig-paths support). This helper is self-contained on purpose: it reads
// env directly via Gatling's getEnvironmentVariable so the bundled simulation
// has no dependency on the Node-only configuration layer.
/**
 * Shared injection-profile builder for the load simulations.
 *
 * Mirrors the smoke/load/stress mapping owned by
 * configuration/tools/gatling.config.ts (kept in sync by convention; the config
 * module is the source of truth for the orchestrator, this is its bundle-safe
 * twin for the simulations). Driven by PERF_PROFILE / PERF_USERS / PERF_DURATION.
 *
 * Direct performance configuration — no indirection layer.
 */
import { atOnceUsers, rampUsers, getEnvironmentVariable } from '@gatling.io/core';

const PROFILE = getEnvironmentVariable('PERF_PROFILE', 'smoke').toLowerCase();
const USERS = parseInt(getEnvironmentVariable('PERF_USERS', '20'), 10);
const DURATION = parseInt(getEnvironmentVariable('PERF_DURATION', '120'), 10);

// smoke  -> 1 user, single iteration (validate the chain works).
// load   -> ramp to PERF_USERS over PERF_DURATION seconds.
// stress -> PERF_USERS injected at once.
const INJECTION_PROFILES = new Map<string, () => ReturnType<typeof atOnceUsers>>([
  ['smoke', () => atOnceUsers(1)],
  ['load', () => rampUsers(USERS).during(DURATION)],
  ['stress', () => atOnceUsers(USERS)],
]);

/** Returns the configured open-injection step, or throws on an unknown profile. */
export function injectionProfile(): ReturnType<typeof atOnceUsers> {
  const factory = INJECTION_PROFILES.get(PROFILE);
  if (!factory) {
    throw new Error(
      `Unknown PERF_PROFILE="${PROFILE}". Valid values: ${[...INJECTION_PROFILES.keys()].join(' | ')}`,
    );
  }
  return factory();
}

/** Resolves the required API base URL or throws (fail-loud at simulation setUp). */
export function requireApiBaseUrl(): string {
  const apiBaseUrl = getEnvironmentVariable('API_BASE_URL');
  if (!apiBaseUrl) {
    throw new Error('Missing required env var: API_BASE_URL');
  }
  return apiBaseUrl;
}
