/**
 * Test Adaptation contract: the platform-agnostic UI driver interface.
 *
 * Use cases (Test Definition) depend ONLY on this interface. Concrete executors
 * in the Test Execution layer (PlaywrightWebExecutor, AppiumAndroidExecutor,
 * AppiumIosExecutor) implement it. There is no indirection layer between them —
 * the use case holds a UiDriver and calls it directly.
 *
 * Locator arguments are logical refs ("<domain>.<key>"); the executor resolves
 * them through the locator adaptation layer for the active platform.
 */
export interface CaptureOptions {
  /** Logical locator refs whose regions are masked (redacted) before capture. */
  maskRefs?: string[];
}

export interface UiDriver {
  readonly platform: string;

  /** Start the underlying session (browser context / mobile session). */
  start(): Promise<void>;
  /** Tear the session down. Always safe to call (idempotent). */
  stop(): Promise<void>;

  navigate(url: string): Promise<void>;
  click(ref: string): Promise<void>;
  type(ref: string, text: string): Promise<void>;
  getText(ref: string): Promise<string>;
  isVisible(ref: string): Promise<boolean>;
  waitForVisible(ref: string, timeoutMs?: number): Promise<void>;

  /** Capture a PNG of the element resolved from `ref`, applying any masks. */
  captureRegion(ref: string, options?: CaptureOptions): Promise<Buffer>;
  /** Capture a full-page/screen PNG, applying any masks. */
  capturePage(options?: CaptureOptions): Promise<Buffer>;
}
