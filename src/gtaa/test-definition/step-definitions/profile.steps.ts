/**
 * Test Definition layer — Profile step definitions (update-profile.feature).
 *
 * The Background "logged in as" Given is registered in common.steps.ts and
 * reused via Cucumber's global registry — NOT re-declared here.
 *
 * Call path: feature -> THIS step -> ProfileUseCase -> executor/driver.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import { GtaaWorld } from '../support/world';
import { ProfileUseCase } from '../usecases/profile.usecase';

Given(
  'they are on the profile screen in market {string} using language {string}',
  async function (this: GtaaWorld, market: string, language: string) {
    await new ProfileUseCase(this).openProfile(market, language);
  },
);

Then(
  'the profile card shows username {string} and the premium badge is visible',
  async function (this: GtaaWorld, user: string) {
    await new ProfileUseCase(this).assertProfileCard(user);
  },
);

// Shared by the render scenario and the "editable + save accepted" scenario.
Then('the full name, phone, address, and notes inputs are visible', async function (this: GtaaWorld) {
  await new ProfileUseCase(this).assertFormInputsVisible();
});

Then(
  'the form labels {string}, {string}, {string}, {string} are visible',
  async function (
    this: GtaaWorld,
    fullNameLabel: string,
    phoneLabel: string,
    addressLabel: string,
    notesLabel: string,
  ) {
    await new ProfileUseCase(this).assertFormLabels(fullNameLabel, phoneLabel, addressLabel, notesLabel);
  },
);

When(
  'they update the profile with full name {string}, phone {string}, address {string}, notes {string}',
  async function (
    this: GtaaWorld,
    fullName: string,
    phone: string,
    address: string,
    notes: string,
  ) {
    await new ProfileUseCase(this).updateProfile(fullName, phone, address, notes);
  },
);

When('they save the profile', async function (this: GtaaWorld) {
  await new ProfileUseCase(this).saveProfile();
});

Then(
  'the profile API reports full name {string}, phone {string}, address {string}, notes {string}',
  async function (
    this: GtaaWorld,
    fullName: string,
    phone: string,
    address: string,
    notes: string,
  ) {
    await new ProfileUseCase(this).assertProfileApiReports(fullName, phone, address, notes);
  },
);
