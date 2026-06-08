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
import { authenticate } from '../../test-adaptation/clients/auth-login';
import { getUser } from '../../test-generation/test-data/user-fixtures';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';

/** Logical locator refs reused from the login domain contract. */
const REF = {
  usernameInput: 'login.usernameInput',
  passwordInput: 'login.passwordInput',
  loginButton: 'login.loginButton',
  logoutButton: 'login.logoutButton',
} as const;

export class SessionUseCase {
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
      // Authenticate via the tolerant login client (coalesces token/access_token)
      // instead of the contract's strict $.token assertion, so the byte-identical
      // login contract stays untouched while the live backend's access_token shape
      // is still accepted. Mirrors the reference login token accessor.
      const auth = await authenticate({
        username: user.username,
        password: user.password,
        language: String(this.world.state.language ?? 'en'),
        market: String(this.world.state.market ?? ''),
      });
      if (!auth.token) {
        throw new ClassifiedError(
          FailureBucket.API_RESPONSE_FAILURE,
          `login failed for "${alias}" (HTTP ${auth.status}; no access token in response)`,
        );
      }
      this.world.state.token = auth.token;
      return;
    }

    const ui = await this.world.ui();
    await ui.navigate('/login');
    await ui.type(REF.usernameInput, user.username);
    await ui.type(REF.passwordInput, user.password);
    await ui.click(REF.loginButton);
    // Best-effort: capture a bearer token for downstream API-backed helpers
    // (e.g. catalog name->id resolution for the builder deep link). Never fails
    // the UI login — the web session itself is established by the form submit.
    try {
      const auth = await authenticate({
        username: user.username,
        password: user.password,
        language: String(this.world.state.language ?? 'en'),
      });
      this.world.state.token = auth.token ?? '';
    } catch {
      /* token capture is best-effort */
    }
    // Login redirects to the catalog. The logout control is only directly
    // visible in the DESKTOP navbar; on responsive web and on native mobile it
    // lives inside a collapsed menu, so gate "logged in" on the catalog screen
    // there.
    const usesNavbarLogout = this.world.context.platform === 'desktop';
    await ui.waitForVisible(usesNavbarLogout ? REF.logoutButton : 'catalog.catalogScreen');
    // Mobile login defaults to the US market (no market is chosen on the login
    // screen); track it so ensureMarket() knows when a switch is required.
    this.world.state.loggedInMarket = 'US';
  }

  /**
   * Ensure the app is showing `market`. On native mobile the market is only
   * selectable on the login screen, so switching means re-logging in with that
   * market selected. Web carries the market in URL params, so this is a no-op
   * there (and on the api path).
   */
  async ensureMarket(market: string): Promise<void> {
    const platform = this.world.context.platform;
    if (platform !== 'android' && platform !== 'ios') return;
    if (this.world.context.driver === 'api') return;

    const target = market.toUpperCase();
    if (String(this.world.state.loggedInMarket ?? 'US').toUpperCase() === target) return;

    const alias = String(this.world.state.userAlias ?? 'standard_user');
    const user = getUser(alias);
    const ui = await this.world.ui();
    await ui.click('navbar.navLogoutLink');
    await ui.waitForVisible('login.loginScreen');
    await ui.click(`login.marketByCode#code=${target}`);
    if (target === 'CH') {
      // CH exposes a runtime language picker on the login screen once the market
      // is chosen (de default + fr). Select the scenario's language so the
      // post-login UI (catalog "All" pill, builder add-to-cart CTA, labels)
      // localizes to French instead of falling back to German. The lang buttons
      // share the navbar's ~btn-lang-{code} testids. Best-effort.
      const lang = String(this.world.state.language ?? '').toLowerCase();
      const langRef = lang === 'fr' ? 'navbar.languageFRButton' : 'navbar.languageDEButton';
      await ui.click(langRef).catch(() => undefined);
    }
    await ui.type(REF.usernameInput, user.username);
    await ui.type(REF.passwordInput, user.password);
    await ui.click(REF.loginButton);
    await ui.waitForVisible('catalog.catalogScreen');
    this.world.state.loggedInMarket = target;
  }
}
