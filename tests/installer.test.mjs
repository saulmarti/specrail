// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
test('installer enables native questionnaires and installs skills/adapters for Codex and Pi', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'ai-flow-install-'));
    mkdirSync(path.join(home, '.codex'), { recursive: true });
    writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "gpt-5.6"\n\n[features]\nmulti_agent = true\n');
    writeFileSync(path.join(home, '.codex', 'AGENTS.md'), '# Existing user rules\n\nKeep this.\n');
    mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
    writeFileSync(path.join(home, '.pi', 'agent', 'AGENTS.md'), '# Existing Pi rules\n\nKeep Pi too.\n');
    writeFileSync(path.join(home, '.pi', 'agent', 'settings.json'), JSON.stringify({ theme: 'dark', packages: ['npm:other/pi-package', 'npm:@saulmarti/specrail@old'] }, null, 2));
    for (let i = 0; i < 2; i++) {
        const result = spawnSync(process.execPath, ['scripts/install.mjs'], { cwd: root, env: { ...process.env, AI_FLOW_HOME: home }, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
    }
    for (const base of ['.agents/skills', '.codex/skills'])
        assert.ok(existsSync(path.join(home, base, 'ai-flow', 'SKILL.md')));
    const config = readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');
    assert.match(config, /\[features\][\s\S]*default_mode_request_user_input\s*=\s*true/);
    const agents = readFileSync(path.join(home, '.codex', 'AGENTS.md'), 'utf8');
    assert.match(agents, /Keep this\./);
    assert.equal((agents.match(/AI-FLOW:BEGIN/g) || []).length, 1);
    assert.match(agents, /automatically apply SpecRail/i);
    assert.match(agents, /\$HOME\/.local\/bin\/specrail/);
    assert.ok(existsSync(path.join(home, '.local', 'bin', 'ai-flow')));
    assert.ok(existsSync(path.join(home, '.local', 'bin', 'specrail')));
    const piAgents = readFileSync(path.join(home, '.pi', 'agent', 'AGENTS.md'), 'utf8');
    assert.match(piAgents, /Keep Pi too\./);
    assert.equal((piAgents.match(/AI-FLOW:PI-BEGIN/g) || []).length, 1);
    assert.match(piAgents, /specrail_cli/);
    assert.match(piAgents, /specrail_host_context/);
    const piSettings = path.join(home, '.pi', 'agent', 'settings.json');
    assert.ok(existsSync(piSettings));
    const settings = JSON.parse(readFileSync(piSettings, 'utf8'));
    assert.equal(settings.theme, 'dark');
    assert.deepEqual(settings.packages, ['npm:other/pi-package', path.join(home, '.ai-flow')]);
    assert.equal(existsSync(path.join(home, '.pi', 'agent', 'extensions', 'specrail.js')), false, 'managed Pi route must load SpecRail as a Pi Package, not as a dependency-fragile loose extension');
    const managedExtension = path.join(home, '.ai-flow', 'extensions', 'specrail.js');
    assert.ok(existsSync(managedExtension));
    assert.match(readFileSync(managedExtension, 'utf8'), /registerTool\(\{[\s\S]*name: 'specrail_cli'/);
    assert.match(readFileSync(managedExtension, 'utf8'), /sessionManager\.getSessionId\(\)/);
});
//# sourceMappingURL=installer.test.js.map
test('global AGENTS block stays compact and delegates details to the installed skill', () => {
    const managed = readFileSync(path.join(root, 'src/lib/managed-installation.ts'), 'utf8');
    const match = managed.match(/export const ACTIVATION_BODY=\[([\s\S]*?)\]\.join\('\\n'\)/);
    assert.ok(match);
    const words = match[1].replace(/['",]/g, ' ').trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length < 230, `managed global instructions are too large: ${words.length} words`);
    assert.match(match[1], /ai-flow\/SKILL\.md/);
    assert.match(match[1], /complete workflow contract/i);
});

test('Pi managed AGENTS block stays compact and delegates workflow semantics to the shared skill', () => {
    const managed = readFileSync(path.join(root, 'src/lib/managed-installation.ts'), 'utf8');
    const match = managed.match(/export const PI_ACTIVATION_BODY=\[([\s\S]*?)\]\.join\('\\n'\)/);
    assert.ok(match);
    const words = match[1].replace(/['",]/g, ' ').trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length < 190, `managed Pi instructions are too large: ${words.length} words`);
    assert.match(match[1], /specrail_skill/);
    assert.match(match[1], /exact name `ai-flow`/);
    assert.match(match[1], /specrail_cli/);
    assert.match(match[1], /specrail_host_context/);
});
