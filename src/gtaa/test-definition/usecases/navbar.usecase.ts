/**
 * Test Definition layer — Navbar shell use case (navbar-shell.feature).
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> navbar step -> THIS use case
 *     -> world.ui() : UiDriver.<action>(ref)   [Test Execution] -> locator adaptation -> telemetry
 *
 * The navbar domain has NO API contract and its scenarios carry no @api tag, so
 * there is no API path. If reached on the API driver, fail loudly with a
 * classified error rather than silently passing.
 *
 * @visual mapping (by scenario discriminator tag):
 *   @desktop @ui-only   -> navbar_desktop_strip            (desktop-links step)
 *   responsive/mobile   -> navbar_mobile_menu_opened       (mobile-menu step)
 *   header switch (CH)  -> navbar_header_language_switcher (label-reflects step)
 */
import type { GtaaWorld } from '../support/world';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { runVisualCheck } from './visual-check';

/** Logical locator refs for the navbar domain (see navbar.locators.json). */
const REF = {
  navLogo: 'navbar.navLogo',
  navCatalogLink: 'navbar.navCatalogLink',
  navCheckoutLink: 'navbar.navCheckoutLink',
  navProfileLink: 'navbar.navProfileLink',
  mobileMenuButton: 'navbar.mobileMenuButton',
  mobileNavCatalogLink: 'navbar.mobileNavCatalogLink',
  mobileNavCheckoutLink: 'navbar.mobileNavCheckoutLink',
  mobileNavProfileLink: 'navbar.mobileNavProfileLink',
  mobileLogoutButton: 'navbar.mobileLogoutButton',
  languageFRButton: 'navbar.languageFRButton',
  languageDEButton: 'navbar.languageDEButton',
} as const;

/** Catalog add-to-cart label is read from the catalog card list (cross-domain). */
const CATALOG_CARDS = 'catalog.pizzaCardList';
const CATALOG_SCREEN = 'catalog.catalogScreen';

const DOMAIN = 'navbar';

export class NavbarUseCase {
  constructor(private readonly world: GtaaWorld) {}

  /** "they are on the catalog screen in market {string} using language {string}". */
  async openCatalogScreen(market: string, language: string): Promise<void> {
    this.world.state.market = market;
    this.world.state.language = language;
    const ui = await this.requireUi();
    await ui.navigate(`/catalog?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`);
    await ui.waitForVisible(REF.navLogo);
  }

  /** "the navbar logo, catalog, checkout, and profile links are visible". */
  async assertDesktopLinksVisible(): Promise<void> {
    const ui = await this.requireUi();
    const visible =
      (await ui.isVisible(REF.navLogo)) &&
      (await ui.isVisible(REF.navCatalogLink)) &&
      (await ui.isVisible(REF.navCheckoutLink)) &&
      (await ui.isVisible(REF.navProfileLink));
    if (!visible) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the navbar logo, catalog, checkout, and profile links to be visible',
      );
    }
    // @visual @desktop @ui-only scenario terminates on this step.
    await runVisualCheck(this.world, DOMAIN, 'navbar_desktop_strip');
  }

  /** "they open the mobile navigation menu". */
  async openMobileMenu(): Promise<void> {
    const ui = await this.requireUi();
    await ui.click(REF.mobileMenuButton);
    await ui.waitForVisible(REF.mobileNavCatalogLink);
  }

  /** "the mobile menu shows catalog, checkout, profile, and logout entries". */
  async assertMobileMenuEntries(): Promise<void> {
    const ui = await this.requireUi();
    const visible =
      (await ui.isVisible(REF.mobileNavCatalogLink)) &&
      (await ui.isVisible(REF.mobileNavCheckoutLink)) &&
      (await ui.isVisible(REF.mobileNavProfileLink)) &&
      (await ui.isVisible(REF.mobileLogoutButton));
    if (!visible) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the mobile menu to show catalog, checkout, profile, and logout entries',
      );
    }
    // @visual responsive/mobile scenario terminates on this step.
    await runVisualCheck(this.world, DOMAIN, 'navbar_mobile_menu_opened');
  }

  /** "they switch the header language to {string}". */
  async switchHeaderLanguage(targetLanguage: string): Promise<void> {
    this.world.state.language = targetLanguage;
    const ui = await this.requireUi();
    const ref = targetLanguage.toLowerCase() === 'fr' ? REF.languageFRButton : REF.languageDEButton;
    await ui.click(ref);
    await ui.waitForVisible(CATALOG_SCREEN);
  }

  /** "the catalog add-to-cart label reflects {string}". */
  async assertAddToCartLabelReflects(expected: string): Promise<void> {
    const ui = await this.requireUi();
    const text = await ui.getText(CATALOG_CARDS);
    if (!text.includes(expected)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the catalog add-to-cart label to reflect "${expected}" but got "${text}"`,
      );
    }
    // @visual CH header-language-switch scenario terminates on this step.
    await runVisualCheck(this.world, DOMAIN, 'navbar_header_language_switcher');
  }

  /** Guard: navbar is UI-only; there is no API contract for this domain. */
  private async requireUi() {
    if (this.world.context.driver === 'api') {
      throw new ClassifiedError(
        FailureBucket.DATA_SETUP_FAILURE,
        'navbar has no API contract; navbar scenarios run on UI drivers only',
      );
    }
    return this.world.ui();
  }
}
