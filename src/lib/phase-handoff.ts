import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contextStatus, resetContextForPhaseBoundary } from './context.js';
import { listEvidence, matchesAnyExpectedVisualContext } from './evidence.js';
import { loadProjectConfig } from './project.js';
import { scopeGuardStatus } from './scope-guard.js';
import { findTask, getSection, loadTask } from './task.js';
import { loadPhaseBoundary, phaseBoundaryStatus } from './phase-boundary.js';
import { codexFreshChatUrl } from './codex-deeplink.js';
import { targetAudienceRequired } from './product-intelligence.js';
import { isMicroControl, requiresPhaseBoundary } from './control-profile.js';
import { contextProfileForTask, runtimeRoleForPhase } from './phase-role.js';
import { activeRevision } from './revisions.js';
import type { RuntimeRecommendation, TaskDocument } from './types.js';

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function contentDigest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function words(value: string): string[] { return value.trim().split(/\s+/).filter(Boolean); }
function bounded(value: string, maxWords: number): string {
  const parts = words(value);
  if (parts.length <= maxWords) return value.trim();
  return `${parts.slice(0, maxWords).join(' ')}\n\n_[Truncated in runtime handoff. Read the canonical task section if more detail is needed.]_`;
}
function boundedList(values: readonly string[], maxItems = 20): string {
  const items = values.slice(0, maxItems).map(value => `\`${value}\``);
  if (values.length > maxItems) items.push(`_+${values.length - maxItems} more in canonical state_`);
  return items.join(', ') || 'none';
}

const HANDOFF_WORD_LIMITS = { implementer: 3200, reviewer: 1500, 'target-audience': 1200 } as const;

type HandoffRole = 'implementer' | 'reviewer' | 'target-audience';

function handoffFile(root: string, id: string, role: HandoffRole): string {
  return path.join(path.resolve(root), '.ai', 'runtime', 'handoffs', `${id}-${role}.md`);
}

function evidenceRole(kind: string): 'before' | 'proposal' | 'after' | 'supporting' {
  if (['frontend-before', 'frontend-mobile-before'].includes(kind)) return 'before';
  if (['frontend-proposal', 'frontend-mobile-proposal', 'architecture-rendered', 'database-rendered'].includes(kind)) return 'proposal';
  if (['frontend-after', 'frontend-mobile-after', 'architecture-final', 'database-final'].includes(kind)) return 'after';
  return 'supporting';
}
function evidenceFamily(kind: string): 'frontend' | 'architecture' | 'database' | 'other' {
  if (kind.startsWith('architecture-')) return 'architecture';
  if (kind.startsWith('database-')) return 'database';
  if (kind.startsWith('frontend-')) return 'frontend';
  return 'other';
}

function canonicalVisualEvidence(root: string, taskId: string) {
  const selected = new Map<string, ReturnType<typeof listEvidence>[number]>();
  const task=loadTask(findTask(root,taskId));
  for (const item of listEvidence(root, taskId)) {
    const role = evidenceRole(item.kind);
    if (role === 'supporting') continue;
    if(evidenceFamily(item.kind)==='frontend'&&!matchesAnyExpectedVisualContext(task,item)) continue;
    const key = `${evidenceFamily(item.kind)}|${role}|${item.viewport || 'unspecified'}|${item.route || ''}|${item.target || ''}|${item.captureScope || ''}`;
    selected.set(key, item);
  }
  return [...selected.values()].map(item => ({
    id: item.id,
    role: evidenceRole(item.kind),
    kind: item.kind,
    label: item.label,
    path: `.ai/evidence/${taskId}/${item.path}`,
    route: item.route || null,
    viewport: item.viewport || null,
    target: item.target || null,
    captureScope: item.captureScope || null,
    runtimeUrl: item.runtimeUrl || null,
    sha256: item.sha256
  }));
}

