# Product Intelligence Layer

**Status:** Implemented on the 0.9.1 codebase; pending publication in the next package release.

SpecRail Product Intelligence adds two independent product roles around the deterministic delivery workflow:

- **Project Product Owner** — a persistent project-level product guardian that reviews both the proposed task before specification **and the delivered outcome before final approval**.
- **Target Audience Agent** — one or more configured audience profiles that validate the completed result through its public interface after QA.

These roles do not replace specification, QA, evidence, Scope Guard, or human product judgment. They add product-value and audience-understanding checks that technical gates cannot prove.

## Governed product loop

```text
request
  ↓
Project Product Owner (build / revise / do-not-build)
  ↓
specification → implementation → technical review → QA
  ↓
Target Audience (configured primary personas, fresh sessions)
  ↓
Final Product Owner (ship / revise / do-not-ship)
  ↓
Final Review Bundle → final approval → delivery
```

The pre-spec Product Owner judges whether the work should be built as proposed; Target Audience challenges whether the delivered behavior is understandable and useful; the final Product Owner judges whether the real outcome still serves the product after seeing the audience evidence. The three gates have different authority and are kept separate in persisted state.

## Project Product Owner

New projects persist product context in:

- `.ai/project/product.md`
- `.ai/project/product-owner.md`
- `.ai/project/users.md`

On a new project, SpecRail does not let a task-level Product Owner verdict run against placeholder product files. `next` first routes `bootstrap-product-intelligence-context` to the Product Owner specialist so `product.md`, `product-owner.md`, and `users.md` become concrete. Product Specifier then completes repository architecture/runbook context. Only after the complete project context is ready does the Project Product Owner record a structured task review with one verdict:

- `build`
- `revise`
- `do-not-build`

A non-`build` verdict is a recommendation, not authority to cancel the task. It creates a human product-decision gate. In `Guided`, even a clean `build` verdict is presented to the user and must be explicitly acknowledged before Product Specifier completion; `Autonomous` and `Headless` may continue past a clean `build` without interruption. The review becomes stale when the task Need or product/owner/users context changes.

The Product Owner artifact is content-digested and must exactly match the canonical `Product Owner Review` task section. The approved Product Owner review is also included in the governed specification hash, so manual JSON/Markdown edits or later implementation cannot silently reinterpret the product judgment after approval.

### Final Product Owner outcome review

After QA and any required Target Audience validation, SpecRail routes the task to the same persistent Product Owner for a second, outcome-focused review **before final approval**. This review asks whether the real delivered result still creates the approved value and remains coherent with product principles and the audience findings. It returns `ship`, `revise`, or `do-not-ship`.

A clean `ship` is shown for explicit acknowledgement in `Guided`; `Autonomous`/`Headless` may continue mechanically. `revise` / `do-not-ship`, concerns that require product judgment, or explicit questions remain human gates. Human routing can continue toward final approval, return to Builder for implementation revision, or return to Product Specifier for product reconsideration. The final artifact is integrity/freshness sealed against the approved specification, pre-spec PO opinion, current product/audience context, Target Audience result, governed implementation snapshot, and canonical evidence. Final approval fails closed while this required review is missing, stale, invalid, or awaiting its Guided/human decision. The current outcome review is also rendered into the canonical Final Review Bundle so the final human approval cannot omit the Product Owner's result-level judgment.

## Target Audience validation

After QA, user-facing tasks can enter the persisted `final-customer` compatibility phase while routing to the `ai-flow-target-audience` specialist.

Audience profiles are project data, not ad-hoc prompts. Prefer stable headings in `.ai/project/users.md`:

```text
## Audience: operator (primary)
## Audience: auditor (secondary)
```

`specrail audience profiles` exposes the deterministic IDs. Target Audience requires stable explicit profile headings in `users.md`; SpecRail never invents a fallback persona, accepts unknown profile IDs, or overrides primary/secondary classification. If explicit profile headings classify every profile as secondary, SpecRail treats the project configuration as incomplete instead of silently promoting one to primary.

