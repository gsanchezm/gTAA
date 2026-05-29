/**
 * gTAA :: Test Execution layer :: minimal JSONPath resolver.
 *
 * Intentionally tiny. It supports only the two path shapes that the
 * declarative API contracts actually use:
 *
 *   - dotted properties:        `$.a.b.c`     (e.g. `$.token`, `$.user.id`,
 *                                              `$.totals.total`, `$.status_code`)
 *   - array index segments:     `$.a[0].b`    (e.g. `$.items[0].sku`,
 *                                              `$.products[0].id`,
 *                                              `$.cart.items[0].sku`)
 *
 * Anything else (wildcards, filters, recursive descent, quoted keys) is out of
 * scope. The resolver fully tokenizes the path and rejects any leftover/
 * malformed input by returning `undefined`, rather than silently walking a
 * partial path.
 */

type Token = { kind: 'prop'; name: string } | { kind: 'index'; index: number };

/**
 * Tokenize a `$`-rooted path into property/index segments.
 *
 * Returns `null` if the path is not fully consumable (malformed), so the
 * caller can distinguish a structurally invalid path from a valid path that
 * simply resolves to `undefined`.
 */
export function parseJsonPath(path: string): Token[] | null {
  if (typeof path !== 'string' || !path.startsWith('$')) {
    return null;
  }

  const tokens: Token[] = [];
  // Match either `.propName` or `[123]`, anchored so each step is contiguous.
  const segment = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/y;
  segment.lastIndex = 1; // skip the leading `$`

  while (segment.lastIndex < path.length) {
    const match = segment.exec(path);
    if (match === null) {
      // Unconsumed characters remain -> malformed path.
      return null;
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: 'prop', name: match[1] });
    } else {
      tokens.push({ kind: 'index', index: Number(match[2]) });
    }
  }

  return tokens;
}

/**
 * Resolve a value from `root` using a minimal JSONPath.
 *
 * Returns `undefined` when the path is malformed or when any segment cannot be
 * traversed (missing key, non-array indexed, null/undefined along the way).
 */
export function resolveJsonPath(root: unknown, path: string): unknown {
  const tokens = parseJsonPath(path);
  if (tokens === null) {
    return undefined;
  }

  let current: unknown = root;
  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (token.kind === 'index') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[token.index];
    } else {
      if (
        typeof current !== 'object' ||
        current === null ||
        Array.isArray(current)
      ) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[token.name];
    }
  }
  return current;
}
