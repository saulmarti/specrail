import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { appendLog, findTask, loadTask, saveTask } from './task.js';
import { recordTrace } from './trace.js';
import { deriveRevisionChangeSignals, materialRevisionSignals, nextRevisionValidationPhase, revisionDependencyPlan, type RevisionChangeSignal, type RevisionClassification } from './artifact-dependencies.js';
import { captureRevisionBaseline, revisionBaselineDigestValid, revisionDeltaFiles } from './revision-delta.js';
import type { TaskDocument, TaskPhase } from './types.js';

export type { RevisionClassification, RevisionChangeSignal } from './artifact-dependencies.js';
export type RevisionStatus = 'active'|'implemented'|'validated'|'accepted'|'superseded'|'cancelled';
export interface RevisionInput {
  request: string;
  classification?: RevisionClassification|string;
  changeSignals?: RevisionChangeSignal[]|string[];
  affectedFiles?: string[];
  affectedAcceptanceCriteria?: string[];
  allowedFiles?: string[];
  sourceGate?: string;
  userAuthorized?: boolean;
}
export interface RevisionRecord {
  schemaVersion: 1|2|3;
  id: string;
  taskId: string;
  request: string;
  classification: string;
  sourceGate: string;
  affectedFiles: string[];
  affectedAcceptanceCriteria: string[];
  allowedFiles: string[];
  impact: string[];
  declaredChangeSignals?: RevisionChangeSignal[];
  initialChangeSignals?: RevisionChangeSignal[];
  changeSignals?: RevisionChangeSignal[];
  actualChangedFiles?: string[];
  impactSource?: 'context'|'implementation-delta';
  baselineSnapshotDigest?: string|null;
  invalidatedArtifacts?: string[];
  requiredPhases?: TaskPhase[];
  revalidateEvidenceKinds: string[];
  preservedArtifacts: string[];
  testPolicy: {
    preImplementationTestPlanning: 'not-required';
    newPermanentTests: 'decide-after-stabilization';
    existingTests: 'run-after-implementation-only-when-cheap-and-relevant';
  };
  userAuthorized: boolean;
  status: RevisionStatus;
  createdAt: string;
  implementedAt: string|null;
  validatedAt: string|null;
  acceptedAt: string|null;
  implementationGeneration: string|null;
  implementationDigest: string|null;
  digest: string;
  stateDigest: string;
}

