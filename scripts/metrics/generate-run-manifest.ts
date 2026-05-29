/**
 * generate-run-manifest.ts
 *
 * Writes metrics/raw/run-manifest/<run-id>.json by delegating to the foundation
 * writer (src/gtaa/test-reporting/telemetry/telemetry-writer.writeRunManifest),
 * so the manifest shape and identity resolution stay identical to what the test
 * run itself would emit. architecture_type is GTAA_BASELINE via runIdentity().
 *
 * Run: tsx scripts/metrics/generate-run-manifest.ts
 */
import { writeRunManifest } from '../../src/gtaa/test-reporting/telemetry/telemetry-writer';

export function run(): string {
  return writeRunManifest();
}

if (require.main === module) {
  const file = run();
  // eslint-disable-next-line no-console
  console.log(`run-manifest written: ${file}`);
}
