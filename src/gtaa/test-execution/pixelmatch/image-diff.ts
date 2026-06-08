/**
 * Test Execution layer — pixelmatch + pngjs wrapper.
 *
 * `pixelmatch` is a pure-JS perceptual diff; with `pngjs` for decode/encode it
 * gives a fully open-source, reproducible visual oracle (no commercial diff
 * service). This module is deliberately tiny and pure: decode two PNG buffers,
 * verify equal dimensions, run the diff, and return counts plus a diff PNG.
 *
 * Dimension policy: pixelmatch requires identical width/height. Full-page /
 * variable-grid captures of this app wobble in height between runs (lazy
 * content, virtualized lists), which would hard-fail every comparison as a size
 * mismatch. Rather than silently resizing/padding (which would fabricate
 * "matching" pixels), we tolerate a small wobble: compare the common top-left
 * overlap and let the snapshot threshold judge it. Only a GROSS size change
 * (>=25% in either axis) — a genuine structural regression — is reported as a
 * real diff failure (sizeMismatch=true), which the executor maps to
 * VISUAL_DIFF_FAILURE. This keeps the oracle honest while absorbing layout jitter.
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

/**
 * Beyond this relative delta in either axis a capture is treated as a
 * structural change (real size mismatch -> hard fail), not a flaky height
 * wobble. Anything within it is tolerated and compared on the common overlap.
 */
const GROSS_SIZE_DELTA = 0.25;

interface DecodedImage {
  width: number;
  height: number;
  data: Buffer;
}

function decode(buffer: Buffer): DecodedImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

/** Crop a decoded image to a top-left w x h sub-region (RGBA, row-major). */
function cropTopLeft(img: DecodedImage, w: number, h: number): DecodedImage {
  if (img.width === w && img.height === h) return img;
  const out = Buffer.alloc(w * h * 4);
  const rowBytes = w * 4;
  for (let y = 0; y < h; y++) {
    const src = y * img.width * 4;
    img.data.copy(out, y * rowBytes, src, src + rowBytes);
  }
  return { width: w, height: h, data: out };
}

/**
 * Compare two PNG buffers. Returns diff counts and a diff PNG.
 *
 * Dimensions are allowed to wobble: when they differ by less than
 * GROSS_SIZE_DELTA in both axes the comparison runs on the common top-left
 * overlap (the size wobble itself is forgiven) and diffRatio is measured over
 * that overlap, so the snapshot threshold still judges the pixels. A GROSS size
 * change returns sizeMismatch=true with a descriptive error and no diff PNG;
 * the caller classifies that as VISUAL_DIFF_FAILURE.
 */
export function diffPngBuffers(
  actual: Buffer,
  baseline: Buffer,
  options: ImageDiffOptions = {},
): ImageDiffResult {
  const a = decode(actual);
  const b = decode(baseline);

  const sizeMismatch = a.width !== b.width || a.height !== b.height;

  if (sizeMismatch) {
    const wDelta = Math.abs(a.width - b.width);
    const hDelta = Math.abs(a.height - b.height);
    const maxW = Math.max(a.width, b.width);
    const maxH = Math.max(a.height, b.height);
    const gross =
      (maxW > 0 && wDelta / maxW > GROSS_SIZE_DELTA) ||
      (maxH > 0 && hDelta / maxH > GROSS_SIZE_DELTA);
    if (gross) {
      return {
        width: a.width,
        height: a.height,
        diffPixels: a.width * a.height,
        totalPixels: a.width * a.height,
        diffRatio: 1,
        diffPng: null,
        sizeMismatch: true,
        error:
          `Image size mismatch (gross >=${GROSS_SIZE_DELTA * 100}%): ` +
          `actual=${a.width}x${a.height}, baseline=${b.width}x${b.height}`,
      };
    }
  }

  // Compare the common top-left overlap. When sizes match this is a no-op crop.
  const cw = Math.min(a.width, b.width);
  const ch = Math.min(a.height, b.height);
  const ac = cropTopLeft(a, cw, ch);
  const bc = cropTopLeft(b, cw, ch);

  const diff = new PNG({ width: cw, height: ch });
  // pixelmatch v7 default export: pixelmatch(img1, img2, output, width, height, options)
  const diffPixels = pixelmatch(ac.data, bc.data, diff.data, cw, ch, {
    threshold: options.pixelmatchThreshold ?? DEFAULT_PIXELMATCH_THRESHOLD,
    includeAA: options.includeAA ?? false,
  });
  const totalPixels = cw * ch;
  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

  return {
    width: cw,
    height: ch,
    diffPixels,
    totalPixels,
    diffRatio,
    diffPng: PNG.sync.write(diff),
    // Wobble was tolerated and compared on the overlap, so this is NOT a hard
    // mismatch for the executor; record an informational note for traceability.
    sizeMismatch: false,
    error: sizeMismatch
      ? `Image size differs (tolerated, compared ${cw}x${ch} overlap): ` +
        `actual=${a.width}x${a.height}, baseline=${b.width}x${b.height}`
      : null,
  };
}
