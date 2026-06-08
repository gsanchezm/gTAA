/**
 * Test Definition layer — Pizza Builder use case (customize-pizza.feature).
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> pizzaBuilder step -> THIS use case
 *     -> (api) ApiExecutor.executeEndpoint('pizzaBuilder', <endpointId>, vars)  [Test Execution]
 *     -> (ui)  world.ui() : UiDriver.<action>(ref)                             [Test Execution]
 *                 -> locator adaptation -> telemetry
 *
 * Real pizzaBuilder endpoints: pizzaBuilder.listPizzas (name -> id resolution,
 * extracts `pizzas`/`currency`) and pizzaBuilder.addCustomizedToCart (extracts
 * `cartItems`/`updatedAt`). The confirm-add-to-cart scenario is the only @api
 * one; render/label/size/topping scenarios are UI/visual. Per-scenario builder
 * state (size, toppings, cart count) lives on world.state — no module-level
 * shared counters.
 *
 * @visual mapping (by scenario discriminator tag):
 *   @size    -> pizzaBuilder_size_selected      (selectSize assertion step)
 *   @toppings-> pizzaBuilder_toppings_selected  (addToppings assertion step)
 *   @confirm -> pizzaBuilder_confirm_state      (builder-closed assertion step)
 * The @ui-only render/label scenarios have no matching pizzaBuilder snapshot, so
 * no visual check is attached to those steps.
 */
import type { GtaaWorld } from '../support/world';
import { ApiExecutor } from '../../test-execution/api/api-executor';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { textContains } from '../support/text-match';
import { resolvePizzaId } from '../../test-adaptation/clients/catalog-lookup';
import { addCustomizedToCart } from '../../test-adaptation/clients/cart-add';
import { SessionUseCase } from './session.usecase';
import { runVisualCheck } from './visual-check';
import type { ApiExecutionResult } from '../../test-execution/api/api-executor';

/** Logical locator refs for the pizzaBuilder domain (see pizzaBuilder.locators.json). */
const REF = {
  builderScreen: 'pizzaBuilder.pizzaBuilderScreen',
  sizeOptionsList: 'pizzaBuilder.sizeOptionsList',
  toppingsList: 'pizzaBuilder.toppingsList',
  confirmButton: 'pizzaBuilder.confirmAddToCartButton',
  priceText: 'pizzaBuilder.customizerPriceText',
} as const;

/** Navbar cart-count badge is a cross-domain affordance the builder mutates. */
const NAV_CART_COUNT = 'navbar.navCartCount';

/** Poll budget for the post-confirm cart-count badge (updates asynchronously). */
const CART_COUNT_POLL_ATTEMPTS = 40;
const CART_COUNT_POLL_INTERVAL_MS = 300;

/**
 * Reads the cart-count badge straight from the DOM. On the responsive viewport
 * the navbar collapses the badge out of Playwright's "visible" check, but the
 * element is present with its textContent — querySelector finds it regardless.
 * Absent badge yields '' (treated as 0).
 */
const READ_CART_BADGE_JS = `(() => {
  const el = document.querySelector("[data-testid='nav-cart-count']");
  return el ? (el.textContent || '').replace(/\\D/g, '') : '';
})()`;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const DOMAIN = 'pizzaBuilder';

interface BuilderDraft {
  item?: string;
  market?: string;
  language?: string;
  size?: string;
  toppings: string[];
}

export class PizzaBuilderUseCase {
  private readonly api = new ApiExecutor();

  constructor(private readonly world: GtaaWorld) {}

  private draft(): BuilderDraft {
    if (!this.world.state.builderDraft) {
      this.world.state.builderDraft = { toppings: [] } as BuilderDraft;
    }
    return this.world.state.builderDraft as BuilderDraft;
  }

