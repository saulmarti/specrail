import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findTask, getSection, loadTask } from './task.js';
import { listEvidence, matchesAnyExpectedVisualContext } from './evidence.js';
import { lintSpecification, specificationHash } from './specification.js';
import { applicableActiveEvals } from './failures.js';
import { acceptanceCoverage } from './acceptance.js';
import { scopeGuardStatus } from './scope-guard.js';
import { listAmendments, effectiveSpecificationHash } from './amendments.js';
import { listTrace, validateTrace } from './trace.js';
const SPEC = ['Need', 'Product Value', 'Users', 'Scope', 'UI Target', 'Blast Radius', 'Out of Scope', 'Acceptance Criteria', 'Gherkin', 'QA Mission', 'UX/UI Proposal', 'Architecture and Data Design', 'Quality Strategy', 'Operational Evidence', 'Vertical Slices', 'Constitution Impact', 'Implementation Plan', 'Decisions'];
function clean(v: any) { return String(v || '').trim(); }
function rel(from: any, to: any) { return path.relative(path.dirname(from), to).split(path.sep).join('/'); }

function evidenceVisualRole(kind: string): string | null {
    if (['frontend-before','frontend-mobile-before'].includes(kind)) return 'Before';
    if (['frontend-proposal','frontend-mobile-proposal'].includes(kind)) return 'Proposal';
    if (['frontend-after','frontend-mobile-after'].includes(kind)) return 'After';
    return null;
}
function evidenceDisplay(item: any): string {
    const role = evidenceVisualRole(item.kind);
    if (!role) return item.label;
    const context = [item.route, item.target, item.viewport, item.captureScope].filter(Boolean).join(' · ');
    return context ? `${role} · ${context}` : role;
}
function activeVisualEvidence(task: any, evidence: any[], stage: any): { active: any[]; historical: any[] } {
    const allowedRoles = stage === 'final' ? new Set(['Before','Proposal','After']) : new Set(['Before','Proposal']);
    const canonical = new Map<string, any>();
    const visual = evidence.filter(item => evidenceVisualRole(item.kind));
    for (const item of visual) {
        const role = evidenceVisualRole(item.kind)!;
        if (!allowedRoles.has(role) || !matchesAnyExpectedVisualContext(task, item)) continue;
        canonical.set(`${role}|${item.route || ''}|${item.target || ''}|${item.viewport || ''}|${item.captureScope || ''}`, item);
    }
    const active = [...canonical.values()];
    const activeIds = new Set(active.map(item => item.id));
    return { active, historical: visual.filter(item => !activeIds.has(item.id)) };
}
function gitSummary(root: any, task: any) { const cwd = task.meta.worktree_path || root; const status = spawnSync('git', ['status', '--short'], { cwd, encoding: 'utf8' }); const stat = spawnSync('git', ['diff', '--stat'], { cwd, encoding: 'utf8' }); return { status: status.status === 0 ? String(status.stdout || '').trim() : 'Unavailable', stat: stat.status === 0 ? String(stat.stdout || '').trim() : 'Unavailable' }; }
export function writeReviewBundle(root: any, id: any, stage: any = 'spec') {
    const task = loadTask(findTask(root, id)), suffix = stage === 'final' ? 'final-review' : 'spec-review', file = path.join(path.resolve(root), '.ai', 'reviews', `${task.meta.id}-${suffix}.md`);
    mkdirSync(path.dirname(file), { recursive: true });
    const lint = lintSpecification(task, { stage: 'approval' }), currentHash = specificationHash(task);
    const lines = [`# ${task.meta.id} — ${task.meta.title}`, ``, stage === 'final' ? '> Final review bundle' : '> Specification review bundle', '', `- Status: \`${task.meta.status}\``, `- Phase: \`${task.meta.phase}\``, `- Specification lint: **${lint.valid ? 'PASS' : 'FAIL'}** (${lint.score}/100)`, `- Current specification hash: \`${currentHash}\``, task.meta.spec_approval_hash ? `- Approved specification hash: \`${task.meta.spec_approval_hash}\`` : '- Approved specification hash: _not approved yet_', ''];
    if (lint.errors.length)
        lines.push('## Specification errors', '', ...lint.errors.map((x: any) => `- ${x}`), '');
    if (lint.warnings.length)
        lines.push('## Specification warnings', '', ...lint.warnings.map((x: any) => `- ${x}`), '');
    for (const section of SPEC) {
        const value = clean(getSection(task.body, section));
        if (value)
            lines.push(`## ${section}`, '', value, '');
    }
    const acceptance=acceptanceCoverage(root,task.meta.id),scopeGuard=scopeGuardStatus(root,task.meta.id),amendments=listAmendments(root,task.meta.id),effectiveHash=effectiveSpecificationHash(root,task.meta.id,currentHash);
    lines.push('## Effective specification','',`- Base approved hash: ${task.meta.spec_approval_hash?`\`${task.meta.spec_approval_hash}\``:'_not approved yet_'}`,`- Effective hash: \`${effectiveHash}\``,`- Amendments: ${amendments.length}`,'');
    if(amendments.length)lines.push('### Amendments','',...amendments.map(item=>`- **${item.id} · ${item.title}** — \`${item.status}\` · ${item.reason}${item.acceptanceCriteria.length?` · adds ${item.acceptanceCriteria.map(x=>x.id).join(', ')}`:''}`),'');
    lines.push('## Acceptance Coverage Matrix','',`Coverage: **${acceptance.coverage}%** · ${acceptance.criteria.filter(row=>row.proven).length}/${acceptance.criteria.length} required criteria proven.`,'', '| Criterion | Evidence | Status |','|---|---|---|',...acceptance.criteria.map(row=>`| \`${row.id}\` ${row.text.replace(/\|/g,'\\|')} | ${row.evidence.length?row.evidence.map(item=>`${item.label} (\`${item.kind}\`)`).join('<br>'):'—'} | ${row.proven?'PASS':'MISSING'} |`),'');
    if(acceptance.invalidReferences.length)lines.push('### Invalid acceptance references','',...acceptance.invalidReferences.map(item=>`- ${item}`),'');
    lines.push('## Scope Guard / Blast Radius','',`- Status: **${scopeGuard.applicable?(scopeGuard.valid?'PASS':'FAIL'):'NOT APPLICABLE'}**`,`- Detail: ${scopeGuard.detail}`,`- Allowed: ${scopeGuard.allowedFiles.join(', ')||'none'}`,`- Actual changes: ${scopeGuard.actualFiles.join(', ')||'none'}`,`- Unexpected: ${scopeGuard.unexpectedFiles.join(', ')||'none'}`,`- Protected changes: ${scopeGuard.protectedChanges.join(', ')||'none'}`,'');
    const trace=listTrace(root,task.meta.id),traceIntegrity=validateTrace(root,task.meta.id),latest=trace.at(-1);
    lines.push('## Delivery trace','',`- Integrity: **${traceIntegrity.valid?'PASS':'FAIL'}**`,`- Events: ${traceIntegrity.eventCount}`,`- Branches: ${traceIntegrity.branchCount}`,latest?`- Current taskset digest: \`${latest.taskset.digest}\``:'- Current taskset digest: _not recorded_',latest?`- Current harness digest: \`${latest.harness.digest}\``:'- Current harness digest: _not recorded_',latest?`- Current runtime digest: \`${latest.runtime.digest}\``:'- Current runtime digest: _not recorded_',...(traceIntegrity.errors.length?['',...traceIntegrity.errors.map(error=>`- ${error}`)]:[]),'');
    const activeEvals=applicableActiveEvals(root,{phase:task.meta.phase,surfaces:task.meta.surfaces});
    if(activeEvals.length) lines.push('## Active regression evals','',...activeEvals.map(item=>`- ${item.id} · ${item.category}: ${item.statement}`),'');
    const evidence = listEvidence(root, id);
    if (evidence.length) {
        lines.push('## Evidence', '', '> **Presentation contract:** active canonical visual evidence must be visible to the user through a host-supported review surface before approval. A local path, filename, generated HTML artifact, or textual “Before / Proposal / After” label is audit metadata only and never counts as presented evidence. `$visualize` and the Review Cockpit are enhancements; when host presentation cannot be verified, fall back to directly visible canonical evidence plus an action to open the Cockpit.', '');
        const visualState = activeVisualEvidence(task, evidence, stage);
        if (visualState.active.length) {
            lines.push('### Review Surface — active canonical visuals', '', '| Role / context | Evidence ID | Host presentation |', '|---|---|---|');
            for (const item of visualState.active) {
                lines.push(`| **${evidenceDisplay(item).replace(/\|/g,'\\|')}** | \`${item.id}\` | **REQUIRED VISIBLE** |`);
            }
            lines.push('', '> The host must render the canonical bytes for every `REQUIRED VISIBLE` evidence item. Do not substitute a filesystem path or attachment filename.', '');
            lines.push('#### Audit metadata (not presentation)', '');
            for (const item of visualState.active) {
                const abs = path.resolve(root, '.ai', 'evidence', id, item.path), link = rel(file, abs);
                const runtime = item.runtimeUrl ? ` · runtime: \`${item.runtimeUrl}\`` : '';
                lines.push(`- \`${item.id}\` · \`${item.kind}\` · ${item.source}${runtime} · canonical file: \`${link}\``);
            }
            lines.push('');
        }
        const supporting = evidence.filter(item => !evidenceVisualRole(item.kind));
        if (supporting.length) {
            lines.push('### Supporting evidence', '');
            for (const item of supporting) {
                const abs = path.resolve(root, '.ai', 'evidence', id, item.path), link = rel(file, abs);
                const runtime = item.runtimeUrl ? ` · runtime: \`${item.runtimeUrl}\`` : '';
                const visual = /\.(?:png|jpe?g|webp|gif|svg)$/i.test(item.path);
                if (visual) lines.push(`- **${item.label}** — \`${item.kind}\` · ${item.source}${runtime} · canonical file: \`${link}\``);
                else lines.push(`- [${item.label}](${link}) — \`${item.kind}\` · ${item.source}${runtime}`);
            }
            lines.push('');
        }
        if (visualState.historical.length) {
            lines.push('### Historical / inactive visual evidence', '', '> These visuals are retained for audit history but are not active Comparator/Visualize sources for this gate.', '');
            for (const item of visualState.historical) {
                const abs = path.resolve(root, '.ai', 'evidence', id, item.path), link = rel(file, abs);
                lines.push(`- ${evidenceDisplay(item)} — \`${item.kind}\` · canonical file: \`${link}\``);
            }
            lines.push('');
        }
    }
    if (stage === 'final') {
        const git = gitSummary(root, task);
        lines.push('', '## Delivery diff summary', '', git.stat || '_No diff stat available._', '', '```text', git.status || 'Clean working tree', '```', '');
        for (const section of ['QA', 'Final Customer', 'Handoff']) {
            const value = clean(getSection(task.body, section));
            if (value)
                lines.push(`## ${section}`, '', value, '');
        }
    }
    writeFileSync(file, `${lines.join('\n').trim()}\n`);
    return { path: file, stage, lint, currentHash, approvedHash: task.meta.spec_approval_hash || null };
}
