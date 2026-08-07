import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findTask, getSection, loadTask } from './task.js';
import { listEvidence } from './evidence.js';
import { lintSpecification, specificationHash } from './specification.js';
import { applicableActiveEvals } from './failures.js';
import { acceptanceCoverage } from './acceptance.js';
import { scopeGuardStatus } from './scope-guard.js';
import { listAmendments, effectiveSpecificationHash } from './amendments.js';
import { listTrace, validateTrace } from './trace.js';
const SPEC = ['Need', 'Product Value', 'Users', 'Scope', 'UI Target', 'Blast Radius', 'Out of Scope', 'Acceptance Criteria', 'Gherkin', 'QA Mission', 'UX/UI Proposal', 'Architecture and Data Design', 'Quality Strategy', 'Operational Evidence', 'Vertical Slices', 'Constitution Impact', 'Implementation Plan', 'Decisions'];
function clean(v: any) { return String(v || '').trim(); }
function rel(from: any, to: any) { return path.relative(path.dirname(from), to).split(path.sep).join('/'); }
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
        lines.push('## Evidence', '');
        for (const item of evidence) {
            const abs = path.resolve(root, '.ai', 'evidence', id, item.path), link = rel(file, abs);
            if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(item.path))
                lines.push(`### ${item.label}`, '', `![${item.label}](${link})`, '');
            else
                lines.push(`- [${item.label}](${link}) — \`${item.kind}\` · ${item.source}`);
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
