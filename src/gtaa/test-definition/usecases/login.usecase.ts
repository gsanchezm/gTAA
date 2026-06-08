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
import { ApiExecutor } from '../../test-execution/api/api-executor';
import { getUser } from '../../test-generation/test-data/user-fixtures';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { runVisualCheck } from './visual-check';
import { textContains, textEquals } from '../support/text-match';
import type { ApiExecutionResult } from '../../test-execution/api/api-executor';

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

export class LoginUseCase {
  private readonly api = new ApiExecutor();

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
      const result = await this.api.executeEndpoint('login', 'login.authenticate.invalid', {
        username,
        password,
      });
      // Persist for the subsequent assertion step (per-scenario state only).
      this.world.state.loginApiResult = result;
      return;
    }

    const ui = await this.world.ui();
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
      const result = this.world.state.loginApiResult as ApiExecutionResult | undefined;
      // The login.authenticate.invalid contract asserts a 4xx with an error body
      // matching /invalid|locked|user|password/; a PASS means that rejection
      // contract held (the generic-message guarantee is a UI concern).
      if (!result || result.status !== 'PASS') {
        throw new ClassifiedError(
          result?.failureBucket ?? FailureBucket.API_RESPONSE_FAILURE,
          result?.errorMessage ??
            `expected the invalid-credentials endpoint to reject login (containing "${expected}")`,
        );
      }
      return;
    }

    const ui = await this.world.ui();
    const actual = await ui.getText(REF.loginError);
    if (!textContains(actual, expected)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected login error to contain "${expected}" but got "${actual}"`,
      );
    }
    // @visual @invalid scenario -> the post-failure login screen snapshot.
    await runVisualCheck(this.world, DOMAIN, 'login_screen_invalid_credentials');
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
    await ui.click(REF.marketButtonList);
    if (market.toUpperCase() === 'CH') {
      // CH is the only market exposing a runtime language picker.
      await ui.click(REF.switzerlandLanguageList);
    }
  }

  /** Sign in with a known-good alias (used after market+language selection). */
  async loginWithAlias(alias: string): Promise<void> {
    const user = getUser(alias);
    const ui = await this.world.ui();
    await ui.type(REF.usernameInput, user.username);
    await ui.type(REF.passwordInput, user.password);
    await ui.click(REF.loginButton);
    await ui.waitForVisible(REF.logoutButton);
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
