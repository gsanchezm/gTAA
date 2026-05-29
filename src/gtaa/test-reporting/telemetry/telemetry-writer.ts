/**
 * Reporting layer: appends raw telemetry to the metrics/raw/** JSONL streams and
 * writes the run manifest. Append-only and crash-safe so metrics are never lost
 * even when a scenario fails (mirrors the CI `if: always()` upload policy).
 *
 * Secrets are never written here — callers hash sensitive payloads before
 * passing them in (see hashing helpers below).
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type {
  ApiContractEvent,
  GatlingSummary,
  RunManifest,
  TelemetryEvent,
  VisualContractEvent,
} from '../../shared/types';
import { runIdentity } from './run-context';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const RAW = join(REPO_ROOT, 'metrics', 'raw');

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function appendJsonl(filePath: string, record: unknown): void {
  ensureDir(filePath);
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

/** Stable hash for sensitive payloads (passwords, card numbers, headers). */
export function hashPayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `sha256:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;
}

export function writeRunManifest(extra: Partial<RunManifest> = {}): string {
  const id = runIdentity();
  const manifest: RunManifest = {
    ...id,
    generated_at: new Date().toISOString(),
    ci_provider: process.env.GITHUB_ACTIONS ? 'github-actions' : null,
    platform: process.env.GTAA_PLATFORM ?? 'unknown',
    viewport: process.env.GTAA_PLATFORM ?? null,
    driver: process.env.GTAA_DRIVER ?? null,
    tags: [],
    environment: process.env.TARGET_ENVIRONMENT ?? 'local',
    node_version: process.version,
    os: `${process.platform}-${process.arch}`,
    ...extra,
  };
  const file = join(RAW, 'run-manifest', `${id.run_id}.json`);
  ensureDir(file);
  writeFileSync(file, JSON.stringify(manifest, null, 2), 'utf8');
  return file;
}

export function emitToolEvent(event: TelemetryEvent): void {
  appendJsonl(join(RAW, 'tool-events', `${event.run_id}.jsonl`), event);
}

export function emitApiEvent(event: ApiContractEvent): void {
  appendJsonl(join(RAW, 'api', `${event.run_id}.jsonl`), event);
}

export function emitVisualEvent(event: VisualContractEvent): void {
  appendJsonl(join(RAW, 'visual', `${event.run_id}.jsonl`), event);
}

export function writeGatlingSummary(summary: GatlingSummary): string {
  const file = join(RAW, 'gatling', summary.run_id, 'summary.json');
  ensureDir(file);
  writeFileSync(file, JSON.stringify(summary, null, 2), 'utf8');
  return file;
}

export { REPO_ROOT, RAW };
