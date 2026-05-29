/**
 * Test Execution layer — API executor.
 *
 * Executes declarative API contracts
 * (test-generation/contracts/api/<domain>.api.contract.json) directly via the
 * Test Adaptation HTTP client (Test Execution -> Test Adaptation). The contract
 * data drives everything — there is no indirection layer. Emits exactly one
 * ApiContractEvent per endpoint execution.
 *
 * Secrets never leave this process in raw form: request headers and body are
 * recorded only as hashes (hashPayload). Passwords / card numbers / tokens are
 * therefore never written to telemetry.
 */
import { FailureBucket } from '../../shared/failure-buckets';
import type { ApiContractEvent, ExecutionStatus } from '../../shared/types';
import { appConfig } from '../../configuration/environments/env';
import { runIdentity } from '../../test-reporting/telemetry/run-context';
import {
  emitApiEvent,
  hashPayload,
} from '../../test-reporting/telemetry/telemetry-writer';
import { httpRequest } from '../../test-adaptation/clients/http-client';
import { resolveJsonPath } from './json-path';
import {
  loadApiContract,
  type ApiAssertion,
  type ApiEndpoint,
} from './api-contract-loader';

/**
 * FROZEN public result shape — do not change. The executor body fills it.
 */
export interface ApiExecutionResult {
  status: ExecutionStatus;
  endpointId: string;
  method: string;
  path: string;
  responseStatus: number | null;
  responseTimeMs: number | null;
  extracted: Record<string, string>;
  assertionCount: number;
  failedAssertions: number;
  failureBucket: FailureBucket | null;
  errorMessage: string | null;
}

type Variables = Record<string, string | number>;

const SCHEMA_VERSION = '1.0.0';
const PLATFORM = 'api';
const REQUEST_TIMEOUT_MS = 15000;

/** Internal accumulator passed to the single telemetry/finish step (DRY). */
interface Outcome {
  method: string;
  path: string;
  responseStatus: number | null;
  responseTimeMs: number | null;
  assertionCount: number;
  failedAssertions: number;
  extracted: Record<string, string>;
  bucket: FailureBucket | null;
  status: ExecutionStatus;
  errorMessage: string | null;
}

