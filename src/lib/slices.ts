import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSubtask, findTask, loadTask, saveTask, setSection, appendLog } from './task.js';
import type { TaskDocument, VerticalSliceDefinition, VerticalSlicePlan } from './types.js';

function file(root:string,id:string){return path.join(path.resolve(root),'.ai','runtime','slices',`${id}.json`);}
function assertAcyclic(slices:VerticalSliceDefinition[]):void{
  const byId=new Map(slices.map(item=>[item.id,item]));
  for(const slice of slices) for(const dependency of slice.dependsOn??[]){
    if(!byId.has(dependency)) throw new Error(`Slice ${slice.id} depends on unknown slice ${dependency}`);
    if(dependency===slice.id) throw new Error(`Slice ${slice.id} cannot depend on itself`);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string)=>{if(visiting.has(id))throw new Error('Vertical slice dependencies must be acyclic');if(visited.has(id))return;visiting.add(id);for(const dep of byId.get(id)?.dependsOn??[])visit(dep);visiting.delete(id);visited.add(id);};
  for(const slice of slices)visit(slice.id);
}
export function createSlicePlan(root:string,id:string,inputs:Array<Omit<VerticalSliceDefinition,'id'>>):VerticalSlicePlan{
  const task=loadTask(findTask(root,id));
  if(task.meta.size!=='large'||task.meta.type!=='feature')throw new Error('Vertical slice plans are required only for large features');
  if(inputs.length<2)throw new Error('Large feature needs at least two vertical slices');
  const slices=inputs.map((input,index)=>({...input,id:`SLICE-${String(index+1).padStart(2,'0')}`,dependsOn:input.dependsOn??[]}));
  for(const slice of slices){
    if(slice.surfaces.length<1||slice.acceptance.length<1||slice.evidence.length<1||slice.outcome.trim().length<12)throw new Error(`Slice ${slice.id} is not end-to-end and demonstrable`);
    if(slice.surfaces.every(surface=>['frontend-only-layer','backend-only-layer','database-only-layer'].includes(surface)))throw new Error(`Slice ${slice.id} is a horizontal technical layer, not a demonstrable user outcome`);
  }
  assertAcyclic(slices);
  const plan:VerticalSlicePlan={schemaVersion:1,taskId:task.meta.id,status:'draft',slices,createdAt:new Date().toISOString(),materializedAt:null};
  mkdirSync(path.dirname(file(root,id)),{recursive:true});writeFileSync(file(root,id),`${JSON.stringify(plan,null,2)}\n`);
  task.meta.delivery_strategy='vertical-slices';
  task.body=setSection(task.body,'Vertical Slices',slices.map(slice=>`### ${slice.id} — ${slice.title}\n\n- Outcome: ${slice.outcome}\n- Surfaces: ${slice.surfaces.join(', ')}\n- Depends on: ${(slice.dependsOn??[]).join(', ')||'none'}\n- Acceptance: ${slice.acceptance.join('; ')}\n- Evidence: ${slice.evidence.join(', ')}`).join('\n\n'));
  appendLog(task,'Vertical slice plan created.');saveTask(task);return plan;
}
export function loadSlicePlan(root:string,id:string):VerticalSlicePlan|null{const target=file(root,id);return existsSync(target)?JSON.parse(readFileSync(target,'utf8')) as VerticalSlicePlan:null;}
export function materializeSlices(root:string,id:string):{plan:VerticalSlicePlan;children:TaskDocument[]}{
  const task=loadTask(findTask(root,id)),plan=loadSlicePlan(root,id);if(!plan)throw new Error('No vertical slice plan found');assertAcyclic(plan.slices);
  if(plan.status==='materialized')return{plan,children:task.meta.slice_ids.map(childId=>loadTask(findTask(root,childId)))};
  const children:TaskDocument[]=[];const childBySlice=new Map<string,string>();
  for(const slice of plan.slices){
    let child=createSubtask(root,id,{title:slice.title,need:slice.outcome,type:'feature',surfaces:slice.surfaces,size:'small',risk:task.meta.risk,executionProfile:task.meta.execution_profile});
    child.body=setSection(child.body,'Product Value',`Vertical slice of ${task.meta.id}: ${slice.outcome}`);
    child.body=setSection(child.body,'Users',getUserSection(task));child.body=setSection(child.body,'Scope',slice.outcome);child.body=setSection(child.body,'Out of Scope',`Other slices from ${task.meta.id}.`);
    child.body=setSection(child.body,'Acceptance Criteria',slice.acceptance.map(value=>`- ${value}`).join('\n'));
    child.body=setSection(child.body,'QA Mission',`- Persona: approved user of ${task.meta.id}\n- Starting point: public entry point\n- Goal: ${slice.outcome}\n- Allowed interface: public UI or API only\n- Success: ${slice.acceptance.join('; ')}\n- Failure: required evidence is missing or the outcome cannot be completed`);
    child.meta.file_scope=[];child=saveTask(child);children.push(child);childBySlice.set(slice.id,child.meta.id);
  }
  for(const [index,slice] of plan.slices.entries()){
    const child=children[index]!;child.meta.dependencies=(slice.dependsOn??[]).map(dep=>childBySlice.get(dep)!).filter(Boolean);children[index]=saveTask(child);
  }
  const refreshed=loadTask(findTask(root,id));refreshed.meta.slice_ids=children.map(child=>child.meta.id);appendLog(refreshed,`Materialized ${children.length} vertical slices with explicit dependency order.`);saveTask(refreshed);
  plan.status='materialized';plan.materializedAt=new Date().toISOString();writeFileSync(file(root,id),`${JSON.stringify(plan,null,2)}\n`);return{plan,children};
}
function getUserSection(task:TaskDocument){const match=task.body.match(/## Users\n\n([\s\S]*?)(?=\n## )/);return match?.[1]?.trim()||'Approved users from the parent feature.';}