function handoffSource(
  root: string,
  task: TaskDocument,
  role: HandoffRole,
  scope: ReturnType<typeof scopeGuardStatus>,
  context: ReturnType<typeof contextStatus>
) {
  const previousProfile = context.history.filter(item => item.status === 'profile-reset').at(-1);
  return {
    taskId: task.meta.id,
    role,
    phase: task.meta.phase,
    specApprovalHash: task.meta.spec_approval_hash,
    effectiveSpecHash: task.meta.spec_effective_hash,
    qaMissionHash: task.meta.qa_mission_hash,
    scopeGuardHash: task.meta.scope_guard_hash,
    allowedFiles: scope.allowedFiles,
    protectedFiles: scope.protectedFiles,
    expectedSymbols: 'expectedSymbols' in scope ? scope.expectedSymbols : [],
    contextFiles: context.files.length ? context.files : (previousProfile?.files ?? []),
    contextSymbols: context.symbols.length ? context.symbols : (previousProfile?.symbols ?? []),
    visualEvidence: canonicalVisualEvidence(root, task.meta.id),
    revision: activeRevision(root, task.meta.id),
    projectProduct: role === 'target-audience' ? readFileSync(path.join(path.resolve(root), '.ai', 'project', 'product.md'), 'utf8') : '',
    projectUsers: role === 'target-audience' ? readFileSync(path.join(path.resolve(root), '.ai', 'project', 'users.md'), 'utf8') : '',
    sections: {
      need: getSection(task.body, 'Need').trim(),
      productValue: getSection(task.body, 'Product Value').trim(),
      users: getSection(task.body, 'Users').trim(),
      scope: getSection(task.body, 'Scope').trim(),
      uiTarget: getSection(task.body, 'UI Target').trim(),
      outOfScope: getSection(task.body, 'Out of Scope').trim(),
      acceptance: getSection(task.body, 'Acceptance Criteria').trim(),
      uxProposal: getSection(task.body, 'UX/UI Proposal').trim(),
      implementationPlan: getSection(task.body, 'Implementation Plan').trim(),
      decisions: getSection(task.body, 'Decisions').trim(),
      architecture: getSection(task.body, 'Architecture and Data Design').trim(),
      qaMission: getSection(task.body, 'QA Mission').trim(),
      handoff: getSection(task.body, 'Handoff').trim(),
      qa: getSection(task.body, 'QA').trim(),
      finalCustomer: getSection(task.body, 'Final Customer').trim()
    }
  };
}

function visualEvidenceMarkdown(items: ReturnType<typeof canonicalVisualEvidence>): string {
  if (!items.length) return '_No canonical visual evidence._';
  const shown = items.slice(0, 12);
  const lines = shown.map(item =>
    `- ${item.role.toUpperCase()} · ${item.kind} · \`${item.id}\` · ${bounded(item.label, 18)} · \`${item.path}\`` +
    `${item.route ? ` · route ${item.route}` : ''}${item.target ? ` · target ${item.target}` : ''}${item.viewport ? ` · viewport ${item.viewport}` : ''}${item.captureScope ? ` · capture ${item.captureScope}` : ''}` +
    `${item.runtimeUrl ? ` · runtime ${item.runtimeUrl}` : ''}`
  );
  if (items.length > shown.length) lines.push(`- _+${items.length - shown.length} canonical visual records; read the evidence manifest if needed._`);
  return lines.join('\n');
}

