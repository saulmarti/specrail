# Review Cockpit — beta implementation

Review Cockpit is a local, mobile-friendly, read-only decision surface generated from SpecRail's existing task Markdown, Review Bundle, evidence manifest, metrics, context budget, repair state, and signed trace.

It is **not** a second task database. If the Cockpit file disappears, every decision remains reconstructable from repository artifacts.

## Generate a Cockpit

SpecRail generates it automatically before specification and final approval. It can also be generated manually:

```bash
specrail cockpit TASK-0042
specrail cockpit TASK-0042 --stage spec
specrail cockpit TASK-0042 --stage final
specrail review cockpit TASK-0042 --stage status
```

The result is written under:

```text
.ai/reviews/TASK-0042-spec-cockpit.html
.ai/reviews/TASK-0042-final-cockpit.html
.ai/reviews/TASK-0042-status-cockpit.html
```

At approval gates SpecRail always generates the local Cockpit HTML as a durable, read-only review artifact. When the installed Codex skill catalog exposes `visualize` and the signed gate plan calls for interactive review, `$visualize` may prepare a validated interactive fragment and native `visualize` content reference. **Artifact prepared and reference prepared are not proof of host presentation.** For visual gates, `next` first returns `interaction.tool=host_actions` rather than a decision: the host must show the complete authoritative Review Bundle, present every `requiredVisible` canonical image in-conversation, and resolve the Cockpit open action. Each outcome is recorded against the exact session/action/`presentationDigest`; the approval question and direct decision commands remain blocked until all blocking actions are successfully acknowledged. Changed evidence, another session, or stale/corrupt acknowledgment forces presentation again. `$visualize` still records `hostPresentation: unverified` / `hostPresentationVerified: false` because preparation does not itself prove display. A local path, filename, or generated HTML file never satisfies “show the evidence”.

## What the MVP shows

### Overview

- requested need;
- approved scope and out-of-scope boundaries;
- immutable QA mission;
- current phase;
- stage-specific readiness checks;
- blocker explanation;
- shortest safe next action;
- context budget usage.

### Evidence — Visual Comparator v2

For frontend review the Cockpit now renders a deterministic **Visual Comparator v2** rather than a one-image-at-a-time switcher:

- **Side by side:** Before / Proposal / After remain simultaneously visible when available;
- **Slider:** compare the strongest available canonical pair interactively;
- **Overlay:** blend the strongest available pair to inspect alignment and visual drift;
- viewport filtering;
- route + target filtering and always-visible context chips;
- only contexts declared by the current `UI Target` are active in the comparator; historical/stale frontend captures remain audit evidence but cannot substitute for the current proposal;
- each visual context is declared in deterministic `Route → Target → exact pixel Viewport(s) → Capture` order, and route/target identity is matched exactly rather than case-folded;
- explicit red missing-evidence states instead of blank frames or broken thumbnails;
- canonical evidence IDs and review roles preserved on embedded images;
- the active canonical visual set is shown first; superseded or out-of-scope frontend visuals are separated as historical audit evidence, while supporting evidence remains listed below the comparator.

At specification approval the required frontend roles are Before + Proposal. At final approval they are Before + Proposal + After. Missing required roles are never silently hidden.

Registered PNG/JPEG/WebP/GIF/SVG visuals up to 8 MB are embedded as data URIs, making the generated local Cockpit self-contained. The Review Bundle does not use repository-local Markdown image URLs as a presentation mechanism. Instead, its **Review Surface** declares the active canonical visual roles/contexts as `REQUIRED VISIBLE`, while local file paths are relegated to an **Audit metadata (not presentation)** subsection; the host must render the canonical bytes through a visible surface. When `$visualize` renders a `visual-comparator-v2` plan, it must reproduce the same review contract: one `data-specrail-comparator="v2"` root, Side by side / Slider / Overlay modes, viewport, route/target, and capture-scope filters, exact route+target+viewport+capture grouping, visible missing-role states, and canonical images embedded as data URIs with `data-specrail-evidence-id`, `data-specrail-review-role`, `data-specrail-comparator-source="v2"`, and their route/target/viewport/capture-scope metadata. A static gallery does not count as Visual Comparator v2. The rendered fragment must contain marked split/opacity range controls and a marked v2 runtime that actually binds filtering, slider state, and overlay opacity. It must read local image bytes rather than using `file://`, absolute filesystem paths, or repository-relative `<img src>` values. If an image cannot be embedded, the surface must show an explicit fallback instead of a broken placeholder.


