/**
 * Test Execution layer — json-path resolver unit tests.
 *
 * Run with `node --test` (or via tsx/ts-node). Covers exactly the path shapes
 * the declarative API contracts use, plus malformed-path handling.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveJsonPath, parseJsonPath } from './json-path';

const sample = {
  token: 'abc123',
  status_code: 401,
  user: { id: 'u-1', username: 'standard_user' },
  totals: { total: 42.5 },
  products: [{ id: 'p1', name: 'Backpack' }],
  items: [{ sku: 'SKU-1' }],
  cart: { items: [{ sku: 'SKU-9' }] },
};

test('resolves a top-level property ($.token)', () => {
  assert.equal(resolveJsonPath(sample, '$.token'), 'abc123');
});

test('resolves a nested property ($.user.id)', () => {
  assert.equal(resolveJsonPath(sample, '$.user.id'), 'u-1');
});

test('resolves a nested numeric property ($.totals.total)', () => {
  assert.equal(resolveJsonPath(sample, '$.totals.total'), 42.5);
});

test('resolves an array index then property ($.items[0].sku)', () => {
  assert.equal(resolveJsonPath(sample, '$.items[0].sku'), 'SKU-1');
});

test('resolves array-in-object ($.products[0].id)', () => {
  assert.equal(resolveJsonPath(sample, '$.products[0].id'), 'p1');
});

test('resolves deeply nested array ($.cart.items[0].sku)', () => {
  assert.equal(resolveJsonPath(sample, '$.cart.items[0].sku'), 'SKU-9');
});

test('returns undefined for a missing property', () => {
  assert.equal(resolveJsonPath(sample, '$.nope'), undefined);
});

test('returns undefined for out-of-range index', () => {
  assert.equal(resolveJsonPath(sample, '$.items[5].sku'), undefined);
});

test('returns undefined when indexing a non-array', () => {
  assert.equal(resolveJsonPath(sample, '$.user[0]'), undefined);
});

test('returns undefined for a path not starting with $', () => {
  assert.equal(resolveJsonPath(sample, 'token'), undefined);
});

test('rejects a malformed path (parseJsonPath returns null)', () => {
  assert.equal(parseJsonPath('$.foo..bar'), null);
  assert.equal(parseJsonPath('$foo'), null);
  assert.equal(parseJsonPath('$.foo[bar]'), null);
});

test('parses a valid path into tokens', () => {
  assert.deepEqual(parseJsonPath('$.items[0].sku'), [
    { kind: 'prop', name: 'items' },
    { kind: 'index', index: 0 },
    { kind: 'prop', name: 'sku' },
  ]);
});
