// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const expected = ['ai-flow', 'ai-flow-product-specifier', 'ai-flow-ux-ui-designer', 'ai-flow-builder', 'ai-flow-technical-reviewer', 'ai-flow-qa-engineer', 'ai-flow-final-customer'];
function skill(name) { return readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8'); }
function description(md) { return md.match(/^description:\s*(.+)$/m)?.[1]?.trim() || ''; }
test('global skills are discoverable, concise, and have Codex UI metadata', () => {
    for (const name of expected) {
        const file = path.join(root, 'skills', name, 'SKILL.md');
        assert.ok(existsSync(file), `${name} missing`);
        const md = skill(name), desc = description(md);
        assert.ok(desc.length >= 90, `${name} description is too vague`);
        assert.ok(desc.length <= 520, `${name} description is too long`);
        assert.ok(md.split('\n').length >= 18, `${name} contract is too thin`);
        assert.ok(md.split('\n').length <= 75, `${name} contract is too verbose`);
        assert.ok(existsSync(path.join(root, 'skills', name, 'agents', 'openai.yaml')), `${name} openai.yaml missing`);
        assert.match(md, /request_user_input/);
        assert.match(md, /never[^\n]*(?:option lists|multiple-choice)[^\n]*text/i);
    }
});
test('primary skill can be selected from ordinary repository requests without explicit invocation', () => {
    const desc = description(skill('ai-flow')).toLowerCase();
    for (const trigger of ['create', 'change', 'fix', 'redesign', 'implement', 'review', 'continue', 'architecture', 'database', 'frontend', 'backend', 'crea', 'corrige', 'rediseña', 'implementa', 'continúa', 'valida'])
        assert.ok(desc.includes(trigger), `missing trigger ${trigger}`);
    assert.match(desc, /automatically use/);
    assert.match(desc, /Do not use for read-only explanations or research/i);
    assert.match(skill('ai-flow'), /Do not require the user to mention AI Flow, a skill name, a task ID, or a CLI command/i);
});
test('documentation leads with natural-language usage rather than manual commands', () => {
    const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /Open a repository in Codex and ask naturally/i);
    assert.doesNotMatch(readme, /Ask Codex to use \$ai-flow/i);
    assert.match(readme, /Commands are internal and optional/i);
});
test('skills minimize token use and reserve subagents for useful parallel work', () => {
    const primary = skill('ai-flow');
    const product = skill('ai-flow-product-specifier');
    assert.match(primary, /context small/i);
    assert.match(primary, /Do not spawn subagents for trivial work/i);
    assert.match(primary, /at most three read-only subagents/i);
    assert.match(product, /do not scan or copy the whole repository/i);
    assert.match(product, /CodeGraph MCP first/i);
});
test('primary skill resumes tasks across chats by ID, title, or unique phrase without duplicate intake', () => {
    const primary = skill('ai-flow');
    assert.match(primary, /ai-flow resolve/);
    assert.match(primary, /ID, exact title, or unique phrase/i);
    assert.match(primary, /native task selector/i);
    assert.match(primary, /source of truth/i);
    const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /Continue a task in another chat/i);
    assert.match(readme, /Retoma la tarea de la homepage/i);
});
test('orchestrator explicitly loads only the specialist contract returned by deterministic routing', () => {
    const primary = skill('ai-flow');
    assert.match(primary, /\.agents\/skills\/<recommendedSkill>\/SKILL\.md/);
    assert.match(primary, /do not rely on automatic mid-turn skill reselection/i);
    assert.match(primary, /keep unrelated skills in context/i);
});
test('user-facing gates expose a stable optional reference without requiring commands', () => {
    const primary = skill('ai-flow');
    assert.match(primary, /TASK-#### — Title/);
    assert.match(primary, /easy to reference in another chat/i);
    assert.match(primary, /do not expose internal CLI instructions/i);
});
test('orchestrator explains cross-chat references and deterministic delivery without exposing commands to the user', () => {
    const primary = skill('ai-flow'), readme = readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(primary, /ID, title, or descriptive phrase/i);
    assert.match(primary, /Done requires final approval and explicit delivery\/merge/i);
    assert.match(primary, /delivery merge/);
    assert.match(readme, /Implementa la tarea/i);
    assert.match(readme, /Fusionar localmente/);
    assert.match(readme, /Confirmar entrega externa/);
});
test('CodeGraph maintenance is deterministic and automatic before agent reasoning', () => {
    const primary = skill('ai-flow'), product = skill('ai-flow-product-specifier'), readme = readFileSync(path.join(root, 'README.md'), 'utf8'), managed = readFileSync(path.join(root, 'src/lib/managed-installation.ts'), 'utf8');
    for (const text of [primary, readme]) {
        assert.match(text, /codegraph init.*--index/i);
        assert.match(text, /codegraph sync/i);
        assert.match(text, /codegraph index.*--force.*--quiet/i);
        assert.match(text, /codegraph status/i);
    }
    assert.match(primary, /Do not ask the user to initialize or sync it manually/i);
    assert.match(product, /Never ask the user to run init, sync, or index manually/i);
    assert.match(managed, /complete workflow contract/i);
    assert.match(managed, /ai-flow\/SKILL\.md/i);
});
test('frontend skills require exact-target browser evidence and reject broken layout proposals', () => {
    const product = skill('ai-flow-product-specifier'), designer = skill('ai-flow-ux-ui-designer'), qa = skill('ai-flow-qa-engineer'), primary = skill('ai-flow'), managed = readFileSync(path.join(root, 'src/lib/managed-installation.ts'), 'utf8');
    assert.match(product, /UI Target/);
    assert.match(product, /exact selector|visible anchor/i);
    assert.match(product, /Never leave the target as “homepage”/i);
    assert.match(designer, /page-top or full-page screenshot is supplementary only/i);
    assert.match(designer, /Taste Skill/i);
    assert.match(designer, /Image Gen/i);
    assert.match(designer, /editing the focused before screenshot/i);
    assert.match(designer, /visible overflow/i);
    assert.match(designer, /clipped or malformed text/i);
    assert.match(qa, /same target, capture scope, and pixel viewport/i);
    assert.match(qa, /ui-after-validation/i);
    assert.match(qa, /page-top or unrelated screenshot is invalid/i);
    assert.match(primary, /primary screenshot must focus the exact task target/i);
    assert.match(primary, /Taste Skill/i);
    assert.match(primary, /Image Gen/i);
    assert.match(managed, /follow .*ai-flow\/SKILL\.md/i);
});
test('AI Flow contracts enforce approval hashes, task leases, spec lint, review bundles, and progressive context', () => {
    const primary = skill('ai-flow'), product = skill('ai-flow-product-specifier'), builder = skill('ai-flow-builder'), managed = readFileSync(path.join(root, 'src/lib/managed-installation.ts'), 'utf8');
    assert.match(primary, /stable internal session token/i);
    assert.match(primary, /resolve-task-lease/i);
    assert.match(primary, /hashes the governed specification/i);
    assert.match(primary, /specification linter/i);
    assert.match(primary, /review-bundle/i);
    assert.match(primary, /context\.policy/i);
    assert.match(product, /deterministic specification linter/i);
    assert.match(product, /observable inputs, outputs/i);
    assert.match(product, /context policy/i);
    assert.match(builder, /task lease/i);
    assert.match(builder, /approved specification hash/i);
    assert.match(managed, /complete workflow contract/i);
    assert.match(managed, /ai-flow\/SKILL\.md/i);
});
//# sourceMappingURL=skills.test.js.map