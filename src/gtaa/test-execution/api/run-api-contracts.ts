/**
 * Test Execution layer — API contract runner (CLI).
 *
 * Executes each endpoint of one or more domain contracts exactly once with
 * representative variables, so a `pnpm test:api`-style invocation produces
 * `metrics/raw/api/<run-id>.jsonl` telemetry even outside Cucumber.
 *
 * Feature selection:
 *   - `GTAA_API_FEATURES` env (comma-separated) selects specific domains.
 *   - Otherwise every `*.api.contract.json` in the contracts directory runs.
 *
 * The live API may be unreachable; that is fine. Unreachable endpoints emit
 * FAIL / INFRASTRUCTURE_FAILURE events — the point is that the pipeline runs
 * end to end.
 *
 * Variable sourcing: representative values come from the Test Generation
 * test-data (users.json, the first 'standard' user) merged with obviously-fake,
 * non-secret defaults for the remaining placeholders. In a real run these would
 * be drawn from feature examples / chained extraction; here each endpoint runs
 * once with these static representatives.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { runIdentity } from '../../test-reporting/telemetry/run-context';
import { ApiExecutor, type ApiExecutionResult } from './api-executor';
import { apiContractsDir, loadApiContract } from './api-contract-loader';

const CONTRACT_SUFFIX = '.api.contract.json';

/** Path to the Test Generation user test-data, relative to this file. */
const USERS_FILE = join(
  __dirname,
  '..',
  '..',
  'test-generation',
  'test-data',
  'users.json',
);

/**
 * Load representative interpolation variables. Real-ish identifiers come from
 * the users.json test-data; everything sensitive is an obviously-fake
 * placeholder. These never leave the process as raw values — only as hashes.
 */
function representativeVariables(): Record<string, string | number> {
  const base: Record<string, string | number> = {
    language: 'en',
    market: 'us',
    username: 'standard_user',
    // Non-secret placeholders (only ever emitted as hashes).
    password: 'example-not-a-real-secret',
    authToken: 'example-token-not-a-real-secret',
    customerId: 'cust-0001',
    cartId: 'cart-0001',
    productId: 'prod-0001',
    sku: 'SKU-0001',
    quantity: 1,
    paymentMethod: 'card',
    deliveryStreet: '1 Example Street',
    deliveryZip: '00000',
    deliverySuburb: 'Example Suburb',
    deliveryName: 'Example Person',
    deliveryPhone: '000-000-0000',
    orderId: 'ORDER-000001',
    locale: 'en-US',
  };

  // Prefer a real username from the test-data when available.
  try {
    const raw = readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(raw) as unknown;
    const user = pickFirstUser(data);
    if (user && typeof user.username === 'string') {
      base.username = user.username;
    }
  } catch {
    // Test-data is optional for this representative run; keep defaults.
  }

  return base;
}

/** Best-effort extraction of the first user record from arbitrary JSON shapes. */
function pickFirstUser(data: unknown): { username?: string } | null {
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    return data[0] as { username?: string };
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Common shapes: { users: [...] } or { standard: {...} } or a flat record.
    if (Array.isArray(obj.users) && obj.users.length > 0) {
      return obj.users[0] as { username?: string };
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        return value as { username?: string };
      }
    }
  }
  return null;
}

/** Discover all domain features by scanning the contracts directory. */
function discoverFeatures(): string[] {
  return readdirSync(apiContractsDir())
    .filter((name) => name.endsWith(CONTRACT_SUFFIX))
    .map((name) => name.slice(0, -CONTRACT_SUFFIX.length))
    .sort();
}

/** Resolve the features to run from env, falling back to all discovered. */
function selectedFeatures(): string[] {
  const fromEnv = process.env.GTAA_API_FEATURES;
  if (fromEnv && fromEnv.trim() !== '') {
    return fromEnv
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
  }
  return discoverFeatures();
}

async function main(): Promise<void> {
  const features = selectedFeatures();
  const executor = new ApiExecutor();
  const identity = runIdentity();
  const variables = representativeVariables();

  // eslint-disable-next-line no-console
  console.log(
    `[gtaa:api] run ${identity.run_id} :: features=[${features.join(', ')}]`,
  );

  const results: ApiExecutionResult[] = [];

  for (const feature of features) {
    let endpointIds: string[];
    try {
      endpointIds = loadApiContract(feature).endpoints.map((e) => e.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[gtaa:api] skipping "${feature}": ${message}`);
      continue;
    }

    for (const endpointId of endpointIds) {
      // Each endpoint executes exactly once with representative variables.
      const result = await executor.executeEndpoint(
        feature,
        endpointId,
        variables,
      );
      results.push(result);
      // eslint-disable-next-line no-console
      console.log(
        `[gtaa:api] ${feature}/${endpointId} -> ${result.status}` +
          ` (http=${result.responseStatus ?? 'n/a'},` +
          ` assertions=${result.failedAssertions}/${result.assertionCount},` +
          ` bucket=${result.failureBucket ?? 'none'})`,
      );
    }
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  // eslint-disable-next-line no-console
  console.log(
    `[gtaa:api] done :: ${passed}/${results.length} passed ->` +
      ` metrics/raw/api/${identity.run_id}.jsonl`,
  );
}

// CLI entry point (invoked via ts-node / tsx). Run only when executed directly.
if (require.main === module) {
  void main();
}
