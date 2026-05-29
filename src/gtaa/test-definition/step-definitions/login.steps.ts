/**
 * Test Definition layer — Login step definitions.
 *
 * Covers invalid-credentials.feature and market-language-localization.feature
 * (both login domain). The shared "login screen is open" Given lives here once.
 *
 * Call path: feature -> THIS step -> LoginUseCase -> executor/driver.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { LoginUseCase } from '../usecases/login.usecase';

// Background of both login features.
Given('the OmniPizza login screen is open', async function (this: GtaaWorld) {
  await new LoginUseCase(this).openLoginScreen();
});

// --- invalid-credentials.feature ---
When(
  'the user attempts to log in with username {string} and password {string}',
  async function (this: GtaaWorld, username: string, password: string) {
    await new LoginUseCase(this).attemptLogin(username, password);
  },
);

Then(
  'the login error message contains {string}',
  async function (this: GtaaWorld, expected: string) {
    await new LoginUseCase(this).assertLoginErrorContains(expected);
  },
);

// --- market-language-localization.feature ---
When(
  'the user selects the {string} market with language {string}',
  async function (this: GtaaWorld, market: string, language: string) {
    await new LoginUseCase(this).selectMarketWithLanguage(market, language);
  },
);

When('they log in as {string}', async function (this: GtaaWorld, alias: string) {
  await new LoginUseCase(this).loginWithAlias(alias);
});

Then('the logout button label is {string}', async function (this: GtaaWorld, expected: string) {
  await new LoginUseCase(this).assertLogoutLabel(expected);
});
