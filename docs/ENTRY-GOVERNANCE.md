# Entry and mutation governance

SpecRail separates **process choice**, **material-decision authority**, **code minimalism**, and **review presentation**. These contracts apply at the host boundary before repository delivery work is allowed to mutate code.

## 1. Choose the process route first

A new repository-delivery work item must have an explicit route before SpecRail intake or mutation:

- **SpecRail** — normal governed workflow. `micro | light | standard | rigorous` remains a separate deterministic Control Profile.
- **Directo** — execute without creating SpecRail task, CodeGraph-preflight, evidence, trace, learning, or approval workflow state.
- **Directo + verificar** — Direct plus a bounded, read-only verification after the final mutation.
- **Other / free text** — always available when the fixed choices do not express the user's intent.

Existing explicit prefixes are route choices, not new control profiles:

- `SpecRail Fast:` → SpecRail route with Fast semantics.
- `Sin SpecRail:` / `No SpecRail:` → Direct.
- `Directo + verificar:` / `Direct + Verify:` → Direct + Verify.

`Continue/Resume/Retoma TASK-####` continues an existing SpecRail task without a redundant route question. Host adapters must also avoid re-asking while the user is answering a pending question, reviewing an approval, or refining the current work item. When a Direct continuation loses enough host/session context that the previous choice can no longer be proved applicable, the safe behavior is to ask again rather than infer a route.

Direct-route continuity may be stored only as host-session metadata. It must not create repository-local SpecRail workflow state merely to remember the bypass.

## 2. No silent material assumptions

Direct does not mean “guess”. Before a production-code mutation, material decisions must be either:

- explicitly supplied by the active user;
- present in an approved decision;
- proven by an authoritative repository contract;
- uniquely established by the repository pattern; or
- observed in deterministic trusted tool output.

The Pi runtime does not trust an agent-provided `source`/`ref` by itself. It binds user answers, repository quotes, and trusted tool output to runtime-observed evidence records. A conflicting or unresolved material decision blocks mutation.

When clarification is needed, questions use **2–4 choices plus Other/free text**. A recommendation may be displayed but is never selected automatically. Legacy generic open-answer questions remain supported where the caller deliberately uses that older contract.

## 3. Ponytail is mandatory and ships with SpecRail

Every code-writing route requires the official `@dietrichgebert/ponytail` host capability in literal **`full`** mode. Missing, `off`, `lite`, `ultra`, or imitated state does not satisfy the gate.

SpecRail declares the official Ponytail package as a runtime dependency. Managed Codex installation copies its official skills into the managed skill locations. When the Pi integration is selected, the SpecRail Pi Package loads the bundled official Ponytail extension and skills. SpecRail does not vendor a lookalike implementation and does not expose an internal bypass.

A missing Ponytail capability after SpecRail installation is therefore an installation/host-reload defect, not a separate prerequisite the user must install. Repair/reinstall SpecRail or reload the host; never substitute an imitation. The mode is re-read immediately before mutation, so downgrading Ponytail after attestation blocks the write.

After the final mutation, the official `ponytail-review` capability must review the current result. Review completion is bound to a repository fingerprint; any subsequent repository change invalidates the review and requires a fresh one.

User requirements, security/privacy/data-loss protection, accessibility, approved scope, acceptance criteria, and evidence requirements always outrank minimalism.

## 4. Direct + Verify is read-only verification

`Directo + verificar` performs the implementation directly, then runs an allowlisted verification command. The Pi runtime fingerprints Git-visible tracked and non-ignored untracked content before and after the verifier and rejects the verification if repository content changes.

The fingerprint is anchored at the Git repository root even when the host is working from a nested directory. Symlinks are hashed as links (`lstat` + `readlink`) instead of following their targets. `.specrail/` runtime-only data is excluded from the verification snapshot.

The verifier is fail-closed: shell composition and arbitrary executables are not accepted. Current Pi verification allows tightly bounded read-only Git commands and `node --check <file>`/version checks.

## 5. Concise approval presentation

Normal approval output is **Decision Capsule first in chat**. The exact native approval question begins with the complete concise Decision Capsule and only then shows the selector, so a host cannot ask for approval before exposing the summary merely because it ignored optional presentation metadata.

The complete Review Bundle remains authoritative and available as **Review Details**. Canonical visual evidence and blockers remain above the approval decision when applicable.

**Review Cockpit is not part of the normal approval path.** SpecRail does not generate, open, offer, or require Cockpit for normal approvals. The legacy manual artifact/command may remain available only when explicitly requested.

For Codex, `$visualize` is used only when the exact skill is actually discoverable. A prepared visualization is not treated as verified host presentation. Pi uses the same canonical inline-evidence contract and does not depend on Cockpit.

## 6. Runtime continuity and authority reset

Pi persists the selected route as session metadata so retry, compaction, and session reconstruction do not silently lose Direct/Direct+Verify. Restoring a route does **not** restore mutation authority: Ponytail attestation, material-decision clearance, mutation authorization, post-mutation review state, and incomplete verification state are reset and must be re-established from current runtime evidence.

Unknown Pi tools fail closed unless they are explicitly classified as read-only or governed. Mutation authorization is one-use: after a successful write, another write requires a fresh No-Assumption gate and current Ponytail state.

## 7. Headless behavior

A non-interactive host with no explicit route stops instead of inventing one. The same rule applies to unresolved material user judgment: autonomy does not fabricate an answer.

## 8. Verification

The release contract requires at minimum:

- build and version synchronization;
- Pi adapter/runtime-gate smoke tests;
- full unit suite;
- installed E2E suite;
- JavaScript syntax checks for installer and both Pi extensions;
- package dry-run;
- adversarial coverage for route continuity, no-assumption provenance, bundled Ponytail re-check/review freshness, Pi opt-in/non-mutation behavior, summary-before-selector ordering, verifier mutation detection, symlinks/path traversal, unknown tools, and Direct no-workflow-state behavior.