export function writeRuntimeHandoff(root: string, id: string, role: HandoffRole = 'implementer') {
  const task = loadTask(findTask(root, id));
  const file = handoffFile(root, task.meta.id, role);
  const boundaryPhase = role === 'implementer' ? 'builder' : role === 'reviewer' ? 'technical-reviewer' : 'final-customer';
  if (task.meta.phase === boundaryPhase && role !== 'target-audience') {
    const sealed = loadPhaseBoundary(root, task.meta.id, task.meta.phase);
    if (sealed) {
      const existing = readFileSync(file, 'utf8');
      const existingContentDigest = contentDigest(existing);
      if (existingContentDigest !== sealed.handoffContentDigest) throw new Error(`Runtime ${role} handoff integrity check failed; regenerate the phase boundary instead of using modified capsule content`);
      return { path: file, relativePath: path.relative(path.resolve(root), file).split(path.sep).join('/'), sourceDigest: sealed.handoffDigest, contentDigest: existingContentDigest, role, words: words(existing).length, wordLimit: HANDOFF_WORD_LIMITS[role] };
    }
  }
  const scope = scopeGuardStatus(root, id);
  const context = contextStatus(root, id);
  const source = handoffSource(root, task, role, scope, context);
  const sourceDigest = digest(source);
  mkdirSync(path.dirname(file), { recursive: true });
  const sections = source.sections;
  const revision = source.revision;
  const revisionBody = role === 'implementer' && revision
    ? `# ${task.meta.id} · ${revision.id} — revision delta capsule\n\n` +
      `> Bounded user-authorized iteration over the already approved implementation. This is not a new task and not a planning replay. Preserve every governed artifact not named below.\n\n` +
      `- Classification: **${revision.classification}**\n- Request: ${revision.request}\n- Approved specification: \`${task.meta.spec_effective_hash || task.meta.spec_approval_hash || 'not sealed'}\` (preserved)\n- Current implementation generation: \`${task.meta.implementation_generation_id || 'initial'}\`\n- Source digest: \`${sourceDigest}\`\n\n` +
      `## Authority and scope\n\n` +
      `Implement only this delta. Do not reopen Product Specifier, UX planning, architecture, Technical Review, Target Audience, Product Owner, or the full QA Mission unless the requested change proves materially broader than the declared/context-derived delta. If it does, STOP and escalate instead of silently expanding the revision.\n\n` +
      `- Affected files named by the revision: ${boundedList(revision.affectedFiles, 16)}\n` +
      `- Extra files explicitly authorized by the revision: ${boundedList(revision.allowedFiles, 16)}\n` +
      `- Existing Scope Guard still applies: ${boundedList(scope.allowedFiles, 20)}\n` +
      `- Affected ACs: ${revision.affectedAcceptanceCriteria.length ? revision.affectedAcceptanceCriteria.map(x=>`\`${x}\``).join(', ') : 'none explicitly invalidated'}\n\n` +
      `## Test policy for exploratory revision\n\n` +
      `**Do not design or create a new test before implementing this revision.** The user is still evaluating what the desired result should be, so speculative test-first work would freeze an unstable idea and waste context/tokens. Implement the smallest delta first. After implementation, run only cheap, directly relevant validation. Existing tests may be run after the change when cheap and useful. Decide whether a permanent regression test is worth adding only after the revision is accepted/stabilized.\n\n` +
      `## Required sequence\n\n` +
      `1. Read this delta capsule; do not reconstruct the full planning history.\n` +
      `2. Inspect only the smallest files/symbols needed for the requested delta.\n` +
      `3. Implement the delta without changing preserved product/architecture decisions.\n` +
      `4. Do not create speculative tests.\n` +
      `5. Stop Builder. SpecRail will compare the revision baseline with the real implementation delta, bind a new implementation generation, recompute affected artifacts from that delta, and route only the resulting validation.\n\n` +
      `## Dependency-selected invalidation\n\n- Change signals: ${(revision.changeSignals||revision.impact).map(x=>`\`${x}\``).join(', ') || 'implementation-output'}\n- Invalidated artifacts: ${(revision.invalidatedArtifacts||[]).map(x=>`\`${x}\``).join(', ') || 'legacy revision validation'}\n- Derived validation phases: ${(revision.requiredPhases||['qa-engineer']).map(x=>`\`${x}\``).join(' → ')}\n\n` +
      `## Targeted post-implementation validation\n\n${revision.revalidateEvidenceKinds.map(x=>`- \`${x}\``).join('\n')}\n\n` +
      `## Preserved artifacts\n\n${revision.preservedArtifacts.map(x=>`- ${x}`).join('\n')}\n\n` +
      `## Stop and escalate\n\nIf the delta requires a product-outcome change, new user flow, architecture/security/migration decision, breaking contract, or broad scope expansion, do not force it through Revision. Use the narrowest Amendment/specification path instead.\n`
    : null;
  const body = revisionBody || (role === 'implementer'
    ? `# ${task.meta.id} — implementation capsule\n\n` +
      `> Compiled execution contract for the Builder. Previous conversational reasoning is non-authoritative. Execute this capsule and the sealed SpecRail artifacts; do not redesign, reinterpret, or replay planning. Read the full canonical task only when this capsule explicitly says content was truncated or a concrete conflict requires source verification.\n\n` +
      `- Role: **implementer**\n- Approved specification: \`${task.meta.spec_effective_hash || task.meta.spec_approval_hash || 'not sealed'}\`\n- QA Mission: \`${task.meta.qa_mission_hash || 'not sealed'}\`\n- Scope Guard: \`${task.meta.scope_guard_hash || 'not sealed'}\`\n- Source digest: \`${sourceDigest}\`\n\n` +
      `## Execution authority\n\n` +
      `1. Acceptance Criteria, Scope Guard, approved UX/UI proposal, architecture/decisions, approved Amendments, and QA Mission are authoritative.\n` +
      `2. Earlier chat prose, discarded alternatives, speculative ideas, and implementation suggestions are not requirements.\n` +
      `3. You may choose local implementation details only when they do not change observable behavior, scope, architecture, contracts, or approved UX.\n` +
      `4. If satisfying the task requires a material product, scope, architecture, contract, security, migration, or UX decision, STOP and create the appropriate blocker/Amendment instead of improvising.\n\n` +
      `## Required execution sequence\n\n` +
      `1. Read this capsule completely before editing.\n` +
      `2. Inspect the listed context seeds and allowed files first; do not proactively search generic Kanban, memory, process, or task-instruction files unless they are listed here or a concrete implementation need requires them. Expand through CodeGraph only with a concrete implementation reason.\n` +
      `3. Implement the smallest coherent change that satisfies every effective AC without touching protected scope.\n` +
      `4. Run the required build/tests and the immutable QA Mission.\n` +
      `${task.meta.surfaces.includes('frontend') ? (isMicroControl(task) ? `5. Run the changed frontend through its HTTP dev/preview server, capture focused AFTER evidence from that served URL, and record matching layout validation. A micro change does not require Before/Proposal/ImageGen. Never validate raw index.html or file://.\n6. Record implementation evidence and stop at Final Approval; do not self-approve.\n\n` : `5. Run frontend work through its HTTP dev/preview server, capture AFTER evidence from that served URL, and compare the evidence required by the governed control profile. Never validate raw index.html or file://.\n6. Record implementation evidence and ${task.meta.route.technical_review!=='none'?'return the task to independent Technical Review':'continue only through the routed validation phases'}; do not self-approve.\n\n`) : `5. Record implementation evidence and ${task.meta.route.technical_review!=='none'?'return the task to independent Technical Review':'continue only through the routed validation phases'}; do not self-approve.\n\n`}` +
      `## Need\n\n${bounded(sections.need, 120)}\n\n` +
      `## Product value / users\n\n${bounded(`${sections.productValue}\n\n${sections.users}`, 120)}\n\n` +
      `## Scope\n\n${bounded(sections.scope, 180)}\n\n` +
      `## UI target\n\n${bounded(sections.uiTarget, 120) || '_Not applicable._'}\n\n` +
      `## Out of scope\n\n${bounded(sections.outOfScope, 100)}\n\n` +
      `## Acceptance criteria\n\n${bounded(sections.acceptance, 420)}\n\n` +
      `## Approved UX/UI proposal\n\n${bounded(sections.uxProposal, 180) || '_No textual UX/UI proposal section._'}\n\n` +
      `## Canonical visual evidence\n\n${visualEvidenceMarkdown(source.visualEvidence)}\n\n` +
      `## Implementation plan\n\n${bounded(sections.implementationPlan, 240)}\n\n` +
      `## Architecture / data constraints\n\n${bounded(sections.architecture, 180)}\n\n` +
      `## Decisions\n\n${bounded(sections.decisions, 140)}\n\n` +
      `## Immutable QA Mission\n\n${bounded(sections.qaMission, 220)}\n\n` +
      `## Blast radius\n\n- Allowed files: ${boundedList(scope.allowedFiles)}\n- Protected files: ${boundedList(scope.protectedFiles)}\n` +
      `${'expectedSymbols' in scope && Array.isArray(scope.expectedSymbols) && scope.expectedSymbols.length ? `- Expected symbols: ${boundedList(scope.expectedSymbols)}\n` : ''}\n` +
      `## Progressive context seeds\n\n- Files already justified: ${source.contextFiles.slice(0, 16).map(x => `\`${x}\``).join(', ') || 'none'}\n- Symbols already justified: ${source.contextSymbols.slice(0, 24).map(x => `\`${x}\``).join(', ') || 'none'}\n- Expand through progressive CodeGraph reads only when implementation requires it; do not scan the repository wholesale.\n\n` +
      `## Definition of done\n\n` +
      `- Every effective Acceptance Criterion is implemented.\n- No protected file or unapproved scope is changed.\n- Required build/tests and QA Mission have been executed with real evidence.\n- Required frontend/architecture/database visual evidence is recorded from a valid runtime/rendered artifact.\n- No unresolved blocker or material decision is hidden in the implementation.\n- Builder stops at the next routed gate; when Technical Review is disabled by a governed control profile, it must not invent an extra reviewer phase.\n\n` +
      `## Stop and escalate\n\n` +
      `STOP instead of guessing when: an AC conflicts with another governed artifact; the approved proposal cannot be implemented inside Scope Guard; a protected file must change; a contract would become breaking/unknown; a material architecture/security/migration decision appears; or required evidence cannot be produced. Record the blocked AC and the minimum decision required.\n\n` +
      `## Existing handoff notes\n\n${bounded(sections.handoff, 120) || '_None._'}\n`
    : role === 'reviewer'
      ? `# ${task.meta.id} — review handoff\n\n` +
      `> Deterministic SpecRail review packet. Review the implementation against the approved specification and evidence; do not inherit implementation assumptions from chat history.\n\n` +
      `- Preferred role: **reviewer**\n- Approved specification: \`${task.meta.spec_effective_hash || task.meta.spec_approval_hash || 'not sealed'}\`\n- QA Mission: \`${task.meta.qa_mission_hash || 'not sealed'}\`\n- Source digest: \`${sourceDigest}\`\n\n` +
      `## Acceptance criteria\n\n${bounded(sections.acceptance, 380)}\n\n` +
      `## Scope / UI target\n\n${bounded(`${sections.scope}\n\n${sections.uiTarget}`, 220)}\n\n` +
      `## Implementation delta\n\n- Changed files: ${boundedList(scope.actualFiles || [], 28)}\n- Unexpected files: ${boundedList(scope.unexpectedFiles || [], 16)}\n- Protected changes: ${boundedList(scope.protectedChanges || [], 16)}\n- Worktree: ${task.meta.worktree_path ? `\`${task.meta.worktree_path}\`` : 'local repository'}\n\n` +
      `## Decisions / architecture\n\n${bounded(`${sections.decisions}\n\n${sections.architecture}`, 220)}\n\n` +
      `## Canonical visual evidence\n\n${visualEvidenceMarkdown(source.visualEvidence)}\n\n` +
      `## QA Mission\n\n${bounded(sections.qaMission, 200)}\n\n` +
      `## Current QA / customer evidence summaries\n\n${bounded(`${sections.qa}\n\n${sections.finalCustomer}`, 220) || '_Not recorded yet._'}\n`
      : `# ${task.meta.id} — target audience handoff\n\n` +
        `> Fresh-context product evaluation packet. Act only as the configured target audience. Do not inspect source code, diffs, implementation plans, architecture internals, private Builder/Reviewer handoffs, or previous chat reasoning. Judge the result from user-visible behavior and the product/audience context below.\n\n` +
        `- Role: **target audience**\n- Fresh session: **required**\n- Source digest: \`${sourceDigest}\`\n\n` +
        `## Product\n\n${bounded(source.projectProduct, 220)}\n\n` +
        `## Audience profiles\n\n${bounded(source.projectUsers, 260)}\n\n` +
        `## User-visible intent\n\n${bounded(`${sections.need}\n\n${sections.productValue}\n\n${sections.users}\n\n${sections.uiTarget}`, 260)}\n\n` +
        `## Canonical visible evidence\n\n${visualEvidenceMarkdown(source.visualEvidence)}\n\n` +
        `## Evaluation contract\n\n` +
        `Evaluate comprehension, utility, discoverability, friction, trust, and repeat value from the perspective of the requested profile. Interact only through the public/runtime surface available to a real user. Do not derive answers from tests, source code, internal acceptance criteria, implementation notes, architecture, or QA conclusions. If the visible result is insufficient to judge a dimension, mark it as a finding instead of guessing.\n`);
  const wordCount = words(body).length;
  const wordLimit = HANDOFF_WORD_LIMITS[role];
  if (wordCount > wordLimit) throw new Error(`Runtime ${role} handoff exceeds its deterministic word budget: ${wordCount}/${wordLimit}. Keep canonical detail in task/evidence state and shrink the runtime seed.`);
  const persistedBody = body.endsWith('\n') ? body : `${body}\n`;
  writeFileSync(file, persistedBody);
  return {
    path: file,
    relativePath: path.relative(path.resolve(root), file).split(path.sep).join('/'),
    sourceDigest,
    contentDigest: contentDigest(persistedBody),
    role,
    words: wordCount,
    wordLimit
  };
}

