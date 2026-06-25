/**
 * Pre-suite backend warm-up (Test Definition / support).
 *
 * The OmniPizza frontend (BASE_URL) and backend (API_BASE_URL) are deployed on
 * Render free-tier dynos, which sleep after ~15 min of inactivity; the first
 * request to a cold dyno hangs for tens of seconds while it boots (or the edge
 * returns 502/503 until the app is listening). Left unwarmed, the FIRST scenario
 * of a run eats that cold start and intermittently blows a per-step wait budget —
 * the "order_success.orderSuccessScreen never became visible" flake bites exactly
 * the web + @visual jobs, which (unlike the mobile jobs, that curl the API 5×)
 * do not warm the backend before the suite.
 *
 * Pinging both services once at BeforeAll moves that cost off the scenario clock.
 * Mirrors the TOM reference's src/core/tests/support/warm-up.ts so both arms
 * absorb the cold start identically. Best-effort and non-fatal: a failure here
 * just restores the pre-warm-up status quo (the first scenario pays the cost).
 *
 * Config is read through env.ts's appConfig() (never process.env directly —
 * configuration constraint #3).
 */
import { appConfig } from '../../configuration/environments/env';
import { logger } from '../../test-reporting/telemetry/logger';

const log = logger.child({ layer: 'support', action: 'warm-up' });

const ATTEMPT_TIMEOUT_MS = 60_000; // a cold dyno can hold a single request this long
const TOTAL_BUDGET_MS = 120_000; // give up after this; scenarios keep their own timeouts
const RETRY_DELAY_MS = 3_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A local/loopback target is never a sleeping remote dyno, so warming it is a
 * pointless 120s no-op (and would stall a developer running with no app up).
 * appConfig() defaults BASE_URL/API_BASE_URL to localhost, so this guard is what
 * keeps the warm-up CI-only — TARGET_ENVIRONMENT can't distinguish it (CI leaves
 * it 'local' while injecting real secret URLs).
 */
function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    );
  } catch {
    return true; // unparseable -> treat as local and skip (never warm a bad URL)
  }
}

/**
 * GETs `url` until the dyno answers with any non-5xx status (proof it's awake)
 * or the budget is exhausted. A 401/403/404 counts as "awake" — we only care that
 * the server, not Render's edge, answered. Best-effort: never throws.
 */
async function pingUntilAwake(url: string): Promise<void> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastInfo = '';
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      if (res.status < 500) {
        log.info({ url, status: res.status }, 'Service awake');
        return;
      }
      lastInfo = `status ${res.status}`;
    } catch (err) {
      lastInfo = (err as Error).message;
    } finally {
      clearTimeout(timer);
    }
    log.warn({ url, lastInfo }, 'Service not ready yet — retrying');
    await sleep(RETRY_DELAY_MS);
  }
  log.warn({ url, lastInfo }, 'Warm-up budget exhausted — proceeding anyway');
}

/**
 * Wakes the OmniPizza frontend + backend before the suite runs. Idempotent and
 * non-fatal. Local/loopback targets are skipped (nothing to wake), so a developer
 * running with no app deployed doesn't pay a 120s no-op.
 */
export async function warmUpServices(): Promise<void> {
  const { baseUrl, apiBaseUrl } = appConfig();
  const targets: string[] = [];
  if (baseUrl && !isLocal(baseUrl)) {
    targets.push(baseUrl.replace(/\/+$/, ''));
  }
  if (apiBaseUrl && !isLocal(apiBaseUrl)) {
    targets.push(`${apiBaseUrl.replace(/\/+$/, '')}/api/pizzas`);
  }
  if (targets.length === 0) {
    log.info('No remote BASE_URL / API_BASE_URL — skipping warm-up');
    return;
  }
  log.info({ targets }, 'Warming up services before suite');
  await Promise.all(targets.map(pingUntilAwake));
}
