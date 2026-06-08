/**
 * Test Execution layer — Gatling simulation orchestrator.
 *
 * Responsibilities:
 *   1. Resolve injection config from the configuration layer.
 *   2. Shell out to the Gatling CLI to run a simulation (the only JVM/CLI-bound
 *      step; isolated here so the rest of the logic stays unit-testable).
 *   3. Parse the resulting stats (pure parser, see stats-parser.ts).
 *   4. Build a normalized GatlingSummary stamped with runIdentity and write it
 *      via the reporting layer.
 *
 * Failure policy: NEVER crash silently. Any run/parse failure still produces a
 * summary with threshold_status UNKNOWN and an explicit failure_bucket
 * (PERFORMANCE_THRESHOLD_FAILURE for threshold breaches, INFRASTRUCTURE_FAILURE
 * for run/parse/IO problems).
 *
 * Direct performance service invocation — no indirection layer. The
 * JVM/CLI dependency is confined to {@link runGatlingCli} so that
 * {@link buildSummary} and the parser can be exercised without Gatling.
 */
// Load .env in THIS (parent) process so appConfig() resolves the real
// API_BASE_URL. Without it the parent injects the localhost default into the
// child env, which then shadows the child's own `-r dotenv/config` (dotenv
// never overrides an already-set var).
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ExecutionStatus, GatlingSummary, RunIdentity } from '../../shared/types';
import { FailureBucket } from '../../shared/failure-buckets';
import { ARCHITECTURE_TYPE } from '../../shared/types';
import { runIdentity } from '../../test-reporting/telemetry/run-context';
import { writeGatlingSummary } from '../../test-reporting/telemetry/telemetry-writer';
import { appConfig } from '../../configuration/environments/env';
import {
  activeProfile,
  maxKoRate,
  p95ThresholdMs,
  resolveInjection,
  type LoadProfile,
} from '../../configuration/tools/gatling.config';
import {
  parseStatsFromConsole,
  parseStatsFromReportDir,
  type ParsedStats,
} from './stats-parser';

/** Repo root, resolved relative to this file's location. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/** Folder holding the simulation bundles passed to the Gatling CLI. */
const SOURCES_FOLDER = 'src/gtaa/test-execution/gatling/simulations';

/** Path to the bundled Gatling CLI entry point. */
const GATLING_BIN = join(REPO_ROOT, 'node_modules', '@gatling.io', 'cli', 'target', 'index.js');

/** Base directory where the Gatling CLI writes its per-run reports. */
const GATLING_TARGET = join(REPO_ROOT, 'target', 'gatling');

export interface RunSimulationOptions {
  /** Simulation name (file name without the .gatling.ts suffix). */
  simulationName: string;
  /** Load profile (smoke | load | stress). */
  profile: LoadProfile;
}

/** Outcome of the JVM/CLI-bound run step (isolated for testability). */
export interface CliRunResult {
  exitCode: number;
  reportDir: string;
  /** Captured CLI stdout+stderr (carries the "Global Information" summary). */
  output: string;
}

/** Returns the most recently created report directory under target/gatling. */
export function latestReportDir(baseDir: string = GATLING_TARGET): string {
  if (!existsSync(baseDir)) return baseDir;

  const dirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, created: statSync(join(baseDir, e.name)).birthtimeMs }))
    .sort((a, b) => b.created - a.created);

  return dirs.length > 0 ? join(baseDir, dirs[0].name) : baseDir;
}

/**
 * JVM/CLI boundary — spawns the Gatling CLI as a child process. This is the ONLY
 * function that touches the JVM/CLI; everything else is pure logic over its
 * result so unit tests can stub this out.
 */
export function runGatlingCli(
  options: RunSimulationOptions,
  env: NodeJS.ProcessEnv,
): Promise<CliRunResult> {
  const args = [
    '-r',
    'dotenv/config',
    GATLING_BIN,
    'run',
    '--sources-folder',
    SOURCES_FOLDER,
    '--simulation',
    options.simulationName,
  ];

  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      cwd: REPO_ROOT,
      // Capture stdout/stderr so we can parse Gatling's console summary, while
      // still streaming it to the parent so live progress stays visible. stdin
      // is inherited (the CLI is non-interactive here).
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({ exitCode: code ?? 1, reportDir: latestReportDir(), output });
    });
  });
}

/**
 * Resolves PASS/FAIL/UNKNOWN against the configured thresholds.
 *
 * Once stats have parsed successfully, a non-zero CLI exit code is NOT treated
 * as infrastructure failure: Gatling exits non-zero when assertions/KO rates are
 * breached, which is a PERFORMANCE_THRESHOLD_FAILURE, not an INFRASTRUCTURE one.
 * Genuine run/parse failures are handled upstream in the orchestrator's catch
 * block (which never reaches here). The exit code is therefore folded into the
 * threshold evaluation: a non-zero exit with stats that otherwise look healthy
 * is still reported as a threshold FAIL.
 */
