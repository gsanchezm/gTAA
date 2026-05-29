# gTAA Layered Architecture

This repository implements a layered **General Test Automation Architecture
(gTAA)**. The codebase is organized into the canonical gTAA layers, each with a
single responsibility, composed through direct, typed interfaces. It is the
`GTAA_BASELINE` in the paired experiment described in
[`../research/gtaa-baseline-protocol.md`](../research/gtaa-baseline-protocol.md).

## Folder structure

All source lives under `src/gtaa/`. One line per layer:

```
src/gtaa/
├── test-generation/        # Test artifacts & contracts (the "what to test")
│   ├── features/           # Gherkin feature files (scenarios + scenario outlines)
│   ├── contracts/
│   │   ├── locators/       # <domain>.locators.json — declarative selectors
│   │   ├── api/            # <domain>.api.contract.json — endpoint/request/assert specs
│   │   └── visual/         # <domain>.visual.json — snapshot/region/mask specs
│   └── test-data/          # users.json / users.ts — parameterized, isolated test data
│
├── test-definition/        # Glue + business intent (the "how a scenario flows")
│   ├── step-definitions/   # Cucumber steps; thin, delegate to use cases
│   ├── usecases/           # Platform-agnostic flows driving the execution layer
│   └── support/            # world.ts (per-scenario World) + hooks.ts (atomic lifecycle)
│
├── test-execution/         # Concrete tool executors (the "drive the tool")
│   ├── playwright/         # PlaywrightWebExecutor (desktop + responsive web)
│   ├── appium/             # AppiumAndroidExecutor, AppiumIosExecutor (+ shared base)
│   ├── api/                # ApiExecutor + contract loader + JSON-path engine
│   ├── gatling/            # GatlingExecutor + simulations + feeder generation
│   └── pixelmatch/         # PixelmatchVisualExecutor + image diff
│
├── test-adaptation/        # Platform abstraction (the "talk to the platform")
│   ├── drivers/            # ui-driver.ts (interface), driver-factory.ts (switch),
│   │                       #   execution-context.ts, appium/mobile-actions.ts
│   ├── locators/           # locator-resolver.ts — resolves logical refs to selectors
│   ├── clients/            # http-client.ts — HTTP transport for the API executor
│   └── visual/             # visual-contract.ts, baseline-policy.ts, visual-paths.ts
│
├── test-reporting/         # Telemetry & metrics emission (the "record what happened")
│   └── telemetry/          # logger.ts, run-context.ts, telemetry-writer.ts
│
├── configuration/          # Environment & tool configuration (single source of truth)
│   ├── environments/       # env.ts — typed accessors for all environment config
│   └── tools/              # playwright.config.ts, gatling.config.ts
│
└── shared/                 # Architecture-neutral contracts shared by every layer
    ├── types.ts            # RunIdentity, TelemetryEvent, ApiContractEvent, ... ; ArchitectureType
    └── failure-buckets.ts  # 14 standardized failure buckets + ClassifiedError
```

## Layer responsibilities

| Layer | Responsibility |
| --- | --- |
| **Test Generation** | Owns all test artifacts and declarative contracts: feature files, scenarios and scenario outlines, locator/API/visual contracts, and parameterized test data. Contains no execution logic. |
| **Test Definition** | Binds Gherkin steps to platform-agnostic use cases and owns the per-scenario lifecycle. Step definitions are thin and delegate to use cases; use cases depend only on the Test Adaptation `UiDriver` interface and the typed executors, never on a concrete tool. |
| **Test Execution** | Concrete executors that drive each tool: `PlaywrightWebExecutor`, `AppiumAndroidExecutor`, `AppiumIosExecutor`, `ApiExecutor`, `GatlingExecutor`, `PixelmatchVisualExecutor`. Each executor implements a shared interface (`UiDriver`) or exposes a typed entry point (API, performance, visual). |
| **Test Adaptation** | Isolates platform/tool specifics behind stable abstractions: the `UiDriver` interface, the `createUiDriver` factory, the locator resolver (logical ref → concrete selector), the HTTP client, and visual region/mask resolution. This is the only layer that knows platform-specific selectors and session details. |
| **Test Reporting** | Emits telemetry at scenario, step, and tool level; classifies failures into standardized buckets; writes the run manifest and the raw JSONL/JSON metric streams. Append-only and crash-safe so metrics survive failing scenarios. |
| **Configuration / Environment Management** | Centralizes all environment and tool configuration. `env.ts` is the single source of truth; adapters never read `process.env` directly. Tool config files hold tool-specific settings. |

## Tool adapter design

Each tool has its own executor service in the Test Execution layer. UI tools
(Playwright web, Appium Android, Appium iOS) implement a single shared
contract, the `UiDriver` interface (`test-adaptation/drivers/ui-driver.ts`):

