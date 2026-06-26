/**
 * Test Definition layer — Order Success use case (order-success.feature).
 *
 * Call path (direct calls between layers; no indirection layer):
 *   feature -> order_success step -> THIS use case
 *     -> (api) ApiExecutor.executeEndpoint('order_success', 'order_success.getOrder', vars)  [Test Execution]
 *     -> (ui)  world.ui() : UiDriver.<action>(ref)                                           [Test Execution]
 *                 -> locator adaptation -> telemetry
 *
 * Real endpoint: order_success.getOrder (GET /api/orders/{{orderId}}, extracts
 * orderId/subtotal/tax/total/currency). The login Background is handled by the
 * shared SessionUseCase. The feature is @ui-only @visual; the api path is
 * supported for coverage parity via order_success.getOrder.
 */
import type { GtaaWorld } from '../support/world';
import { ApiExecutor } from '../../test-execution/api/api-executor';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import { textContains } from '../support/text-match';
import { fetchLatestOrderId } from '../../test-adaptation/clients/order-lookup';
import { seedWebPersistedStores, isWebPlatform } from '../support/web-session-seed';
import { runVisualCheck } from './visual-check';
import type { ApiExecutionResult } from '../../test-execution/api/api-executor';

/** Logical locator refs for the order_success domain (see order_success.locators.json). */
const REF = {
  screen: 'order_success.orderSuccessScreen',
  statusTitle: 'order_success.statusTitleText',
  successTitle: 'order_success.orderSuccessTitle',
  orderDetailsLabel: 'order_success.orderDetailsLabel',
  liveTracking: 'order_success.liveTrackingText',
  courierInfo: 'order_success.courierInfoContainer',
  viewOrderDetailsButton: 'order_success.viewOrderDetailsButton',
} as const;

const DOMAIN = 'order_success';

/**
 * Wait budget for the order-success screen to render after landing on it. Like
 * the checkout place-order path, the free-tier backend can cold-start while the
 * page's getOrder fetch resolves, so give the container a generous budget instead
 * of the default explicit-wait. 90s mirrors the TOM reference's
 * order-success-screen.molecule.ts (`orderSuccessScreen||90000`,
 * SUCCESS_SCREEN_WAIT_MS); the BeforeAll warm-up removes most of that cost first.
 */
const ORDER_SUCCESS_SCREEN_WAIT_MS = 90_000;

/**
 * Deterministic synthetic order id used to seed the confirmation context. There
 * is no live backend in this baseline; the value flows into the {{orderId}}
 * path template so the wiring is exercised. Held on world.state for isolation.
 */
const SEED_ORDER_ID = 'seed-order';

export class OrderSuccessUseCase {
  private readonly api = new ApiExecutor();

  constructor(private readonly world: GtaaWorld) {}

  /** "a placed order exists in market {string} using language {string}". */
  async createPlacedOrder(market: string, language: string): Promise<void> {
    this.world.state.market = market;
    this.world.state.language = language;

    // The order-success screen mounts only for a real backend order id; use the
    // user's latest order (falls back to the synthetic id only if unavailable).
    // NOTE: the success-screen status TITLE is derived from the placed order's
    // stored locale, not the seeded localStorage — fetchLatestOrderId returns the
    // market's own properly-localized order, so MX/CH/JP titles localize. (A
    // freshly-placed order via the checkout client carries no locale and renders
    // English, which is why the TOM-style fresh-order placement was reverted.)
    this.world.state.orderId =
      (await fetchLatestOrderId({
        token: String(this.world.state.token ?? ''),
        market,
        language,
      })) ?? SEED_ORDER_ID;
    // No navigation here — the next step opens the success screen.
  }

