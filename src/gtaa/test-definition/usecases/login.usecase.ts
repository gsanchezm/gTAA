/**
 * Test Definition layer — Login use case.
 *
 * Backs invalid-credentials.feature and market-language-localization.feature.
 * Platform-agnostic: decides the path from world.context and drives the
 * execution layer directly.
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> login step -> THIS use case
 *     -> (api) ApiExecutor.executeEndpoint('login', <endpointId>, vars)   [Test Execution]
 *     -> (ui)  world.ui() : UiDriver.<action>(ref)                        [Test Execution]
 *                 -> locator adaptation -> telemetry
 */
import type { GtaaWorld } from '../support/world';
import { attemptAuthentication, type LoginAttempt } from '../../test-adaptation/clients/auth-login';
import { getUser } from '../../test-generation/test-data/user-fixtures';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { runVisualCheck } from './visual-check';
import { isWebPlatform } from '../support/web-session-seed';
import { textContains, textEquals } from '../support/text-match';

/** Logical locator refs for the login domain (see login.locators.json). */
const REF = {
  loginScreen: 'login.loginScreen',
  usernameInput: 'login.usernameInput',
  passwordInput: 'login.passwordInput',
  loginButton: 'login.loginButton',
  loginError: 'login.loginError',
  logoutButton: 'login.logoutButton',
  marketButtonList: 'login.marketButtonList',
  switzerlandLanguageList: 'login.switzerlandLanguageList',
} as const;

const DOMAIN = 'login';

/** Window-global sentinel planted before an invalid-login click (see below). */
const LOGIN_SENTINEL = '__gtaaLoginAttemptSentinel';

/** Poll budget for the (possibly empty-for-a-tick) login-error banner. */
const LOGIN_ERROR_POLL_ATTEMPTS = 40;
const LOGIN_ERROR_POLL_INTERVAL_MS = 250;

/**
 * Clears the React-controlled login inputs to empty. The OmniPizza form
 * pre-fills the demo credentials, and a plain empty `type` is a no-op, so the
 * empty-field cases would otherwise submit valid creds. Uses the native value
 * setter + input/change events so React's controlled state updates. Selectors
 * are prefix-matched to cover both desktop and responsive testids.
 */
