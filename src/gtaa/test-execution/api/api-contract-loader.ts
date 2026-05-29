/**
 * gTAA :: Test Execution layer :: API contract loader.
 *
 * Loads and caches a domain's declarative API contract JSON from the Test
 * Generation layer (`test-generation/contracts/api/<feature>.api.contract.json`).
 * Contracts are declarative — endpoints, assertions and extractions are data,
 * never hardcoded in execution code.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A single assertion against a JSONPath-resolved value. The contracts use two
 * forms: regex (`matches`) and exact (`equals`). At least one is present.
 */
export interface ApiAssertion {
  path: string;
  matches?: string;
  equals?: string | number | boolean | null;
}

/** A value to lift out of the response into the execution result. */
export interface ApiExtract {
  name: string;
  from: string; // currently only 'body'
  path: string;
}

export interface ApiExpectation {
  status: number[];
  headers?: Record<string, string>;
  jsonPathAssertions?: ApiAssertion[];
}

export interface ApiEndpoint {
  id: string;
  description?: string;
  method: string;
  path: string;
  headersTemplate?: Record<string, string>;
  queryTemplate?: Record<string, string>;
  bodyTemplate?: Record<string, unknown> | null;
  expect: ApiExpectation;
  extract?: ApiExtract[];
  tags?: string[];
}

export interface ApiContract {
  feature: string;
  version: string;
  baseUrlRef: string;
  endpoints: ApiEndpoint[];
}

/**
 * Directory holding declarative API contracts, resolved relative to this file
 * so the loader works regardless of the process working directory:
 *   src/gtaa/test-execution/api -> src/gtaa/test-generation/contracts/api
 */
const CONTRACTS_DIR = join(
  __dirname,
  '..',
  '..',
  'test-generation',
  'contracts',
  'api',
);

const cache = new Map<string, ApiContract>();

/**
 * Load (and cache) the API contract for a feature/domain.
 *
 * @throws if the contract file is missing or not valid JSON.
 */
export function loadApiContract(feature: string): ApiContract {
  const cached = cache.get(feature);
  if (cached) {
    return cached;
  }

  const file = join(CONTRACTS_DIR, `${feature}.api.contract.json`);
  const raw = readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw) as ApiContract;
  cache.set(feature, parsed);
  return parsed;
}

/** Directory where contracts live (exposed for the runner's domain discovery). */
export function apiContractsDir(): string {
  return CONTRACTS_DIR;
}
