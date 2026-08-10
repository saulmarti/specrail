import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProject } from '../dist/src/lib/project.js';
import { readyProjectContext, setDefaultBlastRadius, enterCurrentPhaseBoundary, acknowledgePresentation, addFrontendAfterAudit } from './helpers.mjs';
import { completePhase, approveSpecification, rejectFinal, startExecution, startRefinement } from '../dist/src/lib/workflow.js';
import { addEvidence } from '../dist/src/lib/evidence.js';
import { createTask, findTask, loadTask, saveTask, setSection } from '../dist/src/lib/task.js';
import { applyControlProfile, classifyControlProfile, controlProfile } from '../dist/src/lib/control-profile.js';
import { validateEvidence } from '../dist/src/lib/evidence.js';
import { taskReadiness } from '../dist/src/lib/readiness.js';
import { nextAction } from '../dist/src/lib/next.js';
import { activeRevision } from '../dist/src/lib/revisions.js';

function repo(){const root=mkdtempSync(path.join(tmpdir(),'specrail-controls-'));initProject(root,{name:'Controls'});return root;}
function frontend(root,title,need=''){return createTask(root,{title,need,type:'task',surfaces:['frontend'],size:'small',risk:'low'});}

test('localized color/copy changes select micro controls and retain final real-app proof',()=>{
  const root=repo(),task=frontend(root,'Cambia el color del botón principal a verde');
  assert.equal(controlProfile(task),'micro');
  assert.equal(task.meta.route.design,false);
  assert.equal(task.meta.route.technical_review,'none');
  assert.equal(task.meta.route.qa,'none');
  assert.equal(task.meta.route.final_customer,false);
  const pre=validateEvidence(root,task.meta.id,'pre-approval');
  assert.equal(pre.missing.includes('frontend-before'),false);
  assert.equal(pre.missing.includes('frontend-proposal'),false);
  const final=validateEvidence(root,task.meta.id,'final');
  assert.equal(final.missing.includes('frontend-after'),true);
  assert.equal(final.missing.includes('ui-after-validation'),true);
});

test('responsive or judgment work is light, while redesign and behavior stay standard',()=>{
  const root=repo();
  const responsive=frontend(root,'Reduce el heading que está demasiado dominante en mobile');
  assert.equal(controlProfile(responsive),'light');
  assert.equal(responsive.meta.route.design,false);
  assert.equal(responsive.meta.route.qa,'focused');
  assert.equal(responsive.meta.route.technical_review,'none');
  assert.equal(frontend(root,'Rediseña la jerarquía visual del hero').meta.route.control_profile,'standard');
  assert.equal(frontend(root,'Cambia lo que hace el botón al hacer click').meta.route.control_profile,'standard');
});


test('copy updates stay micro, shared design tokens are light, and auth tokens remain rigorous',()=>{
  const root=repo();
  assert.equal(controlProfile(frontend(root,'Update button text from Save to Done')),'micro');
  assert.equal(controlProfile(frontend(root,'Cambia el color del design token primary-500')),'light');
  assert.equal(controlProfile(frontend(root,'Cambia el color del access token status')),'rigorous');
});


test('acceptance criteria can escalate an apparently cosmetic request when they reveal behavior or sensitive scope',()=>{
  const root=repo();let task=frontend(root,'Cambia el color del botón principal');
  task.body=setSection(task.body,'Acceptance Criteria','- AC-001: Clicking the button redirects to a new checkout flow.');saveTask(task);
  task=loadTask(findTask(root,task.meta.id));assert.equal(classifyControlProfile(task).profile,'standard');
  task.body=setSection(task.body,'Acceptance Criteria','- AC-001: The button color changes only after authentication token refresh succeeds.');saveTask(task);
  task=loadTask(findTask(root,task.meta.id));assert.equal(classifyControlProfile(task).profile,'rigorous');
});

test('light frontend controls require a real Before but not ImageGen proposal evidence',()=>{
  const root=repo(),task=frontend(root,'Reduce el heading que está demasiado dominante en mobile');
  const pre=validateEvidence(root,task.meta.id,'pre-approval');
  assert.equal(pre.missing.includes('frontend-before'),true);
  assert.equal(pre.missing.includes('frontend-proposal'),false);
  assert.equal(pre.missing.includes('ui-design-brief'),false);
  assert.equal(pre.missing.includes('ui-proposal-review'),false);
});

