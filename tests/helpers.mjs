// @ts-nocheck
import { writeFileSync, mkdtempSync, chmodSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeProjectContext } from '../dist/src/lib/project.js';
import { markCodeGraphReadyForTests } from '../dist/src/lib/codegraph.js';
import { addEvidence } from '../dist/src/lib/evidence.js';
import { setBlastRadius } from '../dist/src/lib/scope-guard.js';
export function createFakeCodeGraph({ failSync = false, failStatus = false, incompatibleContract = false } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'fake-codegraph-'));
    const command = path.join(dir, 'codegraph');
    const log = path.join(dir, 'calls.log');
    const script = `#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');const cmd=args[0];if(args[1]==='--help'){if(cmd==='init')console.log(${JSON.stringify(incompatibleContract)}?'Usage: codegraph init <path>':'Usage: codegraph init <path> --index');else if(cmd==='index')console.log(${JSON.stringify(incompatibleContract)}?'Usage: codegraph index <path>':'Usage: codegraph index <path> --force --quiet');else console.log('Usage: codegraph '+cmd+' <path>');process.exit(0);}const target=path.resolve(args.find(a=>!a.startsWith('-')&&a!==cmd)||process.cwd());if(cmd==='--version'){console.log('codegraph 0.9.5');process.exit(0);}if(cmd==='init'){fs.mkdirSync(path.join(target,'.codegraph'),{recursive:true});fs.writeFileSync(path.join(target,'.codegraph','index.ready'),'ready');console.log('initialized');process.exit(0);}if(cmd==='sync'){if(${JSON.stringify(failSync)}){console.error('sync failed');process.exit(2);}fs.mkdirSync(path.join(target,'.codegraph'),{recursive:true});fs.writeFileSync(path.join(target,'.codegraph','synced'),'yes');console.log('synced');process.exit(0);}if(cmd==='index'){fs.mkdirSync(path.join(target,'.codegraph'),{recursive:true});fs.writeFileSync(path.join(target,'.codegraph','reindexed'),'yes');console.log('indexed');process.exit(0);}if(cmd==='status'){if(${JSON.stringify(failStatus)}){console.error('bad status');process.exit(3);}console.log('healthy');process.exit(0);}console.error('unknown',args);process.exit(4);`;
    writeFileSync(command, script);
    chmodSync(command, 0o755);
    return { command, dir, log, calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [] };
}
export function readyProjectContext(root) {
    markCodeGraphReadyForTests(root);
    const docs = {
        'product.md': '# Product\n\nA real software product with defined user value, capabilities, and priorities.',
        'product-owner.md': '# Product Owner\n\nProtect user value, explicit scope, evidence, and consequential user decisions.',
        'users.md': '# Users\n\nPrimary users need reliable, understandable workflows and observable outcomes.',
        'architecture.md': '# Architecture\n\nThe repository boundaries and contracts are discovered with CodeGraph MCP.',
        'runbook.md': '# Runbook\n\nUse the repository build, test, launch, and validation commands discovered from project files.'
    };
    for (const [name, content] of Object.entries(docs))
        writeFileSync(path.join(root, '.ai', 'project', name), `${content}\n`);
    return completeProjectContext(root, 'Test context');
}
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64');
export function addApprovedImageGenProposal(root, id, { route = '/', target = 'section#homepage-hero', viewport = '1440x1000', beforeLabel = 'Before', proposalLabel = 'Proposal' } = {}) {
    const dir = path.join(root, '.ai', 'evidence', id, 'frontend');
    mkdirSync(dir, { recursive: true });
    const before = path.join(dir, 'before.png'), proposal = path.join(dir, 'proposal.png');
    writeFileSync(before, Buffer.concat([tinyPng, Buffer.from([1])]));
    writeFileSync(proposal, Buffer.concat([tinyPng, Buffer.from([2])]));
    addEvidence(root, id, { kind: 'frontend-before', path: before, source: 'browser-capture', label: beforeLabel, tool: 'Codex browser', route, viewport, target, captureScope: 'focused-section' });
    const tasteBase = path.join(root, '.agents', 'skills');
    const skills = ['gpt-taste','redesign-existing-projects','imagegen-frontend-web','image-to-code'].map(name => {
        const skillPath = path.join(tasteBase, name, 'SKILL.md');
        mkdirSync(path.dirname(skillPath), { recursive: true });
        writeFileSync(skillPath, `---
name: ${name}
description: Official Taste Skill workflow for ${name}.
---
# ${name}
`);
        return { name, path: skillPath };
    });
    const brief = path.join(dir, 'ui-design-brief.json');
    writeFileSync(brief, JSON.stringify({ schemaVersion: 2, agent: 'codex', taskMode: 'redesign', surface: 'web', skills, briefInference: { pageKind: 'existing page section', audience: 'product users', direction: 'coherent editorial redesign', variance: 4, density: 4, motion: 2 }, locks: { color: 'existing design system', shape: 'consistent component geometry', theme: 'current project theme' }, auditFirst: true, preflightPassed: true, proposalMethod: 'image-gen', generationMode: 'edit-existing-screenshot', context: { beforeEvidenceKind: 'frontend-before', route, target, viewport, realContentProvided: true, designSystemReferenced: true, preserveUnchangedAreas: true } }));
    addEvidence(root, id, { kind: 'ui-design-brief', path: brief, source: 'ui-design-brief', label: 'Taste and Image Gen brief', tool: 'Codex' });
    addEvidence(root, id, { kind: 'frontend-proposal', path: proposal, source: 'image-gen-proposal', label: proposalLabel, tool: 'ChatGPT Image Gen', route, viewport, target, captureScope: 'focused-section' });
    const review = path.join(dir, 'ui-proposal-review.json');
    writeFileSync(review, JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-proposal', route, target, viewport, checks: { targetMatch: true, scopePreserved: true, noVisibleOverflow: true, noTextClipping: true, noOverlappingElements: true, readableText: true, designSystemConsistency: true }, tasteSkillApplied: true, verdict: 'pass' }));
    addEvidence(root, id, { kind: 'ui-proposal-review', path: review, source: 'visual-proposal-review', label: 'Proposal visual review', tool: 'Taste Skill + Codex vision' });
    return { dir, before, proposal, brief, review };
}
export function addFrontendAfterAudit(root, id, { route = '/', target = 'section#homepage-hero', viewport = '1440x1000', afterLabel = 'After' } = {}) {
    const dir = path.join(root, '.ai', 'evidence', id, 'frontend');
    mkdirSync(dir, { recursive: true });
    const after = path.join(dir, 'after.png');
    writeFileSync(after, Buffer.concat([tinyPng, Buffer.from([3])]));
    addEvidence(root, id, { kind: 'frontend-after', path: after, source: 'browser-capture', label: afterLabel, tool: 'Codex browser', route, viewport, target, captureScope: 'focused-section' });
    const [width, height] = viewport.split('x').map(Number);
    const audit = path.join(dir, 'after-layout.json');
    writeFileSync(audit, JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-after', route, target, viewport: { width, height }, capture: { scope: 'focused-section', targetFound: true, targetVisible: true, targetCoverage: 0.7 }, checks: { horizontalOverflow: false, textClipping: false, overlappingElements: false, unreadableText: false }, measurements: [{ selector: target, clientWidth: 800, scrollWidth: 800, clientHeight: 400, scrollHeight: 400 }] }));
    addEvidence(root, id, { kind: 'ui-after-validation', path: audit, source: 'browser-layout-validation', label: 'After layout audit', tool: 'Chrome DevTools' });
    return { after, audit };
}
//# sourceMappingURL=helpers.js.map
// Governance defaults for legacy regression fixtures. New dedicated governance tests
// use precise blast radii; unrelated tests use a permissive boundary so they can
// continue exercising their original concern without bypassing production gates.
export function setDefaultBlastRadius(root, id, allowedFiles = ['**']) {
    return setBlastRadius(root, id, { allowedFiles, protectedFiles: [], expectedSymbols: [], reason: 'Legacy regression fixture boundary.' });
}
