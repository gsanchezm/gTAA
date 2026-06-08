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

/** Logical locator refs for the checkout domain (see checkout.locators.json). */
const REF = {
  checkoutHeader: 'checkout.checkoutHeader',
  streetInput: 'checkout.streetInput',
  zipCodeInput: 'checkout.zipCodeInput',
  fullNameInput: 'checkout.fullNameInput',
  phoneNumberInput: 'checkout.phoneNumberInput',
  paymentCardButton: 'checkout.paymentCardButton',
  paymentCashButton: 'checkout.paymentCashButton',
  cardNumberInput: 'checkout.cardNumberInput',
  expiryDateInput: 'checkout.expiryDateInput',
  cvvInput: 'checkout.cvvInput',
  placeOrderButton: 'checkout.placeOrderButton',
  // The web place-order flow lands on the order-success screen, whose locator
  // lives in the order_success domain contract (cross-domain ref).
  orderSuccessScreen: 'order_success.orderSuccessScreen',
} as const;

const DOMAIN = 'checkout';

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
    if (this.world.context.driver === 'api') {
      return; // Market is sent on the place-order call.
    }
    const ui = await this.world.ui();
    await ui.navigate(`/checkout?market=${encodeURIComponent(market)}`);
    await ui.waitForVisible(REF.checkoutHeader);
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
    await ui.type(REF.streetInput, street);
    if (zip) {
      await ui.type(REF.zipCodeInput, zip);
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
    await ui.waitForVisible(REF.orderSuccessScreen);
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
