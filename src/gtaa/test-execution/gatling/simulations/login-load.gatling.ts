// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
/**
 * Login Load Simulation (gTAA baseline).
 *
 * Positive auth-throughput simulation: the feeder rotates across a small set of
 * test users and hits /api/auth/login at the configured injection rate. Tolerant
 * of locked_out_user / problem_user returning 401 — this measures auth-endpoint
 * throughput, not policy.
 *
 * The HTTP target is API_BASE_URL (stamped from appConfig().apiBaseUrl).
 * Profiles (PERF_PROFILE): smoke | load | stress. See injection-profile.ts.
 * Direct performance simulation — no indirection layer.
 */
import {
  simulation,
  scenario,
  arrayFeeder,
  StringBody,
  jsonPath,
  getEnvironmentVariable,
  Session,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

import { loginRows } from './login-rows.generated';
import { injectionProfile, requireApiBaseUrl } from './injection-profile';

const loginFeeder = arrayFeeder(loginRows).circular();

export default simulation((setUp) => {
  const apiBaseUrl = requireApiBaseUrl();

  const httpProtocol = http
    .baseUrl(apiBaseUrl)
    .header('Content-Type', 'application/json')
    .header('X-Language', getEnvironmentVariable('LANGUAGE', 'en'));

  const login = scenario('Login API Flow')
    .feed(loginFeeder)
    .exec(
      http('Login')
        .post('/api/auth/login')
        .body(
          StringBody((session: Session) =>
            JSON.stringify({
              username: session.get<string>('username'),
              password: session.get<string>('password'),
            }),
          ),
        )
        .check(jsonPath('$.token').optional()),
    );

  setUp(login.injectOpen(injectionProfile())).protocols(httpProtocol);
});
