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
const e2eCommandTimeoutMs = Number(process.env.SPEC_RAIL_E2E_COMMAND_TIMEOUT_MS || 30_000);
const e2eTrace = ['1','true','yes'].includes(String(process.env.SPEC_RAIL_E2E_TRACE || '').toLowerCase());
function run(command, args, options = {}) {
    const label = `${command} ${args.join(' ')}`;
    if (e2eTrace) process.stderr.write(`[installed-e2e] START ${label}\n`);
    const started = Date.now();
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: e2eCommandTimeoutMs, ...options });
    if (result.error?.code === 'ETIMEDOUT') throw new Error(`Installed E2E command timed out after ${e2eCommandTimeoutMs}ms: ${label}`);
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    if (e2eTrace) process.stderr.write(`[installed-e2e] PASS ${Date.now() - started}ms ${label}\n`);
    return result.stdout.trim();
}
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
        'users.md': '# Users\n\n## Audience: operator (primary)\n\nOperators need a dependable way to verify service availability.',
        'architecture.md': '# Architecture\n\nThe service exposes HTTP contracts within existing repository boundaries.',
        'runbook.md': '# Runbook\n\nRun the project test and application commands discovered in the repository.'
    };
    for (const [name, content] of Object.entries(projectDocs))
        writeFileSync(path.join(repo, '.ai', 'project', name), content);
    json(bin, ['project', 'complete', '--root', repo]);
    const sections = { Need: 'Expose a health endpoint for monitoring.', 'Product Value': 'Operators can confirm service availability.', Scope: 'Add GET /health with a stable response.', 'Out of Scope': 'Dependency diagnostics.', 'Acceptance Criteria': '- GET /health returns 200\n- Response contains status=ok' };
    for (const [heading, text] of Object.entries(sections))
        json(bin, ['section', 'set', id, heading, '--text', text, '--root', repo]);
    json(bin, ['product','owner','review',id,'--verdict','build','--summary','The health endpoint directly supports the monitoring need for this service.','--value','Operators gain a dependable public signal for service availability.','--root',repo]);
    json(bin, ['product','owner','decide',id,'--decision','proceed','--note','Reviewed Product Owner opinion in Guided mode.','--root',repo]);
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
    const audienceNext = json(bin, ['next', id, '--session', 'backend-reviewer', '--root', repo]);
    assert.equal(audienceNext.runtime.boundary.recommendation, 'fresh-chat-required');
    assert.equal(audienceNext.runtime.boundary.sameChatAllowed, false);
    json(bin, ['boundary', 'enter', id, '--session', 'backend-audience', '--root', repo]);
    json(bin, ['audience','review',id,'--profile','operator','--primary','--verdict','pass','--comprehension','pass','--utility','pass','--discoverability','pass','--friction','pass','--trust','pass','--repeat-value','pass','--findings','The health contract is clear and useful to operators.','--session','backend-audience','--root',repo]);
    json(bin, ['phase', 'complete', id, '--session', 'backend-audience', '--root', repo]);
    json(bin, ['project', 'learn', '--task', id, '--text', 'The health endpoint is a stable public monitoring contract.', '--root', repo]);
    const finalPoNext = json(bin, ['next', id, '--root', repo]);
    assert.equal(finalPoNext.actor, 'ai-flow-product-owner');
    assert.equal(finalPoNext.action, 'final-product-owner-review');
    json(bin, ['product','owner','final','review',id,'--verdict','ship','--summary','The implemented health endpoint matches the approved product intent and remains understandable to operators.','--value','Operators now have the dependable monitoring outcome the feature was intended to create.','--root',repo]);
    const finalPoDecision = json(bin, ['next', id, '--root', repo]);
    assert.equal(finalPoDecision.action, 'review-final-product-owner-opinion');
    assert.equal(finalPoDecision.actor, 'user');
    json(bin, ['product','owner','final','decide',id,'--decision','proceed','--note','Reviewed final Product Owner outcome in Guided mode.','--root',repo]);
    const finalReadiness = json(bin, ['readiness', id, '--root', repo]);
    const productOwnerGate = finalReadiness.gates.find(gate => gate.id === 'product-owner-review');
    assert.equal(productOwnerGate.status, 'pass');
    assert.match(productOwnerGate.detail, /sealed into the approved specification/i);
    const finalProductOwnerGate = finalReadiness.gates.find(gate => gate.id === 'product-owner-final-review');
    assert.equal(finalProductOwnerGate.status, 'pass');
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
    const intake = json(bin, ['intake', 'Rediseñar la jerarquía de Home Spotlight', '--need', 'Redesign the exact spotlight visual hierarchy.', '--type', 'task', '--surfaces', 'frontend', '--root', repo]);
    const id = intake.task.id;
    const docs = { 'product.md': '# Product\n\nA real web product whose homepage helps visitors discover and understand its primary content.', 'product-owner.md': '# Product Owner\n\nProtect focused user value, existing homepage hierarchy, and evidence-based visual delivery.', 'users.md': '# Users\n\n## Audience: homepage visitor (primary)\n\nHomepage visitors use desktop and mobile layouts and need clear readable section headings.', 'architecture.md': '# Architecture\n\nThe existing frontend has bounded homepage sections and reusable typography components.', 'runbook.md': '# Runbook\n\nStart the real application with the repository command and validate the target route in a browser.' };
    for (const [name, content] of Object.entries(docs))
        writeFileSync(path.join(repo, '.ai', 'project', name), content);
    json(bin, ['project', 'complete', '--root', repo]);
    const sections = { Need: 'Redesign the exact Home Spotlight heading hierarchy across the focused section.', 'Product Value': 'Improve the section hierarchy and visual comprehension without changing unrelated homepage areas.', Scope: 'Only the Home Spotlight heading.', 'UI Target': '- Route: `/`\n- Target: `section#home-spotlight`\n- Viewport: `1440x1000`\n- Capture: focused section', 'Out of Scope': 'Hero, navigation, cards, and backend.', 'Acceptance Criteria': '- Exact section is shown before and after\n- No overflow or clipped text' };
    for (const [heading, text] of Object.entries(sections))
        json(bin, ['section', 'set', id, heading, '--text', text, '--root', repo]);
    json(bin, ['product','owner','review',id,'--verdict','build','--summary','The hierarchy adjustment is a focused product-quality improvement for homepage visitors.','--value','Clearer heading hierarchy improves comprehension without adding product complexity.','--root',repo]);
    json(bin, ['product','owner','decide',id,'--decision','proceed','--note','Reviewed Product Owner opinion in Guided mode.','--root',repo]);
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
test('installed SpecRail Fast completes a micro UI change with one compact governed pass and no CodeGraph/worktree/reviewer/QA chain', () => {
    const source=process.cwd(),home=mkdtempSync(path.join(tmpdir(),'specrail-fast-e2e-home-')),repo=mkdtempSync(path.join(tmpdir(),'specrail-fast-e2e-repo-'));
    run('git',['init','-b','main'],{cwd:repo});run('git',['config','user.email','test@example.test'],{cwd:repo});run('git',['config','user.name','Test'],{cwd:repo});
    mkdirSync(path.join(repo,'src'),{recursive:true});writeFileSync(path.join(repo,'src','button.css'),'#primary { color: blue; }\n');run('git',['add','.'],{cwd:repo});run('git',['commit','-m','seed'],{cwd:repo});
    run(process.execPath,['scripts/install.mjs'],{cwd:source,env:{...process.env,AI_FLOW_HOME:home}});const bin=path.join(home,'.local','bin','specrail');
    const env={...process.env,AI_FLOW_CODEGRAPH_COMMAND:path.join(repo,'definitely-missing-codegraph'),SPEC_RAIL_RUNTIME_IDLE_MS:'1000'};
    const j=(args)=>json(bin,args,{env});
    const intake=j(['intake','Cambia el color del botón principal a verde','--need','Only change the primary button color to green.','--type','task','--surfaces','frontend','--mode','fast','--root',repo]);const id=intake.task.id;
    assert.equal(intake.task.workflowMode,'fast');assert.equal(intake.task.fastActive,true);assert.equal(intake.codegraph.action,'fast-mode-on-demand');
    const sections={Need:'Only change the primary button color to green.',Scope:'Only `src/button.css` and `button#primary` color.', 'UI Target':'- Route: `/`\n- Target: `button#primary`\n- Viewport: `390x844`\n- Capture: focused element','Out of Scope':'Layout, responsive behavior, interactions, backend and data.','Acceptance Criteria':'- At 390x844 `button#primary` uses the requested green color with no clipped or overlapping content.'};
    for(const [heading,text] of Object.entries(sections))j(['section','set',id,heading,'--text',text,'--root',repo]);
    j(['scope','set',id,'--allowed-files','src/button.css','--reason','Exact localized color change','--root',repo]);
    const sealed=j(['phase','complete',id,'--root',repo]);
    assert.equal(sealed.controlProfile,'micro');assert.equal(sealed.workflowMode,'fast');assert.equal(sealed.fastActive,true);assert.equal(sealed.phase,'builder');assert.equal(sealed.status,'ready');assert.equal(sealed.specApproval,'approved');
    const next=j(['next',id,'--root',repo]);assert.equal(next.phase,'builder');assert.equal(next.action,'continue');assert.equal(next.userInputRequired,false);assert.equal(next.recommendedSkill,'ai-flow-builder');
    j(['run',id,'--session','fast-builder','--root',repo]);writeFileSync(path.join(repo,'src','button.css'),'#primary { color: green; }\n');
    const evidenceDir=path.join(repo,'.ai','evidence',id,'frontend');mkdirSync(evidenceDir,{recursive:true});
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64'),after=path.join(evidenceDir,'after.png');writeFileSync(after,Buffer.concat([png,Buffer.from([33])]));
    j(['evidence','add',id,'--kind','frontend-after','--path',after,'--source','browser-capture','--label','Fast final button','--tool','Codex browser','--route','/','--viewport','390x844','--target','button#primary','--capture-scope','focused-element','--url','http://127.0.0.1:4173/','--proves','AC-001','--root',repo]);
    const audit=path.join(evidenceDir,'after-layout.json');writeFileSync(audit,JSON.stringify({schemaVersion:1,screenshotKind:'frontend-after',route:'/',target:'button#primary',viewport:{width:390,height:844},capture:{scope:'focused-element',targetFound:true,targetVisible:true,targetCoverage:0.5},checks:{horizontalOverflow:false,textClipping:false,overlappingElements:false,unreadableText:false},measurements:[{selector:'button#primary',clientWidth:120,scrollWidth:120,clientHeight:44,scrollHeight:44}]}));
    j(['evidence','add',id,'--kind','ui-after-validation','--path',audit,'--source','browser-layout-validation','--label','Fast layout audit','--tool','Chrome DevTools','--root',repo]);
    const completed=j(['phase','complete',id,'--session','fast-builder','--root',repo]);assert.equal(completed.phase,'final-approval');assert.equal(completed.status,'awaiting_final_approval');
    const readiness=j(['readiness',id,'--root',repo]);for(const gate of ['codegraph','project-context','product-owner-review','target-audience-review','product-owner-final-review','project-learning'])assert.equal(readiness.gates.find(item=>item.id===gate)?.status,'not-applicable');assert.equal(readiness.gates.find(item=>item.id==='acceptance-coverage')?.status,'pass');
    let review=j(['interaction',id,'--kind','final-approval','--session','fast-review','--root',repo]);assert.equal(review.tool,'host_actions');assert.deepEqual(review.actions.filter(action=>action.blocking).map(action=>action.type),['present-image']);
    for(const action of review.actions)j(['presentation','record',id,'--gate','final','--session','fast-review','--presentation-digest',review.presentation.presentationContract.presentationDigest,'--action',action.id,'--outcome',action.type==='present-image'?'presented':'offered','--root',repo]);
    review=j(['interaction',id,'--kind','final-approval','--session','fast-review','--root',repo]);assert.equal(review.tool,'request_user_input');assert.equal(review.questions[0].options[0].label,'Aprobar resultado');
    const approved=j(['final','approve',id,'--session','fast-review','--root',repo]);assert.equal(approved.status,'done');assert.equal(approved.deliveryStatus,'not_required');assert.equal(readFileSync(path.join(repo,'src','button.css'),'utf8'),'#primary { color: green; }\n');assert.equal(existsSync(path.join(repo,'.ai-flow-worktrees',id)),false);
    spawnSync(bin,['runtime-stop','--root',repo],{encoding:'utf8',env});
});