const CLEAR_LOGIN_INPUTS_JS = `(() => {
  const u = document.querySelector("[data-testid^='username-']");
  const p = document.querySelector("[data-testid^='password-']");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  for (const el of [u, p]) {
    if (!el) continue;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return 'cleared';
})()`;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class LoginUseCase {
  constructor(private readonly world: GtaaWorld) {}

  /** Background: open the login screen (UI only; API has no screen to open). */
  async openLoginScreen(): Promise<void> {
    if (this.world.context.driver === 'api') {
      return; // API path is stateless; nothing to open.
    }
    const ui = await this.world.ui();
    await ui.navigate('/login');
    await ui.waitForVisible(REF.loginScreen);
  }

  /**
   * Negative path: attempt a login with the (possibly empty / invalid)
   * credentials supplied by the scenario outline. Values flow straight from
   * the Examples table — they are intentionally invalid, so they are NOT
   * sourced from getUser().
   */
  async attemptLogin(username: string, password: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      const attempt = await attemptAuthentication({
        username,
        password,
        language: this.world.state.language as string | undefined,
        market: this.world.state.market as string | undefined,
      });
      // Persist for the subsequent assertion step (per-scenario state only).
      this.world.state.loginAttempt = attempt;
      return;
    }

    const ui = await this.world.ui();
    // WEB ONLY: the OmniPizza login form PRE-FILLS standard_user/pizza123, so an
    // empty test case must truly clear the React-controlled inputs first (a
    // plain `type('')` is a no-op and would submit the valid demo creds). And
    // the FE reloads the page on a 401 (wiping the banner), so plant a sentinel
    // before the click to detect that reload-as-rejection. Both use evaluate(),
    // which is web-only; native mobile types + clicks directly.
    if (isWebPlatform(this.world)) {
      await ui.evaluate(CLEAR_LOGIN_INPUTS_JS);
      await ui.evaluate(`(() => { window.${LOGIN_SENTINEL} = '1'; return 'ok'; })()`);
    }
    if (username) {
      await ui.type(REF.usernameInput, username);
    }
    if (password) {
      await ui.type(REF.passwordInput, password);
    }
    await ui.click(REF.loginButton);
  }

  /** Assert the auth error contains the expected (generic) message. */
  async assertLoginErrorContains(expected: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      const attempt = this.world.state.loginAttempt as LoginAttempt | undefined;
      // On the API path the rejection guarantee is "the backend refused the
      // credentials and surfaced an error" (4xx, no token). The live backend's
      // message varies by case (401 "Invalid username or password", 403 locked,
      // 422 pydantic) and never literally contains the generic "Invalid
      // credentials" sentinel — that single-message guarantee is a UI concern
      // (see invalid-credentials.feature). So API asserts the rejection itself.
      if (!attempt || !attempt.rejected) {
        throw new ClassifiedError(
          FailureBucket.API_RESPONSE_FAILURE,
          `expected the invalid-credentials endpoint to reject login (containing "${expected}") ` +
            `but it was not rejected (status ${attempt?.status ?? 'n/a'})`,
        );
      }
      if (!attempt.errorMessage) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          `expected the rejected login to surface an error message but the body carried none ` +
            `(status ${attempt.status})`,
        );
      }
      return;
    }

    const ui = await this.world.ui();
    // Poll the banner: React can attach it empty for a tick before committing
    // text, and on a cold backend the rejection round-trips. isVisible/getText
    // return promptly (no long wait) so the loop stays bounded.
    let actual = '';
    for (let attempt = 0; attempt < LOGIN_ERROR_POLL_ATTEMPTS; attempt++) {
      if (await ui.isVisible(REF.loginError)) {
        actual = (await ui.getText(REF.loginError)).trim();
        if (actual.length > 0) break;
      }
      await delay(LOGIN_ERROR_POLL_INTERVAL_MS);
    }
    if (textContains(actual, expected)) {
      await runVisualCheck(this.world, DOMAIN, 'login_screen_invalid_credentials');
      return;
    }
    // WEB ONLY: an empty banner can mean the FE reloaded the page on a 401 (the
    // sentinel planted before the click is wiped), which IS the rejection — just
    // via the reload code path rather than the banner. Treat a wiped sentinel as
    // auth-rejected. (evaluate() is web-only; native mobile renders the banner.)
    if (isWebPlatform(this.world)) {
      const sentinelAlive = (
        await ui.evaluate(`typeof window.${LOGIN_SENTINEL} === 'string'`)
      ).trim();
      if (sentinelAlive !== 'true') {
        await runVisualCheck(this.world, DOMAIN, 'login_screen_invalid_credentials');
        return;
      }
    }
    throw new ClassifiedError(
      FailureBucket.ASSERTION_FAILURE,
      `expected login error to contain "${expected}" but got "${actual}"`,
    );
  }

  /**
   * Select a market + language on the login screen, then sign in. The
   * market-language scenarios are @visual @desktop (web only, no @api), so this
   * is a UI flow. Market/language selection clicks the relevant button rows;
   * the concrete per-button selectors live in the adaptation layer.
   */
  async selectMarketWithLanguage(market: string, language: string): Promise<void> {
    this.world.state.market = market;
    this.world.state.language = language;
    const ui = await this.world.ui();
    // The market is chosen on the login screen (testid keyed by upper-case code).
    // CH is the only market with two locales (de default + fr); that picker lives
    // in the POST-LOGIN navbar, so it is applied in loginWithAlias once the navbar
    // renders — not on the login screen.
    await ui.click(`login.marketByCode#code=${market.toUpperCase()}`);
  }

  /** Sign in with a known-good alias (used after market+language selection). */
  async loginWithAlias(alias: string): Promise<void> {
    const user = getUser(alias);
    const ui = await this.world.ui();
    await ui.type(REF.usernameInput, user.username);
    await ui.type(REF.passwordInput, user.password);
    await ui.click(REF.loginButton);
    await ui.waitForVisible(REF.logoutButton);
    // CH defaults to German after market selection; switch to French via the
    // post-login navbar language button so the localized chrome (logout label)
    // reflects the requested locale.
    if (String(this.world.state.market ?? '').toUpperCase() === 'CH') {
      const lang = String(this.world.state.language ?? '').toLowerCase();
      if (lang === 'french' || lang === 'fr') {
        await ui.click('navbar.languageFRButton');
        await ui.waitForVisible(REF.logoutButton);
      }
    }
  }

  /**
   * Assert the post-login logout button label reads the localized value, then
   * run the visual oracle (@visual scenario).
   */
  async assertLogoutLabel(expected: string): Promise<void> {
    const ui = await this.world.ui();
    const actual = (await ui.getText(REF.logoutButton)).trim();
    if (!textEquals(actual, expected)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the logout button label to read "${expected}" but got "${actual}"`,
      );
    }
    // @visual @localized scenario -> the post-login localized-chrome snapshot.
    await runVisualCheck(this.world, DOMAIN, 'login_screen_localized');
  }
}
