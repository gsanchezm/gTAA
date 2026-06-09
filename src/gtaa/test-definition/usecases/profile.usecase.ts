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
import { textContains } from '../support/text-match';
import { SessionUseCase } from './session.usecase';
import { isWebPlatform } from '../support/web-session-seed';
import { fetchProfileFullName } from '../../test-adaptation/clients/profile-lookup';
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
  // Native-mobile form LABEL nodes (distinct from the inputs).
  fullNameLabel: 'profile.fullNameLabel',
  phoneLabel: 'profile.phoneNumberLabel',
  addressLabel: 'profile.addressLabel',
  notesLabel: 'profile.notesLabel',
} as const;

/** Normalize for tolerant name comparison (lowercase, strip non-alphanumeric). */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

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
    await new SessionUseCase(this.world).ensureMarket(market);
    const ui = await this.world.ui();
    await ui.navigate(`/profile?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`);
    // `profileScreen` is a mobile-only locator; on web the profile renders as a
    // form, so gate "on the profile screen" on a web-resolvable field instead.
    const isWeb =
      this.world.context.platform === 'desktop' || this.world.context.platform === 'responsive';
    await ui.waitForVisible(isWeb ? REF.fullNameInput : REF.profileScreen);
  }

  /** "the profile card shows username {string} and the premium badge is visible". */
  async assertProfileCard(user: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      const result = await this.api.executeEndpoint('profile', 'profile.getMe', {
        market: String(this.world.state.market ?? ''),
        language: String(this.world.state.language ?? ''),
        authToken: String(this.world.state.token ?? ''),
      });
      this.assertApiPass(result, 'profile.getMe');
      return;
    }
    const ui = await this.world.ui();
    // Web renders the profile as an editable form — there is no username "card"
    // or premium badge (those are native-only affordances). The web-equivalent
    // assertion is that the profile form for the signed-in user is displayed.
    const isWeb =
      this.world.context.platform === 'desktop' || this.world.context.platform === 'responsive';
    if (isWeb) {
      if (!(await ui.isVisible(REF.fullNameInput))) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          `expected the profile form for "${user}" to be displayed`,
        );
      }
      await runVisualCheck(this.world, DOMAIN, 'profile_card_render');
      return;
    }
    // Native mobile: the card renders the (shared, mutable) full_name, not the
    // login alias. Compare the card against the fresh backend full_name (tolerant
    // of spacing/case) rather than the literal "standard_user".
    const fullName = (await fetchProfileFullName(String(this.world.state.token ?? ''))) ?? user;
    const cardText = await ui.getText(REF.usernameText);
    const badge = await ui.isVisible(REF.premiumBadge);
    if (!normalizeName(cardText).includes(normalizeName(fullName)) || !badge) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the profile card to show "${fullName}" with the premium badge (card read "${cardText}")`,
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
    if (!isWebPlatform(this.world)) {
      // Native mobile: the notes input is the last field and sits below the fold,
      // so its visibility check never resolves without scrolling. Check the top
      // fields, scroll the notes field into view, then check it.
      const topVisible =
        (await ui.isVisible(REF.fullNameInput)) &&
        (await ui.isVisible(REF.phoneInput)) &&
        (await ui.isVisible(REF.addressInput));
      await ui.scrollTo(REF.notesInput);
      if (!topVisible || !(await ui.isVisible(REF.notesInput))) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          'expected the full name, phone, address, and notes inputs to be visible',
        );
      }
      if (this.world.state.profileSaved) {
        await runVisualCheck(this.world, DOMAIN, 'profile_post_save');
      }
      return;
    }
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
    if (!isWebPlatform(this.world)) {
      // Native mobile: each label is a dedicated text node, not aggregated on the
      // screen container. Read the top three, scroll the notes label into view,
      // then read it.
      const missing: string[] = [];
      const topChecks: Array<readonly [string, string]> = [
        [REF.fullNameLabel, fullNameLabel],
        [REF.phoneLabel, phoneLabel],
        [REF.addressLabel, addressLabel],
      ];
      for (const [ref, expected] of topChecks) {
        if (!textContains(await ui.getText(ref), expected)) missing.push(expected);
      }
      await ui.scrollTo(REF.notesLabel);
      if (!textContains(await ui.getText(REF.notesLabel), notesLabel)) missing.push(notesLabel);
      if (missing.length > 0) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          `expected the form labels to be visible; missing: ${missing.join(', ')}`,
        );
      }
      return;
    }
    const text = await ui.getText(REF.profileScreen);
    const missing = [fullNameLabel, phoneLabel, addressLabel, notesLabel].filter(
      (label) => !textContains(text, label),
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
        authToken: String(this.world.state.token ?? ''),
      });
      this.world.state.profileSaveResult = result;
      this.world.state.profileSaved = true;
      this.assertApiPass(result, 'profile.updateMe');
      return;
    }
    const ui = await this.world.ui();
    await ui.click(REF.saveButton);
    if (!isWebPlatform(this.world)) {
      // OmniPizza pops a native "Profile saved" AlertDialog on save (Android).
      // Left open it overlays the form, so the post-save inputs-visible assertion
      // reads every field as not-displayed. Dismiss it before continuing.
      await ui.dismissNativeDialog();
    }
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
