/**
 * Test Definition layer — Catalog step definitions (browse-catalog.feature).
 *
 * The Background "logged in as" Given is registered in common.steps.ts and
 * reused via Cucumber's global registry — NOT re-declared here.
 *
 * Call path: feature -> THIS step -> CatalogUseCase -> executor/driver.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { CatalogUseCase } from '../usecases/catalog.usecase';

Given(
  'they are browsing the catalog in market {string} using language {string}',
  async function (this: GtaaWorld, market: string, language: string) {
    await new CatalogUseCase(this).browseCatalog(market, language);
  },
);

Then('the catalog screen is fully displayed', async function (this: GtaaWorld) {
  await new CatalogUseCase(this).assertCatalogDisplayed();
});

Then(
  'the add-to-cart label {string} is visible on a pizza card',
  async function (this: GtaaWorld, label: string) {
    await new CatalogUseCase(this).assertAddToCartLabelVisible(label);
  },
);

Then('the section title {string} is visible', async function (this: GtaaWorld, title: string) {
  await new CatalogUseCase(this).assertSectionTitle(title);
});

When('they search the catalog for {string}', async function (this: GtaaWorld, query: string) {
  await new CatalogUseCase(this).searchCatalog(query);
});

Then(
  'only pizzas whose name contains {string} remain visible',
  async function (this: GtaaWorld, query: string) {
    await new CatalogUseCase(this).assertOnlyNameContains(query);
  },
);

When('they clear the catalog filters', async function (this: GtaaWorld) {
  await new CatalogUseCase(this).clearFilters();
});

Then('the full pizza grid is restored', async function (this: GtaaWorld) {
  await new CatalogUseCase(this).assertFullGridRestored();
});

When('they select the {string} category', async function (this: GtaaWorld, category: string) {
  await new CatalogUseCase(this).selectCategory(category);
});

Then(
  'only pizzas in category {string} are visible',
  async function (this: GtaaWorld, category: string) {
    await new CatalogUseCase(this).assertOnlyCategoryVisible(category);
  },
);

When('they open the pizza {string}', async function (this: GtaaWorld, item: string) {
  await new CatalogUseCase(this).openPizza(item);
});

Then('the pizza builder is displayed for {string}', async function (this: GtaaWorld, item: string) {
  await new CatalogUseCase(this).assertBuilderDisplayed(item);
});
