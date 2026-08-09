#!/usr/bin/env node
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initProject, findProjectRoot, resolveRepositoryRoot, projectContextStatus, completeProjectContext, appendProjectLearning } from './lib/project.js';
import { createTask, listTasks, findTask, loadTask, saveTask, setSection, patchTask, addDependency, createSubtask, resolveTaskReference } from './lib/task.js';
import { addQuestion, answerQuestion, listQuestions } from './lib/questions.js';
import { addEvidence, listEvidence, validateEvidence, visualEvidenceDigest } from './lib/evidence.js';
import { startRefinement, completePhase, approveSpecification, requestSpecChanges, rejectTask, startExecution, blockTask, resumeTask, returnTask, approveFinal, rejectFinal, completeDelivery, approveAmendmentDecision, rejectAmendmentDecision } from './lib/workflow.js';
import { createWorktree, checkpointWorktree, removeWorktree } from './lib/worktree.js';
import { doctor, doctorFixPlan, applyDoctorFixes } from './lib/doctor.js';
import { nextAction } from './lib/next.js';
import { intakeTask, ensureTaskCodeGraph } from './lib/automation.js';
import { prepareCodeGraph } from './lib/codegraph.js';
import { interactionForTask } from './lib/interactions.js';
import { recordTaskLearning } from './lib/learning.js';
import { lintSpecification } from './lib/specification.js';
import { writeReviewBundle } from './lib/review.js';
import { writeReviewCockpit } from './lib/cockpit.js';
import { acquireTaskLease, leaseStatus, releaseTaskLease, takeTaskLease } from './lib/lease.js';
import { contextStatus, requestContextExpansion } from './lib/context.js';
import { getVisualizationCapability, getVisualizationPlan, getVisualizationRun, recordVisualizationCapability, recordVisualizationRun } from './lib/capabilities.js';
import { validateVisualizationPlan } from './lib/visualization.js';
import { validateAgentPlugin } from './lib/plugin.js';
import { qaMissionHash, qaMissionText, validateQAMission } from './lib/qa.js';
import { recordFailure, listFailures, listEvalCandidates, approveEvalCandidate, dismissEvalCandidate } from './lib/failures.js';
import { repairStatus, resetRepairBudget } from './lib/repairs.js';
import { taskMetrics } from './lib/metrics.js';
import { listTrace, validateTrace } from './lib/trace.js';
import { addConstitutionPrinciple, checkConstitution, listConstitution } from './lib/constitution.js';
import { qualityPolicy } from './lib/quality.js';
import { operationalPolicy } from './lib/observability.js';
import { createSlicePlan, loadSlicePlan, materializeSlices } from './lib/slices.js';
import { taskReadiness } from './lib/readiness.js';
import { createReplay, replayStatus, startReplayVariant, completeReplayVariant, compareReplay, cleanupReplay, replayScenarios, recordReplayEvent, listReplayEvents } from './lib/replay.js';
import { recommendHarness } from './lib/policy.js';
import { acceptanceCoverage } from './lib/acceptance.js';
import { setBlastRadius, scopeGuardStatus } from './lib/scope-guard.js';
import { proposeAmendment, listAmendments } from './lib/amendments.js';
import { inferUpdateChannel, updateSpecRail, type UpdateChannel } from './lib/update.js';
import { choosePhaseBoundary, enterPhaseBoundary } from './lib/phase-boundary.js';
import { estimatePhaseBoundary } from './lib/boundary-metrics.js';
import { runtimeRecommendation } from './lib/phase-handoff.js';
import { finalPresentation, specificationPresentation } from './lib/presentation.js';
import { recordPresentationAction, type PresentationGate } from './lib/presentation-state.js';
import type { PresentationActionOutcome } from './lib/types.js';
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_META = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version?: string };
const VERSION = PACKAGE_META.version || '0.0.0';
type Flags = Record<string, any>;
function parse(argv: string[]): { positional: string[]; flags: Flags } { const positional: string[] = []; const flags: Flags = {}; for (let i = 0; i < argv.length; i++) {
    const v = argv[i]!;
    if (v.startsWith('--')) {
        const key = v.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--'))
            flags[key] = true;
        else {
            flags[key] = next;
            i++;
        }
    }
    else
        positional.push(v);
} return { positional, flags }; }
function output(value: unknown, json = false) { if (json)
    console.log(JSON.stringify(value, null, 2));
else if (typeof value === 'string')
    console.log(value);
else
    console.log(JSON.stringify(value, null, 2)); }