  /** "they open the order success screen". */
  async openSuccessScreen(): Promise<void> {
    if (this.world.context.driver === 'api') {
      const result = await this.api.executeEndpoint('order_success', 'order_success.getOrder', {
        orderId: this.orderId(),
        market: String(this.world.state.market ?? ''),
        language: String(this.world.state.language ?? ''),
        authToken: String(this.world.state.token ?? ''),
      });
      this.assertApiPass(result, 'order_success.getOrder');
      this.world.state.orderApiResult = result;
      return;
    }
    const ui = await this.world.ui();
    // WEB ONLY: the success screen mounts directly (no UI journey), so the app
    // reads its market/language and auth from persisted localStorage. Prime the
    // origin, seed the Zustand stores (so the page renders in the scenario's
    // language instead of US/English), then land on the success screen. Native
    // mobile reaches order-success via a deep link carrying the params.
    if (isWebPlatform(this.world)) {
      await ui.navigate('/');
      await seedWebPersistedStores(ui, {
        market: String(this.world.state.market ?? 'US'),
        language: String(this.world.state.language ?? 'en'),
        token: String(this.world.state.token ?? ''),
      });
      await ui.navigate(`/order-success?orderId=${encodeURIComponent(this.orderId())}`);
    } else {
      // Native mobile has no UI journey to order-success and no bottom-nav tab for
      // it; the appium navigate() turns this no-tab route into a deep link
      // (omnipizza://order-success?…) so the AUT fetches the order (orderId), sets
      // the market, and localizes (lang) — the params the web path seeds instead.
      await ui.navigate(
        `/order-success?orderId=${encodeURIComponent(this.orderId())}` +
          `&market=${encodeURIComponent(String(this.world.state.market ?? 'US'))}` +
          `&lang=${encodeURIComponent(String(this.world.state.language ?? 'en'))}`,
      );
    }
    await ui.waitForVisible(REF.screen, ORDER_SUCCESS_SCREEN_WAIT_MS);
  }

  /** "the order success screen is fully displayed with status {string}". */
  async assertScreenWithStatus(expectedStatus: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      // Order existence/shape is asserted by the order_success.getOrder contract.
      const result = this.world.state.orderApiResult as ApiExecutionResult | undefined;
      if (!result || result.status !== 'PASS') {
        throw new ClassifiedError(
          result?.failureBucket ?? FailureBucket.API_RESPONSE_FAILURE,
          result?.errorMessage ??
            `expected the order success status "${expectedStatus}" from the order endpoint`,
        );
      }
      return;
    }
    const ui = await this.world.ui();
    // The delivery status renders in the (mobile-only) statusTitle on native, but
    // in the order-success title on web — pick the platform-resolvable ref.
    const isWeb =
      this.world.context.platform === 'desktop' || this.world.context.platform === 'responsive';
    const statusRef = isWeb ? REF.successTitle : REF.statusTitle;
    const displayed = await ui.isVisible(REF.screen);
    const title = (await ui.getText(statusRef)).trim();
    if (!displayed || !textContains(title, expectedStatus)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the order success screen with status "${expectedStatus}" but got "${title}"`,
      );
    }
  }

  /** "the tracking information, courier details, and order details {string} are visible". */
  async assertTrackingAndDetails(expectedOrderDetails: string): Promise<void> {
    if (this.world.context.driver === 'api') {
      return; // Tracking/courier are UI affordances; the api path stops at status.
    }
    const ui = await this.world.ui();
    // Mirror TOM's order-success-screen.molecule.ts: WAIT for each affordance
    // (the wait IS the presence assertion, at 8s) then read the order-details
    // label for the localized content check.
    await ui.waitForVisible(REF.liveTracking, 8_000);
    await ui.waitForVisible(REF.courierInfo, 8_000);
    await ui.waitForVisible(REF.viewOrderDetailsButton, 8_000);
    const detailsText = await ui.getText(REF.orderDetailsLabel);
    if (!textContains(detailsText, expectedOrderDetails)) {
      throw new ClassifiedError(
        FailureBucket.ASSERTION_FAILURE,
        `expected the order details "${expectedOrderDetails}" to be visible`,
      );
    }
    // @visual scenario: compare the confirmation screen against the baseline.
    await runVisualCheck(this.world, DOMAIN, 'order_success_screen_landed');
  }

  private orderId(): string {
    return String(this.world.state.orderId ?? SEED_ORDER_ID);
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
