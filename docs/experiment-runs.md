# gTAA Experiment: running the 100-run batch

The primary workflow is `.github/workflows/gtaa-experiment.yml`. It is
manual-dispatch friendly (single run from the Actions UI) but is designed to be
driven 100 times for the paired experiment. Each invocation is one independent
workflow run that produces its own metrics dataset, traceable via
`EXPERIMENT_BATCH_ID` + `RUN_INDEX`.

## Dispatch inputs

| Input                    | Type    | Default       | Purpose                                   |
| ------------------------ | ------- | ------------- | ----------------------------------------- |
| `experiment_batch_id`    | string  | `batch-local` | Groups all runs of one batch.             |
| `run_index`              | string  | `1`           | Index of this run within the batch.       |
| `update_visual_baseline` | boolean | `false`       | Refresh visual baselines instead of diff. |
| `target_environment`     | choice  | `local`       | `local` / `staging` / `prod`.             |

## Option 1 — external driver loop (recommended for 100 runs)

One workflow run (one dataset) per index. Bash / GitHub CLI:

```bash
BATCH="batch-$(date +%Y%m%d-%H%M)"
for i in $(seq 1 100); do
  gh workflow run gtaa-experiment.yml \
    -f experiment_batch_id="$BATCH" \
    -f run_index="$i" \
    -f target_environment="staging" \
    -f update_visual_baseline=false
  # Optional: throttle so you don't exceed concurrent-run limits.
  sleep 5
done
```

PowerShell:

```powershell
$batch = "batch-$(Get-Date -Format yyyyMMdd-HHmm)"
1..100 | ForEach-Object {
  gh workflow run gtaa-experiment.yml `
    -f experiment_batch_id=$batch `
    -f run_index=$_ `
    -f target_environment=staging `
    -f update_visual_baseline=false
  Start-Sleep -Seconds 5
}
```

Collect results afterwards:

```bash
gh run list --workflow gtaa-experiment.yml --limit 100
gh run download <run-id> --name gtaa-metrics-consolidated --dir ./results/$BATCH
```

## Option 2 — single manual run

Use the Actions UI -> "gTAA Experiment" -> "Run workflow", fill in
`experiment_batch_id` and `run_index`.

## Option 3 — matrix fan-out (example)

The `matrix-driver-example` job in the workflow shows fanning out several
indices from a single dispatch. It is gated behind a `RUN_MATRIX=true`
workflow/repository variable so it stays off by default. For statistically
independent runs prefer Option 1, since the matrix shares a single workflow run.

## Notes

- Tool jobs are resilient: test execution uses `|| true` / `continue-on-error`
  so the metrics pipeline and artifact upload always run, even without a live
  app or device in CI.
- Secrets (API base URLs, tokens, device-lab credentials) are referenced via
  `${{ secrets.* }}` placeholders in the workflow; never commit them in plaintext.
