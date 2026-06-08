/**
 * Test Definition support — web persisted-state seeding.
 *
 * Pre-seeds the two Zustand-persisted localStorage stores the OmniPizza web app
 * reads on boot — `omnipizza-auth` (token + username) and `omnipizza-country`
 * (countryCode + language + locale + currency) — plus the loose keys the app
 * reads imperatively (`token`, `username`, `countryCode`, CH `chLang`). This is
 * how a web-only flow that lands DIRECTLY on a screen (order-success deep link,
 * a localized navbar/catalog) gets past `ProtectedRoute` AND renders in the
 * requested market language, instead of falling back to US/English.
 *
 * Mirrors the reference's seedWebPersistedStores. The persist envelope shape
 * ({ state, version }) matches zustand/middleware's `persist`. Must run on the
 * app origin, so the caller navigates to the site root first, seeds, then
 * navigates to the target screen.
 */
import type { UiDriver } from '../../test-adaptation/drivers/ui-driver';

export interface WebSeedArgs {
  market: string;
  language: string;
  token: string;
}

export async function seedWebPersistedStores(ui: UiDriver, args: WebSeedArgs): Promise<void> {
  const market = args.market.toUpperCase();
  const auth = {
    state: { token: args.token, username: 'standard_user', behavior: null },
    version: 0,
  };
  const country = {
    state: {
      countryCode: market,
      language: args.language,
      locale: deriveLocale(market, args.language),
      currency: deriveCurrency(market),
      countryInfo: null,
    },
    version: 0,
  };

  const chLangLine =
    market === 'CH' ? `localStorage.setItem('chLang', ${JSON.stringify(args.language)});` : '';

  // Single IIFE expression so the CDP-backed evaluate runs the whole seed
  // atomically and returns a value.
  const script = `(() => {
    localStorage.setItem('token', ${JSON.stringify(args.token)});
    localStorage.setItem('username', 'standard_user');
    localStorage.setItem('countryCode', ${JSON.stringify(market)});
    ${chLangLine}
    localStorage.setItem('omnipizza-auth', ${JSON.stringify(JSON.stringify(auth))});
    localStorage.setItem('omnipizza-country', ${JSON.stringify(JSON.stringify(country))});
    return 'seeded';
  })()`;

  await ui.evaluate(script);
}

function deriveLocale(market: string, language: string): string {
  if (market === 'CH') return language === 'fr' ? 'fr-CH' : 'de-CH';
  if (market === 'US') return 'en-US';
  if (market === 'MX') return 'es-MX';
  if (market === 'JP') return 'ja-JP';
  return 'en-US';
}

function deriveCurrency(market: string): string {
  switch (market) {
    case 'US':
      return 'USD';
    case 'MX':
      return 'MXN';
    case 'CH':
      return 'CHF';
    case 'JP':
      return 'JPY';
    default:
      return 'USD';
  }
}
