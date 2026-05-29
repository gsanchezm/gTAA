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
import { ApiExecutor } from '../../test-execution/api/api-executor';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { runVisualCheck } from './visual-check';
import type { ApiExecutionResult } from '../../test-execution/api/api-executor';

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
  private readonly api = new ApiExecutor();

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
      // Variables map onto checkout.placeOrder's templates
      // (deliveryStreet/deliveryName/... + paymentMethod); see checkout.api.contract.json.
      const result = await this.api.executeEndpoint('checkout', 'checkout.placeOrder', {
        market: String(d.market ?? ''),
        item: String(d.item ?? ''),
        size: String(d.size ?? ''),
        qty: Number(d.qty ?? 1),
        deliveryName: String(d.name ?? ''),
        deliveryStreet: String(d.street ?? ''),
        deliveryZip: String(d.zip ?? ''),
        deliverySuburb: String(d.suburb ?? ''),
        deliveryPhone: String(d.phone ?? ''),
        paymentMethod: toApiPaymentMethod(d.paymentMethod),
      });
      this.assertApiPass(result, 'checkout.placeOrder');
      // checkout.placeOrder extracts `orderId` (see checkout.api.contract.json).
      this.world.state.orderId = result.extracted.orderId ?? '';
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

  private assertApiPass(result: ApiExecutionResult, endpointId: string): void {
    if (result.status !== 'PASS') {
      throw new ClassifiedError(
        result.failureBucket ?? FailureBucket.API_RESPONSE_FAILURE,
        result.errorMessage ?? `API endpoint "${endpointId}" did not pass`,
      );
    }
  }
}

/** Backend accepts only 'card' | 'cash'; features carry the UI label. */
function toApiPaymentMethod(uiLabel: string | undefined): string {
  return (uiLabel ?? '').toLowerCase().includes('cash') ? 'cash' : 'card';
}
