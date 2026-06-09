/**
 * visual-gate.ts
 *
 * CI visual gate. The in-scenario visual oracle (runVisualCheck) deliberately
 * logs-and-swallows a pixel diff so a non-deterministic rendering drift never
 * fails a FUNCTIONAL scenario. That keeps drift OUT of the cucumber exit code,
 * so a dedicated post-run gate is what turns a real visual regression red — the
 * gTAA counterpart of the reference repo's standalone visual gate.
 *
 * It is a pure CONSUMER of already-emitted telemetry (metrics/raw/visual/*.jsonl,
 * VisualContractEvent). It introduces no router/registry/dispatcher and never
 * redefines a failure bucket — it only READS the VISUAL_DIFF_FAILURE bucket and
 * the normalized status the reporting layer already wrote.
 *
 * Exit semantics (process.exitCode):
 *   - UPDATE_VISUAL_BASELINE=true  -> 0 (baselines are being (re)generated;
 *                                       every comparison SKIPs as baseline-created).
 *   - any status===FAIL (drift)    -> 1
 *   - fewer real comparisons than  -> 1 (guards against a FALSE GREEN when the
 *     VISUAL_GATE_MIN_COMPARISONS       AUT is unreachable: captures then SKIP as
 *     (default 1)                       WEB_SESSION_FAILURE, producing zero FAILs
 *                                       even though nothing was actually compared).
 *   - otherwise                    -> 0
 *
 * Run: tsx scripts/metrics/visual-gate.ts
 */
import { join } from 'node:path';
import { RAW, readJsonlDir } from './lib/io';
import { bucket, normalizeStatus, num, str } from './lib/metrics-common';
import { FailureBucket } from '../../src/gtaa/shared/failure-buckets';

// Bind to the single source of truth shared with TOM — never redefine it.
const VISUAL_DIFF_BUCKET: string = FailureBucket.VISUAL_DIFF_FAILURE;

interface GateResult {
  total: number;
  pass: number;
  fail: number;
  skip: number;
  unknown: number;
  compared: number;
  minComparisons: number;
  failures: Array<{
    snapshot_id: string;
    diff_ratio: number | '';
    threshold: number | '';
    diff_path: string;
  }>;
  updateBaseline: boolean;
  passed: boolean;
  reason: string;
}

export function evaluate(): GateResult {
  const updateBaseline = String(process.env.UPDATE_VISUAL_BASELINE ?? '').toLowerCase() === 'true';
  const minComparisons = Number(process.env.VISUAL_GATE_MIN_COMPARISONS ?? '1') || 1;

  const records = readJsonlDir<Record<string, unknown>>(join(RAW, 'visual'));

  let pass = 0;
  let fail = 0;
  let skip = 0;
  let unknown = 0;
  const failures: GateResult['failures'] = [];

  for (const r of records) {
    const status = normalizeStatus(r.status);
    const isDiff = status === 'FAIL' || bucket(r.failure_bucket) === VISUAL_DIFF_BUCKET;
    if (isDiff) {
      fail += 1;
      failures.push({
        snapshot_id: str(r.snapshot_id),
        diff_ratio: num(r.diff_ratio),
        threshold: num(r.threshold),
        diff_path: str(r.diff_path),
      });
      continue;
    }
    if (status === 'PASS') pass += 1;
    else if (status === 'SKIP') skip += 1;
    else unknown += 1;
  }

  const compared = pass + fail;

  let passed: boolean;
  let reason: string;
  if (updateBaseline) {
    passed = true;
    reason = 'UPDATE_VISUAL_BASELINE=true — baselines (re)generated; gate skipped.';
  } else if (fail > 0) {
    passed = false;
    reason = `${fail} visual snapshot(s) drifted beyond threshold.`;
  } else if (compared < minComparisons) {
    passed = false;
    reason =
      `Only ${compared} real comparison(s) (PASS+FAIL); expected >= ${minComparisons}. ` +
      `Likely the AUT was unreachable (captures SKIP), so nothing was actually validated.`;
  } else {
    passed = true;
    reason = `${pass} snapshot(s) matched baselines; no drift.`;
  }

  return {
    total: records.length,
    pass,
    fail,
    skip,
    unknown,
    compared,
    minComparisons,
    failures,
    updateBaseline,
    passed,
    reason,
  };
}

export function run(): GateResult {
  const result = evaluate();
  /* eslint-disable no-console */
  console.log('--- Visual gate ---------------------------------------------');
  console.log(
    `records=${result.total} pass=${result.pass} fail=${result.fail} ` +
      `skip=${result.skip} unknown=${result.unknown} compared=${result.compared} ` +
      `min=${result.minComparisons}`,
  );
  for (const f of result.failures) {
    console.log(
      `  DRIFT: ${f.snapshot_id} diff_ratio=${f.diff_ratio} threshold=${f.threshold}` +
        (f.diff_path ? ` diff=${f.diff_path}` : ''),
    );
  }
  console.log(`${result.passed ? 'PASS' : 'FAIL'}: ${result.reason}`);
  console.log('-------------------------------------------------------------');
  /* eslint-enable no-console */
  return result;
}

if (require.main === module) {
  const result = run();
  process.exitCode = result.passed ? 0 : 1;
}
