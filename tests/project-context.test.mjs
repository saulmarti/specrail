// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject, projectContextStatus } from '../dist/src/lib/project.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { specificationHash } from '../dist/src/lib/specification.js';
import { projectGovernanceHash } from '../dist/src/lib/project-governance.js';
import { qaMissionHash } from '../dist/src/lib/qa.js';
import { startRefinement, completePhase, approveFinal } from '../dist/src/lib/workflow.js';
import { readyProjectContext, setDefaultBlastRadius } from './helpers.mjs';
import { recordTaskLearning } from '../dist/src/lib/learning.js';
import { addEvidence } from '../dist/src/lib/evidence.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-context-'));
function fillSpec(root, id) { const task = loadTask(findTask(root, id)); for (const [heading, text] of Object.entries({ Need: 'Define a stable behavior.', 'Product Value': 'Users receive a useful outcome.', Scope: 'Only the requested behavior.', 'Out of Scope': 'Unrelated changes.', 'Acceptance Criteria': '- Observable result' }))
    task.body = setSection(task.body, heading, text); saveTask(task); setDefaultBlastRadius(root,id); }
test('first task cannot reach approval until the project Product Owner context is generated', () => {
    const root = repo();
    initProject(root, { name: 'Context' });
    const task = createTask(root, { title: 'First change', surfaces: [] });
    startRefinement(root, task.meta.id);
    fillSpec(root, task.meta.id);
    assert.equal(projectContextStatus(root).status, 'pending');
    assert.throws(() => completePhase(root, task.meta.id), /Product Owner context/i);
    readyProjectContext(root);
    completePhase(root, task.meta.id);
    assert.equal(loadTask(findTask(root, task.meta.id)).meta.status, 'awaiting_spec_approval');
});
test('final approval requires a durable learning so future refinement improves', () => {
    const root = repo();
    initProject(root, { name: 'Learning' });
    readyProjectContext(root);
    const task = createTask(root, { title: 'Documentation only', type: 'design', surfaces: [] });
    const loaded = loadTask(findTask(root, task.meta.id));
    for (const [heading, text] of Object.entries({ Need: 'Document the approved terminology.', 'Product Value': 'Keep product language consistent.', Scope: 'Update documentation only.', 'Out of Scope': 'Code changes.', 'Acceptance Criteria': '- The documented terminology matches the approved wording.' }))
        loaded.body = setSection(loaded.body, heading, text);
    loaded.body = setSection(loaded.body, 'QA Mission', '- Persona: Documentation reader\n- Starting point: Project documentation\n- Goal: Confirm the approved terminology is documented\n- Allowed interface: Documentation only\n- Success: The approved wording is present\n- Failure: The wording differs or is missing');
    loaded.meta.spec_approval = 'approved';
    loaded.meta.spec_integrity_version = 2;
    loaded.meta.project_governance_hash = projectGovernanceHash(root);
    loaded.meta.spec_approval_hash = specificationHash(loaded);
    loaded.meta.qa_mission_hash = qaMissionHash(loaded);
    loaded.meta.status = 'awaiting_final_approval';
    loaded.meta.phase = 'final-approval';
    saveTask(loaded);
    const proofDir=path.join(root,'.ai','evidence',task.meta.id,'documentation');mkdirSync(proofDir,{recursive:true});const proof=path.join(proofDir,'result.md');writeFileSync(proof,'# Documentation result\n\nThe approved terminology is present.\n');
    addEvidence(root,task.meta.id,{kind:'documentation-result',path:proof,source:'executed-command',label:'Documentation result',tool:'SpecRail test',command:'verify documentation',exitCode:0,attributes:{proves:['AC-001']}});
    assert.throws(() => approveFinal(root, task.meta.id), /learning/i);
    recordTaskLearning(root, task.meta.id, 'The product now uses the approved terminology.');
    approveFinal(root, task.meta.id);
    assert.equal(loadTask(findTask(root, task.meta.id)).meta.status, 'done');
});
//# sourceMappingURL=project-context.test.js.map