test('security/data signals escalate even when a cosmetic word is present',()=>{
  const root=repo(),task=frontend(root,'Cambia el color del estado de autenticación y los tokens');
  assert.equal(controlProfile(task),'rigorous');
  assert.equal(task.meta.route.technical_review,'full');
});

test('Out of Scope security words do not falsely escalate a micro task',()=>{
  const root=repo();let task=frontend(root,'Cambia el padding del botón principal');
  task.body=setSection(task.body,'Out of Scope','No authentication, database, API, migration or security changes.');saveTask(task);
  task=loadTask(findTask(root,task.meta.id));
  assert.equal(classifyControlProfile(task).profile,'micro');
  assert.equal(applyControlProfile(task).profile,'micro');
});

test('control profiles stay provisional during refinement, then never auto-downgrade after sealing',()=>{
  const root=repo();let task=frontend(root,'Cambia el color del botón');assert.equal(controlProfile(task),'micro');assert.equal(task.meta.route.control_profile_provisional,true);
  task.body=setSection(task.body,'Need','On mobile, adjust the layout and breakpoint spacing around the button.');saveTask(task);
  task=loadTask(findTask(root,task.meta.id));const elevated=applyControlProfile(task);assert.equal(elevated.profile,'light');assert.equal(elevated.escalated,true);
  task.body=setSection(task.body,'Need','Only change the color.');const cheaper=applyControlProfile(task);assert.equal(cheaper.profile,'micro','planning may reduce controls when the refined specification proves narrower');assert.equal(cheaper.downgraded,true);
  task.body=setSection(task.body,'Need','On mobile, adjust the layout around the button.');applyControlProfile(task,{lock:true});assert.equal(task.meta.route.control_profile,'light');assert.equal(task.meta.route.control_profile_provisional,false);
  task.meta.phase='spec-approval';task.body=setSection(task.body,'Need','Only change the color.');const sealed=applyControlProfile(task);assert.equal(sealed.profile,'light','sealed controls never auto-downgrade outside refinement');
});


test('micro specification requires only the compact governed contract while standard work still requires product value',async()=>{
  const { lintSpecification }=await import('../dist/src/lib/specification.js');
  const root=repo();let micro=frontend(root,'Cambia el color del botón principal');
  for(const [heading,value] of Object.entries({Need:'Change only the primary button color to green.',Scope:'Only button#primary styling.','Out of Scope':'Layout and behavior.','UI Target':`- Route: \`/\`\n- Target: \`button#primary\`\n- Viewport: \`390x844\`\n- Capture: focused section`,'Acceptance Criteria':'- AC-001: At 390x844 `button#primary` shows the requested green color with no clipping.'}))micro.body=setSection(micro.body,heading,value);
  micro.body=setSection(micro.body,'Blast Radius','- Allowed files: `src/button.css`');saveTask(micro);micro=loadTask(findTask(root,micro.meta.id));assert.equal(lintSpecification(micro,{stage:'approval'}).errors.some(e=>/Product Value is required/i.test(e)),false);
  let standard=frontend(root,'Cambia lo que hace el botón al hacer click');for(const [heading,value] of Object.entries({Need:'Change the button click flow for a new interaction.',Scope:'Only the button flow.','Out of Scope':'Other flows.','UI Target':`- Route: \`/\`\n- Target: \`button#primary\`\n- Viewport: \`390x844\`\n- Capture: focused section`,'Acceptance Criteria':'- AC-001: Clicking `button#primary` opens the requested flow.','Blast Radius':'- Allowed files: `src/button.ts`'}))standard.body=setSection(standard.body,heading,value);saveTask(standard);standard=loadTask(findTask(root,standard.meta.id));assert.equal(lintSpecification(standard,{stage:'approval'}).errors.includes('Product Value is required'),true);
});

