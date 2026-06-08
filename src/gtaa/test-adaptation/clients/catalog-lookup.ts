/**
 * Test Adaptation layer — catalog name -> id lookup.
 *
 * The OmniPizza frontend/back end key pizzas by id (`p01`…), while features
 * reference them by display name (`Margherita`). The builder deep link and the
 * add-to-cart payload both need the id, so callers resolve the name against the
 * live catalog listing first (mirrors the reference flow). Pure relative to the
 * supplied bearer token; uses the shared httpRequest (with transient retry).
 */
import { appConfig } from '../../configuration/environments/env';
import { httpRequest } from './http-client';

export interface PizzaLookupOptions {
  /** Bearer token — /api/pizzas requires authentication. */
  token?: string;
  /** Unused for matching — see note below; kept for caller ergonomics. */
  language?: string;
  market?: string;
}

// Pizza display names are LOCALIZED per market (p01 = "Margherita"/"Margarita"/
// "マルゲリータ") while the id (p01…) is stable across markets. Feature files
// reference the canonical English name, so the name -> id match always runs
// against the en/us listing; the resolved id is then valid on any market's
// catalog. (Verified against the live backend.)
const CANONICAL_LANGUAGE = 'en';
const CANONICAL_MARKET = 'us';

interface PizzaRecord {
  id?: string;
  name?: string;
}

/**
 * Resolve a pizza display name to its catalog id (case/space-insensitive), or
 * undefined when unauthenticated, the listing is unavailable, or no name match.
 */
export async function resolvePizzaId(
  name: string,
  options: PizzaLookupOptions = {},
): Promise<string | undefined> {
  if (!options.token) return undefined;

  const baseUrl = appConfig().apiBaseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${options.token}`,
    // Match against the canonical (English) catalog — names are localized but
    // ids are stable, and feature files use the English name.
    'X-Language': CANONICAL_LANGUAGE,
    'x-country-code': CANONICAL_MARKET,
  };

  const res = await httpRequest({ method: 'GET', url: `${baseUrl}/api/pizzas`, headers });
  const body = res.json as { pizzas?: PizzaRecord[] } | null;
  const pizzas = body?.pizzas;
  if (!Array.isArray(pizzas)) return undefined;

  const target = name.trim().toLowerCase();
  const match = pizzas.find((p) => String(p.name ?? '').trim().toLowerCase() === target);
  return match?.id;
}
