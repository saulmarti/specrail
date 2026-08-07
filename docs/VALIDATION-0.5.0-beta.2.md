# SpecRail 0.5.0-beta.2 — validation

Date: 2026-08-07

## Release metadata

- package: `specrail`
- version: `0.5.0-beta.2`
- author: Saúl Martí `<me@saulmarti.dev>`
- license: MIT
- dist-tag: `beta`
- Node.js: `>=22`
- supported OS metadata: macOS and Linux

## Source validation

```text
TypeScript strict compilation: PASS
Automated tests:              123/123 PASS
CLI syntax check:             PASS
npm pack dry run:             PASS
@ts-nocheck in src/:          0
```

## Review Cockpit validation

Validated behaviors:

- generated from real task state and evidence;
- status/spec/final stage selection;
- local self-contained HTML output;
- no external script tags;
- no `fetch()` or remote dependency;
- registered raster evidence embedded as data URI;
- project-controlled strings HTML-escaped;
- stage-specific checks and blocker explanation;
- before/proposal/after switching;
- viewport filter;
- metrics, repair budget, context budget and trace summary;
- read-only decision surface;
- exactly one rendered instance of each decision action;
- first attachment at specification/final approval gates;
- Markdown and evidence fallback retained.

A generated specification Cockpit returned:

```json
{
  "stage": "spec",
  "readiness": {
    "score": 100,
    "passed": 7,
    "total": 7,
    "label": "Ready"
  },
  "blockers": [],
  "trace": "5 events / 1 branch / valid chain"
}
```

## Exact npm tarball validation

Exact artifact: `specrail-0.5.0-beta.2.tgz`

```text
npm install from exact .tgz:       PASS
specrail --version:                0.5.0-beta.2
ai-flow compatibility alias:      PASS
specrail install in empty HOME:    PASS
skills in ~/.agents:               7
skills in ~/.codex:                7
native questionnaire config:       installed
Cockpit command from installed tgz: PASS
installed Cockpit HTML:            valid local HTML
```

The tarball contains 133 files, approximately 143 kB compressed and 659 kB unpacked.

## Roadmap validation

- Review Cockpit is marked Beta.
- Readiness / Why blocked, `doctor --fix`, and Replayable Tasksets/Harness comparison remain the active product priorities.
- GitHub Issue/PR/CI delivery is Deferred with no target release.
- Signed Delivery Bundle is Deferred with no target release.
- `AGENTS.md` requires roadmap, changelog, documentation, migration and package checks to remain synchronized.

## Known host-only validation

The following require the user's actual Codex Desktop environment and are not claimed as executed here:

- rendering the local HTML attachment inline in Codex Desktop;
- opening the Cockpit from the iOS Codex/ChatGPT surface;
- Visualize plugin capability and exact tool name in that session;
- browser, Computer Use and Image Gen availability on the user's account;
- the concrete versions of Taste Skills installed on the user's Mac.

These do not block SpecRail because the Review Bundle, task Markdown and evidence remain attached and authoritative.
