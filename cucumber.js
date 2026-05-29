// Cucumber configuration for the gTAA baseline.
// Layered flow: feature -> step-definition -> use case (Test Definition)
//   -> executor (Test Execution) -> driver/client (Test Adaptation) -> telemetry (Test Reporting).
// No microkernel, no proxy, no plugin registry, no intent routing.
module.exports = {
  default: {
    paths: ["src/gtaa/test-generation/features/**/*.feature"],
    requireModule: ["ts-node/register", "tsconfig-paths/register", "dotenv/config"],
    require: [
      "src/gtaa/test-definition/support/**/*.ts",
      "src/gtaa/test-definition/step-definitions/**/*.ts",
    ],
    format: ["progress"],
    formatOptions: { snippetInterface: "async-await" },
    timeout: 300000,
    parallel: 1,
    retry: 0,
  },
};
