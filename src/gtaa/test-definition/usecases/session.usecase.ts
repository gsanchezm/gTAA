/**
 * Test Definition layer — shared session/auth use case.
 *
 * Backs the cross-feature Background step
 *   `Given the OmniPizza user is logged in as "<alias>"`
 * used by checkout, catalog, pizzaBuilder, profile, navbar and order_success.
 * Defined once here (and bound once in common.steps.ts) so the layered flow
 * stays DRY and Cucumber never sees a duplicate step definition.
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> common step -> THIS use case
 *     -> (api) ApiExecutor.executeEndpoint('login','login.authenticate',...)  [Test Execution]
 *     -> (ui)  world.ui() : UiDriver.type/click(ref)                          [Test Execution]
 *                 -> locator adaptation -> telemetry
 */
import type { GtaaWorld } from '../support/world';
import { ApiExecutor } from '../../test-execution/api/api-executor';
import { getUser } from '../../test-generation/test-data/users';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';

/** Logical locator refs reused from the login domain contract. */
const REF = {
  usernameInput: 'login.usernameInput',
  passwordInput: 'login.passwordInput',
  loginButton: 'login.loginButton',
  logoutButton: 'login.logoutButton',
} as const;

export class SessionUseCase {
  private readonly api = new ApiExecutor();

  constructor(private readonly world: GtaaWorld) {}

  /**
   * Authenticate the shopper identified by `alias`. Credentials come from
   * getUser() (a fresh copy, never shared) so scenarios stay atomic.
   *
   * - api: authenticate against the login contract and stash the token in
   *   per-scenario world.state for any later authorized endpoint call.
   * - ui: drive the login form via the UiDriver and wait for the post-login
   *   logout anchor to confirm the session is established.
   */
  async loginAs(alias: string): Promise<void> {
    const user = getUser(alias);
    this.world.state.userAlias = alias;
    this.world.state.username = user.username;

    if (this.world.context.driver === 'api') {
      const result = await this.api.executeEndpoint('login', 'login.authenticate', {
        username: user.username,
        password: user.password,
      });
      if (result.status !== 'PASS') {
        throw new ClassifiedError(
          result.failureBucket ?? FailureBucket.API_RESPONSE_FAILURE,
          result.errorMessage ?? `login.authenticate failed for "${alias}"`,
        );
      }
      // login.authenticate extracts `accessToken` (see login.api.contract.json).
      this.world.state.token = result.extracted.accessToken ?? '';
      return;
    }

    const ui = await this.world.ui();
    await ui.navigate('/login');
    await ui.type(REF.usernameInput, user.username);
    await ui.type(REF.passwordInput, user.password);
    await ui.click(REF.loginButton);
    await ui.waitForVisible(REF.logoutButton);
  }
}
