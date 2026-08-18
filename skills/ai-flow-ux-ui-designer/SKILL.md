---
name: ai-flow-ux-ui-designer
description: Use when AI Flow routes frontend, UI, UX, navigation, responsive, accessibility, interaction, or visual design. Run bounded design production as a Worker, apply the installed Taste/Image Gen workflow when available, and return material visual-direction decisions to the Brain before approval.
---
# UX/UI Designer

## Brain / Worker contract

Design discovery, screenshot preparation, proposal generation and critique are **worker-owned** when `next.intelligence.tier=worker`. The Worker may create/evaluate bounded alternatives inside already approved product/design-system constraints, but it may not choose a new material visual direction, information architecture, interaction contract, or accessibility trade-off on the user's behalf. Return `STATUS: ESCALATE_TO_BRAIN` with the alternatives/evidence when that choice is material.

When `SPEC_RAIL_WORKER=1`, never call `request_user_input`; the Brain owns approval and all consequential questions. Outside Worker mode, Brain uses native `request_user_input`. Never print option lists or multiple-choice questions as text when native input is available.

## Official Taste workflow

Use installed Taste Skills as documented, not a generic placeholder:
- Core: `gpt-taste` when installed, or `design-taste-frontend` v2.
- Existing product: also use `redesign-existing-projects` and audit-first analysis.
- Image proposal: use `imagegen-frontend-web` or `imagegen-frontend-mobile` for the target surface when that capability is actually available to the Worker host.
- Implementation handoff: require `image-to-code` where routed.

Run brief inference (page kind, audience, direction, variance, density, motion), lock color/shape/theme intentionally, and pass the hard preflight. Record actual skill paths in the v2 `ui-design-brief`; if a required capability is unavailable, report it rather than pretending it ran.

## Proposal

1. Open the real application through served `http://` or `https://`, navigate/scroll to exact route/target, and capture focused Before evidence at each approved viewport. Never open raw `index.html` or `file://`. Keep preview URL tied to evidence.
2. Prefer Image Gen editing the real focused screenshot and preserving current content/design system. Generate from scratch only for a genuinely new surface.
3. Produce one strong proposal for trivial work or up to three meaningfully different variants for material redesign. A material selection is Brain/user-owned.
4. Critique proposals with Taste/vision. Reject visible overflow, clipping, malformed text, overlap, illegibility, generic styling, target mismatch, or scope drift.
5. Material UI work retains independent fresh-context Technical Review. Bind its source digest to canonical Before, brief, proposal and critique.
6. Prepare Visualize comparison only when the active host exposes it and it materially improves review. Canonical images/evidence remain authoritative; local filesystem paths and broken placeholders are not presentation.

Do not implement before Brain/user approval. Builder receives exact target, viewport, approved image/direction, preserved areas, tokens, behavior and acceptance criteria—not the design Worker transcript.

## Evidence quality

The page-top or full-page screenshot is supplementary only; the primary capture must focus the approved target. Use the official Taste Skill workflow and Image Gen, preferably by editing the focused before screenshot. Reject and regenerate visible overflow, clipped or malformed text, overlap, unreadable text, scope drift, or generic visual treatment.

When Codex exposes `visualize`, use `$visualize` only with the signed comparison plan and canonical sources. Do not ask the user to type `/visualize`, do not invoke internal renderers directly, and do not claim generated files prove host presentation. Preserve the direct canonical-evidence fallback and Review Cockpit open action.
