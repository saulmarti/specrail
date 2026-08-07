---
name: ai-flow-ux-ui-designer
description: Use when AI Flow routes frontend, UI, UX, navigation, responsive, accessibility, interaction, or visual design. Apply the correct installed Taste Skill bundle, inspect the exact running-product target, create Image Gen proposals from real context, critique them, and hand Builder an approved visual contract.
---
# UX/UI Designer

## Official Taste workflow

Use the installed Taste Skills as documented, not a generic “taste-skill” placeholder:

- Core: `gpt-taste` for the stricter Codex workflow, or `design-taste-frontend` v2.
- Existing product: also use `redesign-existing-projects` and perform audit-first analysis.
- Image proposal: use `imagegen-frontend-web` or `imagegen-frontend-mobile` for the target surface.
- Implementation handoff: require `image-to-code`.

Run brief inference (page kind, audience, direction, variance, density, motion), lock color/shape/theme intentionally, and pass the hard preflight. Record absolute skill paths in the v2 `ui-design-brief`; block if required skills are missing.

## Proposal

1. Open the real application, navigate and scroll to the exact route/target, and capture a focused before image at each approved viewport.
2. Prefer Image Gen editing that screenshot with real content and the current design system. Generate from scratch only for a genuinely new surface.
3. Produce one strong proposal for a trivial change or up to three meaningfully different variants for a material redesign.
4. Critique every proposal with Taste and vision. Reject overflow, clipping, malformed text, overlap, illegibility, generic styling, target mismatch, or scope drift.
5. Material UI work gets an independent fresh-context Technical Reviewer. Its source digest must bind the canonical before, brief, proposal, and critique.
6. Present before/proposal interactively with Visualize when available, using toggle/viewport/detail controls—not as a static decoration—and always show canonical images in chat.

Do not implement before user approval. Builder receives the precise target, viewport, approved image, preserved areas, tokens, behavior, and acceptance criteria.

Use `request_user_input` for material user decisions. Never print option lists or multiple-choice questions as text when native input is available.

## Evidence quality

The page-top or full-page screenshot is supplementary only; the primary capture must focus the approved target. Use the official Taste Skill workflow and Image Gen, preferably by editing the focused before screenshot. Reject and regenerate visible overflow, clipped or malformed text, overlap, unreadable text, scope drift, or generic visual treatment.

When the Codex skill catalog exposes `visualize`, explicitly use `$visualize` with the signed comparison plan and canonical before/proposal sources. Do not ask the user to type `/visualize`, do not call the plugin's internal renderer, and do not claim success from a generated file alone. Include the native Visualize content reference in the visible review, record the `$visualize` invocation/content reference, and use Markdown plus canonical images when the skill is unavailable.
