import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function invoke(file){return spawnSync(process.execPath,[file,'--version'],{encoding:'utf8'});}

test('direct CLI entrypoint survives symlink/canonical path differences',()=>{
  const direct=path.resolve('dist/src/cli.js');
  const normal=invoke(direct);assert.equal(normal.status,0,normal.stderr);assert.match(normal.stdout,/^0\.10\.1\s*$/);
  const root=mkdtempSync(path.join(tmpdir(),'specrail-cli-link-'));const alias=path.join(root,'dist','src');mkdirSync(alias,{recursive:true});const linked=path.join(alias,'cli.js');symlinkSync(direct,linked);
  const viaLink=invoke(linked);assert.equal(viaLink.status,0,viaLink.stderr);assert.equal(viaLink.stdout.trim(),normal.stdout.trim());
});
