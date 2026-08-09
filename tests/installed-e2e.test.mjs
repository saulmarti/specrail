// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createFakeCodeGraph } from './helpers.mjs';
const fakeCodeGraph = createFakeCodeGraph();
process.env.AI_FLOW_CODEGRAPH_COMMAND = fakeCodeGraph.command;
function run(command, args, options = {}) { const result = spawnSync(command, args, { encoding: 'utf8', ...options }); assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout.trim(); }
function json(command, args, options = {}) { return JSON.parse(run(command, args, options)); }
test('installed CLI reports the packaged version', () => {
    const source = process.cwd(), home = mkdtempSync(path.join(tmpdir(), 'ai-flow-version-home-'));
    run(process.execPath, ['scripts/install.mjs'], { cwd: source, env: { ...process.env, AI_FLOW_HOME: home } });
    const bin = path.join(home, '.local', 'bin', 'ai-flow');
    const packageMeta=JSON.parse(readFileSync(path.join(source,'package.json'),'utf8'));
    assert.equal(run(bin, ['--version']), packageMeta.version);
    assert.equal(run(path.join(home,'.local','bin','specrail'), ['--version']), packageMeta.version);
});
test('installed CLI completes a natural backend request with native approval payloads and real evidence', () => {
    const source = process.cwd(), home = mkdtempSync(path.join(tmpdir(), 'ai-flow-home-')), repo = mkdtempSync(path.join(tmpdir(), 'ai-flow-repo-'));
    run('git', ['init', '-b', 'main'], { cwd: repo });
    run('git', ['config', 'user.email', 'test@example.test'], { cwd: repo });
    run('git', ['config', 'user.name', 'Test'], { cwd: repo });
    writeFileSync(path.join(repo, 'README.md'), 'seed\n');
    run('git', ['add', '.'], { cwd: repo });
    run('git', ['commit', '-m', 'seed'], { cwd: repo });
    run(process.execPath, ['scripts/install.mjs'], { cwd: source, env: { ...process.env, AI_FLOW_HOME: home } });
    const bin = path.join(home, '.local', 'bin', 'ai-flow');
    const intake = json(bin, ['intake', 'Add health status endpoint', '--need', 'Expose a real health response for monitoring.', '--type', 'feature', '--surfaces', 'backend', '--root', repo]);
    const id = intake.task.id;
    assert.equal(intake.created, true);
    assert.equal(intake.task.phase, 'product-specifier');
    const projectDocs = {
        'product.md': '# Product\n\nA monitored service with explicit operational value and priorities.',
        'product-owner.md': '# Product Owner\n\nProtect monitoring value, stable contracts, and evidence-based delivery.',
        'users.md': '# Users\n\nOperators need a dependable way to verify service availability.',
        'architecture.md': '# Architecture\n\nThe service exposes HTTP contracts within existing repository boundaries.',
        'runbook.md': '# Runbook\n\nRun the project test and application commands discovered in the repository.'
    };
    for (const [name, content] of Object.entries(projectDocs))
        writeFileSync(path.join(repo, '.ai', 'project', name), content);
    json(bin, ['project', 'complete', '--root', repo]);
    const sections = { Need: 'Expose a health endpoint for monitoring.', 'Product Value': 'Operators can confirm service availability.', Scope: 'Add GET /health with a stable response.', 'Out of Scope': 'Dependency diagnostics.', 'Acceptance Criteria': '- GET /health returns 200\n- Response contains status=ok' };
    for (const [heading, text] of Object.entries(sections))
        json(bin, ['section', 'set', id, heading, '--text', text, '--root', repo]);
    json(bin, ['scope','set',id,'--allowed-files','health-endpoint.txt','--reason','Health endpoint delivery boundary','--root',repo]);
    json(bin, ['phase', 'complete', id, '--root', repo]);
    const spec = json(bin, ['interaction', id, '--kind', 'spec-approval', '--root', repo]);
    assert.equal(spec.tool, 'request_user_input');
    assert.equal(spec.questions[0].options[0].label, 'Aprobar especificación');
    const approvedSpec=json(bin, ['spec', 'approve', id, '--session', 'backend-planner', '--root', repo]);
    assert.equal(approvedSpec.userInputRequired,true);assert.equal(approvedSpec.interaction.turnPolicy.sameTurnPhaseWork,'forbidden');
    json(bin, ['boundary', 'choose', id, '--choice', 'fresh', '--session', 'backend-planner', '--root', repo]);
    const boundaryNext=json(bin,['next',id,'--session','backend-builder','--root',repo]);assert.equal(boundaryNext.action,'enter-phase-boundary');assert.equal(boundaryNext.userInputRequired,false);
    json(bin, ['boundary', 'enter', id, '--session', 'backend-builder', '--root', repo]);
    json(bin, ['run', id, '--session', 'backend-builder', '--root', repo]);
    const worktree = json(bin, ['worktree', 'create', id, '--root', repo]);
    writeFileSync(path.join(worktree.path, 'health-endpoint.txt'), 'implemented\n');
    json(bin, ['worktree', 'checkpoint', id, '--root', repo]);
    json(bin, ['phase', 'complete', id, '--session', 'backend-builder', '--root', repo]);
    const reviewDir = path.join(repo, '.ai', 'evidence', id, 'review');
    mkdirSync(reviewDir, { recursive: true });
    const reviewFile = path.join(reviewDir, 'technical-review.md');
    writeFileSync(reviewFile, '# Technical Review\n\nNo blocking findings.\n');
    json(bin, ['evidence', 'add', id, '--kind', 'technical-review-report', '--path', reviewFile, '--source', 'technical-review', '--label', 'Technical review', '--tool', 'Codex reviewer', '--root', repo]);
    const reviewBoundary=json(bin,['next',id,'--session','backend-reviewer','--root',repo]);assert.equal(reviewBoundary.action,'phase-boundary');
    json(bin, ['boundary', 'choose', id, '--choice', 'current', '--session', 'backend-reviewer', '--root', repo]);
    json(bin, ['boundary', 'enter', id, '--session', 'backend-reviewer', '--root', repo]);
    json(bin, ['phase', 'complete', id, '--session', 'backend-reviewer', '--root', repo]);
    const dir = path.join(repo, '.ai', 'evidence', id, 'backend');
    mkdirSync(dir, { recursive: true });
    const files = {
        'backend-demo': ['response.txt', 'HTTP/1.1 200 OK\n{"status":"ok"}\n'],
        'test-log': ['tests.txt', 'exit=0\nhealth endpoint test passed\n'],
        'qa-report': ['qa.md', '# QA\n\nReal request returned the approved response.\n']
    };
    for (const [kind, [name, content]] of Object.entries(files)) {
        const file = path.join(dir, name);
        writeFileSync(file, content);
        const command = kind === 'backend-demo' ? 'curl -i http://localhost/health' : kind === 'test-log' ? 'node --test' : null;
        const source = kind === 'qa-report' ? 'qa-validation' : 'executed-command';
        const args = ['evidence', 'add', id, '--kind', kind, '--path', file, '--source', source, '--label', kind, '--tool', 'Codex terminal', '--root', repo];
        if (command)
            args.push('--command', command, '--exit-code', '0');
        if (kind === 'qa-report') args.push('--proves','AC-001,AC-002');
        json(bin, args);
    }
    json(bin, ['phase', 'complete', id, '--session', 'backend-reviewer', '--root', repo]);
    json(bin, ['project', 'learn', '--task', id, '--text', 'The health endpoint is a stable public monitoring contract.', '--root', repo]);
    const final = json(bin, ['interaction', id, '--kind', 'final-approval', '--root', repo]);
    assert.equal(final.tool, 'request_user_input');
    assert.equal(final.questions[0].options[0].label, 'Aprobar resultado');
    const approved = json(bin, ['final', 'approve', id, '--root', repo]);
    assert.equal(approved.status, 'awaiting_delivery');
    const delivery = json(bin, ['interaction', id, '--kind', 'delivery', '--root', repo]);
    assert.equal(delivery.tool, 'request_user_input');
    json(bin, ['delivery', 'merge', id, '--root', repo]);
    const status = json(bin, ['status', id, '--root', repo]);
    assert.equal(status.status, 'done');
    assert.equal(readFileSync(path.join(repo, 'health-endpoint.txt'), 'utf8'), 'implemented\n');
    assert.equal(existsSync(worktree.path), false);
});
test('installed CLI resolves and resumes a persisted task by natural title from a new session', () => {
    const source = process.cwd(), home = mkdtempSync(path.join(tmpdir(), 'ai-flow-resume-home-')), repo = mkdtempSync(path.join(tmpdir(), 'ai-flow-resume-repo-'));
    run(process.execPath, ['scripts/install.mjs'], { cwd: source, env: { ...process.env, AI_FLOW_HOME: home } });
    const bin = path.join(home, '.local', 'bin', 'ai-flow');
    const intake = json(bin, ['intake', 'Rediseñar la homepage principal', '--need', 'Clarify the main actions.', '--type', 'feature', '--surfaces', 'frontend', '--root', repo]);
    const resolved = json(bin, ['resolve', 'tarea de la homepage', '--root', repo]);
    assert.equal(resolved.status, 'matched');
    assert.equal(resolved.task.id, intake.task.id);
    assert.equal(resolved.next.task, intake.task.id);
    assert.equal(resolved.next.phase, 'product-specifier');
});
test('installed CLI returns a native selector for ambiguous task names instead of choosing silently', () => {
    const source = process.cwd(), home = mkdtempSync(path.join(tmpdir(), 'ai-flow-amb-home-')), repo = mkdtempSync(path.join(tmpdir(), 'ai-flow-amb-repo-'));
    run(process.execPath, ['scripts/install.mjs'], { cwd: source, env: { ...process.env, AI_FLOW_HOME: home } });
    const bin = path.join(home, '.local', 'bin', 'ai-flow');
    json(bin, ['intake', 'Rediseñar homepage móvil', '--type', 'feature', '--surfaces', 'frontend', '--root', repo]);
    json(bin, ['intake', 'Rediseñar homepage escritorio', '--type', 'feature', '--surfaces', 'frontend', '--root', repo]);
    const resolved = json(bin, ['resolve', 'homepage', '--root', repo]);
    assert.equal(resolved.status, 'ambiguous');
    assert.equal(resolved.interaction.tool, 'request_user_input');
    assert.equal(resolved.interaction.questions[0].options.length, 2);
});
test('installed CLI requires Taste Skill plus Image Gen and rejects a visibly broken proposal before review', () => {
    const source = process.cwd(), home = mkdtempSync(path.join(tmpdir(), 'ai-flow-ui-home-')), repo = mkdtempSync(path.join(tmpdir(), 'ai-flow-ui-repo-'));
    run(process.execPath, ['scripts/install.mjs'], { cwd: source, env: { ...process.env, AI_FLOW_HOME: home } });
    const bin = path.join(home, '.local', 'bin', 'ai-flow');
    const intake = json(bin, ['intake', 'Ajustar el H3 de Home Spotlight', '--need', 'Improve the exact spotlight heading hierarchy.', '--type', 'task', '--surfaces', 'frontend', '--root', repo]);
    const id = intake.task.id;
    const docs = { 'product.md': '# Product\n\nA real web product whose homepage helps visitors discover and understand its primary content.', 'product-owner.md': '# Product Owner\n\nProtect focused user value, existing homepage hierarchy, and evidence-based visual delivery.', 'users.md': '# Users\n\nHomepage visitors use desktop and mobile layouts and need clear readable section headings.', 'architecture.md': '# Architecture\n\nThe existing frontend has bounded homepage sections and reusable typography components.', 'runbook.md': '# Runbook\n\nStart the real application with the repository command and validate the target route in a browser.' };
    for (const [name, content] of Object.entries(docs))
        writeFileSync(path.join(repo, '.ai', 'project', name), content);
    json(bin, ['project', 'complete', '--root', repo]);
    const sections = { Need: 'Reduce the exact Home Spotlight H3 size.', 'Product Value': 'Improve hierarchy without changing other homepage sections.', Scope: 'Only the Home Spotlight heading.', 'UI Target': '- Route: `/`\n- Target: `section#home-spotlight`\n- Viewport: `1440x1000`\n- Capture: focused section', 'Out of Scope': 'Hero, navigation, cards, and backend.', 'Acceptance Criteria': '- Exact section is shown before and after\n- No overflow or clipped text' };
    for (const [heading, text] of Object.entries(sections))
        json(bin, ['section', 'set', id, heading, '--text', text, '--root', repo]);
    json(bin, ['scope','set',id,'--allowed-files','src/**','--reason','Home Spotlight implementation boundary','--root',repo]);
    json(bin, ['phase', 'complete', id, '--root', repo]);
    const dir = path.join(repo, '.ai', 'evidence', id, 'frontend');
    mkdirSync(dir, { recursive: true });
    const base = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64');
    const before = path.join(dir, 'before.png'), proposal = path.join(dir, 'proposal.png');
    writeFileSync(before, Buffer.concat([base, Buffer.from([1])]));
    writeFileSync(proposal, Buffer.concat([base, Buffer.from([2])]));
    const common = ['--route', '/', '--viewport', '1440x1000', '--target', 'section#home-spotlight', '--capture-scope', 'focused-section', '--url', 'http://127.0.0.1:4173/', '--root', repo];
    json(bin, ['evidence', 'add', id, '--kind', 'frontend-before', '--path', before, '--source', 'browser-capture', '--label', 'Focused before', '--tool', 'Codex browser', ...common]);
    const legacy = spawnSync(bin, ['evidence', 'add', id, '--kind', 'frontend-proposal', '--path', proposal, '--source', 'browser-rendered-proposal', '--label', 'Legacy proposal', '--tool', 'Codex browser', ...common], { encoding: 'utf8' });
    assert.notEqual(legacy.status, 0);
    assert.match(legacy.stderr, /image-gen-proposal/i);
    const tasteBase = path.join(home, '.agents', 'skills');
    const tasteSkills = ['gpt-taste','redesign-existing-projects','imagegen-frontend-web','image-to-code'].map(name => { const skillPath=path.join(tasteBase,name,'SKILL.md'); mkdirSync(path.dirname(skillPath),{recursive:true}); writeFileSync(skillPath,`---
name: ${name}
description: Official Taste Skill ${name}.
---
# ${name}
`); return {name,path:skillPath}; });
    const brief = path.join(dir, 'ui-design-brief.json');
    writeFileSync(brief, JSON.stringify({ schemaVersion:2,agent:'codex',taskMode:'redesign',surface:'web',skills:tasteSkills,briefInference:{pageKind:'existing homepage section',audience:'visitors',direction:'coherent product redesign',variance:4,density:4,motion:2},locks:{color:'existing palette',shape:'consistent geometry',theme:'current theme'},auditFirst:true,preflightPassed:true,proposalMethod:'image-gen',generationMode:'edit-existing-screenshot',context:{beforeEvidenceKind:'frontend-before',route:'/',target:'section#home-spotlight',viewport:'1440x1000',realContentProvided:true,designSystemReferenced:true,preserveUnchangedAreas:true}}));
    json(bin, ['evidence', 'add', id, '--kind', 'ui-design-brief', '--path', brief, '--source', 'ui-design-brief', '--label', 'Taste brief', '--tool', 'Codex', '--root', repo]);
    json(bin, ['evidence', 'add', id, '--kind', 'frontend-proposal', '--path', proposal, '--source', 'image-gen-proposal', '--label', 'Image Gen proposal', '--tool', 'ChatGPT Image Gen', ...common]);
    const bad = path.join(dir, 'bad-review.json');
    writeFileSync(bad, JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-proposal', route: '/', target: 'section#home-spotlight', viewport: '1440x1000', checks: { targetMatch: true, scopePreserved: true, noVisibleOverflow: false, noTextClipping: true, noOverlappingElements: true, readableText: true, designSystemConsistency: true }, tasteSkillApplied: true, verdict: 'fail' }));
    const rejected = spawnSync(bin, ['evidence', 'add', id, '--kind', 'ui-proposal-review', '--path', bad, '--source', 'visual-proposal-review', '--label', 'Bad review', '--tool', 'Taste Skill + Codex vision', '--root', repo], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /visible overflow/i);
    const good = path.join(dir, 'ui-proposal-review.json');
    writeFileSync(good, JSON.stringify({ schemaVersion: 1, screenshotKind: 'frontend-proposal', route: '/', target: 'section#home-spotlight', viewport: '1440x1000', checks: { targetMatch: true, scopePreserved: true, noVisibleOverflow: true, noTextClipping: true, noOverlappingElements: true, readableText: true, designSystemConsistency: true }, tasteSkillApplied: true, verdict: 'pass' }));
    json(bin, ['evidence', 'add', id, '--kind', 'ui-proposal-review', '--path', good, '--source', 'visual-proposal-review', '--label', 'Proposal review', '--tool', 'Taste Skill + Codex vision', '--root', repo]);
    json(bin, ['phase', 'complete', id, '--root', repo]);
    const review = json(bin, ['interaction', id, '--kind', 'spec-approval', '--root', repo]);
    assert.match(review.presentation.markdown, /## UI Target/);
    assert.match(review.presentation.markdown, /section#home-spotlight/);
    assert.equal(review.presentation.previewUrl, 'http://127.0.0.1:4173/');
    assert.deepEqual(review.presentation.attachments.map(x => x.kind), ['review-cockpit', 'review-bundle', 'frontend-before', 'frontend-proposal', 'ui-design-brief', 'ui-proposal-review']);
});
//# sourceMappingURL=installed-e2e.test.js.map