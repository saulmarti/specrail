# AI Flow 0.4.0 implementation review

## Verdict

The nine roadmap items are implemented as deterministic workflow controls or risk-selected specialist contracts. They do not add permanent agents or mandatory model passes to trivial tasks.

## Review by roadmap item

### 1. Immutable QA Mission

Product Specifier must write persona, starting point, goal, allowed public interface, success, and failure. Approval stores its SHA-256. QA evidence must reference the same hash; changed missions invalidate approval.

### 2. Failure-to-eval loop

Failures and user rejections are classified and fingerprinted. The threshold is read from project config. A repeated pattern creates a Markdown eval candidate, activation needs explicit user approval, and active evals are routed into future matching phases and Review Bundles.

### 3. Repair limits

Fast / standard / rigorous profiles stop exactly on the configured Nth failed attempt. The workflow stores its resume phase and asks the user instead of continuing an unbounded repair loop.

### 4. Local delivery metrics

Metrics are derived from structured traces and include elapsed time, time to approvals/delivery, phase duration, branch count, repairs, questions, failure categories, QA/customer returns, context growth, and delivery state. Telemetry is local-only.

### 5. Independent visual evaluator

Medium/large or medium+ risk UI work requires a fresh-context Technical Reviewer for proposal and final evidence. Reports bind to canonical evidence digests and must pass fidelity, scope, readability, overflow, clipping, and score checks.

### 6. Project constitution

A principle needs an explicit user approval reference and a deterministic command. Active principles run during Technical Review; their result is registered as evidence. Earlier records migrate with a legacy approval reference.

### 7. Property/mutation by risk

High/critical tasks require property and mutation testing. Reports must record framework/generated case count or mutation score/threshold/total mutants. Scores below the approved threshold are invalid.

### 8. Operational evidence

Relevant operational tasks require logs, traces, and/or metrics according to risk. Evidence identifies environment and scenario; traces require correlation, and metrics require named measures and a sample window.

### 9. Vertical slices

Large features require at least two demonstrable user outcomes. Dependencies must form a DAG. Materialization creates child tasks and maps slice dependencies into task dependencies. Horizontal layer-only slices are rejected.

## Visualize review

The previous interpretation was too static. 0.4.0 requires interactive views and controls while retaining capability discovery, signed sources, actual invocation references, and fallback. It never treats a visualization as primary evidence or as the user’s answer.

## Taste review

The previous validator used three folder-style names that did not match official install/frontmatter names. 0.4.0 uses `gpt-taste`, `redesign-existing-projects`, and `image-to-code`, plus the existing `design-taste-frontend` and image generation names.

## Remaining external risks

- Visualize availability and exact invocation remain host/session dependent.
- Taste v2 is documented as experimental and may evolve; AI Flow validates the local installed contracts rather than hardcoding remote file contents.
- Project-specific property/mutation commands still depend on the project’s own tooling.
- Token counts are not recorded because Codex Desktop does not expose a stable per-task token metric to this CLI.
