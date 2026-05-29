/**
 * Test Execution layer — pixelmatch + pngjs wrapper.
 *
 * `pixelmatch` is a pure-JS perceptual diff; with `pngjs` for decode/encode it
 * gives a fully open-source, reproducible visual oracle (no commercial diff
 * service). This module is deliberately tiny and pure: decode two PNG buffers,
 * verify equal dimensions, run the diff, and return counts plus a diff PNG.
 *
 * Dimension policy: pixelmatch requires identical width/height. Rather than
 * silently resizing/padding (which would mask a genuine layout regression and
 * fabricate "matching" pixels), a size mismatch is reported as a real diff
 * failure — the executor maps it to VISUAL_DIFF_FAILURE. This keeps the oracle
 * honest: a baseline captured at a different size IS a visual change.
 */
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface ImageDiffOptions {
  /** Per-pixel color-distance sensitivity passed to pixelmatch (0..1). */
  pixelmatchThreshold?: number;
  /** Whether anti-aliased pixels count as differences. */
  includeAA?: boolean;
}

export interface ImageDiffResult {
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  /** PNG-encoded diff visualization, or null when dimensions mismatched. */
  diffPng: Buffer | null;
  /** True when the two images have different dimensions (treated as a diff). */
  sizeMismatch: boolean;
  /** Human-readable explanation when sizeMismatch is true, else null. */
  error: string | null;
}

/** pixelmatch's default color-distance threshold. */
const DEFAULT_PIXELMATCH_THRESHOLD = 0.1;

interface DecodedImage {
  width: number;
  height: number;
  data: Buffer;
}

function decode(buffer: Buffer): DecodedImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

/**
 * Compare two PNG buffers. Returns diff counts and a diff PNG. On dimension
 * mismatch returns sizeMismatch=true with a descriptive error and no diff PNG;
 * the caller should classify that as VISUAL_DIFF_FAILURE.
 */
export function diffPngBuffers(
  actual: Buffer,
  baseline: Buffer,
  options: ImageDiffOptions = {},
): ImageDiffResult {
  const a = decode(actual);
  const b = decode(baseline);

  if (a.width !== b.width || a.height !== b.height) {
    return {
      width: a.width,
      height: a.height,
      diffPixels: a.width * a.height,
      totalPixels: a.width * a.height,
      diffRatio: 1,
      diffPng: null,
      sizeMismatch: true,
      error: `Image size mismatch: actual=${a.width}x${a.height}, baseline=${b.width}x${b.height}`,
    };
  }

  const diff = new PNG({ width: a.width, height: a.height });
  // pixelmatch v7 default export: pixelmatch(img1, img2, output, width, height, options)
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: options.pixelmatchThreshold ?? DEFAULT_PIXELMATCH_THRESHOLD,
    includeAA: options.includeAA ?? false,
  });
  const totalPixels = a.width * a.height;
  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

  return {
    width: a.width,
    height: a.height,
    diffPixels,
    totalPixels,
    diffRatio,
    diffPng: PNG.sync.write(diff),
    sizeMismatch: false,
    error: null,
  };
}
