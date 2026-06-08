/**
 * Test Adaptation layer — order lookup.
 *
 * The order-success screen renders only for a real backend order id
 * (ORDER-…); a synthetic id 404s and the screen never mounts. Callers seed the
 * confirmation context with a genuine order id fetched from the user's order
 * history. Pure relative to the supplied bearer token; uses the shared
 * httpRequest (with transient retry).
 */
import { appConfig } from '../../configuration/environments/env';
import { httpRequest } from './http-client';

export interface OrderLookupOptions {
  /** Bearer token — /api/orders requires authentication. */
  token?: string;
  market?: string;
  language?: string;
}

/** Most-recent order id for the authenticated user, or undefined if none/unauth. */
export async function fetchLatestOrderId(options: OrderLookupOptions = {}): Promise<string | undefined> {
  if (!options.token) return undefined;

  const baseUrl = appConfig().apiBaseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${options.token}`,
  };
  if (options.language) headers['X-Language'] = options.language;
  if (options.market) headers['x-country-code'] = options.market;

  const res = await httpRequest({ method: 'GET', url: `${baseUrl}/api/orders`, headers });
  const orders = (res.json as { orders?: Array<{ order_id?: string }> } | null)?.orders;
  return Array.isArray(orders) && orders.length > 0 ? orders[0]?.order_id : undefined;
}
