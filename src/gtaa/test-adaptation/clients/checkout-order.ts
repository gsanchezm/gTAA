/**
 * Test Adaptation layer — checkout order client.
 *
 * Places an order against the AUT's real checkout route (`POST /api/checkout`)
 * and returns the created order id. The declarative checkout contract documents
 * an aspirational templated path (`/api/{{market}}/{{language}}/checkout/place-order`)
 * that the deployed backend does not serve (404), and an `$.status == "ACCEPTED"`
 * field the backend never emits — so the live endpoint + acceptance check live in
 * CODE, keeping the checkout contract asset byte-identical to the reference while
 * the layered flow still drives the real route. Uses the shared httpRequest
 * (with its transient-transport retry).
 */
import { appConfig } from '../../configuration/environments/env';
import { httpRequest } from './http-client';

const CHECKOUT_PATH = '/api/checkout';

export interface CheckoutLineItem {
  pizzaId: string;
  size: string;
  quantity: number;
}

export interface PlaceOrderParams {
  token: string;
  /** Market / country code (e.g. US, MX, CH, JP). */
  market: string;
  items: CheckoutLineItem[];
  name: string;
  address: string;
  phone: string;
  /** Backend accepts only 'card' | 'cash'. */
  paymentMethod: string;
  zip?: string;
  /** Optional locality field (e.g. MX "colonia"); sent only when provided. */
  suburb?: string;
}

export interface PlaceOrderResult {
  status: number;
  orderId: string | undefined;
  total: number | undefined;
}

/** Submit the order and return the created order id (when accepted). */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const baseUrl = appConfig().apiBaseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${params.token}`,
    'x-country-code': params.market,
  };

  const body: Record<string, unknown> = {
    country_code: params.market,
    items: params.items.map((item) => ({
      pizza_id: item.pizzaId,
      size: item.size,
      quantity: item.quantity,
    })),
    name: params.name,
    address: params.address,
    phone: params.phone,
    payment_method: params.paymentMethod,
  };
  // Each market mandates a different address field (per /api/countries
  // required_fields): a postal code — US `zip_code`, CH `plz` (filled from the
  // feature's zip column) — and a locality — MX `colonia`, JP `prefectura`
  // (filled from the feature's suburb column). Unrequired extras are ignored by
  // the backend, but we map precisely to keep the request faithful.
  const market = params.market.toUpperCase();
  if (params.zip) {
    if (market === 'CH') body.plz = params.zip;
    else body.zip_code = params.zip;
  }
  if (params.suburb) {
    if (market === 'JP') body.prefectura = params.suburb;
    else body.colonia = params.suburb;
  }

  const res = await httpRequest({
    method: 'POST',
    url: baseUrl + CHECKOUT_PATH,
    headers,
    body: JSON.stringify(body),
    timeoutMs: 60_000,
  });

  const json = res.json as { order_id?: string; total?: number } | null;
  return { status: res.status, orderId: json?.order_id, total: json?.total };
}
