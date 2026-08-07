import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateVisualizationPlan } from '../dist/src/lib/visualization.js';
import { validateVisualizationQuality } from '../dist/src/lib/capabilities.js';
const load=name=>JSON.parse(readFileSync(path.join(process.cwd(),'evals','visualization',name),'utf8'));
test('visualization plan evals reject fake availability and accept the signed capability contract',()=>{
 assert.deepEqual(validateVisualizationPlan(load('valid-ui-spec.json')),[]);
 const failures=validateVisualizationPlan(load('invalid-fake-provider.json')).join(' ');
 assert.match(failures,/exact discovered tool/i);
});
test('visualization quality evals reject unreadable, unfaithful, overflowing output',()=>{
 assert.deepEqual(validateVisualizationQuality(load('valid-quality.json'),'fresh-context'),[]);
 const failures=validateVisualizationQuality(load('invalid-quality.json'),'fresh-context').join(' ');
 assert.match(failures,/fresh-context/);assert.match(failures,/sourceFaithful/);assert.match(failures,/mobileReadable/);assert.match(failures,/noOverflow/);assert.match(failures,/score/i);
});