export function classifyThreshold(
  stats: ParsedStats,
  cliExitCode: number,
  thresholds: { p95Ms: number; maxKoRate: number },
): { status: ExecutionStatus; bucket: FailureBucket | null } {
  const koExceeded = stats.koRate > thresholds.maxKoRate;
  const p95 = stats.responseTime.p95;
  const p95Exceeded = p95 !== null && p95 > thresholds.p95Ms;

  if (koExceeded || p95Exceeded || cliExitCode !== 0) {
    return { status: 'FAIL', bucket: FailureBucket.PERFORMANCE_THRESHOLD_FAILURE };
  }
  return { status: 'PASS', bucket: null };
}

/**
 * Builds a normalized GatlingSummary from parsed stats. Pure — no IO, no JVM —
 * so it is independently unit-testable. Stamped with the shared run identity and
 * architecture_type GTAA_BASELINE.
 */
export function buildSummary(input: {
  identity: RunIdentity;
  simulationName: string;
  stats: ParsedStats;
  durationMs: number;
  threshold: { status: ExecutionStatus; bucket: FailureBucket | null };
}): GatlingSummary {
  const { identity, simulationName, stats, durationMs, threshold } = input;
  return {
    ...identity,
    architecture_type: ARCHITECTURE_TYPE,
    tool_name: 'gatling',
    simulation_name: simulationName,
    request_count: stats.requests.total,
    success_count: stats.requests.ok,
    failure_count: stats.requests.ko,
    mean_response_time_ms: stats.responseTime.mean,
    p95_response_time_ms: stats.responseTime.p95,
    max_response_time_ms: stats.responseTime.max,
    threshold_status: threshold.status,
    duration_ms: durationMs,
    failure_bucket: threshold.bucket,
  };
}

/**
 * Builds a degraded summary used when the run could not be executed or the
 * stats could not be parsed. threshold_status is UNKNOWN and the failure_bucket
 * defaults to INFRASTRUCTURE_FAILURE.
 */
export function buildFailureSummary(input: {
  identity: RunIdentity;
  simulationName: string;
  durationMs: number;
  bucket: FailureBucket;
}): GatlingSummary {
  const { identity, simulationName, durationMs, bucket } = input;
  return {
    ...identity,
    architecture_type: ARCHITECTURE_TYPE,
    tool_name: 'gatling',
    simulation_name: simulationName,
    request_count: 0,
    success_count: 0,
    failure_count: 0,
    mean_response_time_ms: null,
    p95_response_time_ms: null,
    max_response_time_ms: null,
    threshold_status: 'UNKNOWN',
    duration_ms: durationMs,
    failure_bucket: bucket,
  };
}

/**
 * Orchestrates a single simulation run end to end and returns the resulting
 * summary (also persisted to metrics/raw/gatling/<run-id>/summary.json).
 * Never throws — failures are captured into the summary's bucket/status.
 */
export async function runSimulation(options: RunSimulationOptions): Promise<GatlingSummary> {
  const identity = runIdentity();
  const injection = resolveInjection(options.profile);
  const startedAt = Date.now();

  // The simulations read these env vars at bundle-runtime via getEnvironmentVariable.
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    API_BASE_URL: appConfig().apiBaseUrl,
    PERF_PROFILE: options.profile,
    PERF_USERS: String(injection.users),
    PERF_DURATION: String(injection.duration),
  };

  let summary: GatlingSummary;
  try {
    const { exitCode, reportDir, output } = await runGatlingCli(options, childEnv);
    // Prefer the CLI's console "Global Information" block — the @gatling.io JS
    // bundle (Gatling 3.14) does not emit js/stats.json. Fall back to a
    // stats.json reader when present (e.g. a JVM Gatling report) so the parser
    // stays tolerant across tool versions.
    const stats = parseStatsFromConsole(output) ?? parseStatsFromReportDir(reportDir);
    const threshold = classifyThreshold(stats, exitCode, {
      p95Ms: p95ThresholdMs(),
      maxKoRate: maxKoRate(),
    });
    summary = buildSummary({
      identity,
      simulationName: options.simulationName,
      stats,
      durationMs: Date.now() - startedAt,
      threshold,
    });
  } catch (err) {
    // Run or parse failed — emit a degraded summary so metrics are never lost.
    process.stderr.write(
      `[run-simulation] "${options.simulationName}" failed: ${(err as Error).message}\n`,
    );
    summary = buildFailureSummary({
      identity,
      simulationName: options.simulationName,
      durationMs: Date.now() - startedAt,
      bucket: FailureBucket.INFRASTRUCTURE_FAILURE,
    });
  }

  // Persist the summary regardless of outcome (best-effort, never crash silently).
  try {
    writeGatlingSummary(summary);
  } catch (writeErr) {
    process.stderr.write(
      `[run-simulation] failed to write summary: ${(writeErr as Error).message}\n`,
    );
  }

  return summary;
}

/** CLI entry point: simulation selected via PERF_SIMULATION (default checkout-load). */
async function main(): Promise<void> {
  const simulationName = process.env.PERF_SIMULATION || 'checkout-load';
  const profile = activeProfile();
  const summary = await runSimulation({ simulationName, profile });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  // Non-zero exit on FAIL/UNKNOWN so CI surfaces threshold breaches.
  process.exitCode = summary.threshold_status === 'PASS' ? 0 : 1;
}

if (require.main === module) {
  void main();
}
