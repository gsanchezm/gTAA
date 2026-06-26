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
import { textContains } from '../support/text-match';
import { seedWebPersistedStores, isWebPlatform } from '../support/web-session-seed';
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
/** The customizer modal's confirm CTA carries the localized "add" label on web. */
const BUILDER_CONFIRM = 'pizzaBuilder.confirmAddToCartButton';
/** Native-mobile bottom-nav refs (no hamburger drawer on android/ios). */
const BOTTOM_NAV_CONTAINER = 'navbar.bottomNavContainer';
const BOTTOM_NAV_LIST = 'navbar.bottomNavList';

/** First catalog card's pizza id (strips the add-to-cart-<id>-<viewport> testid). */
const FIRST_CARD_ID_JS = `(() => {
  const el = document.querySelector("[data-testid^='add-to-cart-']");
  if (!el) return '';
  return (el.getAttribute('data-testid') || '').replace(/^add-to-cart-/, '').replace(/-(desktop|responsive)$/, '');
})()`;

/** Dismiss the customizer modal (Escape) so it doesn't leak into a snapshot. */
const DISMISS_MODAL_JS = `(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
  return 'dismissed';
})()`;

const DOMAIN = 'navbar';

export class NavbarUseCase {
  constructor(private readonly world: GtaaWorld) {}

  /** "they are on the catalog screen in market {string} using language {string}". */
  async openCatalogScreen(market: string, language: string): Promise<void> {
    this.world.state.market = market;
    this.world.state.language = language;
    const ui = await this.requireUi();
    if (isWebPlatform(this.world)) {
      // WEB: prime the app origin so the seed lands there (not about:blank), seed
      // the persisted market/language (the navbar localizes off the omnipizza-
      // country store, NOT the URL — and for CH this is what exposes the header
      // language switcher), then navigate to the bare catalog. Mirrors TOM's
      // navbar-shell.molecule.ts (root -> seed -> /catalog).
      await ui.navigate('/');
      await seedWebPersistedStores(ui, {
        market,
        language,
        token: String(this.world.state.token ?? ''),
      });
      await ui.navigate('/catalog');
    } else {
      // Native mobile gets its market via re-login + a deep link carrying the
      // market/lang params (localStorage seeding + bare routes are web-only).
      await ui.navigate(`/catalog?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`);
    }
    // Wait for the full catalog body (mirrors TOM's catalogScreen anchor), not
    // just the navbar shell, so the navbar (incl. the CH switcher) is hydrated
    // before the next step interacts with it.
    await ui.waitForVisible(CATALOG_SCREEN);
  }

  /** "the navbar logo, catalog, checkout, and profile links are visible". */
  async assertDesktopLinksVisible(): Promise<void> {
    const ui = await this.requireUi();
    // Mirror TOM's navbar-shell.molecule.ts: WAIT for each affordance (the wait
    // IS the presence assertion) at 8s.
    await ui.waitForVisible(REF.navLogo, 8_000);
    await ui.waitForVisible(REF.navCatalogLink, 8_000);
    await ui.waitForVisible(REF.navCheckoutLink, 8_000);
    await ui.waitForVisible(REF.navProfileLink, 8_000);
    // @visual @desktop @ui-only scenario terminates on this step.
    await runVisualCheck(this.world, DOMAIN, 'navbar_desktop_strip');
  }

  /** "they open the mobile navigation menu". */
  async openMobileMenu(): Promise<void> {
    const ui = await this.requireUi();
    if (!isWebPlatform(this.world)) {
      // Native mobile: the bottom nav is always visible — there is no hamburger
      // to open. Assert its container is present as the readiness signal.
      await ui.waitForVisible(BOTTOM_NAV_CONTAINER);
      return;
    }
    // Web-responsive: click the hamburger to reveal the drawer.
    await ui.click(REF.mobileMenuButton);
    await ui.waitForVisible(REF.mobileNavCatalogLink);
  }

  /** "the mobile menu shows catalog, checkout, profile, and logout entries". */
  async assertMobileMenuEntries(): Promise<void> {
    const ui = await this.requireUi();
    if (!isWebPlatform(this.world)) {
      // Native mobile: the bottom nav exposes catalog/checkout/profile via a
      // list selector; logout lives on the profile screen, NOT the bottom nav,
      // so it is intentionally not asserted here (matches the reference).
      if (!(await ui.isVisible(BOTTOM_NAV_LIST))) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          'expected the mobile bottom nav to expose the catalog/checkout/profile entries',
        );
      }
      await runVisualCheck(this.world, DOMAIN, 'navbar_mobile_menu_opened');
      return;
    }
    // Mirror TOM's navbar-shell.molecule.ts: WAIT for each drawer entry (the wait
    // IS the presence assertion) at 8s.
    await ui.waitForVisible(REF.mobileNavCatalogLink, 8_000);
    await ui.waitForVisible(REF.mobileNavCheckoutLink, 8_000);
    await ui.waitForVisible(REF.mobileNavProfileLink, 8_000);
    await ui.waitForVisible(REF.mobileLogoutButton, 8_000);
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
    const isWeb =
      this.world.context.platform === 'desktop' || this.world.context.platform === 'responsive';
    if (isWeb) {
      // The per-card "+" button is icon-only on web (no text/aria-label by
      // design); the localized add label ("Ajouter"/"Hinzufügen") lives on the
      // customizer modal's confirm CTA. Open the modal on the first card, read
      // its label, then close it — the web-equivalent of the native card label.
      // A header language switch re-renders/refetches the catalog, so the cards
      // can briefly be absent right after the click. Poll the exact add-to-cart
      // read (bounded) so we wait out the re-render instead of failing the race;
      // when cards are already present the first read returns immediately.
      let pizzaId = (await ui.evaluate(FIRST_CARD_ID_JS)).trim();
      const cardDeadline = Date.now() + 10_000;
      while (!pizzaId && Date.now() < cardDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        pizzaId = (await ui.evaluate(FIRST_CARD_ID_JS)).trim();
      }
      if (!pizzaId) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          `expected a catalog card to read the add-to-cart label "${expected}" but none rendered`,
        );
      }
      await ui.click(`catalog.addToCartButton#id=${pizzaId}`);
      await ui.waitForVisible(BUILDER_CONFIRM);
      const label = await ui.getText(BUILDER_CONFIRM);
      // Close the modal best-effort so it doesn't leak into a later snapshot.
      await ui.evaluate(DISMISS_MODAL_JS).catch(() => undefined);
      if (!textContains(label, expected)) {
        throw new ClassifiedError(
          FailureBucket.ASSERTION_FAILURE,
          `expected the add-to-cart label to reflect "${expected}" but got "${label}"`,
        );
      }
      await runVisualCheck(this.world, DOMAIN, 'navbar_header_language_switcher');
      return;
    }

    const text = await ui.getText(CATALOG_CARDS);
    if (!textContains(text, expected)) {
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
