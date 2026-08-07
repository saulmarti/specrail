// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { readyProjectContext, addApprovedImageGenProposal, setDefaultBlastRadius } from './helpers.mjs';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { startRefinement, completePhase } from '../dist/src/lib/workflow.js';
import { interactionForTask } from '../dist/src/lib/interactions.js';
import { nextAction } from '../dist/src/lib/next.js';
const repo = () => mkdtempSync(path.join(tmpdir(), 'ai-flow-presentation-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=', 'base64');
function prepareFrontendSpec(root) {
    initProject(root, { name: 'Preview' });
    readyProjectContext(root);
    const task = createTask(root, { title: 'Ajustar tamaño del h3 de home spotlight en la homepage', type: 'task', surfaces: ['frontend'] });
    startRefinement(root, task.meta.id);
    let loaded = loadTask(findTask(root, task.meta.id));
    loaded.body = setSection(loaded.body, 'Need', 'Reducir el tamaño visual del encabezado H3 del bloque Home Spotlight.');
    loaded.body = setSection(loaded.body, 'Product Value', 'Mejorar la jerarquía visual sin cambiar el contenido.');
    loaded.body = setSection(loaded.body, 'Users', 'Visitantes de la homepage en móvil y escritorio.');
    loaded.body = setSection(loaded.body, 'Scope', '- Ajustar únicamente el H3 de Home Spotlight.\n- Mantener tipografía y contenido.');
    loaded.body = setSection(loaded.body, 'UI Target', '- Route: `/`\n- Target: `section#home-spotlight`\n- Viewport: `1440x1000` and `390x844`\n- Capture: focused section');
    loaded.body = setSection(loaded.body, 'Out of Scope', '- Rediseñar el resto de la homepage.');
    loaded.body = setSection(loaded.body, 'Acceptance Criteria', '- El H3 se lee completo en 1440x1000 y 390x844.\n- En ambos viewports no hay overflow horizontal, clipping ni solapes.');
    loaded.meta.route.design = true;
    saveTask(loaded);
    setDefaultBlastRadius(root,task.meta.id);
    completePhase(root, task.meta.id);
    addApprovedImageGenProposal(root, task.meta.id, { target: 'section#home-spotlight', beforeLabel: 'Homepage actual', proposalLabel: 'Propuesta H3' });
    completePhase(root, task.meta.id);
    return task.meta.id;
}
test('spec approval includes a complete chat presentation before native input', () => {
    const root = repo(), id = prepareFrontendSpec(root);
    const interaction = interactionForTask(root, id, 'spec-approval');
    assert.equal(interaction.tool, 'request_user_input');
    assert.equal(interaction.presentation.requiredBeforeInput, true);
    assert.equal(interaction.presentation.kind, 'specification-review');
    assert.match(interaction.presentation.markdown, /TASK-0001 — Ajustar tamaño del h3/);
    assert.match(interaction.presentation.markdown, /## Necesidad/);
    assert.match(interaction.presentation.markdown, /Reducir el tamaño visual/);
    assert.match(interaction.presentation.markdown, /## Criterios de aceptación/);
    assert.match(interaction.presentation.markdown, /no hay overflow horizontal/);
    assert.doesNotMatch(interaction.presentation.markdown, /Workflow Log/);
    assert.equal(interaction.presentation.attachments.length, 7);
    assert.ok(interaction.presentation.attachments.every(item => path.isAbsolute(item.path)));
    assert.deepEqual(interaction.presentation.attachments.map(x => x.kind), ['review-cockpit', 'review-bundle', 'task-markdown', 'frontend-before', 'ui-design-brief', 'frontend-proposal', 'ui-proposal-review']);
});
test('next action carries the same review presentation so a new chat can render it', () => {
    const root = repo(), id = prepareFrontendSpec(root);
    const next = nextAction(root, id);
    assert.equal(next.action, 'approve-or-refine-specification');
    assert.equal(next.interaction.presentation.requiredBeforeInput, true);
    assert.match(next.interaction.presentation.markdown, /## Alcance/);
    assert.equal(next.interaction.presentation.attachments.length, 7);
});
test('orchestrator contract requires rendering and attaching evidence before asking', () => {
    const skill = readFileSync(path.join(process.cwd(), 'skills/ai-flow/SKILL.md'), 'utf8');
    assert.match(skill, /render.*presentation\.markdown.*chat/i);
    assert.match(skill, /attach.*presentation\.attachments/i);
    assert.match(skill, /before.*request_user_input/i);
    assert.match(skill, /do not ask for approval/i);
});
test('approval prompts explicitly refer to the preview already shown above', () => {
    const root = repo(), id = prepareFrontendSpec(root);
    const interaction = interactionForTask(root, id, 'spec-approval');
    assert.match(interaction.questions[0].question, /mostrada arriba/i);
    assert.equal(interaction.presentation.attachments[0].display, 'inline');
    assert.equal(interaction.presentation.attachments[0].mediaType, 'text/html');
    assert.equal(interaction.presentation.attachments[1].mediaType, 'text/markdown');
    assert.equal(interaction.presentation.attachments[2].mediaType, 'text/markdown');
    assert.match(interaction.presentation.attachments[3].mediaType, /^image\//);
});
test('managed activation delegates presentation details to the global skill while preserving the approval invariant', () => {
    const managed = readFileSync(path.join(process.cwd(), 'src/lib/managed-installation.ts'), 'utf8');
    assert.match(managed, /follow .*ai-flow\/SKILL\.md/i);
    assert.match(managed, /Before any approval, open or render the Review Cockpit attachment.*show the returned presentation Markdown.*inline attachments in chat/i);
    assert.match(managed, /Never implement before explicit specification approval/i);
});
//# sourceMappingURL=presentation.test.js.map