function requireFlag(flags: Flags, name: string): any { if (flags[name] === undefined)
    throw new Error(`Missing --${name}`); return flags[name]; }
function surfaces(value: unknown): string[] { return String(value || '').split(',').map((x: any) => x.trim()).filter(Boolean); }
function rootFrom(flags: Flags): string { return path.resolve(flags.root || process.cwd()); }
function jsonValue(value: unknown): any { if (value === undefined) return undefined; const text=String(value); if (existsSync(path.resolve(text))) return JSON.parse(readFileSync(path.resolve(text),'utf8')); return JSON.parse(text); }
function booleanFlag(value: unknown, defaultValue = true): boolean { if (value === undefined)
    return defaultValue; if (value === true)
    return true; return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase()); }
function taskSummary(task: any): Record<string, unknown> { return { id: task.meta.id, title: task.meta.title, status: task.meta.status, phase: task.meta.phase, waitingFor: task.meta.waiting_for, openQuestions: task.meta.open_questions, specApproval: task.meta.spec_approval, finalApproval: task.meta.final_approval, deliveryStatus: task.meta.delivery_status || null, path: task.path }; }
function reference(parts: string[], start = 1): string { return parts.slice(start).join(' ').trim(); }
async function main() {
    const { positional: p, flags } = parse(process.argv.slice(2));
    const arg = (index: number): string => p[index] ?? '';
    const command = arg(0);
    const json = Boolean(flags.json);
    let root;
    if (flags.version || command === 'version') {
        output(VERSION);
        return;
    }
    switch (command) {
        case 'install':
            await import(new URL('../../scripts/install.mjs', import.meta.url).href);
            break;
        case 'update': {
            if (flags.beta && flags.latest) throw new Error('Use only one update channel: --beta or --latest');
            const channel: UpdateChannel = flags.beta ? 'beta' : flags.latest ? 'latest' : inferUpdateChannel(VERSION);
            if (!json) console.log(`Updating SpecRail ${VERSION} from the ${channel} channel...`);
            const result = updateSpecRail({ currentVersion: VERSION, channel, dryRun: Boolean(flags['dry-run']) });
            if (json) output(result, true);
            else if (result.status === 'planned') console.log(`Update plan: ${result.target}; then refresh the managed Codex installation.`);
            else if (result.changed) console.log(`SpecRail updated ${result.fromVersion} → ${result.toVersion} (${result.channel}); managed Codex assets refreshed.`);
            else console.log(`SpecRail ${result.toVersion} is current on ${result.channel}; managed Codex assets refreshed.`);
            break;
        }
        case 'init':
            root = rootFrom(flags);
            output(initProject(root, { name: flags.name }), json);
            break;
        case 'intake': {
            root = rootFrom(flags);
            const result = intakeTask(root, { title: p.slice(1).join(' ') || requireFlag(flags, 'title'), need: flags.need, type: flags.type || 'task', surfaces: surfaces(flags.surfaces), size: flags.size, risk: flags.risk, executionProfile: flags.profile, projectName: flags['project-name'] });
            output({ ...result, task: taskSummary(result.task) }, true);
            break;
        }
        case 'project': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'status')
                output(projectContextStatus(root), true);
            else if (arg(1) === 'complete')
                output(completeProjectContext(root, flags.summary), true);
            else if (arg(1) === 'learn')
                output(recordTaskLearning(root, flags.task || arg(2), requireFlag(flags, 'text')), true);
            else
                throw new Error('Unknown project command');
            break;
        }
        case 'create':
            root = findProjectRoot(rootFrom(flags));
            output(taskSummary(createTask(root, { title: p.slice(1).join(' ') || requireFlag(flags, 'title'), type: flags.type || 'task', surfaces: surfaces(flags.surfaces), size: flags.size, risk: flags.risk, executionProfile: flags.profile })), json);
            break;
        case 'list':
            root = findProjectRoot(rootFrom(flags));
            output(listTasks(root).map(taskSummary), true);
            break;
        case 'resolve': {
            root = findProjectRoot(rootFrom(flags));
            const ref = reference(p) || requireFlag(flags, 'reference');
            const resolved = resolveTaskReference(root, ref);
            if (resolved.status === 'matched') {
                const prepared = ensureTaskCodeGraph(root, resolved.task.meta.id);
                output({ status: 'matched', reference: ref, task: taskSummary(prepared.task), codegraph: prepared.codegraph, next: nextAction(root, prepared.task.meta.id, { sessionId: flags.session }) }, true);
            }
            else
                output(resolved, true);
            break;
        }
        case 'status':
            root = findProjectRoot(rootFrom(flags));
            output(taskSummary(loadTask(findTask(root, reference(p)))), true);
            break;
        case 'readiness':
        case 'why-blocked':
            root = findProjectRoot(rootFrom(flags));
            output(taskReadiness(root, reference(p), { sessionId: flags.session ? String(flags.session) : null }), true);
            break;
        case 'next':
            root = findProjectRoot(rootFrom(flags));
            output(nextAction(root, reference(p), { sessionId: flags.session }), true);
            break;
        case 'interaction':
            root = findProjectRoot(rootFrom(flags));
            output(interactionForTask(root, reference(p), flags.kind || 'current', { sessionId: flags.session ? String(flags.session) : null }), true);
            break;
        case 'patch':
            root = findProjectRoot(rootFrom(flags));
            output(taskSummary(patchTask(root, arg(1), JSON.parse(requireFlag(flags, 'json-data')))), true);
            break;
        case 'refine': {
            root = findProjectRoot(rootFrom(flags));
            const prepared = ensureTaskCodeGraph(root, reference(p));
            if (!prepared.codegraph.ok)
                output({ ...taskSummary(prepared.task), codegraph: prepared.codegraph }, true);
            else
                output(taskSummary(startRefinement(root, prepared.task.meta.id)), true);
            break;
        }
        case 'section': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) !== 'set')
                throw new Error('Use: specrail section set TASK "Heading" --text ... or --file ...');
            const task = loadTask(findTask(root, arg(2)));
            const content = flags.file ? readFileSync(path.resolve(flags.file), 'utf8') : requireFlag(flags, 'text');
            task.body = setSection(task.body, arg(3), content);
            output(taskSummary(saveTask(task)), true);
            break;
        }
        case 'question': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'add')
                output(addQuestion(root, arg(2), { text: requireFlag(flags, 'text'), category: flags.category, impact: flags.impact, options: flags.options ? JSON.parse(flags.options) : [], recommendation: flags.recommendation }), true);
            else if (arg(1) === 'answer')
                output(taskSummary(answerQuestion(root, arg(2), arg(3), requireFlag(flags, 'answer'))), true);
            else if (arg(1) === 'list')
                output(listQuestions(root, arg(2)), true);
            else
                throw new Error('Unknown question command');
            break;
        }
        case 'phase': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) !== 'complete')
                throw new Error('Use: specrail phase complete TASK');
            const completed = completePhase(root, arg(2), { sessionId: flags.session });
            output({ ...taskSummary(completed), next: nextAction(root, completed.meta.id, { sessionId: flags.session ? String(flags.session) : null }) }, true);
            break;
        }
        case 'spec':
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'approve') {
                const approved = approveSpecification(root, arg(2), flags.note, { sessionId: flags.session });
                const next = nextAction(root, approved.meta.id, { sessionId: flags.session ? String(flags.session) : null });
                output({ ...taskSummary(approved), approved: true, userInputRequired: next.userInputRequired, interaction: next.interaction, next }, true);
            }
            else if (arg(1) === 'changes')
                output(taskSummary(requestSpecChanges(root, arg(2), requireFlag(flags, 'note'), { sessionId: flags.session })), true);
            else if (arg(1) === 'reject')
                output(taskSummary(rejectTask(root, arg(2), flags.note, { sessionId: flags.session })), true);
            else if (arg(1) === 'lint') {
                const task = loadTask(findTask(root, arg(2)));
                output(lintSpecification(task, { stage: flags.stage || 'approval' }), true);
            }
            else
                throw new Error('Unknown spec command');
            break;
        case 'run': {
            root = findProjectRoot(rootFrom(flags));
            const prepared = ensureTaskCodeGraph(root, reference(p));
            if (!prepared.codegraph.ok)
                output({ ...taskSummary(prepared.task), codegraph: prepared.codegraph }, true);
            else
                output(taskSummary(startExecution(root, prepared.task.meta.id, { sessionId: flags.session })), true);
            break;
        }
        case 'block':
            root = findProjectRoot(rootFrom(flags));
            output(taskSummary(blockTask(root, reference(p), requireFlag(flags, 'reason'))), true);
            break;
        case 'resume':
            root = findProjectRoot(rootFrom(flags));
            output(taskSummary(resumeTask(root, reference(p), { sessionId: flags.session })), true);
            break;
        case 'return':
            root = findProjectRoot(rootFrom(flags));
            output(taskSummary(returnTask(root, arg(1), requireFlag(flags, 'to'), requireFlag(flags, 'reason'))), true);
            break;
        case 'final':
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'approve')
                output(taskSummary(approveFinal(root, arg(2), flags.note, { sessionId: flags.session })), true);
            else if (arg(1) === 'reject')
                output(taskSummary(rejectFinal(root, arg(2), requireFlag(flags, 'note'), flags['return-to'] || 'builder', { sessionId: flags.session })), true);
            else
                throw new Error('Unknown final command');
            break;
        case 'evidence': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'add')
                { const attrs=(flags.attributes?jsonValue(flags.attributes):{}) as Record<string,unknown>; if(flags.proves) attrs.proves=surfaces(flags.proves); output(addEvidence(root, arg(2), { kind: requireFlag(flags, 'kind'), path: requireFlag(flags, 'path'), source: requireFlag(flags, 'source'), label: flags.label, tool: flags.tool, command: flags.command, exitCode: flags['exit-code'] === undefined ? null : Number(flags['exit-code']), route: flags.route, viewport: flags.viewport, target: flags.target, captureScope: flags['capture-scope'], runtimeUrl: flags.url, missionHash: flags['mission-hash'], attributes: attrs as any }), true); }
            else if (arg(1) === 'list')
                output(listEvidence(root, arg(2)), true);
            else if (arg(1) === 'validate')
                output(validateEvidence(root, arg(2), flags.stage || 'all'), true);
            else if (arg(1) === 'digest')
                output({taskId:arg(2),stage:flags.stage||'proposal',digest:visualEvidenceDigest(root,arg(2),flags.stage==='final'?'final':'proposal')},true);
            else
                throw new Error('Unknown evidence command');
            break;
        }
        case 'acceptance': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='coverage') output(acceptanceCoverage(root,arg(2)),true);
            else throw new Error('Use: specrail acceptance coverage TASK');
            break;
        }
        case 'scope': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='set') { const value=flags.file?jsonValue(flags.file):{allowedFiles:surfaces(requireFlag(flags,'allowed-files')),protectedFiles:surfaces(flags['protected-files']),expectedSymbols:surfaces(flags.symbols),reason:requireFlag(flags,'reason')}; output(setBlastRadius(root,arg(2),value),true); }
            else if(arg(1)==='status') output(scopeGuardStatus(root,arg(2)),true);
            else throw new Error('Use: specrail scope set|status TASK');
            break;
        }
        case 'amendment': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='propose') { const value=flags.file?jsonValue(flags.file):{title:requireFlag(flags,'title'),reason:requireFlag(flags,'reason'),changes:surfaces(requireFlag(flags,'changes')),acceptanceCriteria:surfaces(flags['acceptance-criteria']),allowedFiles:surfaces(flags['allowed-files']),protectedFilesRemoved:surfaces(flags['unprotect-files']),scopeAdditions:surfaces(flags['scope-additions'])}; output(proposeAmendment(root,arg(2),value),true); }
            else if(arg(1)==='list') output(listAmendments(root,arg(2)),true);
            else if(arg(1)==='approve') output(approveAmendmentDecision(root,arg(2),arg(3),flags.note||'Approved by user',{sessionId:flags.session?String(flags.session):undefined}),true);
            else if(arg(1)==='reject') output(rejectAmendmentDecision(root,arg(2),arg(3),flags.note||'Rejected by user',{sessionId:flags.session?String(flags.session):undefined}),true);
            else throw new Error('Use: specrail amendment propose|list|approve|reject TASK [AMD-ID]');
            break;
        }
        case 'lease': {
            root = findProjectRoot(rootFrom(flags));
            const id = reference(p, 2) || arg(2);
            if (arg(1) === 'status')
                output(leaseStatus(root, id, flags.session), true);
            else if (arg(1) === 'acquire')
                { const options: any = {}; if (flags.session) options.sessionId = String(flags.session); if (flags['ttl-ms']) options.ttlMs = Number(flags['ttl-ms']); output(acquireTaskLease(root, id, options), true); }
            else if (arg(1) === 'take')
                output(takeTaskLease(root, id, { sessionId: flags.session }), true);
            else if (arg(1) === 'release')
                output(releaseTaskLease(root, id, { sessionId: flags.session, force: Boolean(flags.force) }), true);
            else
                throw new Error('Unknown lease command');
            break;
        }
        case 'boundary': {
            root = findProjectRoot(rootFrom(flags));
            const taskId = arg(2) || arg(1);
            const sub = arg(1);
            if (sub === 'status') {
                output(runtimeRecommendation(root, taskId, { sessionId: flags.session }), true);
            } else if (sub === 'choose') {
                const runtime = runtimeRecommendation(root, taskId, { sessionId: flags.session });
                if (!runtime.handoffDigest) throw new Error('No active implementation/review boundary for this task');
                if (!flags.session) throw new Error('Boundary choose requires --session <stable-codex-session-id>');
                const rawChoice=String(requireFlag(flags,'choice'));
                const choice=rawChoice==='current'?'continue-current':rawChoice==='pause'?'pause-model-change':rawChoice==='fresh'?'fresh-chat':rawChoice;
                const boundary = choosePhaseBoundary(root, taskId, choice as 'continue-current'|'pause-model-change'|'fresh-chat', { sessionId: flags.session, handoffDigest: runtime.handoffDigest, handoffContentDigest: runtime.handoffContentDigest, handoffWords: runtime.handoffWords });
                output({ boundary, runtime: runtimeRecommendation(root, taskId, { sessionId: flags.session }) }, true);
            } else if (sub === 'enter') {
                const runtime = runtimeRecommendation(root, taskId, { sessionId: flags.session });
                if (!runtime.handoffDigest) throw new Error('No active implementation/review boundary for this task');
                if (!flags.session) throw new Error('Boundary enter requires --session <stable-codex-session-id>');
                if (flags.mode) throw new Error('Boundary mode is inferred from stable session IDs and cannot be supplied manually');
                const boundary = enterPhaseBoundary(root, taskId, { sessionId: flags.session, handoffDigest: runtime.handoffDigest, handoffContentDigest: runtime.handoffContentDigest, handoffWords: runtime.handoffWords });
                output({ boundary, runtime: runtimeRecommendation(root, taskId, { sessionId: flags.session }) }, true);
            } else if (sub === 'estimate') {
                output(estimatePhaseBoundary(root, taskId, {
                    historyTokens: flags['history-tokens'] === undefined ? null : Number(flags['history-tokens']),
                    implementationTurns: flags.turns === undefined ? null : Number(flags.turns),
                    inputCostPerMillion: flags['input-cost-per-million'] === undefined ? null : Number(flags['input-cost-per-million'])
                }), true);
            } else throw new Error('Use: specrail boundary status|choose|enter|estimate TASK [--session ID]');
            break;
        }
        case 'context': {
            root = findProjectRoot(rootFrom(flags));
            const id = arg(2);
            if (arg(1) === 'status')
                output(contextStatus(root, id), true);
            else if (arg(1) === 'request')
                output(requestContextExpansion(root, id, { reason: requireFlag(flags, 'reason'), files: flags.files ? surfaces(flags.files) : [], symbols: flags.symbols ? surfaces(flags.symbols) : [], depth: flags.depth ? Number(flags.depth) : 1, readOnly: booleanFlag(flags['read-only'], true) }), true);
            else
                throw new Error('Unknown context command');
            break;
        }
        case 'review': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'bundle') output(writeReviewBundle(root, arg(2), flags.stage || 'spec'), true);
            else if (arg(1) === 'cockpit') output(writeReviewCockpit(root, arg(2), flags.stage || 'auto'), true);
            else throw new Error('Use: specrail review bundle|cockpit TASK --stage auto|status|spec|final');
            break;
        }
        case 'cockpit': {
            root = findProjectRoot(rootFrom(flags));
            output(writeReviewCockpit(root, reference(p), flags.stage || 'auto'), true);
            break;
        }
        case 'dependency':
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) !== 'add')
                throw new Error('Use: specrail dependency add TASK DEPENDENCY');
            output(taskSummary(addDependency(root, arg(2), arg(3))), true);
            break;
        case 'subtask':
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) !== 'create')
                throw new Error('Use: specrail subtask create PARENT "Title"');
            output(taskSummary(createSubtask(root, arg(2), { title: p.slice(3).join(' ') || requireFlag(flags, 'title'), type: flags.type || 'task', surfaces: surfaces(flags.surfaces), fileScope: surfaces(flags['file-scope']) })), true);
            break;
        case 'worktree': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'create') {
                const task = loadTask(findTask(root, arg(2)));
                const worktree = createWorktree(root, task.meta.id, task.meta.title);
                task.meta.worktree_path = worktree.path;
                task.meta.worktree_branch = worktree.branch;
                task.meta.worktree_base = worktree.baseBranch;
                task.meta.delivery_status = 'pending';
                saveTask(task);
                output(worktree, true);
            }
            else if (arg(1) === 'checkpoint') {
                const task = loadTask(findTask(root, arg(2)));
                output(checkpointWorktree(flags.path || task.meta.worktree_path, flags.message || `${task.meta.id} checkpoint`), true);
            }
            else if (arg(1) === 'remove')
                output(removeWorktree(root, requireFlag(flags, 'path'), requireFlag(flags, 'branch')), true);
            else
                throw new Error('Unknown worktree command');
            break;
        }
        case 'delivery':
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) === 'merge')
                output(taskSummary(completeDelivery(root, arg(2), 'merge-local')), true);
            else if (arg(1) === 'external')
                output(taskSummary(completeDelivery(root, arg(2), 'confirm-external')), true);
            else if (arg(1) === 'keep')
                output(taskSummary(completeDelivery(root, arg(2), 'keep-open')), true);
            else
                throw new Error('Unknown delivery command');
            break;
        case 'capability': {
            root = findProjectRoot(rootFrom(flags));
            if (arg(1) !== 'visualize') throw new Error('Use: specrail capability visualize status|record');
            const sessionId = String(flags.session || requireFlag(flags, 'session'));
            if (arg(2) === 'status') output(getVisualizationCapability(root, sessionId), true);
            else if (arg(2) === 'record') output(recordVisualizationCapability(root, {
                sessionId,
                availability: requireFlag(flags, 'availability'),
                exactSkillName: flags.skill ? String(flags.skill) : flags.tool ? String(flags.tool) : null,
                reason: flags.reason ? String(flags.reason) : null
            }), true);
            else throw new Error('Use: specrail capability visualize status|record');
            break;
        }
        case 'visualization': {
            root = findProjectRoot(rootFrom(flags));
            const taskId = arg(2) || requireFlag(flags, 'task');
            const gate = String(flags.gate || 'status');
            const sessionId = String(flags.session || requireFlag(flags, 'session'));
            if (arg(1) === 'status') output({ plan: getVisualizationPlan(root, taskId, gate, sessionId), run: getVisualizationRun(root, taskId, gate, sessionId) }, true);
            else if (arg(1) === 'record') {
                const quality = flags['quality-file'] ? JSON.parse(readFileSync(path.resolve(String(flags['quality-file'])), 'utf8')) : flags.quality ? JSON.parse(String(flags.quality)) : null;
                output(recordVisualizationRun(root, {
                    taskId,
                    gate,
                    sessionId,
                    outcome: requireFlag(flags, 'outcome'),
                    provider: flags.provider ? String(flags.provider) : null,
                    planDigest: String(requireFlag(flags, 'plan-digest')),
                    sourceDigest: String(requireFlag(flags, 'source-digest')),
                    invocationRef: flags['invocation-ref'] ? String(flags['invocation-ref']) : null,
                    resultText: flags['result-file'] ? readFileSync(path.resolve(String(flags['result-file'])), 'utf8') : flags['result-text'] ? String(flags['result-text']) : null,
                    artifactPath: flags.artifact ? String(flags.artifact) : null,
                    quality
                }), true);
            } else if (arg(1) === 'validate-plan') {
                const plan = JSON.parse(readFileSync(path.resolve(requireFlag(flags, 'file')), 'utf8'));
                const errors = validateVisualizationPlan(plan);
                output({ valid: errors.length === 0, errors }, true);
            } else throw new Error('Use: specrail visualization status|record|validate-plan');
            break;
        }

        case 'presentation': {
            root = findProjectRoot(rootFrom(flags));
            const sub = arg(1);
            const taskId = arg(2) || requireFlag(flags, 'task');
            const rawGate = String(flags.gate || 'spec-approval');
            const gate: PresentationGate = rawGate === 'spec' ? 'spec-approval' : rawGate === 'final' ? 'final-approval' : rawGate as PresentationGate;
            if (!['spec-approval','final-approval'].includes(gate)) throw new Error('Presentation gate must be spec-approval or final-approval');
            const sessionId = flags.session ? String(flags.session) : null;
            const presentation = gate === 'spec-approval' ? specificationPresentation(root, taskId, sessionId) : finalPresentation(root, taskId, sessionId);
            const contract = presentation.presentationContract;
            if (sub === 'status') {
                output({ taskId, gate, presentationDigest: contract.presentationDigest, acknowledgement: contract.acknowledgement, actions: contract.fallback.requiredHostActions }, true);
            } else if (sub === 'record') {
                if (!sessionId) throw new Error('Presentation record requires --session <stable-codex-session-id>');
                const suppliedDigest = String(requireFlag(flags, 'presentation-digest'));
                if (suppliedDigest !== contract.presentationDigest) throw new Error('Stale presentation digest; fetch the current presentation status and execute its host actions');
                output(recordPresentationAction(root, { taskId, gate, sessionId, presentationDigest: contract.presentationDigest, actions: contract.fallback.requiredHostActions, actionId: String(requireFlag(flags, 'action')), outcome: String(requireFlag(flags, 'outcome')) as PresentationActionOutcome, detail: flags.detail ? String(flags.detail) : null }), true);
            } else throw new Error('Use: specrail presentation status|record TASK --gate spec-approval|final-approval --session ID');
            break;
        }
        case 'qa': {
            root=findProjectRoot(rootFrom(flags));const task=loadTask(findTask(root,arg(2)||arg(1)));
            if(arg(1)==='mission') output({taskId:task.meta.id,text:qaMissionText(task),hash:qaMissionHash(task),approvedHash:task.meta.qa_mission_hash,valid:validateQAMission(task).length===0,errors:validateQAMission(task)},true);
            else throw new Error('Use: specrail qa mission TASK');
            break;
        }
        case 'failure': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='record') output(recordFailure(root,arg(2),{phase:flags.phase,category:flags.category,statement:String(flags.statement||flags.note||requireFlag(flags,'statement'))}),true);
            else if(arg(1)==='list') output(listFailures(root),true);
            else throw new Error('Use: specrail failure record|list');
            break;
        }
        case 'eval': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='list') output(listEvalCandidates(root),true);
            else if(arg(1)==='approve') output(approveEvalCandidate(root,arg(2),String(flags.note||'Approved by user')),true);
            else if(arg(1)==='dismiss') output(dismissEvalCandidate(root,arg(2),String(flags.note||'Dismissed by user')),true);
            else throw new Error('Use: specrail eval list|approve EVAL-ID');
            break;
        }
        case 'repair': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='status') output(repairStatus(root,arg(2)),true);
            else if(arg(1)==='reset') output(resetRepairBudget(root,arg(2),flags.phase),true);
            else throw new Error('Use: specrail repair status|reset TASK');
            break;
        }
        case 'metrics': root=findProjectRoot(rootFrom(flags)); output(taskMetrics(root,arg(1)),true); break;
        case 'trace': { root=findProjectRoot(rootFrom(flags)); if(arg(1)==='validate') output(validateTrace(root,arg(2)),true); else output(listTrace(root,arg(1)),true); break; }
        case 'constitution': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='list') output(listConstitution(root),true);
            else if(arg(1)==='add') output(addConstitutionPrinciple(root,{id:requireFlag(flags,'id'),title:requireFlag(flags,'title'),statement:requireFlag(flags,'statement'),scope:surfaces(flags.scope||'**'),enforcement:{kind:'command',command:requireFlag(flags,'command')},approvedBy:'user',approvalRef:String(requireFlag(flags,'approval-ref'))}),true);
            else if(arg(1)==='check') output(checkConstitution(root,{stage:String(flags.stage||'review')}),true);
            else throw new Error('Use: specrail constitution list|add|check');
            break;
        }
        case 'quality': { root=findProjectRoot(rootFrom(flags)); const task=loadTask(findTask(root,arg(2)||arg(1))); output(qualityPolicy(task),true); break; }
        case 'operations': { root=findProjectRoot(rootFrom(flags)); const task=loadTask(findTask(root,arg(2)||arg(1))); output(operationalPolicy(task),true); break; }
        case 'slice': {
            root=findProjectRoot(rootFrom(flags));const id=arg(2);
            if(arg(1)==='status') output(loadSlicePlan(root,id),true);
            else if(arg(1)==='create') { const value=jsonValue(requireFlag(flags,'file')); output(createSlicePlan(root,id,Array.isArray(value)?value:value.slices),true); }
            else if(arg(1)==='materialize') output(materializeSlices(root,id),true);
            else throw new Error('Use: specrail slice status|create|materialize TASK');
            break;
        }
        case 'replay': {
            if(arg(1)==='scenarios'){ output(replayScenarios(),true); break; }
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='create') {
                const names=[String(flags.harness||'standard'),...surfaces(flags.compare)];
                output(createReplay(root,arg(2),names),true);
            } else if(arg(1)==='status') output(replayStatus(root,arg(2)),true);
            else if(arg(1)==='start') output(startReplayVariant(root,arg(2),arg(3)),true);
            else if(arg(1)==='complete') {
                const result=jsonValue(flags['result-file']||requireFlag(flags,'result'));
                output(completeReplayVariant(root,arg(2),arg(3),result),true);
            } else if(arg(1)==='compare') output(compareReplay(root,arg(2)),true);
            else if(arg(1)==='cleanup') output(cleanupReplay(root,arg(2),arg(3)||undefined),true);
            else throw new Error('Use: specrail replay create|status|start|complete|compare|event|scenarios|cleanup');
            break;
        }
        case 'harness': {
            root=findProjectRoot(rootFrom(flags));
            if(arg(1)==='recommend') output(recommendHarness(root,arg(2)),true);
            else throw new Error('Use: specrail harness recommend TASK');
            break;
        }
        case 'plugin': {
            if (arg(1) !== 'validate') throw new Error('Use: specrail plugin validate --plugin-root PATH');
            const managedRoot=process.env.AI_FLOW_HOME?path.resolve(process.env.AI_FLOW_HOME):path.join(process.env.HOME||'', '.ai-flow');
            const pluginRoot=flags['plugin-root']?path.resolve(String(flags['plugin-root'])):(existsSync(path.join(managedRoot,'plugin.json'))?managedRoot:PACKAGE_ROOT);
            output(validateAgentPlugin(pluginRoot), true);
            break;
        }
        case 'preflight':
            root = resolveRepositoryRoot(rootFrom(flags));
            if (!existsSync(path.join(root, '.ai', 'config.json')))
                initProject(root, { name: flags.name });
            output(prepareCodeGraph(root, { force: Boolean(flags.force) }), true);
            break;
        case 'doctor':
            root = resolveRepositoryRoot(rootFrom(flags));
            if(flags.fix) {
                if(flags.apply) {
                    const selected=flags.apply===true?['safe']:surfaces(flags.apply);
                    output(applyDoctorFixes(root, process.env.AI_FLOW_HOME ? path.resolve(process.env.AI_FLOW_HOME) : undefined, PACKAGE_ROOT, selected), true);
                } else output(doctorFixPlan(root, process.env.AI_FLOW_HOME ? path.resolve(process.env.AI_FLOW_HOME) : undefined, PACKAGE_ROOT), true);
            } else output(doctor(root, process.env.AI_FLOW_HOME ? path.resolve(process.env.AI_FLOW_HOME) : undefined), true);
            break;
        default: console.log(`specrail commands:\n  init, preflight, intake, project status|complete|learn, create, list, resolve, status, readiness, why-blocked, next, interaction, patch, refine\n  section set, question add|answer|list, phase complete\n  spec approve|changes|reject|lint, run, block, resume, return
  lease status|acquire|take|release, boundary status|choose|enter|estimate TASK, context status|request, review bundle|cockpit, cockpit TASK\n  evidence add|list|validate, acceptance coverage, scope set|status, amendment propose|list|approve|reject, dependency add, subtask create\n  worktree create|checkpoint|remove, final approve|reject, delivery merge|external|keep
  capability visualize status|record [--skill visualize], visualization status|record|validate-plan
  presentation status|record TASK --gate spec-approval|final-approval --session ID
  qa mission, failure record|list, eval list|approve|dismiss, repair status|reset
  metrics, trace [TASK]|validate TASK, constitution list|add|check, quality, operations, slice status|create|materialize
  replay create|status|start|complete|compare|event|scenarios|cleanup
  harness recommend TASK
  plugin validate, doctor [--fix [--apply safe]]
  install, update [--beta|--latest] [--dry-run]`);
    }
}
main().catch((error: any) => { console.error(`specrail: ${error.message}`); process.exitCode = 1; });
