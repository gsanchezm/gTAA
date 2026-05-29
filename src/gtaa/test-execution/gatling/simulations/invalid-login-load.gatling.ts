// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
/**
 * Invalid Login Load Simulation (gTAA baseline).
 *
 * NEGATIVE auth paths only — every request is *expected* to be rejected by
 * /api/auth/login. The feeder rotates across the pinned failure cases:
 *   missing-username, missing-password, both-empty,
 *   invalid-credentials, locked-out.
 *
 * The PASS condition is a 4xx response (400/401/403/422). A 2xx here would mean
 * the auth endpoint leaked, so the simulation fails loud.
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
  getEnvironmentVariable,
  Session,
} from '@gatling.io/core';
import { http, status } from '@gatling.io/http';

import { invalidLoginRows } from './invalid-login-rows.generated';
import { injectionProfile, requireApiBaseUrl } from './injection-profile';

const invalidLoginFeeder = arrayFeeder(invalidLoginRows).circular();

export default simulation((setUp) => {
  const apiBaseUrl = requireApiBaseUrl();

  const httpProtocol = http
    .baseUrl(apiBaseUrl)
    .header('Content-Type', 'application/json')
    .header('X-Language', getEnvironmentVariable('LANGUAGE', 'en'));

  const invalidLogin = scenario('Invalid Login API Flow')
    .feed(invalidLoginFeeder)
    .exec(
      http('Invalid Login')
        .post('/api/auth/login')
        .body(
          StringBody((session: Session) =>
            JSON.stringify({
              username: session.get<string>('username'),
              password: session.get<string>('password'),
            }),
          ),
        )
        // PASS condition is a 4xx — these payloads MUST be rejected.
        .check(status().in(400, 401, 403, 422)),
    );

  setUp(invalidLogin.injectOpen(injectionProfile())).protocols(httpProtocol);
});
