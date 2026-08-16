import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { createTask } from '../dist/src/lib/task.js';
import { addQuestion, answerQuestion, listQuestions } from '../dist/src/lib/questions.js';

const repo=()=>mkdtempSync(path.join(tmpdir(),'specrail-question-compat-'));

test('legacy open-answer questions remain valid while structured choice rules stay strict',()=>{
  const root=repo();
  initProject(root,{name:'Questions compatibility'});
  const task=createTask(root,{title:'Clarify behavior',type:'task',surfaces:['backend']});
  const open=addQuestion(root,task.meta.id,{text:'Describe the required behavior.'});
  assert.deepEqual(open.options,[]);
  assert.equal(open.recommendation,null);
  answerQuestion(root,task.meta.id,open.id,'Keep the current public contract.');
  assert.equal(listQuestions(root,task.meta.id)[0]?.answer,'Keep the current public contract.');
  assert.throws(()=>addQuestion(root,task.meta.id,{text:'Bad structured question',options:['Only']}),/between 2 and 4/);
  assert.throws(()=>addQuestion(root,task.meta.id,{text:'Bad open recommendation',recommendation:'A'}),/cannot define a choice recommendation/);
});
