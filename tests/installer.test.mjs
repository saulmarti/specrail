// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
test('installer enables native questionnaires and installs skills for Codex Desktop and agents', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'ai-flow-install-'));
    mkdirSync(path.join(home, '.codex'), { recursive: true });
    writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "gpt-5.6"\n\n[features]\nmulti_agent = true\n');
    writeFileSync(path.join(home, '.codex', 'AGENTS.md'), '# Existing user rules\n\nKeep this.\n');
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