function base(root:string,id:string){return path.join(path.resolve(root),'.ai','revisions',id);}
function file(root:string,id:string,revisionId:string){return path.join(base(root,id),`${revisionId}.json`);}
function stable(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;const o=value as Record<string,unknown>;return`{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;}
function hash(value:unknown){return createHash('sha256').update(stable(value)).digest('hex');}
function normalize(values:unknown[]|undefined){return [...new Set((values||[]).map(String).map(x=>x.trim()).filter(Boolean))];}
function immutablePartV1(item:RevisionRecord){return{schemaVersion:1,id:item.id,taskId:item.taskId,request:item.request,classification:item.classification,sourceGate:item.sourceGate,affectedFiles:item.affectedFiles,affectedAcceptanceCriteria:item.affectedAcceptanceCriteria,allowedFiles:item.allowedFiles,impact:item.impact,revalidateEvidenceKinds:item.revalidateEvidenceKinds,preservedArtifacts:item.preservedArtifacts,testPolicy:item.testPolicy,userAuthorized:item.userAuthorized,createdAt:item.createdAt};}
function immutablePartV2(item:RevisionRecord){return{schemaVersion:2,id:item.id,taskId:item.taskId,request:item.request,classification:item.classification,sourceGate:item.sourceGate,affectedFiles:item.affectedFiles,affectedAcceptanceCriteria:item.affectedAcceptanceCriteria,allowedFiles:item.allowedFiles,impact:item.impact,changeSignals:item.changeSignals||[],invalidatedArtifacts:item.invalidatedArtifacts||[],requiredPhases:item.requiredPhases||[],revalidateEvidenceKinds:item.revalidateEvidenceKinds,preservedArtifacts:item.preservedArtifacts,testPolicy:item.testPolicy,userAuthorized:item.userAuthorized,createdAt:item.createdAt};}
function immutablePart(item:RevisionRecord){
  if(item.schemaVersion===1)return immutablePartV1(item);
  if(item.schemaVersion===2)return immutablePartV2(item);
  return{schemaVersion:3,id:item.id,taskId:item.taskId,request:item.request,classification:item.classification,sourceGate:item.sourceGate,affectedFiles:item.affectedFiles,affectedAcceptanceCriteria:item.affectedAcceptanceCriteria,allowedFiles:item.allowedFiles,impact:item.impact,declaredChangeSignals:item.declaredChangeSignals||[],initialChangeSignals:item.initialChangeSignals||[],baselineSnapshotDigest:item.baselineSnapshotDigest||null,testPolicy:item.testPolicy,userAuthorized:item.userAuthorized,createdAt:item.createdAt};
}
function legacyStatePart(item:RevisionRecord){return{digest:item.digest,status:item.status,implementedAt:item.implementedAt,validatedAt:item.validatedAt,acceptedAt:item.acceptedAt,implementationGeneration:item.implementationGeneration,implementationDigest:item.implementationDigest};}
function statePart(item:RevisionRecord){
  if(item.schemaVersion<3)return legacyStatePart(item);
  return{digest:item.digest,status:item.status,implementedAt:item.implementedAt,validatedAt:item.validatedAt,acceptedAt:item.acceptedAt,implementationGeneration:item.implementationGeneration,implementationDigest:item.implementationDigest,actualChangedFiles:item.actualChangedFiles||[],impactSource:item.impactSource||'context',changeSignals:item.changeSignals||[],invalidatedArtifacts:item.invalidatedArtifacts||[],requiredPhases:item.requiredPhases||[],revalidateEvidenceKinds:item.revalidateEvidenceKinds,preservedArtifacts:item.preservedArtifacts};
}
function validate(item:RevisionRecord){if(![1,2,3].includes(Number(item.schemaVersion)))throw new Error(`Unsupported revision schema: ${item.schemaVersion}`);if(hash(immutablePart(item))!==item.digest)throw new Error(`Revision integrity check failed: ${item.id}`);if(hash(statePart(item))!==item.stateDigest)throw new Error(`Revision state integrity check failed: ${item.id}`);}
function nextId(root:string,id:string){return `REV-${String(listRevisions(root,id).length+1).padStart(3,'0')}`;}
function inferLabel(task:TaskDocument,request:string,provided?:string):string{
  const explicit=String(provided||'').trim();if(explicit)return explicit;
  if(/\b(?:copy|text|label|wording|texto|etiqueta|redacci[oó]n)\b/i.test(request))return'copy-refinement';
  if(/\b(?:color|spacing|padding|margin|size|width|height|font|contrast|alignment|visual|button|card|layout|css|estilo|tamañ|espaci|margen|contraste|alineaci[oó]n|bot[oó]n|tarjeta)\b/i.test(request)&&task.meta.surfaces.some(x=>['frontend','ui','ux'].includes(x)))return'ui-refinement';
  if(/\b(?:bug|defect|broken|error|incorrect|fix|falla|fallo|arregl)\b/i.test(request))return'implementation-defect';
  if(/\b(?:behavior|behaviour|navigate|navigation|click|submit|cancel|return|flow|comportamiento|navega|clic|enviar|cancelar|volver|flujo)\b/i.test(request))return'behavior-refinement';
  return'bounded-refinement';
}
function impactFromSignals(signals:readonly RevisionChangeSignal[]):string[]{const impact=new Set<string>();if(signals.some(x=>['implementation-output','implementation-correctness'].includes(x)))impact.add('implementation');if(signals.includes('visual-output')||signals.includes('copy-output'))impact.add('visual');if(signals.includes('behavior-output'))impact.add('behavior');return[...impact];}
export function listRevisions(root:string,id:string):RevisionRecord[]{const dir=base(root,id);if(!existsSync(dir))return[];return readdirSync(dir).filter(x=>/^REV-\d+\.json$/.test(x)).map(name=>{const item=JSON.parse(readFileSync(path.join(dir,name),'utf8')) as RevisionRecord;validate(item);return item;}).sort((a,b)=>a.id.localeCompare(b.id));}
export function activeRevision(root:string,id:string):RevisionRecord|null{return[...listRevisions(root,id)].reverse().find(x=>['active','implemented','validated'].includes(x.status))||null;}
export function acceptedRevisions(root:string,id:string):RevisionRecord[]{return listRevisions(root,id).filter(x=>x.status==='accepted');}
function persist(root:string,item:RevisionRecord){item.stateDigest=hash(statePart(item));mkdirSync(base(root,item.taskId),{recursive:true});writeFileSync(file(root,item.taskId,item.id),`${JSON.stringify(item,null,2)}\n`);return item;}
export function createRevision(root:string,id:string,input:RevisionInput):RevisionRecord{
  const task=loadTask(findTask(root,id)),request=String(input.request||'').trim();if(!request)throw new Error('Revision request is required');if(task.meta.spec_approval!=='approved')throw new Error('Incremental revision requires an approved specification');
  const affectedFiles=normalize(input.affectedFiles),declaredChangeSignals=normalize(input.changeSignals) as RevisionChangeSignal[];
  const initialChangeSignals=deriveRevisionChangeSignals({request,files:affectedFiles,taskSurfaces:task.meta.surfaces,explicitSignals:declaredChangeSignals});
  const material=materialRevisionSignals(initialChangeSignals);if(material.length)throw new Error(`Revision context is material (${material.join(', ')}) and cannot use the incremental loop; use an Amendment or return to the narrowest governed specification/design phase`);
  const current=activeRevision(root,task.meta.id);if(current){current.status='superseded';persist(root,current);}
  const revisionId=nextId(root,task.meta.id),classification=inferLabel(task,request,input.classification),dependency=revisionDependencyPlan(initialChangeSignals),createdAt=new Date().toISOString(),baseline=captureRevisionBaseline(root,task,revisionId);
  const item:RevisionRecord={schemaVersion:3,id:revisionId,taskId:task.meta.id,request,classification,sourceGate:String(input.sourceGate||task.meta.phase),affectedFiles,affectedAcceptanceCriteria:normalize(input.affectedAcceptanceCriteria).map(x=>x.toUpperCase()),allowedFiles:normalize(input.allowedFiles),impact:impactFromSignals(initialChangeSignals),declaredChangeSignals,initialChangeSignals,changeSignals:dependency.changeSignals,actualChangedFiles:[],impactSource:'context',baselineSnapshotDigest:baseline.digest,invalidatedArtifacts:dependency.invalidatedArtifacts,requiredPhases:dependency.requiredPhases,revalidateEvidenceKinds:dependency.revalidateEvidenceKinds,preservedArtifacts:dependency.preservedArtifacts,testPolicy:{preImplementationTestPlanning:'not-required',newPermanentTests:'decide-after-stabilization',existingTests:'run-after-implementation-only-when-cheap-and-relevant'},userAuthorized:input.userAuthorized===true||['final-approval','final-customer'].includes(String(input.sourceGate||task.meta.phase)),status:'active',createdAt,implementedAt:null,validatedAt:null,acceptedAt:null,implementationGeneration:null,implementationDigest:null,digest:'',stateDigest:''};
  item.digest=hash(immutablePart(item));persist(root,item);task.meta.active_revision_id=item.id;appendLog(task,`Incremental revision ${item.id} started (${item.classification}) from ${item.sourceGate}: ${item.request}`);saveTask(task);recordTrace(root,task,'revision-started',{revisionId:item.id,classification:item.classification,sourceGate:item.sourceGate,testPlanning:'not-required',impactSource:'context',changeSignals:item.changeSignals||[],invalidatedArtifacts:item.invalidatedArtifacts||[],requiredPhases:item.requiredPhases||[]});return item;
}
export function markRevisionImplemented(root:string,id:string,generation:string,digest:string){
  const task=loadTask(findTask(root,id)),item=activeRevision(root,id);if(!item)throw new Error('No active revision');
  if(item.schemaVersion===3){
    if(!revisionBaselineDigestValid(root,item.taskId,item.id,item.baselineSnapshotDigest))throw new Error(`Revision baseline integrity check failed: ${item.id}`);
    const actualChangedFiles=revisionDeltaFiles(root,task,item.id);if(actualChangedFiles===null)throw new Error(`Revision baseline is missing: ${item.id}`);
    const signals=deriveRevisionChangeSignals({request:item.request,files:actualChangedFiles.length?actualChangedFiles:item.affectedFiles,taskSurfaces:task.meta.surfaces,explicitSignals:item.declaredChangeSignals||[]});
    const material=materialRevisionSignals(signals);if(material.length)throw new Error(`Implemented revision delta became material (${material.join(', ')}); stop the fast path and use an Amendment or the narrowest governed return`);
    const dependency=revisionDependencyPlan(signals);item.actualChangedFiles=actualChangedFiles;item.impactSource='implementation-delta';item.changeSignals=dependency.changeSignals;item.invalidatedArtifacts=dependency.invalidatedArtifacts;item.requiredPhases=dependency.requiredPhases;item.revalidateEvidenceKinds=dependency.revalidateEvidenceKinds;item.preservedArtifacts=dependency.preservedArtifacts;
  }
  item.status='implemented';item.implementedAt=new Date().toISOString();item.implementationGeneration=generation;item.implementationDigest=digest;persist(root,item);recordTrace(root,task,'revision-impact-refined',{revisionId:item.id,impactSource:item.impactSource||'legacy',actualChangedFiles:item.actualChangedFiles||[],changeSignals:item.changeSignals||[],invalidatedArtifacts:item.invalidatedArtifacts||[],requiredPhases:item.requiredPhases||[]});return item;
}
export function markRevisionValidated(root:string,id:string){const item=activeRevision(root,id);if(!item)throw new Error('No active revision');if(item.status!=='implemented')throw new Error(`Revision ${item.id} is not awaiting validation`);item.status='validated';item.validatedAt=new Date().toISOString();persist(root,item);return item;}
export function acceptRevision(root:string,id:string){const task=loadTask(findTask(root,id)),item=activeRevision(root,id);if(!item)return null;if(item.status!=='validated')throw new Error(`Revision ${item.id} must be validated before acceptance`);item.status='accepted';item.acceptedAt=new Date().toISOString();persist(root,item);task.meta.active_revision_id=null;appendLog(task,`Incremental revision ${item.id} accepted after stabilization.`);saveTask(task);recordTrace(root,task,'revision-accepted',{revisionId:item.id,implementationGeneration:item.implementationGeneration||''});return item;}
export function cancelActiveRevision(root:string,id:string,reason='Closed by explicit user governance override'){const task=loadTask(findTask(root,id)),item=activeRevision(root,id);if(!item)return null;item.status='cancelled';persist(root,item);task.meta.active_revision_id=null;appendLog(task,`Incremental revision ${item.id} cancelled: ${reason}`);saveTask(task);recordTrace(root,task,'revision-cancelled',{revisionId:item.id,reason});return item;}
export function revisionRequiredEvidenceKinds(root:string,id:string):string[]{return activeRevision(root,id)?.revalidateEvidenceKinds||[];}
export function revisionRequiredPhases(root:string,id:string):TaskPhase[]{const item=activeRevision(root,id);return item?.requiredPhases||['qa-engineer'];}
export function nextRevisionPhase(root:string,id:string,after?:TaskPhase):TaskPhase|'final-approval'{return nextRevisionValidationPhase(revisionRequiredPhases(root,id),after);}
export function revisionAllowsPreservedFinalProductOwner(root:string,id:string):boolean{const item=activeRevision(root,id);return Boolean(item&&item.status==='validated'&&revisionPreservesArtifact(root,id,'product-owner'));}
export function revisionPreservesArtifact(root:string,id:string,artifact:string):boolean{const item=activeRevision(root,id);return Boolean(item&&['active','implemented','validated'].includes(item.status)&&item.preservedArtifacts.includes(artifact));}
export function revisionInvalidatesArtifact(root:string,id:string,artifact:string):boolean{const item=activeRevision(root,id);return Boolean(item&&['active','implemented','validated'].includes(item.status)&&(item.invalidatedArtifacts||[]).includes(artifact));}
