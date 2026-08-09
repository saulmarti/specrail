// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask } from '../dist/src/lib/task.js';
import { addEvidence, validateEvidence } from '../dist/src/lib/evidence.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-ui-quality-'));
const png = (marker = 1) => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64'), Buffer.from([marker])]);
function file(root, id, name, content) { const dir = path.join(root, '.ai/evidence', id, 'frontend'); mkdirSync(dir, { recursive: true }); const target = path.join(dir, name); writeFileSync(target, content); return target; }
function tasteSkills(root) { const names=['gpt-taste','redesign-existing-projects','imagegen-frontend-web','image-to-code']; return names.map(name=>{const target=path.join(root,'.agents','skills',name,'SKILL.md');mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,`---
name: ${name}
description: Official Taste Skill ${name}.
---
# ${name}
`);return{name,path:target};}); }
function brief(root, { target = 'section#home-spotlight', viewport = '1440x1000' } = {}) { return JSON.stringify({ schemaVersion:2,agent:'codex',taskMode:'redesign',surface:'web',skills:tasteSkills(root),briefInference:{pageKind:'existing homepage section',audience:'visitors',direction:'coherent product redesign',variance:4,density:4,motion:2},locks:{color:'existing palette',shape:'consistent geometry',theme:'current theme'},auditFirst:true,preflightPassed:true,proposalMethod:'image-gen',generationMode:'edit-existing-screenshot',context:{beforeEvidenceKind:'frontend-before',route:'/',target,viewport,realContentProvided:true,designSystemReferenced:true,preserveUnchangedAreas:true}}, null, 2); }
function proposalReview({ target = 'section#home-spotlight', overflow = false, clipping = false, overlap = false, verdict = 'pass' } = {}) { return JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-proposal', route: '/', target, viewport: '1440x1000', checks: { targetMatch: true, scopePreserved: true, noVisibleOverflow: !overflow, noTextClipping: !clipping, noOverlappingElements: !overlap, readableText: true, designSystemConsistency: true }, tasteSkillApplied: true, verdict }, null, 2); }
function afterReport({ overflow = false, target = 'section#home-spotlight' } = {}) { return JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-after', route: '/', target, viewport: { width: 1440, height: 1000 }, capture: { scope: 'focused-section', targetFound: true, targetVisible: true, targetCoverage: 0.68 }, checks: { horizontalOverflow: overflow, textClipping: false, overlappingElements: false, unreadableText: false }, measurements: [{ selector: target, clientWidth: 720, scrollWidth: overflow ? 860 : 720, clientHeight: 280, scrollHeight: 280 }] }, null, 2); }
function addDesignBrief(root, id, target = 'section#home-spotlight') { return addEvidence(root, id, { kind: 'ui-design-brief', path: file(root, id, 'ui-design-brief.json', brief(root, { target })), source: 'ui-design-brief', label: 'Taste and Image Gen brief', tool: 'Codex' }); }
function addProposalReview(root, id, target = 'section#home-spotlight') { return addEvidence(root, id, { kind: 'ui-proposal-review', path: file(root, id, 'ui-proposal-review.json', proposalReview({ target })), source: 'visual-proposal-review', label: 'Proposal visual review', tool: 'Taste Skill + Codex vision' }); }
test('primary frontend captures must target the requested section instead of the page top', () => {
    const root = repo();
    initProject(root, { name: 'UI' });
    const task = createTask(root, { title: 'Spotlight H3', type: 'task', surfaces: ['frontend'] });
    const before = file(root, task.meta.id, 'before.png', png(1));
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'frontend-before', path: before, source: 'browser-capture', label: 'Before', tool: 'Codex browser', route: '/', viewport: '1440x1000' }), /target/i);
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'frontend-before', path: before, source: 'browser-capture', label: 'Before', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'full-page' }), /focused-section|focused-element/i);
    const item = addEvidence(root, task.meta.id, { kind: 'frontend-before', path: before, source: 'browser-capture', label: 'Focused current section', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' });
    assert.equal(item.target, 'section#home-spotlight');
    assert.equal(item.captureScope, 'focused-section');
});
test('UI proposals require Taste Skill context, Image Gen, and a visual critique', () => {
    const root = repo();
    initProject(root, { name: 'UI' });
    const task = createTask(root, { title: 'Spotlight redesign', type: 'feature', surfaces: ['frontend'] });
    const before = file(root, task.meta.id, 'before.png', png(1));
    const proposal = file(root, task.meta.id, 'proposal.png', png(2));
    addEvidence(root, task.meta.id, { kind: 'frontend-before', path: before, source: 'browser-capture', label: 'Before', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' });
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'frontend-proposal', path: proposal, source: 'browser-rendered-proposal', label: 'Legacy proposal', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' }), /image-gen-proposal/i);
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'ui-design-brief', path: file(root, task.meta.id, 'bad-brief.json', JSON.stringify({ schemaVersion: 1, tasteSkill: { used: false }, proposalMethod: 'image-gen' })), source: 'ui-design-brief', label: 'Bad brief', tool: 'Codex' }), /Taste Skill/i);
    addDesignBrief(root, task.meta.id);
    addEvidence(root, task.meta.id, { kind: 'frontend-proposal', path: proposal, source: 'image-gen-proposal', label: 'Image Gen proposal', tool: 'ChatGPT Image Gen', route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' });
    assert.ok(validateEvidence(root, task.meta.id, 'pre-approval').missing.includes('ui-proposal-review'));
    addProposalReview(root, task.meta.id);
    assert.equal(validateEvidence(root, task.meta.id, 'pre-approval').valid, true);
});
test('visible overflow, clipping, overlap, or mismatched target invalidates an Image Gen proposal', () => {
    const root = repo();
    initProject(root, { name: 'UI' });
    const task = createTask(root, { title: 'Spotlight redesign', type: 'feature', surfaces: ['frontend'] });
    const before = file(root, task.meta.id, 'before.png', png(1));
    const proposal = file(root, task.meta.id, 'proposal.png', png(2));
    addEvidence(root, task.meta.id, { kind: 'frontend-before', path: before, source: 'browser-capture', label: 'Before', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' });
    addDesignBrief(root, task.meta.id);
    addEvidence(root, task.meta.id, { kind: 'frontend-proposal', path: proposal, source: 'image-gen-proposal', label: 'Proposal', tool: 'ChatGPT Image Gen', route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' });
    const bad = file(root, task.meta.id, 'bad-review.json', proposalReview({ overflow: true, verdict: 'fail' }));
    assert.throws(() => addEvidence(root, task.meta.id, { kind: 'ui-proposal-review', path: bad, source: 'visual-proposal-review', label: 'Bad review', tool: 'Taste Skill + Codex vision' }), /visible overflow/i);
    const mismatch = file(root, task.meta.id, 'mismatch-review.json', proposalReview({ target: 'section#hero' }));
    addEvidence(root, task.meta.id, { kind: 'ui-proposal-review', path: mismatch, source: 'visual-proposal-review', label: 'Mismatched review', tool: 'Taste Skill + Codex vision' });
    const validation = validateEvidence(root, task.meta.id, 'pre-approval');
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join('\n'), /matching ui-proposal-review|target.*match/i);
});
test('final frontend evidence requires a real after layout audit on the approved target', () => {
    const root = repo();
    initProject(root, { name: 'UI' });
    const task = createTask(root, { title: 'Spotlight redesign', type: 'feature', surfaces: ['frontend'] });
    for (const [kind, name, source, marker, tool] of [['frontend-before', 'before.png', 'browser-capture', 1, 'Codex browser'], ['frontend-proposal', 'proposal.png', 'image-gen-proposal', 2, 'ChatGPT Image Gen'], ['frontend-after', 'after.png', 'browser-capture', 3, 'Codex browser']])
        addEvidence(root, task.meta.id, { kind, path: file(root, task.meta.id, name, png(marker)), source, label: kind, tool, route: '/', viewport: '1440x1000', target: 'section#home-spotlight', captureScope: 'focused-section', runtimeUrl: 'http://127.0.0.1:4173/' });
    addDesignBrief(root, task.meta.id);
    addProposalReview(root, task.meta.id);
    assert.ok(validateEvidence(root, task.meta.id, 'qa').missing.includes('ui-after-validation'));
    addEvidence(root, task.meta.id, { kind: 'ui-after-validation', path: file(root, task.meta.id, 'after-layout.json', afterReport()), source: 'browser-layout-validation', label: 'After audit', tool: 'Chrome DevTools' });
    const validation = validateEvidence(root, task.meta.id, 'qa');
    assert.ok(!validation.missing.includes('ui-after-validation'));
});
//# sourceMappingURL=ui-evidence-quality.test.js.map
test('new frontend runtime evidence requires a served HTTP URL and rejects raw file previews', () => {
    const root = repo();
    initProject(root, { name: 'Runtime evidence' });
    const task = createTask(root, { title: 'Runtime preview', type: 'task', surfaces: ['frontend'] });
    const before = file(root, task.meta.id, 'runtime-before.png', png(9));
    const base = { kind: 'frontend-before', path: before, source: 'browser-capture', label: 'Before', tool: 'Codex browser', route: '/', viewport: '1440x1000', target: 'main', captureScope: 'focused-section' };
    assert.throws(() => addEvidence(root, task.meta.id, base), /served runtime URL/i);
    assert.throws(() => addEvidence(root, task.meta.id, { ...base, runtimeUrl: `file://${path.join(root, 'index.html')}` }), /http:\/\/ or https:\/\//i);
    const item = addEvidence(root, task.meta.id, { ...base, runtimeUrl: 'http://127.0.0.1:4173/' });
    assert.equal(item.runtimeUrl, 'http://127.0.0.1:4173/');
});
