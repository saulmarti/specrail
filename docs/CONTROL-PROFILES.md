# Proportional Control Profiles

SpecRail separates **execution profile** (repair/reasoning depth) from **control profile** (which workflow controls are applicable). The control profile is deterministic workflow state, not an agent suggestion.

Profiles are provisional while Product Specifier refines the task. Refinement may raise or lower the provisional profile as the governed specification becomes concrete. Once Product Specifier seals the specification, automatic routing may only escalate; it never silently downgrades approved controls.

| Profile | Intended use | Main controls |
| --- | --- | --- |
| `micro` | Exact localized, low-risk cosmetic/copy change | Compact spec approval, Scope Guard, Builder, real served After + layout validation, AC coverage, final approval. No separate Product Owner/Target Audience, UX proposal, ImageGen, independent technical reviewer, QA agent, Final Customer, or mandatory durable learning. |
| `light` | Small responsive/layout judgment or shared design-token/theme change | Focused real-app Before, spec approval, Scope Guard, Builder, focused Before→After QA/layout audit, final approval. No separate Product Owner/Target Audience, ImageGen proposal, independent technical review, or mandatory durable learning by default. |
| `standard` | Normal feature/behavior/redesign work | Normal routed UX/technical/QA/customer controls and full evidence appropriate to the task. |
| `rigorous` | High/critical risk or sensitive auth/security/data/API/migration/performance/concurrency work | Full independent controls plus risk-selected property/mutation/operational evidence. |

## Conservative classification

Classification considers the task title plus governed **Need**, **Scope**, **Acceptance Criteria**, and **UI Target**. `Out of Scope` is deliberately excluded from positive escalation signals so phrases such as “No authentication changes” do not accidentally make a color change rigorous.

Examples:

```text
Change this button from blue to green
→ micro

Change the shared design token primary-500
→ light

Make this heading less dominant on mobile
→ light

Redesign the hero hierarchy
→ standard

Change what happens when the button is clicked
→ standard

Change authentication/token refresh behavior
→ rigorous
```

A cosmetic-looking title cannot hide complexity in the acceptance criteria. For example, “change the button color” escalates to `standard` if an AC says clicking it redirects into a new flow, and to `rigorous` if an AC introduces authentication/data-sensitive behavior.

## Escalation rule

If implementation discovers scope that no longer fits the sealed profile, the agent does not improvise or silently restore omitted phases. It stops and returns through the governed refinement/amendment path so SpecRail can deterministically raise the controls.

`next`, `readiness`, and `interaction` remain independent contracts regardless of profile or resident runtime.


## Workflow mode overlay: `SpecRail Fast`

Control profile and workflow mode are separate. A normal request can classify as `micro`/`light`; it still uses the governed specification-approval path, but proportional routing omits separate Product Owner/Target Audience and durable-learning passes for those profiles. An explicit request beginning with `SpecRail Fast:` creates the task with `workflow_mode: fast` and permits an even shorter path **only** while the sealed profile remains `micro` or `light`.

Fast `micro/light` deliberately skips project-wide Product Owner/CodeGraph bootstrap, separate pre-implementation approval, planning→Builder phase boundary/worktree, UX/ImageGen, independent Technical Reviewer, separate QA-agent, Final Customer, and durable learning. It retains the exact blast radius, stable acceptance IDs and approved specification hash, real implementation evidence appropriate to the profile, Scope Guard, Acceptance Coverage, presentation acknowledgment when visual evidence is shown, and explicit final user approval.

If refinement discovers `standard` or `rigorous` scope, `route.fast_mode` becomes false and normal governance resumes automatically. The user cannot force auth/data/API/migration/security/performance or otherwise material work through the compact path by adding cosmetic wording.

## Explicit total bypass

`Sin SpecRail:` / `No SpecRail:` is intentionally **not** a control profile and creates no SpecRail workflow state. It is a host/activation escape hatch for a single request when the user explicitly does not want SpecRail. Because SpecRail is not invoked, the repository's normal instructions and the Codex host remain the only governing layer for that request.
