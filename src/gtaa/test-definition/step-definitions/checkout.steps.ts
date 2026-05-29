/**
 * Test Definition layer — Checkout step definitions (place-delivery-order.feature).
 *
 * The Background "logged in as" Given is registered in common.steps.ts and
 * reused via Cucumber's global registry — NOT re-declared here.
 *
 * Call path: feature -> THIS step -> CheckoutUseCase -> executor/driver.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { CheckoutUseCase } from '../usecases/checkout.usecase';

Given('they are ordering in market {string}', async function (this: GtaaWorld, market: string) {
  await new CheckoutUseCase(this).setMarket(market);
});

Given(
  'they have an order with {string} size {string} quantity {int}',
  async function (this: GtaaWorld, item: string, size: string, qty: number) {
    await new CheckoutUseCase(this).addToOrder(item, size, qty);
  },
);

When(
  'they provide delivery details {string} {string}, {string} for {string} {string}',
  async function (
    this: GtaaWorld,
    street: string,
    zip: string,
    suburb: string,
    name: string,
    phone: string,
  ) {
    await new CheckoutUseCase(this).provideDelivery(street, zip, suburb, name, phone);
  },
);

When('they choose payment method {string}', async function (this: GtaaWorld, method: string) {
  await new CheckoutUseCase(this).choosePayment(method);
});

When(
  'they enter card details {string} expiration {string} cvv {string}',
  async function (this: GtaaWorld, card: string, exp: string, cvv: string) {
    await new CheckoutUseCase(this).enterCard(card, exp, cvv);
  },
);

Then('the order is accepted', async function (this: GtaaWorld) {
  await new CheckoutUseCase(this).assertOrderAccepted();
});
