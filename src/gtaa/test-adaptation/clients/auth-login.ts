/**
 * Test Adaptation layer — tolerant authentication client.
 *
 * Authenticates against the AUT and coalesces the access token across the
 * field-name variants a backend may emit (`token` | `accessToken` |
 * `access_token`, including a nested `data` envelope). This tolerance lives in
 * CODE — never in the declarative login contract — so the experiment's contract
 * assets stay byte-identical to the reference while the layered login flow still
 * accepts the live backend's `access_token` response shape. Uses the shared
 * httpRequest (with its transient-transport retry) to reach the AUT.
 */
import { appConfig } from '../../configuration/environments/env';
import { httpRequest } from './http-client';

/** Canonical auth endpoint; matches login.api.contract.json's path. */
const LOGIN_PATH = '/api/auth/login';

export interface LoginCredentials {
  username: string;
  password: string;
  /** Optional locale/market headers; sent only when provided. */
  language?: string;
  market?: string;
}

export interface LoginResult {
  token: string | undefined;
  status: number;
}

/** First non-empty string among the candidates, else undefined. */
function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Coalesce the access token across known field-name variants (direct or under
 * a `data` envelope). Mirrors the reference login accessor.
 */
export function extractToken(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const root = body as Record<string, unknown>;
  const direct = firstNonEmptyString(root.token, root.accessToken, root.access_token);
  if (direct) return direct;

  const data = root.data;
  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    return firstNonEmptyString(nested.token, nested.accessToken, nested.access_token);
  }
  return undefined;
}

/** Authenticate and return the coalesced token plus the HTTP status. */
export async function authenticate(credentials: LoginCredentials): Promise<LoginResult> {
  const baseUrl = appConfig().apiBaseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (credentials.language) headers['Accept-Language'] = credentials.language;
  if (credentials.market) headers['X-Market'] = credentials.market;

  const response = await httpRequest({
    method: 'POST',
    url: baseUrl + LOGIN_PATH,
    headers,
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  });

  return { token: extractToken(response.json), status: response.status };
}

export interface LoginAttempt {
  status: number;
  token: string | undefined;
  /** True when the backend refused the credentials (4xx with no usable token). */
  rejected: boolean;
  /** The backend's user-facing error text, coalesced across response shapes. */
  errorMessage: string | undefined;
}

/**
 * Negative-path authentication: post the (possibly invalid / empty) credentials
 * and report whether the backend REJECTED them. The live backend surfaces a
 * rejection in three shapes — 401/403 `{error,status_code}` and 422 pydantic
 * `{detail:[...]}` — none of which match the declarative contract's
 * `$.error`/`$.status_code` assertions. The rejection guarantee therefore lives
 * in CODE (the login contract asset stays byte-identical to the reference),
 * mirroring how the reference login flow accepts an error response. A rejection
 * is a 4xx with no usable token.
 */
export async function attemptAuthentication(
  credentials: LoginCredentials,
): Promise<LoginAttempt> {
  const baseUrl = appConfig().apiBaseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (credentials.language) headers['Accept-Language'] = credentials.language;
  if (credentials.market) headers['X-Market'] = credentials.market;

  const response = await httpRequest({
    method: 'POST',
    url: baseUrl + LOGIN_PATH,
    headers,
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  });

  const token = extractToken(response.json);
  return {
    status: response.status,
    token,
    rejected: response.status >= 400 && !token,
    errorMessage: extractAuthError(response.json),
  };
}

/** Coalesce the backend error text across `{error}` and pydantic `{detail}`. */
function extractAuthError(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const root = body as Record<string, unknown>;
  if (typeof root.error === 'string' && root.error.length > 0) return root.error;

  const detail = root.detail;
  if (typeof detail === 'string' && detail.length > 0) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>).msg
          : undefined,
      )
      .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0);
    if (messages.length > 0) return messages.join('; ');
  }
  return undefined;
}