```ts
export interface UiDriver {
  readonly platform: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  navigate(url: string): Promise<void>;
  click(ref: string): Promise<void>;
  type(ref: string, text: string): Promise<void>;
  getText(ref: string): Promise<string>;
  isVisible(ref: string): Promise<boolean>;
  waitForVisible(ref: string, timeoutMs?: number): Promise<void>;
  captureRegion(ref: string, options?: CaptureOptions): Promise<Buffer>;
  capturePage(options?: CaptureOptions): Promise<Buffer>;
}
```

Composition is performed by a **plain factory** — a simple `switch` over the
active platform in `test-adaptation/drivers/driver-factory.ts`:

```ts
export function createUiDriver(context: ExecutionContext): UiDriver {
  switch (context.platform) {
    case 'desktop':
    case 'responsive': return new PlaywrightWebExecutor(context);
    case 'android':    return new AppiumAndroidExecutor(context);
    case 'ios':        return new AppiumIosExecutor(context);
    // 'api' has no UI driver — API scenarios use ApiExecutor directly.
  }
}
```

Key properties of this design:

- **Direct services per tool.** There is no indirection between a use case and
  an executor: the use case holds a `UiDriver` and calls it.
- **No duplicated selectors.** UI actions take *logical locator refs*
  (`"<domain>.<key>"`, e.g. `login.usernameInput`). The
  `locator-resolver.ts` resolves them through the JSON locator contracts for the
  active platform/viewport. Selectors are never hardcoded in executors or use
  cases.
- **Localized change.** Adding a tool means adding one executor service and one
  `case` to the factory switch — no edits ripple across layers.

## The call flow

A scenario flows top-down through the layers, with each layer depending only on
the one beneath it via a typed interface:

```
feature file (Test Generation)
  → step definition (Test Definition)
    → use case (Test Definition)        // platform-agnostic flow
      → executor service (Test Execution)  // UiDriver / ApiExecutor / ...
        → driver / client (Test Adaptation) // locator resolution, session, HTTP
          → telemetry (Test Reporting)      // scenario/step/tool events
```

Concretely, the login use case (`test-definition/usecases/login.usecase.ts`)
chooses the API or UI path from `world.context`, then either calls
`ApiExecutor.executeEndpoint(...)` or `world.ui()` to obtain a `UiDriver` and
invokes actions on it. The driver resolves locators through the adaptation
layer; the lifecycle hooks emit telemetry around the whole scenario.

## Reporting design

Reporting is driven by the per-scenario hooks (`test-definition/support/hooks.ts`)
and the telemetry writer (`test-reporting/telemetry/telemetry-writer.ts`):

- **Scenario- and step-level telemetry.** `AfterStep` records each step's
  status and duration; `After` records the scenario outcome and duration. Each
  emitted `TelemetryEvent` carries the shared run identity, so every record is
  self-describing.
- **Failure-bucket classification.** On failure, the outcome is classified into
  one of the 14 standardized buckets (`shared/failure-buckets.ts`). Layers throw
  a `ClassifiedError` carrying an explicit bucket; the hooks fall back to
  `classifyError()` for any unclassified error. On success `failure_bucket` is
  `null`.
- **Tool-level telemetry.** The API, visual, and performance executors emit
  their own typed records (`ApiContractEvent`, `VisualContractEvent`,
  `GatlingSummary`) to dedicated raw streams.
- **Metrics never lost on failure.** Writes are append-only and crash-safe, and
  emission is wrapped so telemetry can never break a test run. This mirrors the
  CI `if: always()` upload policy so a failing scenario still produces data.

## Why there is no central router, dynamic loader, or action routing

A layered baseline composes its tools through **direct typed interfaces and a
simple factory**, not through a central dispatcher. There is intentionally:

- **No central router / dispatcher.** Use cases call executors directly through
  the `UiDriver` interface; there is no component that receives an abstract
  request and routes it to a tool.
- **No dynamic tool-loading registry.** Tools are wired at build time via
  `import` and the `switch` in `driver-factory.ts`. There is no runtime
  registration step.
- **No in-process or cross-process action routing.** Actions are ordinary
  method calls on a typed interface — there is no message-passing or
  remote-procedure indirection between a use case and its executor.

This is a deliberate design choice grounded in SOLID, DRY, and KISS:

- **Single Responsibility / Interface Segregation** — each executor implements a
  focused interface; use cases depend only on that interface.
- **Open/Closed via composition** — new tools are added by composition (a new
  service + one factory case), not by modifying a central dispatcher.
- **DRY** — selectors and contracts live once, in the Test Generation contracts,
  and are resolved by the adaptation layer.
- **KISS** — the control flow is a readable top-down call stack, which keeps the
  change impact of adding or modifying a tool localized.

These choices also define what this baseline deliberately does **not** copy from
the TOM reference repository; see
[`../research/gtaa-baseline-protocol.md`](../research/gtaa-baseline-protocol.md)
for the full comparison and rationale.
