/**
 * Resolves the shared run identity (architecture_type, experiment pairing fields,
 * git/CI context) once per process. Every telemetry/metric record is stamped with
 * this identity so TOM and gTAA runs can be paired by
 * (experiment_batch_id, run_index, tool_name).
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ARCHITECTURE_TYPE, type RunIdentity, type ToolName } from '../../shared/types';
import { str } from '../../configuration/environments/env';

function safeGit(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

function resolveToolName(): ToolName | string {
  const explicit = str('TOOL_NAME');
  if (explicit) return explicit;
  const driver = str('GTAA_DRIVER', 'playwright');
  const platform = str('GTAA_PLATFORM', 'desktop');
  if (driver === 'api') return 'api';
  if (driver === 'appium') return platform === 'ios' ? 'appium-ios' : 'appium-android';
  return 'playwright';
}

let cached: RunIdentity | null = null;

export function runIdentity(): RunIdentity {
  if (cached) return cached;

  const runId = str('GTAA_RUN_ID') || `${str('GTAA_PLATFORM', 'run')}-${randomUUID()}`;
  const commit = str('GITHUB_SHA') || safeGit('git rev-parse HEAD');
  const branch =
    str('GITHUB_REF_NAME') || safeGit('git rev-parse --abbrev-ref HEAD');
  const runIndexRaw = str('RUN_INDEX');

  cached = {
    architecture_type: ARCHITECTURE_TYPE,
    repository_name: str('REPOSITORY_NAME', 'gTAA'),
    experiment_batch_id: str('EXPERIMENT_BATCH_ID', 'local-batch'),
    workflow_run_id: str('GITHUB_RUN_ID') || null,
    workflow_attempt: str('GITHUB_RUN_ATTEMPT') || null,
    job_name: str('GITHUB_JOB') || str('JOB_NAME') || null,
    tool_name: resolveToolName(),
    run_id: runId,
    run_index: runIndexRaw === '' ? null : Number(runIndexRaw),
    commit_sha: commit,
    branch,
    timestamp: new Date().toISOString(),
  };
  return cached;
}

/** Override the cached identity (used by standalone scripts/tests). */
export function setRunIdentity(identity: Partial<RunIdentity>): RunIdentity {
  cached = { ...runIdentity(), ...identity };
  return cached;
}
