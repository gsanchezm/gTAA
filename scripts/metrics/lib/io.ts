/**
 * Shared, deterministic IO helpers for every metrics + quality script.
 * Keeping this in one place enforces DRY across the processing scripts and
 * guarantees identical CSV quoting/ordering (reproducibility requirement).
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const REPO_ROOT = resolve(__dirname, '..', '..', '..');
export const METRICS = join(REPO_ROOT, 'metrics');
export const RAW = join(METRICS, 'raw');
export const PROCESSED = join(METRICS, 'processed');
export const SUMMARY = join(METRICS, 'summary');

export function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function ensureDirExists(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** CSV-escape a single cell deterministically (RFC-4180 style). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Write rows (array of objects) to a CSV with a fixed column order. */
export function writeCsv(
  filePath: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): void {
  ensureDir(filePath);
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')).join('\n');
  writeFileSync(filePath, rows.length ? `${header}\n${body}\n` : `${header}\n`, 'utf8');
}

export function appendLine(filePath: string, line: string): void {
  ensureDir(filePath);
  appendFileSync(filePath, `${line}\n`, 'utf8');
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeText(filePath: string, text: string): void {
  ensureDir(filePath);
  writeFileSync(filePath, text, 'utf8');
}

/** Read every *.jsonl line across a directory into typed records. */
export function readJsonlDir<T = Record<string, unknown>>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const text = readFileSync(join(dir, name), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as T);
      } catch {
        /* skip malformed lines; never crash the pipeline */
      }
    }
  }
  return out;
}

/** Read every *.json file in a directory. */
export function readJsonDir<T = Record<string, unknown>>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  const out: T[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), 'utf8')) as T);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(ext))
    .map((n) => join(dir, n));
}

/** Percentile (linear interpolation) over a numeric array. */
export function percentile(values: number[], p: number): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];
  const rank = (p / 100) * (xs.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (rank - lo);
}

export function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
