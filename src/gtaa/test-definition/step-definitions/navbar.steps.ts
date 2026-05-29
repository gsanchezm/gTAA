/**
 * Test Definition layer — Navbar step definitions (navbar-shell.feature).
 *
 * The Background "logged in as" Given is registered in common.steps.ts and
 * reused via Cucumber's global registry — NOT re-declared here.
 *
 * Call path: feature -> THIS step -> NavbarUseCase -> driver.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { NavbarUseCase } from '../usecases/navbar.usecase';

Given(
  'they are on the catalog screen in market {string} using language {string}',
  async function (this: GtaaWorld, market: string, language: string) {
    await new NavbarUseCase(this).openCatalogScreen(market, language);
  },
);

Then(
  'the navbar logo, catalog, checkout, and profile links are visible',
  async function (this: GtaaWorld) {
    await new NavbarUseCase(this).assertDesktopLinksVisible();
  },
);

When('they open the mobile navigation menu', async function (this: GtaaWorld) {
  await new NavbarUseCase(this).openMobileMenu();
});

Then(
  'the mobile menu shows catalog, checkout, profile, and logout entries',
  async function (this: GtaaWorld) {
    await new NavbarUseCase(this).assertMobileMenuEntries();
  },
);

When(
  'they switch the header language to {string}',
  async function (this: GtaaWorld, targetLanguage: string) {
    await new NavbarUseCase(this).switchHeaderLanguage(targetLanguage);
  },
);

Then(
  'the catalog add-to-cart label reflects {string}',
  async function (this: GtaaWorld, expected: string) {
    await new NavbarUseCase(this).assertAddToCartLabelReflects(expected);
  },
);