### Live frontend preview

Frontend `before` and `after` evidence recorded after this contract must include the exact served runtime URL used for the capture. It must be `http://` or `https://`; raw `index.html` and `file://` previews are invalid evidence. Approval presentations expose the appropriate URL as `presentation.previewUrl`, and Codex should health-check/open that URL while keeping the dev/preview server alive through the human gate.

For `route.qa=browser`, QA distinguishes `verification.type=human|automated|mixed` from automated browser state. `automatedVisualQA` records `hostBrowser=available|unavailable`, `surfaceClass=host-browser|host-without-browser`, `attempted`, `status`, `surface`, and a concrete reason when needed. An available/attempted Browser also requires `attemptRef` for the actual host invocation and the served `http(s)` `targetUrl`; shell/terminal transports cannot satisfy `surfaceClass=host-browser`, and attempted automation cannot be labeled human-only verification. If the current host exposes no Browser, it must use `host-without-browser`, `attempted=false`, and no invocation reference. `failed` or `unavailable` remains a deterministic QA blocker.

The generated Cockpit result includes `openUrl`, a `file://` URL for the exact generated HTML. Approval presentations map that URL to a non-blocking `open-url` host action labeled **Abrir Review Cockpit**. Record `opened` only after a real host open; if automatic opening is unavailable, expose the exact URL as an actionable link and record `offered`. `failed`/`unavailable` may degrade the Cockpit without blocking only after every required canonical image was actually presented. This is deliberately separate from `path`: a path is audit metadata, while `openUrl` is the explicit browser fallback target.

Canonical visual evidence is mapped to `present-image` host actions whose required surface is the conversation itself. If the current host cannot present a required image there, the gate blocks approval with a presentation-surface limitation; it must never satisfy the gate by printing a local path.

### Checks

- project context;
- material questions;
- dependencies;
- specification lint;
- pre-approval evidence;
- approved hash and specification drift;
- final evidence;
- durable learning;
- final approval state;
- workflow blockers;
- trace integrity.

The displayed percentage is a transparent ratio of passed applicable checks, not an opaque AI confidence score.

### Trace and metrics

- recent parent-linked trace events;
- branch and event counts;
- trace integrity;
- elapsed time;
- repairs used versus budget;
- context expansions;
- QA and user returns;
- delivery status.

## Decision model

The Cockpit never writes task state. Decision buttons only explain the available action. The actual choice must be submitted through Codex's native `request_user_input` gate so the deterministic SpecRail CLI owns the transition.

This prevents an HTML file, browser extension, or stale tab from silently approving work.

## Security and portability

- no network requests;
- no remote scripts or stylesheets;
- no authentication;
- no separate database;
- project-provided text is HTML-escaped;
- visual evidence is embedded only from registered local evidence;
- every Cockpit carries a source digest derived from task, evidence, trace, and check inputs;
- Markdown, evidence hashes, and trace validation remain authoritative.

## Current limitations

- It is a generated snapshot, not a live server; regenerate after task state or evidence changes.
- The MVP emphasizes frontend visual comparison. Backend, architecture, and database explorers are currently lists/checks rather than specialized interactive diagrams.
- A standalone local HTML file cannot directly invoke Codex. Approval remains in the owning chat.
- CI is not integrated in the current product roadmap; a future integration, if prioritized, would appear only as commit-linked evidence.

## Success criteria

- Median user review time decreases.
- Final rejection rate does not increase.
- Users identify blockers and next actions without asking Codex for a second explanation.
- Every displayed result traces back to existing repository artifacts.
- The Cockpit remains usable from 320 CSS px without horizontal overflow.

A static marketing prototype remains at [`prototypes/review-cockpit.html`](prototypes/review-cockpit.html), while real task Cockpits are generated by the CLI.
