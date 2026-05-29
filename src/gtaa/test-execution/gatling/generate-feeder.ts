/**
 * Test Execution layer — Gatling feeder generator (deterministic).
 *
 * Generates the static feeder data the load simulations consume. The Gatling
 * CLI bundles simulation files with esbuild and will not honor `fs`/`path`
 * imports at runtime, so the feeder rows must be materialized into a plain
 * source module ahead of time. This script is the pre-build step that does so.
 *
 * The checkout feeder is FEATURE-DRIVEN: rows are parsed directly from the
 * place-delivery-order.feature Examples table (the .feature file is the single
 * source of truth), so the load matrix tracks the functional test matrix
 * (markets US/MX/CH/JP). The login feeders use small inline data sets.
 *
 * Output is fully deterministic: the same feature/inputs always produce the
 * same generated file (stable ordering, stable formatting). Run via:
 *   pnpm perf:generate
 *
 * Direct generation — no indirection layer.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Repo root, resolved relative to this file's compiled/ts location. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/** Source feature whose Examples table drives the checkout load matrix. */
const CHECKOUT_FEATURE = join(
  REPO_ROOT,
  'src',
  'gtaa',
  'test-generation',
  'features',
  'place-delivery-order.feature',
);

/** Where the generated feeder modules live (consumed by the simulations). */
const SIMULATIONS_DIR = join(
  REPO_ROOT,
  'src',
  'gtaa',
  'test-execution',
  'gatling',
  'simulations',
);

/**
 * Feeder rows carry an index signature so they are directly assignable to
 * Gatling's `arrayFeeder(Record<string, unknown>[])` without a cast.
 */
type FeederRow = Record<string, unknown>;

/** A single checkout feeder row — one row per Gatling virtual-user iteration. */
export interface CheckoutRow extends FeederRow {
  market: string;
  item: string;
  size: string;
  qty: number;
  street: string;
  zip: string;
  suburb: string;
  name: string;
  phone: string;
  payment: string;
  card: string;
  exp: string;
  cvv: string;
}

/** A single login feeder row (positive auth path). */
export interface LoginRow extends FeederRow {
  username: string;
  password: string;
}

/** A single invalid-login feeder row (negative auth path). */
export interface InvalidLoginRow extends FeederRow {
  case: string;
  username: string;
  password: string;
}

/**
 * Minimal Gherkin Scenario-Outline parser. Reads a Scenario Outline's Examples
 * table(s) and returns the raw pipe-delimited rows keyed by header. Inlined here
 * (rather than imported) so the generator stays self-contained and free of any
 * forbidden cross-layer imports. Supports the subset needed for feeders:
 * Scenario Outline / Examples / pipe rows.
 */
export function parseScenarioOutline(
  featurePath: string,
  scenarioName: string,
): Array<Record<string, string>> {
  const lines = readFileSync(featurePath, 'utf8').split(/\r?\n/);
  const rows: Array<Record<string, string>> = [];

  let inScenario = false;
  let inExamples = false;
  let headers: string[] = [];

  const cellsOf = (line: string): string[] =>
    line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('Scenario Outline:')) {
      inScenario = line.slice('Scenario Outline:'.length).trim() === scenarioName;
      inExamples = false;
      headers = [];
      continue;
    }
    // Any other top-level keyword ends the current scenario block.
    if (/^(Scenario:|Feature:|Background:|Rule:)/.test(line)) {
      inScenario = false;
      inExamples = false;
      continue;
    }
    if (inScenario && line.startsWith('Examples:')) {
      inExamples = true;
      headers = [];
      continue;
    }
    if (inScenario && inExamples && line.startsWith('|')) {
      const cells = cellsOf(line);
      if (headers.length === 0) {
        headers = cells;
      } else {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = cells[idx] ?? '';
        });
        rows.push(row);
      }
    }
  }

  return rows;
}

const CARD_SCENARIO = 'Place a delivery order in <market> paying with credit card';

/** A deterministic placeholder card per payment branch (no real PANs). */
const TEST_CARD = { card: '4242424242424242', exp: '12/28', cvv: '123' };

