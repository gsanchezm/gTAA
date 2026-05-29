// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
/**
 * Checkout Load Simulation (gTAA baseline).
 *
 * Drives the checkout API chain under load using a pre-generated feeder
 * (see generate-feeder.ts). The HTTP target is API_BASE_URL, which the
 * orchestrator stamps from appConfig().apiBaseUrl.
 *
 * API flow (login -> get pizzas by market -> checkout with items/delivery/payment):
 *   US  -> zip_code
 *   MX  -> zip_code + colonia  (suburb column)
 *   CH  -> plz
 *   JP  -> zip_code + prefectura  (suburb column)
 *
 * Profiles (PERF_PROFILE): smoke | load | stress. See injection-profile.ts.
 * Direct performance simulation — no indirection layer.
 */
import {
  simulation,
  scenario,
  arrayFeeder,
  StringBody,
  bodyString,
  jsonPath,
  getEnvironmentVariable,
  Session,
} from '@gatling.io/core';
import { http } from '@gatling.io/http';

import { checkoutRows } from './checkout-rows.generated';
import { injectionProfile, requireApiBaseUrl } from './injection-profile';

const checkoutFeeder = arrayFeeder(checkoutRows).circular();

export default simulation((setUp) => {
  const apiBaseUrl = requireApiBaseUrl();

  const httpProtocol = http
    .baseUrl(apiBaseUrl)
    .header('Content-Type', 'application/json')
    .header('X-Language', getEnvironmentVariable('LANGUAGE', 'en'));

  const checkout = scenario('Checkout API Flow')
    .feed(checkoutFeeder)

    // Step 1: Login.
    .exec(
      http('Login')
        .post('/api/auth/login')
        .body(StringBody('{"username":"standard_user","password":"pizza123"}'))
        .check(jsonPath('$.access_token').saveAs('token')),
    )

    // Step 2: Get pizzas for the feeder market.
    .exec(
      http('Get Pizzas')
        .get('/api/pizzas')
        .header('Authorization', (session: Session) => `Bearer ${session.get<string>('token')}`)
        .header('x-country-code', (session: Session) => session.get<string>('market'))
        .check(bodyString().saveAs('pizzasBody')),
    )

    // Extract the pizza id matching the feeder item.
    .exec((session: Session) => {
      const body = JSON.parse(session.get<string>('pizzasBody'));
      const item = session.get<string>('item');
      const pizza = (body.pizzas as Array<{ id: string; name: string }>).find(
        (p) => p.name.toLowerCase() === item.toLowerCase(),
      );

      if (!pizza) {
        console.error(`[checkout-load] Pizza "${item}" not found for market "${session.get('market')}"`);
        return session.markAsFailed();
      }
      return session.set('pizzaId', pizza.id);
    })

    // Build the market-specific checkout payload.
    .exec((session: Session) => {
      const market = session.get<string>('market');
      const zip = session.get<string>('zip');
      const suburb = session.get<string>('suburb');
      const payment = session.get<string>('payment');
      // Backend uses a card|cash literal; feeder carries the UI label, so
      // translate at the API boundary.
      const paymentMethod = payment && payment.toLowerCase().includes('cash') ? 'cash' : 'card';

      const payload: Record<string, unknown> = {
        country_code: market,
        items: [
          {
            pizza_id: session.get<string>('pizzaId'),
            size: session.get<string>('size'),
            quantity: session.get<number>('qty'),
          },
        ],
        name: session.get<string>('name'),
        address: session.get<string>('street'),
        phone: session.get<string>('phone'),
        payment_method: paymentMethod,
      };

      if (market === 'CH') {
        payload['plz'] = zip;
      } else {
        payload['zip_code'] = zip;
      }
      if (market === 'MX' && suburb) {
        payload['colonia'] = suburb;
      }
      if (market === 'JP' && suburb) {
        payload['prefectura'] = suburb;
      }

      if (paymentMethod === 'card') {
        payload['card_number'] = session.get<string>('card');
        payload['card_expiry'] = session.get<string>('exp');
        payload['card_cvv'] = session.get<string>('cvv');
      }

      return session.set('checkoutBody', JSON.stringify(payload));
    })

    // Step 3: Checkout — validate response shape for internal consistency.
    .exec(
      http('Checkout')
        .post('/api/checkout')
        .header('x-country-code', (session: Session) => session.get<string>('market'))
        .header('Authorization', (session: Session) => `Bearer ${session.get<string>('token')}`)
        .body(StringBody((session: Session) => session.get<string>('checkoutBody')))
        .check(jsonPath('$.order_id').exists())
        .check(jsonPath('$.subtotal').exists())
        .check(jsonPath('$.delivery_fee').exists())
        .check(jsonPath('$.tax').exists())
        .check(jsonPath('$.total').exists()),
    );

  setUp(checkout.injectOpen(injectionProfile())).protocols(httpProtocol);
});
