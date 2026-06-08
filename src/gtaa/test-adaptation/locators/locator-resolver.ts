/**
 * Test Adaptation layer: resolves declarative locator contracts into concrete
 * platform/viewport-specific selectors. Selectors live in JSON contracts
 * (test-generation/contracts/locators/<domain>.locators.json) — never hardcoded
 * in executors or use cases.
 *
 * Logical reference format: "<domain>.<key>"  e.g. "login.usernameInput".
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ClassifiedError, FailureBucket } from '../../shared/failure-buckets';
import type { Platform } from '../../shared/types';

const CONTRACTS_ROOT = resolve(
  __dirname,
  '..',
  '..',
  'test-generation',
  'contracts',
  'locators',
);

type WebSelector = string | { desktop?: string; responsive?: string };
type MobileSelector = string | { android?: string; ios?: string };
interface LocatorEntry {
  web?: WebSelector;
  mobile?: MobileSelector;
}
type LocatorContract = Record<string, LocatorEntry | string>;

const cache = new Map<string, LocatorContract>();

function loadContract(domain: string): LocatorContract {
  const cached = cache.get(domain);
  if (cached) return cached;
  const file = join(CONTRACTS_ROOT, `${domain}.locators.json`);
  if (!existsSync(file)) {
    throw new ClassifiedError(
      FailureBucket.LOCATOR_RESOLUTION_FAILURE,
      `Locator contract not found for domain "${domain}" (${file})`,
    );
  }
  const contract = JSON.parse(readFileSync(file, 'utf8')) as LocatorContract;
  cache.set(domain, contract);
  return contract;
}

export interface ResolvedLocator {
  /** Concrete selector string for the active platform/viewport. */
  selector: string;
  /** Selector family, used by executors to choose a WebDriver/Playwright strategy. */
  strategy: 'web' | 'mobile';
  ref: string;
}

function splitRef(ref: string): { domain: string; key: string } {
  const idx = ref.indexOf('.');
  if (idx <= 0) {
    throw new ClassifiedError(
      FailureBucket.LOCATOR_RESOLUTION_FAILURE,
      `Invalid locator ref "${ref}" — expected "<domain>.<key>"`,
    );
  }
  return { domain: ref.slice(0, idx), key: ref.slice(idx + 1) };
}

/**
 * Parameterized refs carry `{placeholder}` values after a `#`, e.g.
 * "catalog.addToCartButton#id=p01" -> substitutes {id} in the resolved
 * selector. This is how the templated locator keys (pizzaCard, addToCartButton,
 * categoryById, …) become concrete, mirroring the reference's per-item refs
 * without leaking selectors into the use cases.
 */
function parseParams(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

function applyParams(selector: string, params: Record<string, string>): string {
  return selector.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? params[name] : match,
  );
}

export function resolveLocator(ref: string, platform: Platform): ResolvedLocator {
  const hashIdx = ref.indexOf('#');
  const bareRef = hashIdx >= 0 ? ref.slice(0, hashIdx) : ref;
  const params = parseParams(hashIdx >= 0 ? ref.slice(hashIdx + 1) : undefined);

  const { domain, key } = splitRef(bareRef);
  const contract = loadContract(domain);
  const entry = contract[key];
  if (entry === undefined) {
    throw new ClassifiedError(
      FailureBucket.LOCATOR_RESOLUTION_FAILURE,
      `Locator key "${key}" not found in contract "${domain}"`,
    );
  }

  const isWeb = platform === 'desktop' || platform === 'responsive';

  let rawSelector: string | undefined;
  let strategy: 'web' | 'mobile';
  if (typeof entry === 'string') {
    rawSelector = entry;
    strategy = isWeb ? 'web' : 'mobile';
  } else if (isWeb) {
    const web = entry.web;
    rawSelector = typeof web === 'string' ? web : web?.[platform];
    strategy = 'web';
  } else {
    const mobile = entry.mobile;
    rawSelector = typeof mobile === 'string' ? mobile : mobile?.[platform as 'android' | 'ios'];
    strategy = 'mobile';
  }

  if (!rawSelector) {
    throw new ClassifiedError(
      FailureBucket.LOCATOR_RESOLUTION_FAILURE,
      `No ${strategy}/${platform} selector for "${bareRef}"`,
    );
  }

  return { selector: applyParams(rawSelector, params), strategy, ref: bareRef };
}

/** Resolve the locator family for visual region/mask resolution. */
export function tryResolveLocator(ref: string, platform: Platform): ResolvedLocator | null {
  try {
    return resolveLocator(ref, platform);
  } catch {
    return null;
  }
}
