# AI Flow 0.2.5 validation

## Scope

Version 0.2.5 changes the frontend proposal workflow:

- Taste Skill is mandatory for every UI/UX proposal.
- ChatGPT/Codex Image Gen is the required proposal method.
- The preferred generation mode edits the focused screenshot of the real running product.
- Browser-rendered prototypes are no longer required as the visual proposal.
- Image Gen proposals are concepts only; final evidence must still come from the implemented running application.
- A visual critique must reject overflow, clipping, overlap, illegible or malformed text, unrelated changes, target mismatch, and visual-language inconsistency before user review.

## Deterministic gates

A frontend specification cannot reach approval without:

1. `frontend-before` from the running application, focused on the exact target.
2. `ui-design-brief` with:
   - a real globally installed Taste Skill `SKILL.md` path;
   - `tasteSkill.used: true`;
   - `proposalMethod: image-gen`;
   - generation mode;
   - real route, target, viewport, content, design-system context, and unchanged areas.
3. `frontend-proposal` with source `image-gen-proposal`.
4. `ui-proposal-review` with a passing Taste/Codex-vision verdict.

The installed Taste Skill path must exist under `.agents/skills` or `.codex/skills` and identify itself as a Taste skill. A claimed or missing skill path is rejected.

After implementation, frontend completion still requires:

- `frontend-after` from the running application;
- `ui-after-validation` from browser/DevTools measurements;
- no horizontal overflow, clipping, overlap, unreadable content, or target mismatch.

## Test result

- Tests: 55
- Passed: 55
- Failed: 0
- TypeScript build: passed
- CLI syntax check: passed

## Covered regressions

- Browser-rendered proposal without Image Gen is rejected.
- Missing or fake Taste Skill is rejected.
- Image Gen proposal without a design brief is incomplete.
- Proposal without a visual critique is incomplete.
- Visible overflow fails the critique.
- Clipped or overlapping text fails the critique.
- A critique for another route or target does not validate the proposal.
- Specification presentation includes the Markdown task, focused before image, design brief, Image Gen proposal, and proposal review.
- Final completion still requires real browser evidence from the implemented application.

## Host-dependent acceptance

The following must still be exercised in the user's Codex Desktop installation:

- discovery and loading of the user's actual Taste Skill;
- Image Gen editing the focused screenshot;
- rendering proposal images inline in the conversation;
- browser/Computer Use access to the real application;
- DevTools measurements on the implemented result.