export function runtimeRecommendation(root: string, id: string, options: { sessionId?: string | null } = {}): RuntimeRecommendation {
  const task = loadTask(findTask(root, id));
  const role = task.meta.phase === 'final-customer' && targetAudienceRequired(root) ? 'target-audience' : runtimeRoleForPhase(task.meta.phase);
  const contextProfile = role === 'system' ? null : contextProfileForTask(loadProjectConfig(root), task);
  const handoff = role === 'implementer'
    ? writeRuntimeHandoff(root, id, 'implementer')
    : role === 'reviewer'
      ? writeRuntimeHandoff(root, id, 'reviewer')
      : role === 'target-audience'
        ? writeRuntimeHandoff(root, id, 'target-audience')
        : null;
  const handoffText = handoff ? readFileSync(handoff.path, 'utf8') : '';
  const boundaryPhase = (task.meta.phase === 'final-customer' && role === 'target-audience') || requiresPhaseBoundary(task,task.meta.phase);
  const existingBoundary = boundaryPhase ? loadPhaseBoundary(root, id, task.meta.phase) : null;
  const boundary = handoff && boundaryPhase
    ? phaseBoundaryStatus(root, id, { sessionId: options.sessionId ?? null, originSessionId: task.meta.phase === 'final-customer' ? String(task.meta.target_audience_origin_session_id || '') || null : null, handoffDigest: handoff.sourceDigest, handoffContentDigest: handoff.contentDigest, handoffWords: handoff.words })
    : null;
  const boundaryChanged = Boolean(boundary && (!existingBoundary || boundary.recordDigest !== existingBoundary.recordDigest));
  if (boundaryChanged) resetContextForPhaseBoundary(root, id, `Phase boundary prepared for ${task.meta.phase}; preserve previous-phase context only through the sealed runtime handoff.`);
  const currentSession=String(options.sessionId||'').trim()||null;
  const sessionEntryRequired=Boolean(boundary&&(boundary.status!=='entered'||!currentSession||boundary.enteredSessionId!==currentSession));
  const stopBeforePhaseWork=sessionEntryRequired;
  const freshSessionRecommended = boundary?.recommendation === 'fresh-chat-recommended' || boundary?.recommendation === 'fresh-chat-required';
  const transferRequired=Boolean(boundary?.status==='entered'&&sessionEntryRequired);
  const transitionNotice = sessionEntryRequired && handoff
    ? {
        kind: role === 'implementer' ? 'implementation-handoff' as const : role === 'target-audience' ? 'target-audience-handoff' as const : 'review-handoff' as const,
        title: transferRequired ? 'Phase ownership must be entered in this Codex session' : role === 'target-audience' ? 'Fresh Target Audience session required' : boundary?.status==='chosen' ? 'Phase boundary choice recorded; entry required' : role === 'implementer' ? 'Implementation boundary ready' : 'Independent review boundary ready',
        message: transferRequired
          ? `${task.meta.id} is already inside the ${role === 'implementer' ? 'implementation' : role === 'target-audience' ? 'Target Audience' : 'review'} phase, but that phase boundary belongs to another Codex session (${boundary?.enteredSessionId || 'unknown'}). Do not continue phase work from this chat until this session explicitly enters the boundary; an active lease may require a user-approved takeover.`
          : role === 'target-audience'
            ? `QA/review is sealed for ${task.meta.id}. Target Audience evaluation MUST start in a different stable session from the prior implementation/QA session. Open a fresh chat/subagent, enter the boundary there, and use only the audience handoff plus user-visible runtime/evidence. Same-chat audience simulation is rejected by SpecRail.`
            : boundary?.status==='chosen'
              ? `The user's native boundary choice is already persisted as ${boundary.choice}. Do not ask the selector again. Enter the ${role === 'implementer' ? 'implementation' : 'review'} boundary in this session before reading generic repository process/Kanban memory or doing phase work, then execute from the compiled capsule.`
          : role === 'implementer'
            ? `Planning is sealed for ${task.meta.id}. End this turn before coding. Next turn you may continue in this chat or open a fresh Codex chat; SpecRail does not choose or store a model; the Codex selector remains authoritative. ${boundary?.recommendation === 'fresh-chat-recommended' ? 'A fresh chat is recommended because it removes the planning conversation from implementation context and lets a less-capable implementer start from the compiled capsule.' : 'This is a small low-risk task, so continuing in the same chat is reasonable; a fresh chat remains available for stronger isolation.'}`
            : `Implementation is sealed for ${task.meta.id}. End this turn before independent review. Next turn you may continue in this chat or open a fresh Codex chat. ${boundary?.recommendation === 'fresh-chat-recommended' ? 'A fresh chat is recommended to remove builder assumptions from reviewer context.' : 'For this small low-risk change, same-chat review is acceptable after entering the review boundary.'}`,
        resumePrompt: `Continue ${task.meta.id}`,
        freshChatUrl: codexFreshChatUrl(root,task.meta.id)
      }
    : null;
  return {
    role,
    strategy: boundaryPhase ? 'phase-boundary-handoff' : role==='implementer' ? 'direct-capsule-handoff' : 'phase-boundary-handoff',
    contextProfile,
    freshSessionRecommended,
    stopBeforePhaseWork,
    sessionEntryRequired,
    handoffPath: handoff?.path ?? null,
    handoffRelativePath: handoff?.relativePath ?? null,
    handoffDigest: handoff?.sourceDigest ?? null,
    handoffContentDigest: handoff?.contentDigest ?? null,
    handoffWords: handoff?.words ?? null,
    handoffWordLimit: handoff?.wordLimit ?? null,
    handoffEstimatedTokens: handoff ? Math.max(1, Math.ceil(Buffer.byteLength(handoffText, 'utf8') / 4)) : null,
    handoffTruncated: handoffText.includes('_[Truncated in runtime handoff.'),
    boundary: boundary ? {
      status: boundary.status,
      recommendation: boundary.recommendation,
      sameChatAllowed: boundary.sameChatAllowed,
      choice: boundary.choice,
      choiceSessionId: boundary.choiceSessionId,
      mode: boundary.mode,
      originSessionId: boundary.originSessionId,
      enteredSessionId: boundary.enteredSessionId
    } : null,
    rationale: role === 'thinker'
      ? `Keep planning/refinement on a bounded ${contextProfile} repository context. The model and reasoning setting remain whatever the user selected in Codex.`
      : role === 'implementer'
        ? `Implementation starts from the compiled capsule plus ${contextProfile} progressive repository context. The capsule is optimized for execution by a less-capable model: governed decisions are explicit and material ambiguity must escalate instead of being reinterpreted.`
        : role === 'reviewer'
          ? `Independent review starts from a compact ${contextProfile} context plus the deterministic review handoff, diff, evidence, and progressive CodeGraph. No model configuration is stored by SpecRail.`
          : role === 'target-audience'
            ? `Target Audience evaluation starts in a mandatory fresh session with a user-facing handoff only. Source code, diff, architecture internals, QA conclusions, and previous chat reasoning are intentionally excluded.`
            : 'No phase handoff is needed for this system phase.',
    transitionNotice,
    transitionInstruction: transitionNotice && handoff
      ? role === 'target-audience'
        ? `STOP before doing Target Audience evaluation in this turn. Show the transition notice once and end the turn. Open a fresh session; same-session entry is forbidden. Enter the phase boundary there, then treat ${handoff.relativePath} as the compiled phase contract. Previous conversational reasoning is non-authoritative. Do not read the full canonical task, source code, diff, architecture internals, private implementation/review handoffs, or QA conclusions; evaluate only user-visible behavior and the audience packet.`
        : boundary?.status==='chosen'
          ? `The native phase-boundary choice is already persisted as ${boundary.choice}. Do not ask it again. Before reading generic repository process files or doing ${role === 'implementer' ? 'implementation' : 'independent review'} work, enter the phase boundary in this Codex session, then treat ${handoff.relativePath} as the compiled phase contract. Previous conversational reasoning is non-authoritative. Do not replay the previous chat and do not reread generic Kanban/memory/process files unless the capsule names them, a concrete conflict requires source verification, or a specific missing implementation detail requires them.`
          : `STOP before doing ${role === 'implementer' ? 'implementation' : 'independent review'} work in this turn. Show the transition notice once, persist the exact native boundary choice, and end the turn. If the user chooses a fresh chat, open transitionNotice.freshChatUrl so Codex creates a new local chat in this workspace with the deterministic resume prompt prefilled; the user still sends it. On the next user turn or in the selected fresh chat, enter the phase boundary first. Then treat ${handoff.relativePath} as the compiled phase contract. Previous conversational reasoning is non-authoritative. Do not replay the previous chat and do not reread generic Kanban/memory/process files unless the capsule names them, a concrete conflict requires source verification, or a specific missing implementation detail requires them.`
      : handoff && role==='implementer' && !boundaryPhase
        ? `This ${String(task.meta.route.control_profile||'low-cost')} task does not require a blocking model/context boundary. Treat ${handoff.relativePath} as the compiled implementation contract and continue directly in the current approved turn; do not invent a boundary selector or an extra Continue turn.`
        : null
  };
}
