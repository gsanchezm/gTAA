/**
 * Test Definition layer — Pizza Builder step definitions (customize-pizza.feature).
 *
 * The Background "logged in as" Given is registered in common.steps.ts and
 * reused via Cucumber's global registry — NOT re-declared here.
 *
 * The single `the navbar cart count is {string}` binding matches BOTH the
 * pre-confirm (initialCount) and post-confirm (expectedCount) uses, since
 * Cucumber matches on step text, not keyword.
 *
 * Call path: feature -> THIS step -> PizzaBuilderUseCase -> executor/driver.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { PizzaBuilderUseCase } from '../usecases/pizzaBuilder.usecase';

Given(
  'the pizza builder is open for {string} in market {string} using language {string}',
  async function (this: GtaaWorld, item: string, market: string, language: string) {
    await new PizzaBuilderUseCase(this).openBuilder(item, market, language);
  },
);

Then('the size options and topping options are rendered', async function (this: GtaaWorld) {
  await new PizzaBuilderUseCase(this).assertOptionsRendered();
});

Then(
  'the customizer price and confirm-add-to-cart affordance are visible',
  async function (this: GtaaWorld) {
    await new PizzaBuilderUseCase(this).assertPriceAndConfirmVisible();
  },
);

Then(
  'the section labels {string} and {string} are visible',
  async function (this: GtaaWorld, sizeSection: string, toppingsSection: string) {
    await new PizzaBuilderUseCase(this).assertSectionLabels(sizeSection, toppingsSection);
  },
);

Then('the estimated total label {string} is visible', async function (this: GtaaWorld, label: string) {
  await new PizzaBuilderUseCase(this).assertTotalLabel(label);
});

When('they select size {string}', async function (this: GtaaWorld, size: string) {
  await new PizzaBuilderUseCase(this).selectSize(size);
});

Then(
  'the estimated total reflects the price of size {string}',
  async function (this: GtaaWorld, size: string) {
    await new PizzaBuilderUseCase(this).assertTotalReflectsSize(size);
  },
);

When('they add toppings {string}', async function (this: GtaaWorld, toppings: string) {
  await new PizzaBuilderUseCase(this).addToppings(toppings);
});

Then(
  'the estimated total reflects size {string} plus toppings {string}',
  async function (this: GtaaWorld, size: string, toppings: string) {
    await new PizzaBuilderUseCase(this).assertTotalReflectsToppings(size, toppings);
  },
);

Then('the navbar cart count is {string}', async function (this: GtaaWorld, count: string) {
  await new PizzaBuilderUseCase(this).assertNavbarCartCount(count);
});

When('they confirm add to cart', async function (this: GtaaWorld) {
  await new PizzaBuilderUseCase(this).confirmAddToCart();
});

Then('the pizza builder is closed', async function (this: GtaaWorld) {
  await new PizzaBuilderUseCase(this).assertBuilderClosed();
});
