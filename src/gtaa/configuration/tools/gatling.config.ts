/**
 * Configuration / Tool Configuration layer — Gatling performance tool config.
 *
 * Single source of truth for the load-profile -> injection-parameter mapping
 * (smoke / load / stress) and the p95 response-time threshold. The execution
 * layer and the Gatling simulations both read from here so that profile
 * semantics stay identical across the orchestrator and the simulation bundles.
 *
 * Direct tool configuration — no indirection layer. Values are driven by
 * the centralized env helpers (PERF_PROFILE / PERF_USERS / PERF_DURATION /
 * PERF_P95_THRESHOLD_MS) so all environment access stays in the configuration
 * layer.
 */
import { num, str } from '../environments/env';

/** The three supported load profiles. */
export type LoadProfile = 'smoke' | 'load' | 'stress';

export const LOAD_PROFILES: readonly LoadProfile[] = ['smoke', 'load', 'stress'] as const;

/** Resolved injection parameters for a single profile. */
export interface ProfileInjection {
  /** Concurrent users injected (at-once) or ramped to. */
  users: number;
  /** Total scenario duration in seconds. */
  duration: number;
  /** Ramp-up time in seconds (0 = inject all users at once). */
  rampTime: number;
}

/** Default p95 response-time threshold (ms) used for PASS/FAIL classification. */
export const DEFAULT_P95_THRESHOLD_MS = 2000;

/** Default KO (failure) rate above which a run is considered failed. */
export const DEFAULT_MAX_KO_RATE = 0.01;

function isLoadProfile(value: string): value is LoadProfile {
  return (LOAD_PROFILES as readonly string[]).includes(value);
}

/**
 * Normalizes an arbitrary string into a known LoadProfile, defaulting to
 * 'smoke' when the value is empty/unknown so callers never crash on bad input.
 */
export function normalizeProfile(value: string | undefined): LoadProfile {
  const lowered = (value ?? '').toLowerCase().trim();
  return isLoadProfile(lowered) ? lowered : 'smoke';
}

/**
 * Maps a load profile to its injection parameters (users, duration, rampTime),
 * honoring PERF_USERS / PERF_DURATION overrides from the environment.
 *
 *   smoke  -> 1 user, single iteration (validate the chain works), no ramp.
 *   load   -> ramp to PERF_USERS over PERF_DURATION seconds.
 *   stress -> PERF_USERS injected at once (no ramp).
 */
export function resolveInjection(profile: LoadProfile): ProfileInjection {
  const users = num('PERF_USERS', 20);
  const duration = num('PERF_DURATION', 120);

  switch (profile) {
    case 'smoke':
      return { users: 1, duration, rampTime: 0 };
    case 'load':
      return { users, duration, rampTime: duration };
    case 'stress':
      return { users, duration, rampTime: 0 };
  }
}

/** Resolves the configured p95 threshold (ms) for PASS/FAIL classification. */
export function p95ThresholdMs(): number {
  return num('PERF_P95_THRESHOLD_MS', DEFAULT_P95_THRESHOLD_MS);
}

/** Resolves the maximum tolerated KO (failure) rate. */
export function maxKoRate(): number {
  return num('PERF_MAX_KO_RATE', DEFAULT_MAX_KO_RATE);
}

/** Convenience accessor for the active profile resolved from the environment. */
export function activeProfile(): LoadProfile {
  return normalizeProfile(str('PERF_PROFILE', 'smoke'));
}