  /** "the pizza builder is open for {string} in market {string} using language {string}". */
  async openBuilder(item: string, market: string, language: string): Promise<void> {
    const d = this.draft();
    d.item = item;
    d.market = market;
    d.language = language;
    d.size = undefined;
    d.toppings = [];

    if (this.world.context.driver === 'api') {
      // Resolve the pizza via the catalog listing (name -> id) for this market.
      const result = await this.api.executeEndpoint('pizzaBuilder', 'pizzaBuilder.listPizzas', {
        market,
        language,
        authToken: String(this.world.state.token ?? ''),
      });
      this.assertApiPass(result, 'pizzaBuilder.listPizzas');
      return;
    }
    // The customizer is a MODAL opened from the catalog — there is no /builder
    // (or /customizer) URL route on web (confirmed against the AUT). Land on the
    // catalog for this market, then open a pizza card to surface the builder
    // modal. (Mobile reaches the builder the same way: via a catalog card.)
    await new SessionUseCase(this.world).ensureMarket(market);
    const ui = await this.world.ui();
    // Resolve the pizza's catalog id (p01…) to click its specific add button,
    // which opens the customizer modal (`pizzaBuilderScreen`).
    const id =
      (await resolvePizzaId(item, {
        token: String(this.world.state.token ?? ''),
        language,
        market,
      })) ?? item;
    await ui.navigate(`/catalog?market=${encodeURIComponent(market)}&lang=${encodeURIComponent(language)}`);
    await ui.waitForVisible('catalog.catalogScreen');
    await ui.click(`catalog.addToCartButton#id=${id}`);
    await ui.waitForVisible(REF.builderScreen);
  }

