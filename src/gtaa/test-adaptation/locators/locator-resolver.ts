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

export function resolveLocator(ref: string, platform: Platform): ResolvedLocator {
  const { domain, key } = splitRef(ref);
  const contract = loadContract(domain);
  const entry = contract[key];
  if (entry === undefined) {
    throw new ClassifiedError(
      FailureBucket.LOCATOR_RESOLUTION_FAILURE,
      `Locator key "${key}" not found in contract "${domain}"`,
    );
  }

  // A bare string applies to every platform.
  if (typeof entry === 'string') {
    return { selector: entry, strategy: platform === 'desktop' || platform === 'responsive' ? 'web' : 'mobile', ref };
  }

  const isWeb = platform === 'desktop' || platform === 'responsive';
  if (isWeb) {
    const web = entry.web;
    const selector = typeof web === 'string' ? web : web?.[platform];
    if (!selector) {
      throw new ClassifiedError(
        FailureBucket.LOCATOR_RESOLUTION_FAILURE,
        `No web/${platform} selector for "${ref}"`,
      );
    }
    return { selector, strategy: 'web', ref };
  }

  const mobile = entry.mobile;
  const selector =
    typeof mobile === 'string' ? mobile : mobile?.[platform as 'android' | 'ios'];
  if (!selector) {
    throw new ClassifiedError(
      FailureBucket.LOCATOR_RESOLUTION_FAILURE,
      `No mobile/${platform} selector for "${ref}"`,
    );
  }
  return { selector, strategy: 'mobile', ref };
}

/** Resolve the locator family for visual region/mask resolution. */
export function tryResolveLocator(ref: string, platform: Platform): ResolvedLocator | null {
  try {
    return resolveLocator(ref, platform);
  } catch {
    return null;
  }
}