test('micro pre-evidence and durable-learning readiness gates are not applicable',()=>{
  const root=repo(),task=frontend(root,'Cambia el texto del botón de Guardar a Listo');
  const readiness=taskReadiness(root,task.meta.id);
  assert.equal(readiness.gates.find(g=>g.id==='pre-evidence')?.status,'not-applicable');
  // Learning becomes relevant only later, but the route itself must remain explicitly micro.
  assert.equal(task.meta.route.control_profile,'micro');
});


function fillSpec(root,id,{need='Make the approved localized UI change.',target='section#cta'}={}){
  let task=loadTask(findTask(root,id));
  for(const [heading,value] of Object.entries({Need:need,'Product Value':'Keep the requested UI clear and consistent.',Scope:'Only the named UI target.','Out of Scope':'Other components and backend behavior.','UI Target':`- Route: \`/\`\n- Target: \`${target}\`\n- Viewport: \`390x844\`\n- Capture: focused section`,'Acceptance Criteria':`- At 390x844 ${target} shows the requested change with no clipped or overlapping content.`})) task.body=setSection(task.body,heading,value);
  saveTask(task);setDefaultBlastRadius(root,id);return loadTask(findTask(root,id));
}
function addLightBefore(root,id,target='section#cta'){
  const dir=path.join(root,'.ai','evidence',id,'frontend');mkdirSync(dir,{recursive:true});const file=path.join(dir,'before.png');writeFileSync(file,Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7h8AAAAASUVORK5CYII=','base64'),Buffer.from([91])]));
  return addEvidence(root,id,{kind:'frontend-before',path:file,source:'browser-capture',label:'Focused before',tool:'Codex browser',route:'/',viewport:'390x844',target,captureScope:'focused-section',runtimeUrl:'http://127.0.0.1:4173/'});
}

test('micro and light profiles actually remove workflow phases rather than only changing labels',()=>{
  const microRoot=repo();readyProjectContext(microRoot);let micro=frontend(microRoot,'Cambia el color del botón principal');fillSpec(microRoot,micro.meta.id);completePhase(microRoot,micro.meta.id);micro=loadTask(findTask(microRoot,micro.meta.id));assert.equal(micro.meta.phase,'spec-approval');approveSpecification(microRoot,micro.meta.id);startExecution(microRoot,micro.meta.id,{sessionId:'micro-builder'});completePhase(microRoot,micro.meta.id,{sessionId:'micro-builder'});micro=loadTask(findTask(microRoot,micro.meta.id));assert.equal(micro.meta.phase,'final-approval','micro skips UX design, technical review, QA and Final Customer phases');

  const lightRoot=repo();readyProjectContext(lightRoot);let light=frontend(lightRoot,'Reduce el heading demasiado dominante en mobile');fillSpec(lightRoot,light.meta.id,{target:'section#heading'});completePhase(lightRoot,light.meta.id);light=loadTask(findTask(lightRoot,light.meta.id));assert.equal(light.meta.phase,'spec-approval','light skips the UX proposal phase');addLightBefore(lightRoot,light.meta.id,'section#heading');acknowledgePresentation(lightRoot,light.meta.id,'spec-approval','light-review');approveSpecification(lightRoot,light.meta.id,'Approved',{sessionId:'light-review'});startExecution(lightRoot,light.meta.id,{sessionId:'light-builder'});completePhase(lightRoot,light.meta.id,{sessionId:'light-builder'});light=loadTask(findTask(lightRoot,light.meta.id));assert.equal(light.meta.phase,'qa-engineer','light keeps focused QA but skips technical review and Final Customer');

  const standardRoot=repo();readyProjectContext(standardRoot);let standard=frontend(standardRoot,'Rediseña la jerarquía visual del hero');fillSpec(standardRoot,standard.meta.id,{target:'section#hero'});completePhase(standardRoot,standard.meta.id);standard=loadTask(findTask(standardRoot,standard.meta.id));assert.equal(standard.meta.phase,'ux-ui-designer','material redesign keeps the full design path');
});

test('fresh-chat deep link targets the repository and pre-fills the deterministic resume prompt',async()=>{
  const { codexFreshChatUrl }=await import('../dist/src/lib/codex-deeplink.js');
  const root=repo(),url=new URL(codexFreshChatUrl(root,'TASK-0042'));
  assert.equal(url.protocol,'codex:');assert.equal(url.hostname,'threads');assert.equal(url.pathname,'/new');
  assert.equal(url.searchParams.get('prompt'),'Continue TASK-0042');assert.equal(url.searchParams.get('path'),path.resolve(root));
});

test('SpecRail Fast micro seals a compact specification without CodeGraph/project bootstrap and routes directly to Builder',()=>{
  const root=repo();let task=createTask(root,{title:'Cambia el color del botón principal a verde',need:'Change only the primary button color to green.',type:'task',surfaces:['frontend'],size:'small',risk:'low',workflowMode:'fast'});
  task=loadTask(findTask(root,task.meta.id));
  for(const [heading,value] of Object.entries({Scope:'Only button#primary styling.','Out of Scope':'Layout and behavior.','UI Target':`- Route: \`/\`\n- Target: \`button#primary\`\n- Viewport: \`390x844\`\n- Capture: focused section`,'Acceptance Criteria':'- At 390x844 `button#primary` shows the requested green color with no clipping.'})) task.body=setSection(task.body,heading,value);
  saveTask(task);setDefaultBlastRadius(root,task.meta.id,['src/button.css']);
  startRefinement(root,task.meta.id);
  const completed=completePhase(root,task.meta.id,{sessionId:'fast-session'});
  assert.equal(completed.meta.workflow_mode,'fast');
  assert.equal(completed.meta.route.control_profile,'micro');
  assert.equal(completed.meta.route.fast_mode,true);
  assert.equal(completed.meta.spec_approval,'approved');
  assert.equal(completed.meta.phase,'builder');
  assert.equal(completed.meta.status,'ready');
  assert.equal(completed.meta.spec_approval_hash?.length,64);
  assert.equal(completed.meta.qa_mission_hash?.length,64);
  assert.doesNotThrow(()=>startExecution(root,completed.meta.id,{sessionId:'fast-session'}));
});


test('SpecRail Fast automatically escalates sensitive work back to normal governance',()=>{
  const root=repo();let task=createTask(root,{title:'SpecRail Fast add authentication token refresh',need:'Change authentication token refresh behavior.',type:'task',surfaces:['backend'],size:'small',risk:'low',workflowMode:'fast'});
  task=loadTask(findTask(root,task.meta.id));
  assert.equal(task.meta.workflow_mode,'fast');
  assert.equal(task.meta.route.control_profile,'rigorous');
  assert.notEqual(task.meta.route.fast_mode,true);
  startRefinement(root,task.meta.id);
  assert.throws(()=>completePhase(root,task.meta.id,{sessionId:'fast-sensitive'}),/CodeGraph preflight|Product Owner context/i);
});


test('SpecRail Fast final review does not reintroduce Product Owner or durable-learning gates',()=>{
  const root=repo();let task=createTask(root,{title:'SpecRail Fast cambia el color del botón principal',need:'Change only the primary button color.',type:'task',surfaces:['frontend'],size:'small',risk:'low',workflowMode:'fast'});
  task=loadTask(findTask(root,task.meta.id));
  for(const [heading,value] of Object.entries({Scope:'Only button#primary styling.','Out of Scope':'Layout, behavior, backend and shared theme tokens.','UI Target':`- Route: \`/\`\n- Target: \`button#primary\`\n- Viewport: \`390x844\`\n- Capture: focused section`,'Acceptance Criteria':'- At 390x844 `button#primary` shows the requested color with no clipping.'})) task.body=setSection(task.body,heading,value);
  saveTask(task);setDefaultBlastRadius(root,task.meta.id,['src/button.css']);startRefinement(root,task.meta.id);
  task=completePhase(root,task.meta.id,{sessionId:'fast-final'});startExecution(root,task.meta.id,{sessionId:'fast-final'});task=completePhase(root,task.meta.id,{sessionId:'fast-final'});
  assert.equal(task.meta.phase,'final-approval');assert.equal(task.meta.route.fast_mode,true);
  const readiness=taskReadiness(root,task.meta.id,{sessionId:'fast-final'});
  assert.equal(readiness.gates.find(g=>g.id==='product-owner-review')?.status,'not-applicable');
  assert.equal(readiness.gates.find(g=>g.id==='product-owner-final-review')?.status,'not-applicable');
  assert.equal(readiness.gates.find(g=>g.id==='project-learning')?.status,'not-applicable');
  const next=nextAction(root,task.meta.id,{sessionId:'fast-final'});
  assert.equal(next.actor,'user');assert.equal(next.action,'approve-or-reject-final-result');assert.equal(next.productIntelligence.finalProductOwner,null);
});


test('automatic micro/light controls omit Product Owner and durable-learning passes even without Fast',()=>{
  const root=repo();let task=frontend(root,'Cambia el color del botón principal a verde');
  let next=nextAction(root,task.meta.id,{sessionId:'normal-micro'});
  assert.equal(next.controlProfile,'micro');
  assert.equal(next.action,'bootstrap-project-and-refine','normal micro may still bootstrap project context but not Product Owner judgment');
  assert.equal(next.productIntelligence.productOwner,null);
  let readiness=taskReadiness(root,task.meta.id,{sessionId:'normal-micro'});
  assert.equal(readiness.gates.find(g=>g.id==='product-owner-review')?.status,'not-applicable');
  task=loadTask(findTask(root,task.meta.id));task.meta.phase='final-approval';task.meta.status='awaiting_final_approval';saveTask(task);
  next=nextAction(root,task.meta.id,{sessionId:'normal-micro'});
  assert.equal(next.actor,'user');assert.equal(next.action,'approve-or-reject-final-result');assert.equal(next.productIntelligence.finalProductOwner,null);
  readiness=taskReadiness(root,task.meta.id,{sessionId:'normal-micro'});
  assert.equal(readiness.gates.find(g=>g.id==='product-owner-final-review')?.status,'not-applicable');
  assert.equal(readiness.gates.find(g=>g.id==='project-learning')?.status,'not-applicable');
});


test('a Fast initial delivery hands later bounded feedback to the 0.10.1 REV/GEN loop instead of replaying Fast planning',()=>{
  const root=repo();let task=createTask(root,{title:'SpecRail Fast cambia el color del botón principal',need:'Change only the primary button color.',type:'task',surfaces:['frontend'],size:'small',risk:'low',workflowMode:'fast'});
  for(const [heading,value] of Object.entries({Scope:'Only button#primary styling.','Out of Scope':'Layout, behavior, backend and shared theme tokens.','UI Target':`- Route: \`/\`\n- Target: \`button#primary\`\n- Viewport: \`390x844\`\n- Capture: focused section`,'Acceptance Criteria':'- AC-001: At 390x844 `button#primary` shows the requested color with no clipping.'})) task.body=setSection(task.body,heading,value);
  saveTask(task);setDefaultBlastRadius(root,task.meta.id,['src/button.css']);startRefinement(root,task.meta.id);
  task=completePhase(root,task.meta.id,{sessionId:'fast-rev'});startExecution(root,task.meta.id,{sessionId:'fast-rev'});task=completePhase(root,task.meta.id,{sessionId:'fast-rev'});
  assert.equal(task.meta.phase,'final-approval');assert.equal(task.meta.route.fast_mode,true);
  addFrontendAfterAudit(root,task.meta.id,{route:'/',target:'button#primary',viewport:'390x844'});
  acknowledgePresentation(root,task.meta.id,'final-approval','fast-rev');
  task=rejectFinal(root,task.meta.id,'Make the same button green slightly darker after seeing the result.','builder',{sessionId:'fast-rev',revisionClass:'bounded-refinement',affectedAcceptanceCriteria:['AC-001']});
  const revision=activeRevision(root,task.meta.id);assert.ok(revision);assert.equal(revision.id,'REV-001');assert.equal(task.meta.phase,'builder');
  const next=nextAction(root,task.meta.id,{sessionId:'fast-rev'});
  assert.notEqual(next.action,'bootstrap-project-and-refine');
  assert.equal(next.recommendedSkill,'ai-flow-builder');
  assert.equal(next.productIntelligence?.productOwner ?? null,null);
});
