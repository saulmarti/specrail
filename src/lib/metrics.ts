import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { listTrace, validateTrace } from './trace.js';
import { contextStatus } from './context.js';
import { findTask, loadTask } from './task.js';
import { listFailures } from './failures.js';

export function taskMetrics(root:string,id:string){
  const task=loadTask(findTask(root,id)),events=listTrace(root,task.meta.id),phaseEntries:Record<string,number>={},phaseDurationsSeconds:Record<string,number>={};
  const phaseStarts=new Map<string,number>();
  for(const event of events){
    const at=Date.parse(event.at);
    if(['phase-entered','execution-started','refinement-started'].includes(event.event)){
      phaseEntries[event.phase]=(phaseEntries[event.phase]||0)+1;
      if(Number.isFinite(at))phaseStarts.set(event.phase,at);
    }
    if(event.event==='phase-completed'){
      const completed=String(event.data.completedPhase||event.phase),start=phaseStarts.get(completed);
      if(start!==undefined&&Number.isFinite(at))phaseDurationsSeconds[completed]=(phaseDurationsSeconds[completed]||0)+Math.max(0,Math.round((at-start)/1000));
    }
  }
  const first=events[0]?.at?Date.parse(events[0].at):Date.parse(task.meta.created_at),last=events.at(-1)?.at?Date.parse(events.at(-1)!.at):Date.now();
  const specApproved=events.find(event=>event.event==='specification-approved'),finalApproved=events.find(event=>event.event==='final-approved'),delivered=events.find(event=>event.event==='delivery-completed');
  const secondsFromStart=(event:typeof specApproved)=>event&&Number.isFinite(first)?Math.max(0,Math.round((Date.parse(event.at)-first)/1000)):null;
  const context=contextStatus(root,task.meta.id),traceIntegrity=validateTrace(root,task.meta.id),branches=[...new Set(events.map(event=>event.branchId))],runtimeKinds=[...new Set(events.map(event=>event.runtime.kind))];
  const failures=listFailures(root).filter(failure=>failure.taskId===task.meta.id),failureCategories=Object.fromEntries([...new Set(failures.map(failure=>failure.category))].map(category=>[category,failures.filter(failure=>failure.category===category).length]));
  const userRejections=events.filter(event=>event.event==='user-rejection').length,repairAttempts=events.filter(event=>event.event==='repair-attempt').length;
  const metrics={
    schemaVersion:3,taskId:task.meta.id,telemetry:'local-only',events:events.length,branches:branches.length,branchIds:branches,harness:'specrail',runtimeKinds,traceIntegrity,
    elapsedSeconds:Math.max(0,Math.round((last-first)/1000)),timeToSpecApprovalSeconds:secondsFromStart(specApproved),timeToFinalApprovalSeconds:secondsFromStart(finalApproved),timeToDeliverySeconds:secondsFromStart(delivered),
    phaseEntries,phaseDurationsSeconds,repairAttempts,userRejections,qaReturns:failures.filter(failure=>failure.phase==='qa-engineer').length,customerReturns:failures.filter(failure=>failure.phase==='final-customer'||failure.category==='low-value'||failure.category==='usability-friction').length,
    failureCategories,questions:events.filter(event=>event.event==='question-added').length,userGates:events.filter(event=>['question-added','blocked','specification-approved','final-approved'].includes(event.event)).length,
    contextFiles:context.files.length,contextExpansions:context.expansionCount,contextBudgetProfile:task.meta.execution_profile,
    completed:task.meta.status==='done',deliveryStatus:task.meta.delivery_status,generatedAt:new Date().toISOString()
  };
  const file=path.join(path.resolve(root),'.ai','metrics',`${task.meta.id}.json`);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,`${JSON.stringify(metrics,null,2)}\n`);return{...metrics,path:file};
}
