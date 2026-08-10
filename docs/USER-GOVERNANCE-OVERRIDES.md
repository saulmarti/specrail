# User Governance Overrides

SpecRail is fail-closed by default, but the user's explicit instruction remains the highest workflow authority. A deterministic gate must never trap the conversation in a loop where the user has already said “close it anyway” or “skip this step” and the agent keeps repeating the same blocker.

User Governance Overrides provide an auditable escape hatch without weakening normal agent/autonomy rules.

## Rules

- Only an explicit current-turn user instruction may authorize an override.
- Agents and Autonomy may never create an override on their own.
- Ambiguous requests may be confirmed once. After explicit confirmation, execute the override rather than repeating the blocker.
- Every override is persisted under `.ai/overrides/<TASK>/OVR-*.json` with the task phase/status, reason, timestamp, target, and integrity digest.
- An override records that normal SpecRail completion guarantees were waived. It does not pretend that skipped evidence/review actually passed.
- External publication/deployment still requires the user's explicit authorization; closing a task does not fabricate a deployment.

## Close anyway

An explicit request such as “close this task anyway” uses a terminal close override:

```bash
specrail override close TASK-0042 \
  --reason "User explicitly requested closure despite missing final visual evidence" \
  --user-authorized
```

The task moves to `done`, `final_approval` is recorded as `overridden`, any active bounded revision is cancelled, and any separate delivery is marked as skipped by user when applicable. The worktree is not silently merged.

This path intentionally bypasses normal final evidence, Acceptance Coverage, Scope Guard, project-learning, presentation, Product Owner, or other workflow blockers because the user explicitly asked for terminal closure. The audit trail must make that loss of guarantees visible.

## Skip one step

A user can waive one named workflow step without closing the task:

```bash
specrail override waive TASK-0042 \
  --step final-evidence \
  --reason "User explicitly accepts the result without another visual capture" \
  --user-authorized
```

Supported targets are derived from the declarative workflow-gate registry rather than duplicated in the override subsystem. Current waivable gates are:

- `design`
- `technical-architecture`
- `technical-review`
- `qa`
- `target-audience`
- `final-product-owner`
- `host-presentation`
- `acceptance-coverage`
- `final-evidence`
- `scope-guard`
- `project-learning`
- `delivery`

`builder`, `spec-approval`, and `final-approval` are explicitly non-waivable phase gates; an explicit user request to terminate despite them uses the terminal task-close override instead. New gates opt into user waiver by declaring `waivable: true` in the gate registry.

When the waived target owns the current phase (including design, architecture, technical review, QA, Target Audience, or delivery), SpecRail advances once using the normal router with that gate removed. Future routing and final evidence requirements respect the waiver, so the same step does not reappear as a blocker.

A waived gate is reported as satisfied-by-override in Readiness rather than as normal verified evidence. The distinction is intentional: user authority resolves the workflow decision, while the audit trail preserves what was not verified.

## Conversational behavior

Normal use remains conversational. The orchestrator should map explicit user intent directly:

```text
User: "Cierra la tarea aunque falte la evidencia visual."
→ record one terminal user override
→ task closes
→ do not ask again

User: "Sáltate QA en esta tarea."
→ record QA waiver
→ route past QA
→ do not surface QA again as a blocker
```

If the user merely asks why a gate is blocked, complains about the gate, or says they are unsure, that is not authorization to override it.
