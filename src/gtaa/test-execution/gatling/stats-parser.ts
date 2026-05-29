/**
 * Test Execution layer — Gatling stats parser (pure, JVM-free).
 *
 * This module is intentionally free of any JVM/CLI dependency: it is a pure
 * function over a Gatling stats payload (a `js/stats.json` file path OR its raw
 * string content). Keeping the parser isolated from the runner makes the metric
 * extraction independently unit-testable without ever launching Gatling.
 *
 * Gatling writes per-run reports to: target/gatling/<run>/js/stats.json
 * The relevant numbers live under the top-level `stats` group object:
 *   numberOfRequests.{total,ok,ko}
 *   meanResponseTime.total
 *   percentiles3.total   (Gatling's p95)
 *   maxResponseTime.total
 *
 * Direct parsing — no indirection layer.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Normalized response-time statistics, all in milliseconds. */
export interface ResponseTimeStats {
  mean: number | null;
  p95: number | null;
  max: number | null;
}

/** Normalized request counts for a simulation run. */
export interface RequestCounts {
  total: number;
  ok: number;
  ko: number;
}

/** Fully parsed simulation metrics, tool-neutral and serializable. */
export interface ParsedStats {
  requests: RequestCounts;
  responseTime: ResponseTimeStats;
  koRate: number;
}

/** Minimal shape of the Gatling stats group node we read from. */
interface GatlingStatGroup {
  numberOfRequests?: { total?: number; ok?: number; ko?: number };
  meanResponseTime?: { total?: number };
  percentiles3?: { total?: number };
  maxResponseTime?: { total?: number };
}

interface GatlingStatsFile {
  stats?: GatlingStatGroup;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Pure parser over a raw Gatling stats.json string. Throws on malformed JSON so
 * the caller can classify the failure; never reads the filesystem.
 */
export function parseStatsContent(content: string): ParsedStats {
  const raw = JSON.parse(content) as GatlingStatsFile | GatlingStatGroup;
  // The file has a top-level "stats" group; tolerate a flattened shape too.
  const group: GatlingStatGroup =
    (raw as GatlingStatsFile).stats ?? (raw as GatlingStatGroup);

  const requests: RequestCounts = {
    total: numberOrZero(group.numberOfRequests?.total),
    ok: numberOrZero(group.numberOfRequests?.ok),
    ko: numberOrZero(group.numberOfRequests?.ko),
  };

  const responseTime: ResponseTimeStats = {
    mean: numberOrNull(group.meanResponseTime?.total),
    p95: numberOrNull(group.percentiles3?.total),
    max: numberOrNull(group.maxResponseTime?.total),
  };

  const koRate = requests.total > 0 ? requests.ko / requests.total : 0;

  return { requests, responseTime, koRate };
}

/** Resolves the conventional stats.json path inside a Gatling report dir. */
export function statsFilePath(reportDir: string): string {
  return join(reportDir, 'js', 'stats.json');
}

/**
 * Reads and parses a Gatling report directory's stats.json. Pure relative to a
 * given path (only side effect is the read). Throws if the file is missing or
 * malformed so the orchestrator can classify the failure bucket.
 */
export function parseStatsFromReportDir(reportDir: string): ParsedStats {
  const file = statsFilePath(reportDir);
  if (!existsSync(file)) {
    throw new Error(`Gatling stats.json not found at ${file}`);
  }
  return parseStatsContent(readFileSync(file, 'utf8'));
}
