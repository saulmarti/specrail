# Incremental Revision Loop

Small changes discovered while looking at or using an implemented result are not a new feature and should not replay the full SpecRail workflow.

SpecRail models that feedback as an immutable `REV-*` record attached to the existing task.

## The default post-approval loop

When the user requests a bounded change after specification approval—during Builder review, Technical Review, QA, Target Audience, Final Approval, or pre-merge Delivery—SpecRail uses the smallest safe path. Final Approval is the most common case, not a technical restriction:

```text
Final Approval
    ↓
REV-* request
    ↓
Builder delta
    ↓
targeted post-implementation validation
    ↓
Final Approval
```

The approved specification, architecture, QA Mission, Technical Review, Target Audience review, and Product Owner review remain authoritative unless the revision actually changes something they depend on.

A revision is not counted as a repair attempt. User refinement is normal product iteration, not evidence that the agent failed.

## Implement first; do not freeze an unstable idea into a test

A bounded revision has an explicit test policy:

```text
pre-implementation test planning: not required
new permanent tests: decide after stabilization
existing tests: run after implementation only when cheap and relevant
```

This is intentional. A request such as “reduce this spacing”, “change this wording”, or “make this interaction feel slightly different” is still being explored. Designing a new test before seeing the revised behavior would spend context and can prematurely encode a result the user may immediately refine again.

The Builder therefore implements the requested delta first. SpecRail then asks for the cheapest direct evidence capable of validating that delta. Once the behavior is accepted/stable, a permanent regression test can be added when the project risk or contract makes one valuable. The revision loop itself never creates a speculative test merely to satisfy process ceremony.

This exception applies only to bounded `REV-*` work. Normal approved implementation continues to follow the task's existing test/QA policy.

## Selective revalidation

A revision declares what changed and which evidence is invalidated. SpecRail does not assume that returning to Builder invalidates every later phase.

Examples:

| Revision | Typical revalidation |
| --- | --- |
| UI spacing/color/copy | fresh implemented screenshot + UI layout validation |
| small behavior refinement | targeted running-app/command validation |
| implementation defect | targeted proof that the defect is fixed |
| AC-specific refinement | fresh evidence for only the affected `AC-*` |

Unaffected historical evidence remains valid.

The design rule is:

> A change invalidates artifacts, not phases.

Phases are entered only when they are needed to regenerate or validate an invalidated artifact.


## Declarative artifact dependency graph and real delta routing

`REV-*` v3 separates **human description** from **mechanical impact**. `classification` is only a label shown in logs/review surfaces; it is never an input to routing. A new label therefore requires no new switch/case or dependency mapping.

At revision start SpecRail derives provisional `changeSignals` from concrete context: the request text, explicitly named affected files, repository surfaces, and optional explicit semantic signals. It then records `invalidatedArtifacts`, `requiredPhases`, and `preservedArtifacts` through `ARTIFACT_DEPENDENCY_GRAPH`.

Before Builder edits, SpecRail also seals a lightweight hash snapshot of the current workspace (excluding runtime/build/cache directories). When Builder finishes, SpecRail compares that baseline with the current workspace and obtains the files changed **during this revision**, independently of earlier task changes. It then recomputes the semantic signals and dependency plan from that actual delta. The post-Builder plan is authoritative.

```text
request + declared files/signals + task surface
        ↓
provisional change signals
        ↓
Builder
        ↓
revision baseline ↔ current workspace
        ↓
actual revision changed files
        ↓
final semantic signals
        ↓
invalidated artifacts
        ↓
producer/validator phases
        ↓
minimum safe route
```

This closes the remaining classification-coupling problem: two revisions with identical request/files but different classification labels produce the same route. Conversely, a vague request that actually modifies CSS, behavior code, a migration, or a security boundary is routed according to the real delta rather than the label. Baseline snapshot integrity is checked before the delta is trusted.

If the actual implementation reveals material signals (`architecture`, `contract`, `security`, `data-model`, or `product-outcome`), Builder completion fails closed and the change must move to an Amendment or the narrowest governed return.

The invariant is mechanical: **context → real delta → change signals → invalidated artifacts → producer/validator phases → minimum route**. Legacy schema-v1/v2 revision records remain readable and integrity-checked.

## Implementation generations

Every completed Builder pass advances the implementation generation:

```text
GEN-001
GEN-002
GEN-003
```

Implementation-dependent evidence records the generation and implementation digest it proves. Evidence invalidated by the active revision must belong to the current generation; SpecRail cannot satisfy a revised result with a screenshot or QA artifact from the previous implementation.

This gives the incremental loop both properties it needs:

- old unaffected evidence can be preserved to save work and tokens;
- old affected evidence cannot be reused accidentally.

## Revision Delta Capsule

Builder receives a compact Revision Delta Capsule instead of the full planning capsule. It contains only:

- the user-authorized request;
- revision classification (human-facing label only);
- provisional semantic signals and, after Builder, the actual revision-delta files;
- affected ACs/files and allowed additions;
- the governed artifacts that remain unchanged;
- the evidence that must be refreshed;
- the implement-first testing policy;
- escalation boundaries.

The agent should not replay product research, architecture reasoning, the full QA Mission, or previous chat history simply because a small final-review refinement was requested.

## Material changes fail closed

The incremental loop is deliberately narrow. Architecture redesigns, data/schema migrations, authentication/authorization/security/privacy changes, new product outcomes or user flows, breaking contracts, and similarly material changes cannot be smuggled through a `REV-*` fast path.

Those changes must use an Amendment or return to the narrowest governed specification/design phase that actually needs to change.

If the user intentionally wants the old broad return behavior from Final Approval, the CLI supports `--full-return`.

## CLI inspection

Normal users can request changes naturally at Final Approval; the orchestrator should choose the revision path automatically for bounded feedback. The CLI exists for inspection and deterministic automation:

```bash
specrail revision status TASK-0042
specrail revision list TASK-0042

specrail revision start TASK-0042 \
  --note 'Reduce the card padding and strengthen the selected state' \
  --class ui-refinement \
  --signals visual-output \
  --ac AC-004
```

`--signals` is optional and provides direct semantic context; routing still gets recomputed from the real post-Builder delta. `--class` is descriptive only. A final rejection to Builder also defaults to the incremental loop. `--full-return` opts out when a broad replay is intentionally required.
