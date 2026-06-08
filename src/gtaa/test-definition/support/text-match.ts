/**
 * Test Definition layer — text assertion helpers.
 *
 * Label casing is presentation, not semantics: the web renders labels through
 * CSS `text-transform` (so innerText comes back UPPER-CASED) while native and
 * API payloads render them as authored. Asserting raw equality/substring on
 * those labels flakes purely on casing/whitespace drift. These helpers compare
 * trimmed + lower-cased text so "ADD TO CART" and "Add to cart" both match,
 * keeping label assertions stable across platforms.
 *
 * Use ONLY for human-facing label/title text — never for ids, tokens, or
 * numeric values, where casing is significant.
 */

/** Normalize a label for comparison: trim outer whitespace and lower-case. */
function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** True when `haystack` contains `needle`, ignoring case and outer whitespace. */
export function textContains(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

/** True when two labels are equal, ignoring case and outer whitespace. */
export function textEquals(actual: string, expected: string): boolean {
  return normalize(actual) === normalize(expected);
}