/**
 * Maps a raw Examples row to a typed CheckoutRow. Tolerates feature tables that
 * omit suburb/card columns (the gTAA feature does) by defaulting them; the
 * checkout simulation only emits those fields when present/applicable.
 */
function toCheckoutRow(row: Record<string, string>, payment: string): CheckoutRow {
  const isCard = payment.toLowerCase().includes('card');
  return {
    market: row['market'],
    item: row['item'],
    size: row['size'],
    qty: parseInt(row['qty'], 10),
    street: row['street'],
    zip: row['zip'],
    suburb: row['suburb'] ?? '',
    name: row['name'],
    phone: row['phone'],
    payment,
    card: isCard ? (row['card'] || TEST_CARD.card) : '',
    exp: isCard ? (row['exp'] || TEST_CARD.exp) : '',
    cvv: isCard ? (row['cvv'] || TEST_CARD.cvv) : '',
  };
}

/**
 * Builds the checkout matrix from the feature file's Examples table. Ordering is
 * the table's natural order, so output is deterministic.
 */
export function buildCheckoutRows(featurePath: string = CHECKOUT_FEATURE): CheckoutRow[] {
  return parseScenarioOutline(featurePath, CARD_SCENARIO).map((row) =>
    toCheckoutRow(row, row['payment'] || 'Credit Card'),
  );
}

/** Deterministic positive-login user set. */
export const LOGIN_ROWS: readonly LoginRow[] = [
  { username: 'standard_user', password: 'pizza123' },
  { username: 'locked_out_user', password: 'pizza123' },
  { username: 'problem_user', password: 'pizza123' },
  { username: 'performance_glitch_user', password: 'pizza123' },
];

/**
 * Deterministic negative-auth matrix. Every row is *expected* to be rejected
 * with a 4xx by /api/auth/login.
 */
export const INVALID_LOGIN_ROWS: readonly InvalidLoginRow[] = [
  { case: 'missing-username', username: '', password: 'pizza123' },
  { case: 'missing-password', username: 'standard_user', password: '' },
  { case: 'both-empty', username: '', password: '' },
  { case: 'invalid-credentials', username: 'not_a_user', password: 'not_a_pass' },
  { case: 'locked-out', username: 'locked_out_user', password: 'pizza123' },
];

/** Builds a generated-feeder module body for a typed row array. */
function renderModule(typeName: string, exportName: string, rows: unknown[]): string {
  return [
    '// AUTO-GENERATED — do not edit by hand.',
    '// Re-generate with: pnpm perf:generate',
    '// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).',
    `import type { ${typeName} } from '../generate-feeder';`,
    '',
    `export const ${exportName}: ${typeName}[] = ${JSON.stringify(rows, null, 2)};`,
    '',
  ].join('\n');
}

interface GeneratedArtifact {
  file: string;
  count: number;
}

/**
 * Writes all generated feeder modules. Returns the artifacts produced so the
 * caller (or a test) can assert on them. Pure aside from the filesystem writes.
 */
export function generateFeeders(outDir: string = SIMULATIONS_DIR): GeneratedArtifact[] {
  const artifacts: Array<{ name: string; type: string; exportName: string; rows: unknown[] }> = [
    { name: 'checkout-rows.generated.ts', type: 'CheckoutRow', exportName: 'checkoutRows', rows: buildCheckoutRows() },
    { name: 'login-rows.generated.ts', type: 'LoginRow', exportName: 'loginRows', rows: [...LOGIN_ROWS] },
    { name: 'invalid-login-rows.generated.ts', type: 'InvalidLoginRow', exportName: 'invalidLoginRows', rows: [...INVALID_LOGIN_ROWS] },
  ];

  return artifacts.map(({ name, type, exportName, rows }) => {
    const file = join(outDir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderModule(type, exportName, rows), 'utf8');
    return { file, count: rows.length };
  });
}

/** CLI entry point. */
function main(): void {
  const artifacts = generateFeeders();
  for (const { file, count } of artifacts) {
    process.stdout.write(`[generate-feeder] Wrote ${count} rows -> ${file}\n`);
  }
}

if (require.main === module) {
  main();
}