Each audience review records:

- profile id and whether it is primary;
- comprehension;
- utility;
- discoverability;
- friction;
- trust;
- repeat value;
- concrete findings;
- whether a product trade-off requires human judgment.

Each dimension is `pass`, `warn`, or `fail`. The overall verdict is `pass`, `revise`, or `reject`. A `pass` verdict cannot conceal a failed dimension, and warnings/failures/trade-offs require concrete findings.

Target Audience reviews use the public UI/API/CLI or documented external interface. They must not inspect implementation code or accept Builder explanations as proof. **Fresh context is a hard phase-boundary requirement, not a recommendation:** the QA/review session is persisted as the Target Audience origin, same-session entry is rejected, and every additional required primary persona must enter from another stable session. The sealed Target Audience handoff contains only product context, configured audience profiles, user-visible intent, and canonical visible evidence; it deliberately excludes source code, diffs, implementation plans, architecture internals, private Builder/Reviewer handoffs, tests, and QA conclusions. If the audience packet changes after entry, the previous boundary and lease are invalidated and a new fresh session is required. SpecRail verifies these session/boundary facts; the execution host remains the trusted boundary for what it stores internally outside SpecRail. Reviews are content-digested and must match the canonical `Target Audience Review` task section. They become stale when the approved specification, QA mission, audience definition, implementation snapshot inside the governed scope, or evidence set changes. A valid stale batch is replaced only **after** a fresh simulation input has passed validation, so a malformed refresh never destroys the previous review history. A stale or malformed batch whose stored integrity cannot be trusted fails closed and requires explicit `specrail audience reset TASK --force` recovery before new simulations can be recorded. Accepting one product trade-off resolves only the profiles that raised that trade-off; it never clears an unrelated failed/rejected audience review.

Audience decisions are mechanically routed:

- `accept-tradeoff` records the explicit human product decision and keeps the audience gate intact;
- `revise-implementation` returns the task through the governed repair path to Builder;
- `revisit-product` invalidates the prior Product Owner judgment and returns to Product Specifier.

## Configuration

New projects default to:

```json
{
  "productIntelligence": {
    "enabled": true,
    "requireProductOwner": true,
    "requireFinalProductOwnerReview": true,
    "requireTargetAudience": true,
    "minPrimaryAudienceProfiles": 1
  }
}
```

Projects created before this feature preserve their previous behavior even if the initializer is run again. Enable the new gates explicitly with `specrail product intelligence enable`; disable them with `specrail product intelligence disable`.

Product Intelligence policy is part of the approved project-governance seal. Enabling, disabling, or changing its required roles after specification approval invalidates the prior governance digest, so an in-flight approved task must be reviewed and reapproved rather than silently continuing under weaker or different product gates.


### Concurrency authority

When a task is owned by a Multi-Agent Concurrency plan, both pre-spec/final Product Owner reviews and Target Audience are governed lanes just like Builder/Reviewer work. `concurrency prepare` supplies a reservation-specific session plus the normal task lease; the review command must carry that exact `--session`. Recording a Product Owner review yields its lane. Target Audience yields after a profile when another required primary persona remains or when a human product trade-off is raised; the final persona deliberately keeps its lane through agent-owned `complete` or `route` so a normal usability failure cannot lose authority between review and routing. The next specialist/persona is always dispatched with a fresh session rather than inheriting the previous role's authority. Human Product Owner/Audience decisions also clear any speculative task-local reservation that may have been created while the decision was waiting, so the following specialist cannot inherit a stale agent lease.

## Deterministic CLI surface

The orchestration skill normally calls these internally:

```text
specrail product intelligence status|enable|disable
specrail product owner status|review|reset|decide TASK
specrail product owner final status|review|reset|decide TASK
specrail audience profiles
specrail audience status|review|reset|decide TASK
```

Commands are internal and optional for normal natural-language use.
