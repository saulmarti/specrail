import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { restoreManagedInstallation } from '../dist/src/lib/managed-installation.js';

const root=process.cwd();

test('package publishes Brain Worker launcher and architecture contract',()=>{
  const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.bin['specrail-worker'],'scripts/specrail-worker.mjs');
  assert.ok(pkg.files.includes('docs/BRAIN-WORKERS.md'));
  assert.ok(existsSync(path.join(root,'scripts','specrail-worker.mjs')));
  assert.ok(existsSync(path.join(root,'docs','BRAIN-WORKERS.md')));
});

test('managed install provisions an executable specrail-worker without losing bundled Ponytail',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'specrail-brain-worker-home-'));
  const result=restoreManagedInstallation(root,home,{installPi:false});
  const worker=path.join(home,'.local','bin','specrail-worker');
  assert.ok(result.bins.includes(worker));
  assert.ok(existsSync(worker));
  assert.ok((statSync(worker).mode&0o111)!==0);
  assert.match(readFileSync(worker,'utf8'),/specrail-worker\.mjs/);
  assert.ok(existsSync(path.join(result.ponytailRoot,'package.json')));
  assert.match(readFileSync(path.join(home,'.codex','AGENTS.md'),'utf8'),/Brain\/Worker-routed heavy phases/i);
});

test('Pi adapter exposes a first-class worker tool and never asks Brain to select the worker model',()=>{
  const source=readFileSync(path.join(root,'extensions','specrail.js'),'utf8');
  assert.match(source,/name: 'specrail_worker'/);
  assert.match(source,/next\.intelligence=worker/);
  assert.match(source,/WORKER_LAUNCHER/);
  assert.match(source,/--host', 'pi'/);
  assert.doesNotMatch(source,/specrail_worker[\s\S]{0,1500}model:\s*Type\./i);
  assert.match(source,/current Pi chat is the Brain/i);
});