export class ApiExecutor {
  /**
   * Execute a single endpoint from a domain's API contract.
   *
   * @param feature     domain/feature name (maps to <feature>.api.contract.json)
   * @param endpointId  endpoint id within the contract
   * @param variables   interpolation variables for path/headers/body
   */
  async executeEndpoint(
    feature: string,
    endpointId: string,
    variables: Record<string, string | number> = {},
  ): Promise<ApiExecutionResult> {
    const vars: Variables = variables;

    // --- Resolve the contract + build the request. -------------------------
    // Contract/shape problems here are API_CONTRACT_FAILURE.
    let endpoint: ApiEndpoint;
    let method: string;
    let interpolatedPath: string;
    let headers: Record<string, string>;
    let bodyText: string | undefined;
    let url: string;
    try {
      const contract = loadApiContract(feature);
      const found = contract.endpoints.find((e) => e.id === endpointId);
      if (!found) {
        throw new Error(
          `Unknown endpoint "${endpointId}" in feature "${feature}"`,
        );
      }
      endpoint = found;

      const baseUrl = resolveBaseUrl(contract.baseUrlRef);
      method = endpoint.method;
      interpolatedPath = interpolate(endpoint.path, vars);
      const query = buildQueryString(endpoint.queryTemplate, vars);
      headers = interpolateRecord(endpoint.headersTemplate ?? {}, vars);
      bodyText =
        endpoint.bodyTemplate != null
          ? JSON.stringify(interpolateValue(endpoint.bodyTemplate, vars))
          : undefined;
      url = baseUrl + interpolatedPath + query;
    } catch (err) {
      return this.finish(
        feature,
        endpointId,
        {
          method: '',
          path: '',
          responseStatus: null,
          responseTimeMs: null,
          assertionCount: 0,
          failedAssertions: 0,
          extracted: {},
          bucket: FailureBucket.API_CONTRACT_FAILURE,
          status: 'FAIL',
          errorMessage: messageOf(err),
        },
        { headersHash: null, bodyHash: null },
      );
    }

    const requestHashes = {
      headersHash: hashPayload(headers),
      bodyHash: hashPayload(bodyText ?? null),
    };

    // --- Send the request (transport failures -> INFRASTRUCTURE_FAILURE). --
    let response;
    try {
      response = await httpRequest({
        method,
        url,
        headers,
        body: bodyText,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (err) {
      return this.finish(
        feature,
        endpointId,
        {
          method,
          path: interpolatedPath,
          responseStatus: null,
          responseTimeMs: null,
          assertionCount: 0,
          failedAssertions: 0,
          extracted: {},
          bucket: FailureBucket.INFRASTRUCTURE_FAILURE,
          status: 'FAIL',
          errorMessage: messageOf(err),
        },
        requestHashes,
      );
    }

    // --- Assertions. -------------------------------------------------------
    const expect = endpoint.expect;
    const assertions = expect.jsonPathAssertions ?? [];
    let assertionCount = 0;
    let failedAssertions = 0;
    let bucket: FailureBucket | null = null;

    // 1) HTTP status.
    assertionCount += 1;
    if (!expect.status.includes(response.status)) {
      failedAssertions += 1;
      bucket = bucket ?? FailureBucket.API_RESPONSE_FAILURE;
    }

    // 2) Response headers (case-insensitive substring match on the value).
    for (const [name, expected] of Object.entries(expect.headers ?? {})) {
      assertionCount += 1;
      const actual = response.headers[name.toLowerCase()];
      if (
        actual === undefined ||
        !actual.toLowerCase().includes(expected.toLowerCase())
      ) {
        failedAssertions += 1;
        bucket = bucket ?? FailureBucket.API_RESPONSE_FAILURE;
      }
    }

    // A body that was returned but is not parseable JSON is a contract/shape
    // problem (when we actually need to read it).
    const needsJson = assertions.length > 0 || (endpoint.extract ?? []).length > 0;
    const bodyUnparseable =
      needsJson && response.json === null && response.bodyText !== '';

    // 3) JSONPath assertions (regex `matches` and/or exact `equals`).
    for (const assertion of assertions) {
      assertionCount += 1;
      const value = resolveJsonPath(response.json, assertion.path);
      const result = evaluateAssertion(assertion, value, bodyUnparseable);
      if (!result.passed) {
        failedAssertions += 1;
        bucket = bucket ?? result.bucket;
      }
    }

    // --- Extraction (best-effort; missing extracts do not fail the run). ---
    const extracted: Record<string, string> = {};
    for (const extract of endpoint.extract ?? []) {
      // Only the 'body' source is defined by the contract schema today.
      const source = extract.from === 'body' ? response.json : undefined;
      const value = resolveJsonPath(source, extract.path);
      if (value !== undefined && value !== null) {
        extracted[extract.name] = String(value);
      }
    }

    const status: ExecutionStatus = failedAssertions === 0 ? 'PASS' : 'FAIL';

    return this.finish(
      feature,
      endpointId,
      {
        method,
        path: interpolatedPath,
        responseStatus: response.status,
        responseTimeMs: response.timeMs,
        assertionCount,
        failedAssertions,
        extracted,
        bucket: status === 'PASS' ? null : bucket,
        status,
        errorMessage:
          status === 'PASS'
            ? null
            : `${failedAssertions}/${assertionCount} assertion(s) failed`,
      },
      requestHashes,
    );
  }

  /**
   * Build the frozen result, emit exactly one ApiContractEvent, and return.
   * Centralizes event construction so every exit path is consistent (DRY).
   */
  private finish(
    feature: string,
    endpointId: string,
    outcome: Outcome,
    hashes: { headersHash: string | null; bodyHash: string | null },
  ): ApiExecutionResult {
    const identity = runIdentity();

    const event: ApiContractEvent = {
      ...identity,
      schema_version: SCHEMA_VERSION,
      feature,
      contract_type: 'API',
      contract_id: feature,
      endpoint_id: endpointId,
      method: outcome.method,
      path: outcome.path,
      platform: PLATFORM,
      viewport: null,
      status: outcome.status,
      duration_ms: outcome.responseTimeMs,
      // Only hashes are recorded — raw secrets never leave this process.
      request_headers_hash: hashes.headersHash,
      request_body_hash: hashes.bodyHash,
      response_status: outcome.responseStatus,
      response_time_ms: outcome.responseTimeMs,
      // Keys only (never values) — extracted values may be tokens/ids.
      extracted_keys: Object.keys(outcome.extracted),
      assertion_count: outcome.assertionCount,
      failed_assertions: outcome.failedAssertions,
      failure_bucket: outcome.bucket,
      error_message: outcome.errorMessage,
      metadata: {},
    };

    emitApiEvent(event);

    return {
      status: outcome.status,
      endpointId,
      method: outcome.method,
      path: outcome.path,
      responseStatus: outcome.responseStatus,
      responseTimeMs: outcome.responseTimeMs,
      extracted: outcome.extracted,
      assertionCount: outcome.assertionCount,
      failedAssertions: outcome.failedAssertions,
      failureBucket: outcome.bucket,
      errorMessage: outcome.errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Assertion evaluation.
// ---------------------------------------------------------------------------

interface AssertionResult {
  passed: boolean;
  bucket: FailureBucket;
}

/** Evaluate one JSONPath assertion (`matches` regex and/or `equals` exact). */
function evaluateAssertion(
  assertion: ApiAssertion,
  value: unknown,
  bodyUnparseable: boolean,
): AssertionResult {
  if (value === undefined || value === null) {
    // Missing value due to an unparseable body is a contract failure;
    // otherwise the response simply did not match expectations.
    return {
      passed: false,
      bucket: bodyUnparseable
        ? FailureBucket.API_CONTRACT_FAILURE
        : FailureBucket.API_RESPONSE_FAILURE,
    };
  }

  // Exact match.
  if (assertion.equals !== undefined) {
    return {
      passed: String(value) === String(assertion.equals),
      bucket: FailureBucket.API_RESPONSE_FAILURE,
    };
  }

  // Regex match.
  if (assertion.matches !== undefined) {
    let regex: RegExp;
    try {
      regex = new RegExp(assertion.matches);
    } catch {
      // A malformed regex in the contract is a contract problem.
      return { passed: false, bucket: FailureBucket.API_CONTRACT_FAILURE };
    }
    return {
      passed: regex.test(String(value)),
      bucket: FailureBucket.API_RESPONSE_FAILURE,
    };
  }

  // Neither matcher present -> the contract is malformed.
  return { passed: false, bucket: FailureBucket.API_CONTRACT_FAILURE };
}

// ---------------------------------------------------------------------------
// Interpolation helpers ({{var}} substitution from `variables`).
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Replace `{{var}}` placeholders in a string from the variable map. */
function interpolate(template: string, vars: Variables): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars[name];
    return value === undefined ? '' : String(value);
  });
}

/** Interpolate every string value in a flat record (e.g. headers). */
function interpolateRecord(
  record: Record<string, string>,
  vars: Variables,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = interpolate(value, vars);
  }
  return out;
}

/** Recursively interpolate string leaves of an arbitrary JSON-ish value. */
function interpolateValue(value: unknown, vars: Variables): unknown {
  if (typeof value === 'string') {
    return interpolate(value, vars);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, vars));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = interpolateValue(val, vars);
    }
    return out;
  }
  return value;
}

/** Build a `?a=b&c=d` query string from an interpolated query template. */
function buildQueryString(
  template: Record<string, string> | undefined,
  vars: Variables,
): string {
  if (!template) {
    return '';
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(template)) {
    params.append(key, interpolate(value, vars));
  }
  const qs = params.toString();
  return qs === '' ? '' : `?${qs}`;
}

/**
 * Resolve the contract's baseUrlRef placeholder from configuration. Both
 * `{{apiBaseUrl}}` and `{{baseUrl}}` appear across contracts; both map to the
 * configured API base URL for execution.
 */
function resolveBaseUrl(baseUrlRef: string): string {
  const cfg = appConfig();
  const resolved = baseUrlRef.replace(PLACEHOLDER, (_match, name: string) => {
    if (name === 'apiBaseUrl' || name === 'baseUrl') {
      return cfg.apiBaseUrl;
    }
    throw new Error(`Unknown baseUrlRef placeholder "{{${name}}}"`);
  });
  // Trim a trailing slash so `baseUrl + path` does not double up.
  return resolved.replace(/\/+$/, '');
}

/** Best-effort error message extraction (no secrets — contract/transport text). */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