  /** "the size options and topping options are rendered". */
  async assertOptionsRendered(): Promise<void> {
    const ui = await this.world.ui();
    const sizes = await ui.isVisible(REF.sizeOptionsList);
    const toppings = await ui.isVisible(REF.toppingsList);
    if (!sizes || !toppings) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the size options and topping options to be rendered',
      );
    }
    // No pizzaBuilder snapshot matches the @ui-only render scenario's tags.
  }

  /** "the customizer price and confirm-add-to-cart affordance are visible". */
  async assertPriceAndConfirmVisible(): Promise<void> {
    const ui = await this.world.ui();
    const price = await ui.isVisible(REF.priceText);
    const confirm = await ui.isVisible(REF.confirmButton);
    if (!price || !confirm) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the customizer price and confirm-add-to-cart affordance to be visible',
      );
    }
  }

  /** "the section labels {string} and {string} are visible". */
  async assertSectionLabels(sizeSection: string, toppingsSection: string): Promise<void> {
    const ui = await this.world.ui();
    const sizeText = await ui.getText(REF.sizeOptionsList);
    const toppingsText = await ui.getText(REF.toppingsList);
    if (!textContains(sizeText, sizeSection) || !textContains(toppingsText, toppingsSection)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected section labels "${sizeSection}" and "${toppingsSection}" to be visible`,
      );
    }
  }

  /** "the estimated total label {string} is visible". */
  async assertTotalLabel(label: string): Promise<void> {
    const ui = await this.world.ui();
    const text = await ui.getText(REF.priceText);
    if (!textContains(text, label)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the estimated total label "${label}" to be visible`,
      );
    }
  }

  /** "they select size {string}". */
  async selectSize(size: string): Promise<void> {
    this.draft().size = size;
    if (this.world.context.driver === 'api') {
      return; // Size rides along on the add-to-cart call.
    }
    const ui = await this.world.ui();
    // Select the SCENARIO's size (testid is keyed by lower-case label), not just
    // the first size button.
    await ui.click(`pizzaBuilder.sizeByLabel#size=${size.toLowerCase()}`);
  }

  /** "the estimated total reflects the price of size {string}" (@size @visual). */
  async assertTotalReflectsSize(size: string): Promise<void> {
    const ui = await this.world.ui();
    const text = (await ui.getText(REF.priceText)).trim();
    if (text.length === 0) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the estimated total to reflect the price of size "${size}" but it was empty`,
      );
    }
    await runVisualCheck(this.world, DOMAIN, 'pizzaBuilder_size_selected');
  }

  /** "they add toppings {string}". */
  async addToppings(commaSeparated: string): Promise<void> {
    const toppings = commaSeparated
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    this.draft().toppings = toppings;
    if (this.world.context.driver === 'api') {
      return; // Toppings ride along on the add-to-cart call.
    }
    const ui = await this.world.ui();
    for (const _topping of toppings) {
      await ui.click(REF.toppingsList);
    }
  }

  /** "the estimated total reflects size {string} plus toppings {string}" (@toppings @visual). */
  async assertTotalReflectsToppings(size: string, toppings: string): Promise<void> {
    const ui = await this.world.ui();
    const text = (await ui.getText(REF.priceText)).trim();
    if (text.length === 0) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the estimated total to reflect size "${size}" plus toppings "${toppings}" but it was empty`,
      );
    }
    await runVisualCheck(this.world, DOMAIN, 'pizzaBuilder_toppings_selected');
  }

  /**
   * "the navbar cart count is {string}" — used BOTH as a precondition
   * (initialCount before confirm) AND a postcondition (expectedCount after
   * confirm). A single method handles both; the precondition is informational
   * (the upcoming confirm replaces the cart), the postcondition asserts the
   * absolute count.
   */
  async assertNavbarCartCount(count: string): Promise<void> {
    const expected = Number(count);

    if (this.world.context.driver === 'api') {
      if (this.world.state.builderConfirmed) {
        const actual = Number(this.world.state.cartCount ?? 0);
        if (actual !== expected) {
          throw new ClassifiedError(
            FailureBucket.ASSERTION_FAILURE,
            `expected the navbar cart count to be ${expected} but was ${actual}`,
          );
        }
      }
      return;
    }

    const ui = await this.world.ui();
    // The precondition read (before confirm) is informational — the upcoming
    // confirm replaces the cart, so it never gates.
    if (!this.world.state.builderConfirmed) {
      return;
    }
    // Postcondition: poll the badge from the DOM (it updates asynchronously after
    // the confirm click and, on responsive, is collapsed out of the "visible"
    // check). Absent badge == 0.
    let actual = 0;
    for (let attempt = 0; attempt < CART_COUNT_POLL_ATTEMPTS; attempt++) {
      const text = (await ui.evaluate(READ_CART_BADGE_JS)).trim();
      actual = text === '' ? 0 : Number(text);
      if (actual === expected) return;
      await delay(CART_COUNT_POLL_INTERVAL_MS);
    }
    throw new ClassifiedError(
      FailureBucket.ASSERTION_FAILURE,
      `expected the navbar cart count to be ${expected} but was ${actual}`,
    );
  }

  /** "they confirm add to cart". */
  async confirmAddToCart(): Promise<void> {
    const d = this.draft();
    if (this.world.context.driver === 'api') {
      // The deployed /api/cart keys lines by pizza id and stores `toppings` as a
      // string array; resolve the feature's display name -> id and post the real
      // customized line (the contract's `config.{size,toppings}` envelope is not
      // what the backend emits, so acceptance is checked here in CODE).
      const token = String(this.world.state.token ?? '');
      const market = String(d.market ?? '');
      const pizzaId =
        (await resolvePizzaId(String(d.item ?? ''), { token, market, language: d.language })) ??
        String(d.item ?? '');

      const result = await addCustomizedToCart({
        token,
        market,
        pizzaId,
        size: String(d.size ?? ''),
        toppings: d.toppings,
      });

      if (result.status < 200 || result.status >= 300 || !result.line?.pizza_id) {
        throw new ClassifiedError(
          FailureBucket.API_RESPONSE_FAILURE,
          `expected the customized pizza to be added to the cart but POST /api/cart ` +
            `returned status ${result.status}`,
        );
      }
      // POST /api/cart replaces the cart with the single posted line.
      this.world.state.cartCount = 1;
      this.world.state.builderConfirmed = true;
      return;
    }
    const ui = await this.world.ui();
    await ui.click(REF.confirmButton);
    this.world.state.cartCount = 1;
    this.world.state.builderConfirmed = true;
  }

  /** "the pizza builder is closed" (@confirm @visual). */
  async assertBuilderClosed(): Promise<void> {
    if (this.world.context.driver === 'api') {
      return; // No UI modal under the api path.
    }
    const ui = await this.world.ui();
    if (await ui.isVisible(REF.builderScreen)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the pizza builder to be closed after confirming add to cart',
      );
    }
    await runVisualCheck(this.world, DOMAIN, 'pizzaBuilder_confirm_state');
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
