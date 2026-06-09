/**
 * Test Definition layer — Checkout use case (place-delivery-order.feature).
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> checkout step -> THIS use case
 *     -> (api) ApiExecutor.executeEndpoint('checkout', <endpointId>, vars)  [Test Execution]
 *     -> (ui)  world.ui() : UiDriver.<action>(ref)                          [Test Execution]
 *                 -> locator adaptation -> telemetry
 *
 * Per-scenario order state is accumulated on world.state (atomic; never shared
 * across scenarios). The login Background is handled by the shared SessionUseCase.
 */
import type { GtaaWorld } from '../support/world';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { runVisualCheck } from './visual-check';
import { placeOrder } from '../../test-adaptation/clients/checkout-order';
import { resolvePizzaId } from '../../test-adaptation/clients/catalog-lookup';
import { addCustomizedToCart } from '../../test-adaptation/clients/cart-add';
import { seedWebPersistedStores, isWebPlatform } from '../support/web-session-seed';

/** Logical locator refs for the checkout domain (see checkout.locators.json). */
const REF = {
  checkoutHeader: 'checkout.checkoutHeader',
  streetInput: 'checkout.streetInput',
  zipCodeInput: 'checkout.zipCodeInput',
  coloniaInput: 'checkout.coloniaInput',
  fullNameInput: 'checkout.fullNameInput',
  phoneNumberInput: 'checkout.phoneNumberInput',
  paymentCardButton: 'checkout.paymentCardButton',
  paymentCashButton: 'checkout.paymentCashButton',
  cardHolderNameInput: 'checkout.cardHolderNameInput',
  cardNumberInput: 'checkout.cardNumberInput',
  expiryDateInput: 'checkout.expiryDateInput',
  cvvInput: 'checkout.cvvInput',
  placeOrderButton: 'checkout.placeOrderButton',
  // The web place-order flow lands on the order-success screen, whose locator
  // lives in the order_success domain contract (cross-domain ref).
  orderSuccessScreen: 'order_success.orderSuccessScreen',
} as const;


const DOMAIN = 'checkout';

/**
 * Wait budget for the order-success screen after submitting an order. The free-
 * tier backend can cold-start on the first order of a run, so this is well above
 * the default explicit-wait timeout to avoid an intermittent "never became
 * visible" flake on a slow round-trip.
 */
const ORDER_ACCEPT_TIMEOUT_MS = 60_000;

interface OrderDraft {
  market?: string;
  item?: string;
  size?: string;
  qty?: number;
  street?: string;
  zip?: string;
  suburb?: string;
  name?: string;
  phone?: string;
  paymentMethod?: string;
  card?: string;
  exp?: string;
  cvv?: string;
}

export class CheckoutUseCase {
  constructor(private readonly world: GtaaWorld) {}

  private draft(): OrderDraft {
    if (!this.world.state.orderDraft) {
      this.world.state.orderDraft = {} as OrderDraft;
    }
    return this.world.state.orderDraft as OrderDraft;
  }

  /** "they are ordering in market {string}". */
  async setMarket(market: string): Promise<void> {
    this.draft().market = market;
    // Record only — web and native mobile alike. Opening checkout here would hit
    // an EMPTY cart (it bounces to the catalog / shows the empty-cart state). The
    // cart is populated in addToOrder; the screen is opened in provideDelivery
    // (web seeds + navigates, mobile deep-links with hydrateCart) — mirroring the
    // order the place-delivery-order feature drives the steps.
  }

  /**
   * "they have an order with {string} size {string} quantity {int}".
   *
   * The checkout contract exposes only checkout.placeOrder; there is no
   * cart/pizza-resolution endpoint here, so this step just records the order
   * line on world.state (atomic). The place-order call in assertOrderAccepted
   * carries these values. On the UI path the place-delivery-order feature starts
   * on the checkout form with the order already in context — nothing to click.
   */
  async addToOrder(item: string, size: string, qty: number): Promise<void> {
    const d = this.draft();
    d.item = item;
    d.size = size;
    d.qty = qty;
    if (this.world.context.driver === 'api') {
      return; // The api path submits the order line directly in assertOrderAccepted.
    }
    // Web AND native mobile: populate the cart via the API so checkout has a line
    // to order (faster and less flaky than UI cart manipulation; mirrors the
    // reference). The mobile checkout deep link re-fetches this same cart via
    // hydrateCart=true. Resolve the display name to the catalog id the cart
    // endpoint keys by.
    const token = String(this.world.state.token ?? '');
    const market = String(d.market ?? '');
    const pizzaId = (await resolvePizzaId(item, { token, market })) ?? item;
    await addCustomizedToCart({ token, market, pizzaId, size, toppings: [] });
  }

