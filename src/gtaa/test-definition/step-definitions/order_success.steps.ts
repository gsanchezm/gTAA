/**
 * Test Definition layer — Order Success step definitions (order-success.feature).
 *
 * The Background "logged in as" Given is registered in common.steps.ts and
 * reused via Cucumber's global registry — NOT re-declared here.
 *
 * Call path: feature -> THIS step -> OrderSuccessUseCase -> executor/driver.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { OrderSuccessUseCase } from '../usecases/order_success.usecase';

Given(
  'a placed order exists in market {string} using language {string}',
  async function (this: GtaaWorld, market: string, language: string) {
    await new OrderSuccessUseCase(this).createPlacedOrder(market, language);
  },
);

When('they open the order success screen', async function (this: GtaaWorld) {
  await new OrderSuccessUseCase(this).openSuccessScreen();
});

Then(
  'the order success screen is fully displayed with status {string}',
  async function (this: GtaaWorld, expectedStatus: string) {
    await new OrderSuccessUseCase(this).assertScreenWithStatus(expectedStatus);
  },
);

Then(
  'the tracking information, courier details, and order details {string} are visible',
  async function (this: GtaaWorld, expectedOrderDetails: string) {
    await new OrderSuccessUseCase(this).assertTrackingAndDetails(expectedOrderDetails);
  },
);
