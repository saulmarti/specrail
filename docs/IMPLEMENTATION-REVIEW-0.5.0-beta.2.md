# SpecRail 0.5.0-beta.2 — implementation review

Date: 2026-08-07

## Decision

The Review Cockpit is now a real SpecRail feature rather than a documentation-only prototype. It is generated deterministically from repository-local SpecRail artifacts and presented as the first attachment at specification and final approval gates.

The public maintainer email is now `me@saulmarti.dev`.

GitHub Issue/PR/CI delivery and Signed Delivery Bundle remain documented future ideas with no priority or target release.

## Review Cockpit implementation

### Inputs

The generator reads only existing local artifacts:

- task Markdown and metadata;
- project context state;
- registered evidence and its hashes;
- specification lint and approval hash;
- dependency state;
- repair budget;
- context budget and expansions;
- local delivery metrics;
- signed trace events and integrity result.

It does not create a second source of truth or a new database.

### Outputs

For a task, SpecRail writes one of:

```text
.ai/reviews/TASK-0001-status-cockpit.html
.ai/reviews/TASK-0001-spec-cockpit.html
.ai/reviews/TASK-0001-final-cockpit.html
```

Manual commands:

```bash
specrail cockpit TASK-0001
specrail cockpit TASK-0001 --stage spec
specrail cockpit TASK-0001 --stage final
specrail review cockpit TASK-0001
```

### Review surface

The self-contained HTML includes:

- readiness calculated from applicable deterministic checks;
- exact blockers and the shortest safe next action;
- need, scope, out-of-scope boundaries and immutable QA mission;
- before/proposal/after evidence switching;
- viewport filtering;
- all registered evidence;
- specification, evidence and trace checks;
- repair budget, context usage and delivery metrics;
- recent branch-aware signed trace events;
- available decision paths.

The HTML is deliberately read-only. Selecting an action only explains what will be sent through the native Codex decision gate. It cannot mutate `.ai/`, approve a task or bypass `request_user_input`.

### Approval integration

At specification and final approval gates, attachment ordering is now:

1. Review Cockpit (`text/html`)
2. Review Bundle (`text/markdown`)
3. task Markdown
4. registered evidence

The authoritative artifacts remain Markdown, evidence files and deterministic state. Cockpit is a derived review surface.

## Security and portability review

- No remote scripts, stylesheets, images or network requests.
- Project and user content is HTML-escaped.
- Raster evidence is embedded as data URIs only when it is a registered image under the task evidence directory and at most 5 MB.
- Evidence provenance and hashes remain visible in the underlying artifacts.
- Source digest binds the generated Cockpit to task state, evidence hashes, trace hashes, checks and selected metrics.
- The output is portable as one HTML file and usable without a SpecRail service.
- Native decision gates remain mandatory.

## Product decisions

### GitHub PR and CI

Kept as a deferred design note. It has no current priority or target release. Solo/local delivery, Readiness, doctor repair, Cockpit usage and replayable tasksets must demonstrate value first.

### Signed Delivery Bundle

Kept as a deferred idea with no target release. It may become useful for client handoff, audits or regulated delivery, but does not currently justify implementation for the primary solo-developer workflow.

## Publication changes

- version: `0.5.0-beta.2`;
- author: Saúl Martí `<me@saulmarti.dev>`;
- npm package: `specrail`;
- fallback package identity remains `@saulmarti/specrail` if the unscoped name cannot be obtained;
- `ai-flow` remains a compatible binary alias;
- beta dist-tag remains configured.

## Review findings

The generated HTML was inspected for action duplication after a truncated source dump appeared to repeat a template expression. The actual generated file contains exactly three specification actions and each appears once. A regression assertion now counts the rendered actions explicitly.

## Remaining limitations

- Codex Desktop must support opening or rendering a local HTML attachment for the richest approval experience. Markdown and evidence remain the fallback.
- The Cockpit does not yet provide a long-running server, cross-project dashboard or remote mobile URL.
- Readiness is a transparent ratio of applicable checks, not a prediction or confidence score.
- Raster images over 5 MB are listed but not embedded.
- Browser rendering was structurally validated in this environment, but the host-specific Codex attachment presentation still needs a real Mac session test.
