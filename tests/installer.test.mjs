// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();

test('installer enables native questionnaires, bundles official Ponytail, and installs Pi only when selected', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'ai-flow-install-'));
    mkdirSync(path.join(home, '.codex'), { recursive: true });
    writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "gpt-5.6"\n\n[features]\nmulti_agent = true\n');
    writeFileSync(path.join(home, '.codex', 'AGENTS.md'), '# Existing user rules\n\nKeep this.\n');
    mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
    writeFileSync(path.join(home, '.pi', 'agent', 'AGENTS.md'), '# Existing Pi rules\n\nKeep Pi too.\n');
    writeFileSync(path.join(home, '.pi', 'agent', 'settings.json'), JSON.stringify({ theme: 'dark', packages: ['npm:other/pi-package', 'npm:@saulmarti/specrail@old'] }, null, 2));
    for (let i = 0; i < 2; i++) {
        const result = spawnSync(process.execPath, ['scripts/install.mjs', '--pi'], { cwd: root, env: { ...process.env, AI_FLOW_HOME: home }, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Official Ponytail bundled/i);
        assert.match(result.stdout, /Pi integration installed/i);
    }
    for (const base of ['.agents/skills', '.codex/skills']) {
        assert.ok(existsSync(path.join(home, base, 'ai-flow', 'SKILL.md')));
        assert.ok(existsSync(path.join(home, base, 'ponytail', 'SKILL.md')), `official Ponytail skill must be managed in ${base}`);
    }
    assert.ok(existsSync(path.join(home, '.ai-flow', 'node_modules', '@dietrichgebert', 'ponytail', 'package.json')));
    assert.ok(existsSync(path.join(home, '.ai-flow', 'node_modules', '@dietrichgebert', 'ponytail', 'pi-extension', 'index.js')));
    assert.ok(existsSync(path.join(home, '.ai-flow', 'node_modules', 'typebox', 'package.json')));
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
    assert.match(piAgents, /official.*Ponytail/i);
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

test('--no-pi leaves an existing Pi installation byte-for-byte untouched', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'ai-flow-install-no-pi-'));
    const piRoot = path.join(home, '.pi', 'agent');
    mkdirSync(piRoot, { recursive: true });
    const agentsFile = path.join(piRoot, 'AGENTS.md');
    const settingsFile = path.join(piRoot, 'settings.json');
    const agentsBefore = '# User-owned Pi rules\n\nNever change this.\n';
    const settingsBefore = `${JSON.stringify({ theme: 'dark', packages: ['npm:other/pi-package'], custom: { keep: true } }, null, 2)}\n`;
    writeFileSync(agentsFile, agentsBefore);
    writeFileSync(settingsFile, settingsBefore);
    const result = spawnSync(process.execPath, ['scripts/install.mjs', '--no-pi'], { cwd: root, env: { ...process.env, AI_FLOW_HOME: home }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Pi integration skipped/i);
    assert.equal(readFileSync(agentsFile, 'utf8'), agentsBefore);
    assert.equal(readFileSync(settingsFile, 'utf8'), settingsBefore);
    assert.equal(existsSync(`${agentsFile}.ai-flow.bak`), false);
    assert.equal(existsSync(`${settingsFile}.ai-flow.bak`), false);
    assert.ok(existsSync(path.join(home, '.codex', 'skills', 'ponytail', 'SKILL.md')));
    assert.ok(existsSync(path.join(home, '.ai-flow', 'node_modules', '@dietrichgebert', 'ponytail', 'package.json')));
});

test('installer exposes explicit Pi selector flags and does not silently enable Pi non-interactively', () => {
    const script = readFileSync(path.join(root, 'scripts/install.mjs'), 'utf8');
    assert.match(script, /--pi/);
    assert.match(script, /--no-pi/);
    assert.match(script, /¿Instalar también la integración de SpecRail para Pi\?/);
    assert.match(script, /!process\.stdin\.isTTY\|\|!process\.stdout\.isTTY\)return false/);
});

test('global AGENTS block stays compact and delegates details to the installed skill', () => {
    const managed = readFileSync(path.join(root, 'src/lib/managed-installation.ts'), 'utf8');
    const match = managed.match(/export const ACTIVATION_BODY=\[([\s\S]*?)\]\.join\('\\n'\)/);
    assert.ok(match);
    const words = match[1].replace(/['",]/g, ' ').trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length < 260, `managed global instructions are too large: ${words.length} words`);
    assert.match(match[1], /ai-flow\/SKILL\.md/);
    assert.match(match[1], /complete workflow contract/i);
    assert.match(match[1], /official.*Ponytail/i);
    assert.match(match[1], /Decision Capsule summary in chat/i);
    assert.match(match[1], /do not generate or open Review Cockpit/i);
});

test('Pi managed AGENTS block stays compact and delegates workflow semantics to the shared skill', () => {
    const managed = readFileSync(path.join(root, 'src/lib/managed-installation.ts'), 'utf8');
    const match = managed.match(/export const PI_ACTIVATION_BODY=\[([\s\S]*?)\]\.join\('\\n'\)/);
    assert.ok(match);
    const words = match[1].replace(/['",]/g, ' ').trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length < 220, `managed Pi instructions are too large: ${words.length} words`);
    assert.match(match[1], /specrail_skill/);
    assert.match(match[1], /exact name `ai-flow`/);
    assert.match(match[1], /specrail_cli/);
    assert.match(match[1], /specrail_host_context/);
    assert.match(match[1], /official.*Ponytail/i);
    assert.match(match[1], /do not generate or open Review Cockpit/i);
});