  /** "they provide delivery details {street} {zip}, {suburb} for {name} {phone}". */
  async provideDelivery(
    street: string,
    zip: string,
    suburb: string,
    name: string,
    phone: string,
  ): Promise<void> {
    const d = this.draft();
    d.street = street;
    d.zip = zip;
    d.suburb = suburb || undefined;
    d.name = name;
    d.phone = phone;

    if (this.world.context.driver === 'api') {
      return; // Address fields ride along on the place-order body.
    }
    const ui = await this.world.ui();

    if (!isWebPlatform(this.world)) {
      // Native mobile: open checkout via a deep link so the screen hydrates the
      // (API-populated) cart and renders the form — a bottom-nav tap would land on
      // the empty-cart branch. Then fill the fields, market-aware like web.
      const mmarket = String(d.market ?? '').toUpperCase();
      await ui.navigate(`/checkout?market=${encodeURIComponent(mmarket)}&hydrateCart=true`);
      await ui.waitForVisible(REF.checkoutHeader);
      await ui.type(REF.streetInput, street);
      const zipSlot = mmarket === 'JP' ? suburb || zip : zip;
      if (zipSlot) {
        await ui.type(REF.zipCodeInput, zipSlot);
      }
      if (mmarket === 'MX' && suburb) {
        await ui.type(REF.coloniaInput, suburb);
      }
      await ui.type(REF.fullNameInput, name);
      await ui.type(REF.phoneNumberInput, phone);
      return;
    }

    const market = String(d.market ?? '').toUpperCase();
    // Seed auth + market so /checkout hydrates the (just-populated) cart and
    // renders the market's address form. Keep the UI language English so the
    // byte-identical checkoutHeader (h1:has-text("Checkout")) still resolves —
    // the place-order flow has no localized assertions, only the country form.
    await seedWebPersistedStores(ui, {
      market,
      language: 'en',
      token: String(this.world.state.token ?? ''),
    });
    await ui.navigate('/checkout');
    await ui.waitForVisible(REF.checkoutHeader);
    await ui.type(REF.streetInput, street);
    // Each market renders ONE postal-style slot (the `zip-code` testid): US
    // zip_code / CH plz come from the zip column; JP prefectura comes from the
    // suburb column (the form has no separate prefectura input).
    const zipSlot = market === 'JP' ? suburb || zip : zip;
    if (zipSlot) {
      await ui.type(REF.zipCodeInput, zipSlot);
    }
    // MX additionally renders a colonia field.
    if (market === 'MX' && suburb) {
      await ui.type(REF.coloniaInput, suburb);
    }
    await ui.type(REF.fullNameInput, name);
    await ui.type(REF.phoneNumberInput, phone);
  }

  /** "they choose payment method {string}". */
  async choosePayment(method: string): Promise<void> {
    this.draft().paymentMethod = method;
    if (this.world.context.driver === 'api') {
      return;
    }
    const ui = await this.world.ui();
    const ref = method.toLowerCase().includes('cash') ? REF.paymentCashButton : REF.paymentCardButton;
    await ui.click(ref);
  }

  /** "they enter card details {string} expiration {string} cvv {string}". */
  async enterCard(card: string, exp: string, cvv: string): Promise<void> {
    const d = this.draft();
    d.card = card;
    d.exp = exp;
    d.cvv = cvv;
    if (this.world.context.driver === 'api') {
      return; // Card details are not part of the place-order assertion contract.
    }
    const ui = await this.world.ui();
    // The card form requires the cardholder name on both web and native mobile;
    // fill it from the delivery name (mirrors the reference) before the card
    // fields, otherwise place-order validation blocks and the success screen
    // never renders.
    if (d.name) {
      await ui.type(REF.cardHolderNameInput, d.name);
    }
    await ui.type(REF.cardNumberInput, card);
    await ui.type(REF.expiryDateInput, exp);
    await ui.type(REF.cvvInput, cvv);
  }

  /** "the order is accepted" — places the order and asserts acceptance. */
  async assertOrderAccepted(): Promise<void> {
    const d = this.draft();

    if (this.world.context.driver === 'api') {
      // The deployed backend serves the order on the flat `/api/checkout` route
      // (the contract's templated path 404s) and keys cart lines by pizza id, so
      // resolve the feature's display name -> id and post the real order body.
      const token = String(this.world.state.token ?? '');
      const market = String(d.market ?? '');
      const pizzaId =
        (await resolvePizzaId(String(d.item ?? ''), { token, market })) ?? String(d.item ?? '');

      const result = await placeOrder({
        token,
        market,
        items: [{ pizzaId, size: String(d.size ?? ''), quantity: Number(d.qty ?? 1) }],
        name: String(d.name ?? ''),
        address: String(d.street ?? ''),
        phone: String(d.phone ?? ''),
        paymentMethod: toApiPaymentMethod(d.paymentMethod),
        zip: String(d.zip ?? ''),
        suburb: d.suburb,
      });

      if (result.status < 200 || result.status >= 300 || !result.orderId) {
        throw new ClassifiedError(
          FailureBucket.API_RESPONSE_FAILURE,
          `expected the order to be accepted but checkout returned status ${result.status} ` +
            `(orderId=${result.orderId ?? 'none'})`,
        );
      }
      this.world.state.orderId = result.orderId;
      return;
    }

    const ui = await this.world.ui();
    await ui.click(REF.placeOrderButton);
    // Placing the order round-trips to the (free-tier, cold-starting) backend
    // before the success screen renders, which can exceed the default explicit
    // wait. Give this specific step a generous budget so a cold backend doesn't
    // flake "order_success.orderSuccessScreen never became visible".
    await ui.waitForVisible(REF.orderSuccessScreen, ORDER_ACCEPT_TIMEOUT_MS);
    const accepted = await ui.isVisible(REF.orderSuccessScreen);
    if (!accepted) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        'expected the order to be accepted (success screen) but it was not shown',
      );
    }
    // @visual scenario: compare the order summary against the baseline.
    await runVisualCheck(this.world, DOMAIN, 'checkout_order_summary');
  }
}

/** Backend accepts only 'card' | 'cash'; features carry the UI label. */
function toApiPaymentMethod(uiLabel: string | undefined): string {
  return (uiLabel ?? '').toLowerCase().includes('cash') ? 'cash' : 'card';
}
