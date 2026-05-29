/**
 * Configuration layer — Playwright tool settings.
 *
 * Holds ONLY the tool-specific launch knobs that env.ts deliberately does
 * not own (browser channel, extra launch args, slow-motion delay). Sizing,
 * headless mode and timeouts continue to live in webConfig() so there is no
 * duplication: this file is purely additive.
 */

export type WebToolConfig = {
  /** Optional branded browser channel, e.g. 'chrome' or 'msedge'. */
  channel?: string;
  /** Extra chromium launch arguments. */
  args: string[];
  /** Slow-motion delay (ms) applied to each action; 0 disables it. */
  slowMo: number;
};

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Read tool-specific Playwright settings from the environment (once). */
export function webToolConfig(): WebToolConfig {
  const channel = process.env.WEB_BROWSER_CHANNEL;
  const rawArgs = process.env.WEB_BROWSER_ARGS;
  return {
    channel: channel && channel.length > 0 ? channel : undefined,
    args: rawArgs ? rawArgs.split(',').map((a) => a.trim()).filter(Boolean) : [],
    slowMo: num(process.env.WEB_SLOW_MO_MS, 0),
  };
}
