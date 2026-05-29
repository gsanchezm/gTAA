/**
 * Standardized failure buckets shared across every tool/layer of the gTAA baseline.
 * The same enumeration is emitted by the TOM reference repository, so failure
 * classifications are directly comparable between architectures.
 */
export enum FailureBucket {
  API_CONTRACT_FAILURE = 'API_CONTRACT_FAILURE',
  API_RESPONSE_FAILURE = 'API_RESPONSE_FAILURE',
  UI_ACTION_FAILURE = 'UI_ACTION_FAILURE',
  LOCATOR_RESOLUTION_FAILURE = 'LOCATOR_RESOLUTION_FAILURE',
  VISUAL_DIFF_FAILURE = 'VISUAL_DIFF_FAILURE',
  VISUAL_BASELINE_MISSING = 'VISUAL_BASELINE_MISSING',
  PERFORMANCE_THRESHOLD_FAILURE = 'PERFORMANCE_THRESHOLD_FAILURE',
  MOBILE_SESSION_FAILURE = 'MOBILE_SESSION_FAILURE',
  WEB_SESSION_FAILURE = 'WEB_SESSION_FAILURE',
  INFRASTRUCTURE_FAILURE = 'INFRASTRUCTURE_FAILURE',
  DATA_SETUP_FAILURE = 'DATA_SETUP_FAILURE',
  ASSERTION_FAILURE = 'ASSERTION_FAILURE',
  TIMEOUT_FAILURE = 'TIMEOUT_FAILURE',
  UNKNOWN_FAILURE = 'UNKNOWN_FAILURE',
}

export const ALL_FAILURE_BUCKETS: FailureBucket[] = Object.values(FailureBucket);

/**
 * A typed error that carries an explicit failure bucket. Layers throw this so
 * the reporting layer can classify failures deterministically instead of
 * guessing from error text.
 */
export class ClassifiedError extends Error {
  readonly bucket: FailureBucket;
  constructor(bucket: FailureBucket, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ClassifiedError';
    this.bucket = bucket;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * Best-effort classification of an arbitrary error into a failure bucket.
 * Prefer throwing {@link ClassifiedError} at the source; this is the fallback
 * used by hooks when an unclassified error reaches the reporting layer.
 */
export function classifyError(error: unknown): FailureBucket {
  if (error instanceof ClassifiedError) {
    return error.bucket;
  }
  const message = errorMessage(error).toLowerCase();
  if (!message) {
    return FailureBucket.UNKNOWN_FAILURE;
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return FailureBucket.TIMEOUT_FAILURE;
  }
  if (message.includes('no such element') || message.includes('not found') || message.includes('unable to locate')) {
    return FailureBucket.LOCATOR_RESOLUTION_FAILURE;
  }
  if (message.includes('stale element')) {
    return FailureBucket.UI_ACTION_FAILURE;
  }
  if (message.includes('econnrefused') || message.includes('socket hang up') || message.includes('network')) {
    return FailureBucket.INFRASTRUCTURE_FAILURE;
  }
  if (message.includes('expected') || message.includes('assert')) {
    return FailureBucket.ASSERTION_FAILURE;
  }
  return FailureBucket.UNKNOWN_FAILURE;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
