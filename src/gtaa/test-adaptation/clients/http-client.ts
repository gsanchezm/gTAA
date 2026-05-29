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
 * Perform a single HTTP request and normalize the response.
 *
 * Transport-level failures (DNS, connection refused, timeout/abort) propagate
 * as thrown errors so the caller can classify them as infrastructure failures.
 */
export async function httpRequest(req: HttpRequest): Promise<HttpResponse> {
  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
