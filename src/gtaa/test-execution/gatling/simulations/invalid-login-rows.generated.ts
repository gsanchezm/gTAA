// AUTO-GENERATED — do not edit by hand.
// Re-generate with: pnpm perf:generate
// NOTE: keep relative imports — bundled by @gatling.io/cli (esbuild, no tsconfig-paths support).
import type { InvalidLoginRow } from '../generate-feeder';

export const invalidLoginRows: InvalidLoginRow[] = [
  {
    "case": "missing-username",
    "username": "",
    "password": "pizza123"
  },
  {
    "case": "missing-password",
    "username": "standard_user",
    "password": ""
  },
  {
    "case": "both-empty",
    "username": "",
    "password": ""
  },
  {
    "case": "invalid-credentials",
    "username": "not_a_user",
    "password": "not_a_pass"
  },
  {
    "case": "locked-out",
    "username": "locked_out_user",
    "password": "pizza123"
  }
];
