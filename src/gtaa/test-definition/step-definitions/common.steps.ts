/**
 * Test Definition layer — shared (cross-feature) step definitions.
 *
 * `Given the OmniPizza user is logged in as "<alias>"` is the Background of six
 * features (checkout, catalog, customize-pizza, update-profile, navbar,
 * order-success). Cucumber's step registry is global, so this phrasing is
 * defined EXACTLY ONCE here — declaring it again in any domain file would throw
 * MultipleStepDefinitions at boot.
 *
 * Call path: feature -> THIS step -> SessionUseCase -> executor/driver.
 */
import { Given } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { SessionUseCase } from '../usecases/session.usecase';

Given(
  'the OmniPizza user is logged in as {string}',
  async function (this: GtaaWorld, alias: string) {
    await new SessionUseCase(this).loginAs(alias);
  },
);
