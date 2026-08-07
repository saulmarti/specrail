# Specification Amendments / Change Requests

An approved specification is immutable. Implementation discoveries must not be smuggled into the task by editing the original Markdown.

SpecRail therefore models bounded post-approval changes as immutable amendments.

## Propose

```bash
specrail amendment propose TASK-0042 \
  --title 'Permit fallback response' \
  --reason 'The existing dependency contract requires an explicit unavailable state.' \
  --changes 'Add the fallback response,permit src/health/Fallback.ts' \
  --acceptance-criteria 'Dependency unavailable returns HTTP 503' \
  --allowed-files 'src/health/Fallback.ts'
```

A proposal records its own SHA-256 digest and blocks execution until the user makes a decision through the native SpecRail/Codex approval gate.

## Approve or reject

```bash
specrail amendment approve TASK-0042 AMD-001
specrail amendment reject TASK-0042 AMD-001
```

Agents must not invoke those decisions without the corresponding human gate. `specrail next` surfaces the first pending Amendment as a native `request_user_input` decision with the material change visible before input:

- **Aprobar cambio** — incorporate it into the effective specification.
- **Rechazar cambio** — preserve the current effective specification.
- **Revisar / mantener pendiente** — leave it unresolved while more context or refinement is gathered.

The proposal digest and decision state are sealed separately. A schema-v2 approved/rejected Amendment must contain a valid decision digest over the proposal digest, status, decision timestamp, and decision note. Legacy decisions are accepted only when the task's validated trace contains the matching approve/reject event for the immutable proposal digest.

Approval does **not** mutate the original approved specification hash. Instead SpecRail calculates an effective specification hash from:

```text
approved base specification
+
approved amendment digests
```

New acceptance criteria receive stable IDs such as `AC-A001-01` and immediately become mandatory in the Acceptance Coverage Matrix.

Blast-radius additions also become part of the effective Scope Guard policy.

## Safety boundary

Amendments are only for bounded additive discoveries inside the already-approved workflow route. They cannot rewrite the base task metadata, existing acceptance criteria, QA Mission, architecture section, or original blast radius.

Known material categories are rejected mechanically at proposal time when the requested change declares an architecture redesign, data/schema migration or backfill, authentication/authorization/security/privacy boundary, new product outcome/user flow, or risk-classification change. Those changes must return to Product Specifier for a full specification review.

This deterministic guard complements—not replaces—the human decision: ambiguous wording must never be used to hide a material route/risk/architecture/security/data change inside an Amendment. If materiality is uncertain, treat it as a full-review change.

Closed tasks cannot receive amendments, and tampering with immutable proposal or decision fields fails integrity validation.
