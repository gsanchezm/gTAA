/**
 * Test Definition layer — Profile use case (update-profile.feature).
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> profile step -> THIS use case
 *     -> (api) ApiExecutor.executeEndpoint('profile', <endpointId>, vars)  [Test Execution]
 *     -> (ui)  world.ui() : UiDriver.<action>(ref)                         [Test Execution]
 *                 -> locator adaptation -> telemetry
 *
 * Real profile endpoints: profile.getMe (GET, extracts full_name/phone/address/
 * notes/premium) and profile.updateMe (PATCH, extracts full_name/phone/address/
 * notes). The login Background is handled by the shared SessionUseCase.
 * Per-scenario pending update values live on world.state (atomic).
 *
 * @visual mapping (by scenario discriminator tag):
 *   @ui-only render scenario      -> profile_card_render  (profile card step)
 *   editable+save (no @ui-only)   -> profile_post_save    (form-inputs-visible step)
 */
import type { GtaaWorld } from '../support/world';
import { ApiExecutor } from '../../test-execution/api/api-executor';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { runVisualCheck } from './visual-check';
import type { ApiExecutionResult } from '../../test-execution/api/api-executor';

/** Logical locator refs for the profile domain (see profile.locators.json). */
const REF = {
  profileScreen: 'profile.profileScreen',
  fullNameInput: 'profile.profileFullNameInput',
  phoneInput: 'profile.profilePhoneNumberInput',
  addressInput: 'profile.addressInput',
  notesInput: 'profile.notesInput',
  saveButton: 'profile.saveButton',
  usernameText: 'profile.profileUsernameText',
  premiumBadge: 'profile.premiumBadgeText',
} as const;

const DOMAIN = 'profile';

interface ProfileUpdate {
  fullName: string;
  phone: string;
  address: string;
  notes: string;
}

export class ProfileUseCase {
  private readonly api = new ApiExecutor();

  constructor(private readonly world: GtaaWorld) {}

  /** "they are on the profile screen in market {string} using language {string}". */
  async openProfile(market: string, language: string): Promise<void> {
    this.world.state.market = market;
    this.world.state.language = language;
    if (this.world.context.driver === 'api') {
      return;
    }
    const ui = await this.world.ui();
    await ui.navigate(`/profile?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`);
    await ui.waitForVisible(REF.profileScreen);
  }

  /** "the profile card shows username {string} and the premium badge is visible". */
  async assertProfileCard(user: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      const result = await this.api.executeEndpoint('profile', 'profile.getMe', {
        market: String(this.world.state.market ?? ''),
        language: String(this.world.state.language ?? ''),
      });
      this.assertApiPass(result, 'profile.getMe');
      return;
    }
    const ui = await this.world.ui();
    const username = await ui.getText(REF.usernameText);
    const badge = await ui.isVisible(REF.premiumBadge);
    if (!username.includes(user) || !badge) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the profile card to show username "${user}" with the premium badge`,
      );
    }
    // @visual @ui-only render scenario -> profile card snapshot.
    await runVisualCheck(this.world, DOMAIN, 'profile_card_render');
  }

  /** "the full name, phone, address, and notes inputs are visible". */
  async assertFormInputsVisible(): Promise<void> {
    if (this.world.context.driver === 'api') {
      return; // No UI form on the api path.
    }
    const ui = await this.world.ui();
    const visible =
      (await ui.isVisible(REF.fullNameInput)) &&
      (await ui.isVisible(REF.phoneInput)) &&
      (await ui.isVisible(REF.addressInput)) &&
      (await ui.isVisible(REF.notesInput));
    if (!visible) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the full name, phone, address, and notes inputs to be visible',
      );
    }
    // The @visual "editable and save accepted" scenario (no @ui-only) ends on
    // this step -> the post-save snapshot. The @ui-only render scenario reaches
    // this step too but its discriminator snapshot (profile_card_render) already
    // fired on the prior card step, so a no-op here keeps one snapshot/scenario.
    if (this.world.state.profileSaved) {
      await runVisualCheck(this.world, DOMAIN, 'profile_post_save');
    }
  }

  /** "the form labels {string}, {string}, {string}, {string} are visible". */
  async assertFormLabels(
    fullNameLabel: string,
    phoneLabel: string,
    addressLabel: string,
    notesLabel: string,
  ): Promise<void> {
    const ui = await this.world.ui();
    const text = await ui.getText(REF.profileScreen);
    const missing = [fullNameLabel, phoneLabel, addressLabel, notesLabel].filter(
      (label) => !text.includes(label),
    );
    if (missing.length > 0) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the form labels to be visible; missing: ${missing.join(', ')}`,
      );
    }
  }

  /** "they update the profile with full name {string}, phone {string}, address {string}, notes {string}". */
  async updateProfile(
    fullName: string,
    phone: string,
    address: string,
    notes: string,
  ): Promise<void> {
    const update: ProfileUpdate = { fullName, phone, address, notes };
    this.world.state.pendingProfile = update;
    if (this.world.context.driver === 'api') {
      return; // Values held in state; persisted by the save step's PATCH.
    }
    const ui = await this.world.ui();
    await ui.type(REF.fullNameInput, fullName);
    await ui.type(REF.phoneInput, phone);
    await ui.type(REF.addressInput, address);
    await ui.type(REF.notesInput, notes);
  }

  /** "they save the profile". */
  async saveProfile(): Promise<void> {
    if (this.world.context.driver === 'api') {
      const update = this.requirePending();
      // profile.updateMe (PATCH) echoes the updated profile; its contract
      // asserts the response carries full_name/phone/address — a PASS is the
      // read-after-write confirmation.
      const result = await this.api.executeEndpoint('profile', 'profile.updateMe', {
        fullName: update.fullName,
        phone: update.phone,
        address: update.address,
        notes: update.notes,
        market: String(this.world.state.market ?? ''),
        language: String(this.world.state.language ?? ''),
      });
      this.world.state.profileSaveResult = result;
      this.world.state.profileSaved = true;
      this.assertApiPass(result, 'profile.updateMe');
      return;
    }
    const ui = await this.world.ui();
    await ui.click(REF.saveButton);
    this.world.state.profileSaved = true;
  }

  /** "the profile API reports full name {string}, phone {string}, address {string}, notes {string}". */
  async assertProfileApiReports(
    fullName: string,
    phone: string,
    address: string,
    notes: string,
  ): Promise<void> {
    // @api-only step. profile.updateMe's contract asserts the PATCH response
    // echoes the submitted full_name/phone/address; a passing save result is the
    // read-after-write confirmation the scenario requires.
    const result = this.world.state.profileSaveResult as ApiExecutionResult | undefined;
    if (!result || result.status !== 'PASS') {
      throw new ClassifiedError(
        result?.failureBucket ?? FailureBucket.API_RESPONSE_FAILURE,
        result?.errorMessage ??
          `expected the profile API to report full name "${fullName}", phone "${phone}", address "${address}", notes "${notes}"`,
      );
    }
  }

  private requirePending(): ProfileUpdate {
    const pending = this.world.state.pendingProfile as ProfileUpdate | undefined;
    if (!pending) {
      throw new ClassifiedError(
        FailureBucket.DATA_SETUP_FAILURE,
        'no pending profile update — the update step must run before save',
      );
    }
    return pending;
  }

  private assertApiPass(result: ApiExecutionResult, endpointId: string): void {
    if (result.status !== 'PASS') {
      throw new ClassifiedError(
        result.failureBucket ?? FailureBucket.API_RESPONSE_FAILURE,
        result.errorMessage ?? `API endpoint "${endpointId}" did not pass`,
      );
    }
  }
}
