# AI Flow 0.2.4 validation

## Purpose

This release prevents two observed frontend failures: generic screenshots that omit the requested section and UI proposals whose content overflows its container.

## Deterministic changes

- Frontend tasks must specify an exact `UI Target`: route, selector or visible anchor, pixel viewport, and focused capture scope.
- Primary `before`, `proposal`, and `after` evidence rejects full-page/page-top capture scopes.
- The before capture must focus the requested section or element.
- UI proposals must use source `browser-rendered-proposal`; a raw ImageGen layout is rejected. ImageGen remains valid for assets placed into a rendered proposal.
- Proposal and after screenshots must match the approved before evidence by route, target, and viewport.
- `ui-proposal-validation` and `ui-after-validation` are mandatory structured browser audits.
- The audit rejects a missing/invisible target, target coverage below 35%, horizontal overflow, text clipping, overlapping elements, unreadable text, and measured `scrollWidth > clientWidth + 1`.
- Specification presentation includes the exact UI target and the layout audit alongside focused visual evidence.

## Test coverage

The source suite contains 55 passing tests. New coverage proves that:

1. a generic page screenshot cannot satisfy the primary frontend evidence requirement;
2. an ImageGen-only layout cannot be registered as the UI proposal;
3. a browser-rendered proposal without a matching layout audit cannot reach approval;
4. overflow, clipping, overlap, unreadable text, and mismatched targets invalidate evidence;
5. final frontend validation requires an after audit on the same target;
6. the installed CLI rejects a proposal whose measured scroll width exceeds its client width and accepts the corrected version.

## Remaining host acceptance

The deterministic package can reject invalid artifacts and metadata. The quality of browser navigation, screenshots, and rendered proposals still depends on the Codex tools exposed on the user's Mac. A real Codex Desktop acceptance run should confirm that the agent scrolls the requested section into view, produces the browser audit, and presents the corrected focused proposal in chat.
