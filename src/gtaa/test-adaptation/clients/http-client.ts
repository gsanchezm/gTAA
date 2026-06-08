/**
 * gTAA :: Test Adaptation layer :: thin HTTP client.
 *
 * A dependency-free wrapper around the Node 20+ global `fetch`. The Test
 * Execution layer calls into this Test Adaptation client directly (Test
 * Execution -> Test Adaptation) to reach the system under test. No external
 * HTTP libraries; timeout is enforced with a global `AbortController`.
 */

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Pre-serialized request body (e.g. JSON string). Omit for bodyless verbs. */
  body?: string;
  /** Abort the request after this many milliseconds. Defaults to 15000. */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  /** Response headers, lower-cased keys (as fetch normalizes them). */
  headers: Record<string, string>;
  bodyText: string;
  /** Parsed JSON body, or null when the body is empty / not valid JSON. */
  json: unknown;
  /** Wall-clock time spent on the round trip, in milliseconds. */
  timeMs: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Bounded retry for transport-level jitter. A freshly-started service can
 * briefly refuse connections (its readiness window) and sockets can drop
 * mid-flight; both recover on a short backoff. HTTP status codes are NEVER
 * retried here — a 4xx/5xx is a real response the caller must classify. These
 * constants mirror the reference retry policy so transient-absorption
 * behaviour stays comparable across the experiment batch.
 */
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;

/**
 * Transport-level signatures that are safe to retry. Deliberately excludes our
 * own AbortError (the request timeout) — retrying that would multiply wall time
 * against a genuinely-unresponsive host rather than absorb jitter.
 */
const TRANSIENT_TRANSPORT_REGEX =
  /econnrefused|econnreset|econnaborted|epipe|etimedout|enotfound|eai_again|socket hang up|network error|fetch failed/i;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** True for retryable transport jitter (connection refused/reset, DNS, fetch wrapper). */
function isTransientTransport(error: unknown): boolean {
  const err = error as {
    name?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  // Our own timeout abort must NOT be retried.
  if (err?.name === 'AbortError') return false;
  const code = err?.cause?.code ?? '';
  const text = `${err?.name ?? ''}: ${err?.message ?? ''} ${code} ${err?.cause?.message ?? ''}`;
  return TRANSIENT_TRANSPORT_REGEX.test(text);
}

/**
 * Perform an HTTP request and normalize the response, retrying transport-level
 * jitter with exponential backoff (see {@link isTransientTransport}).
 *
 * Transport-level failures that are not transient (or that outlive the retry
 * budget) propagate as thrown errors so the caller can classify them as
 * infrastructure failures.
 */
export async function httpRequest(req: HttpRequest): Promise<HttpResponse> {
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
    try {
      return await attemptOnce(req, timeoutMs);
    } catch (error) {
      lastError = error;
      const retriesExhausted = attempt >= DEFAULT_MAX_RETRIES;
      if (!isTransientTransport(error) || retriesExhausted) {
        throw error;
      }
      await delay(BASE_BACKOFF_MS * (1 << (attempt + 1)));
    }
  }
  // Unreachable (the loop either returns or throws), but satisfies the compiler.
  throw lastError;
}

/** Single HTTP attempt: enforce the timeout, send, and normalize the response. */
async function attemptOnce(req: HttpRequest, timeoutMs: number): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });

    const bodyText = await res.text();

    let json: unknown = null;
    if (bodyText !== '') {
      try {
        json = JSON.parse(bodyText);
      } catch {
        // Leave json as null; callers decide whether non-JSON is a problem.
        json = null;
      }
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: res.status,
      headers,
      bodyText,
      json,
      timeMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}
