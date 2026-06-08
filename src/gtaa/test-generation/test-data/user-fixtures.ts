/**
 * Test Generation layer — test data source.
 *
 * Provides deterministic, isolated access to user fixtures used by scenarios.
 * Data is parameterized per alias so scenarios never share mutable state
 * (supports Automated Atomic Testing).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface UserRecord {
  username: string;
  password: string;
  behavior?: string;
  email?: string;
}

type UsersByAlias = Record<string, UserRecord[]>;

let cache: UsersByAlias | null = null;

function load(): UsersByAlias {
  if (cache) return cache;
  const file = join(__dirname, 'users.json');
  cache = JSON.parse(readFileSync(file, 'utf8')) as UsersByAlias;
  return cache;
}

export function getUser(alias: string): UserRecord {
  const records = load()[alias];
  if (!records || records.length === 0) {
    throw new Error(`No test-data user found for alias "${alias}"`);
  }
  // Return a fresh copy so scenarios cannot mutate shared fixture state.
  return { ...records[0] };
}
