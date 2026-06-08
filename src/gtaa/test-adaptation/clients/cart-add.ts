/**
 * Test Adaptation layer — customized cart client.
 *
 * Adds a builder-customized pizza line to the cart via the real `POST /api/cart`
 * route, sending `toppings` as a string ARRAY (the live backend stores them on
 * the cart line) and the resolved pizza id. The declarative pizzaBuilder contract
 * asserts a `cart_items[0].config.{size,toppings}` envelope that the deployed
 * backend does not emit — it returns a flat `{pizza_id,size,toppings}` line — so
 * the real request shape + acceptance check live in CODE, keeping the contract
 * asset byte-identical to the reference. Uses the shared httpRequest (with its
 * transient-transport retry).
 */
import { appConfig } from '../../configuration/environments/env';
import { httpRequest } from './http-client';

const CART_PATH = '/api/cart';

export interface AddToCartParams {
  token: string;
  /** Market / country code (e.g. US, MX, CH, JP). */
  market: string;
  pizzaId: string;
  size: string;
  toppings: string[];
  quantity?: number;
}

export interface CartLine {
  pizza_id?: string;
  size?: string;
  toppings?: string[];
  quantity?: number;
}

export interface AddToCartResult {
  status: number;
  line: CartLine | undefined;
}

/** POST the customized line and return the first cart line (when accepted). */
export async function addCustomizedToCart(params: AddToCartParams): Promise<AddToCartResult> {
  const baseUrl = appConfig().apiBaseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${params.token}`,
    'x-country-code': params.market,
  };

  const body = JSON.stringify({
    items: [
      {
        pizza_id: params.pizzaId,
        size: params.size,
        quantity: params.quantity ?? 1,
        toppings: params.toppings,
      },
    ],
  });

  const res = await httpRequest({
    method: 'POST',
    url: baseUrl + CART_PATH,
    headers,
    body,
    timeoutMs: 60_000,
  });

  const json = res.json as { cart_items?: CartLine[] } | null;
  return { status: res.status, line: json?.cart_items?.[0] };
}
