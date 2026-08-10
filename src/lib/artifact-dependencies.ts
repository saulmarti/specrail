import type { TaskPhase } from './types.js';

/** Human-facing label only. Routing never depends on this value. */
export type RevisionClassification = string;

export type RevisionChangeSignal =
  | 'implementation-output'
  | 'visual-output'
  | 'copy-output'
  | 'behavior-output'
  | 'implementation-correctness'
  | 'architecture'
  | 'contract'
  | 'security'
  | 'data-model'
  | 'product-outcome'
  | 'user-flow'
  | 'audience-comprehension';

export const REVISION_CHANGE_SIGNALS = [
  'implementation-output','visual-output','copy-output','behavior-output','implementation-correctness',
  'architecture','contract','security','data-model','product-outcome','user-flow','audience-comprehension'
] as const satisfies readonly RevisionChangeSignal[];

export const MATERIAL_REVISION_SIGNALS = new Set<RevisionChangeSignal>(['architecture','contract','security','data-model','product-outcome']);

export interface RevisionImpactContext {
  request: string;
  files?: readonly string[];
  taskSurfaces?: readonly string[];
  explicitSignals?: readonly string[];
}
export interface ArtifactDependencyNode {
  id: string;
  label: string;
  dependsOn: RevisionChangeSignal[];
  evidenceKinds: string[];
  phase: TaskPhase | null;
}

/**
 * Semantic artifact graph. Revisions invalidate artifacts first; workflow
 * phases are derived from the producer/validator of those artifacts.
 */
export const ARTIFACT_DEPENDENCY_GRAPH: readonly ArtifactDependencyNode[] = [
  { id:'approved-specification', label:'Approved specification', dependsOn:['product-outcome','contract','user-flow'], evidenceKinds:[], phase:null },
  { id:'architecture', label:'Architecture decision', dependsOn:['architecture','contract','security','data-model'], evidenceKinds:['architecture-final'], phase:'technical-architecture' },
  { id:'qa-mission', label:'QA Mission', dependsOn:['product-outcome','user-flow','contract','security'], evidenceKinds:[], phase:null },
  { id:'technical-review', label:'Technical review', dependsOn:['architecture','contract','security','data-model'], evidenceKinds:['technical-review-report','constitution-report'], phase:'technical-reviewer' },
  { id:'visual-validation', label:'Visual implementation validation', dependsOn:['visual-output','copy-output'], evidenceKinds:['frontend-after','ui-after-validation'], phase:'qa-engineer' },
  { id:'behavior-validation', label:'Targeted behavior validation', dependsOn:['behavior-output','implementation-correctness'], evidenceKinds:['revision-validation-report'], phase:'qa-engineer' },
  { id:'target-audience', label:'Target Audience judgment', dependsOn:['product-outcome','user-flow','audience-comprehension'], evidenceKinds:['customer-report'], phase:'final-customer' },
  { id:'product-owner', label:'Product Owner judgment', dependsOn:['product-outcome','user-flow','contract'], evidenceKinds:[], phase:null },
  { id:'acceptance-coverage', label:'Acceptance evidence coverage', dependsOn:['implementation-output','visual-output','copy-output','behavior-output','implementation-correctness'], evidenceKinds:[], phase:'qa-engineer' }
] as const;

const PHASE_ORDER:TaskPhase[]=['technical-architecture','technical-reviewer','qa-engineer','final-customer'];
const VISUAL_FILE=/\.(?:css|scss|sass|less|styl|svg)$/i;
const UI_FILE=/(?:^|\/)(?:components?|views?|pages?|screens?|ui|styles?|theme)(?:\/|$)|\.(?:tsx|jsx|vue|svelte|html)$/i;
const COPY_FILE=/(?:^|\/)(?:locales?|i18n|translations?|content|copy)(?:\/|$)|\.(?:po|pot)$/i;
const DATA_FILE=/(?:^|\/)(?:migrations?|database|db)(?:\/|$)|(?:^|\/)(?:schema)\.(?:sql|prisma)$/i;
const SECURITY_FILE=/(?:^|\/)(?:auth|authentication|authorization|permissions?|security|acl)(?:\/|$)/i;
const CONTRACT_FILE=/(?:openapi|swagger|asyncapi|\.proto$|schema\.graphql$|api-contract|contract\.ya?ml$)/i;
const ARCH_FILE=/(?:^|\/)(?:architecture|infra|infrastructure|terraform|k8s|kubernetes)(?:\/|$)|(?:docker-compose|Dockerfile)/i;
const TEST_FILE=/(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const CODE_FILE=/\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|php|cs|cpp|c|h)$/i;

function add(set:Set<RevisionChangeSignal>,...signals:RevisionChangeSignal[]){for(const signal of signals)set.add(signal);}
export function isRevisionChangeSignal(value:string):value is RevisionChangeSignal{return (REVISION_CHANGE_SIGNALS as readonly string[]).includes(value);}

/**
 * Derive impact from concrete revision context: user request, explicitly named
 * signals, affected/actual files, and repository surfaces. Classification is
 * intentionally absent so adding a new label cannot change routing.
 */
export function deriveRevisionChangeSignals(context:RevisionImpactContext):RevisionChangeSignal[] {
  const signals=new Set<RevisionChangeSignal>();
  for(const raw of context.explicitSignals||[]){const value=String(raw).trim();if(!isRevisionChangeSignal(value))throw new Error(`Unknown revision change signal: ${value}`);signals.add(value);}
  const request=String(context.request||''),frontend=(context.taskSurfaces||[]).some(surface=>['frontend','ui','ux'].includes(String(surface).toLowerCase()));
  if(/\b(?:color|spacing|padding|margin|size|width|height|font|contrast|alignment|visual|layout|css|estilo|tamañ|espaci|margen|contraste|alineaci[oó]n)\b/i.test(request))add(signals,'implementation-output',frontend?'visual-output':'implementation-correctness');
  if(/\b(?:copy|text|label|wording|microcopy|texto|etiqueta|redacci[oó]n)\b/i.test(request))add(signals,'implementation-output',frontend?'copy-output':'behavior-output');
  if(/\b(?:bug|defect|broken|error|incorrect|fix|falla|fallo|arregl)\b/i.test(request))add(signals,'implementation-output','implementation-correctness');
  if(/\b(?:behavior|behaviour|navigate|navigation|click|submit|cancel|return|comportamiento|navega|clic|enviar|cancelar|volver)\b/i.test(request))add(signals,'implementation-output','behavior-output');
  if(/\b(?:new user flow|nuevo flujo)\b/i.test(request))add(signals,'user-flow');
  if(/\b(?:product outcome|new capability|nueva capacidad|resultado de producto)\b/i.test(request))add(signals,'product-outcome');
  if(/\b(?:architecture|architectural|arquitectura|microservice|microservicio)\b/i.test(request))add(signals,'architecture');
  if(/\b(?:breaking contract|api contract|contrato breaking|contrato de api)\b/i.test(request))add(signals,'contract');
  if(/\b(?:authentication|authorization|security model|privacy|autenticaci[oó]n|autorizaci[oó]n|seguridad|privacidad)\b/i.test(request))add(signals,'security');
  if(/\b(?:schema migration|data migration|migraci[oó]n de datos|migraci[oó]n de esquema)\b/i.test(request))add(signals,'data-model');

  const files=[...new Set((context.files||[]).map(file=>String(file).replace(/\\/g,'/').replace(/^\.\//,'')).filter(Boolean))];
  for(const file of files){
    add(signals,'implementation-output');
    if(ARCH_FILE.test(file))add(signals,'architecture');
    if(CONTRACT_FILE.test(file))add(signals,'contract');
    if(SECURITY_FILE.test(file))add(signals,'security');
    if(DATA_FILE.test(file))add(signals,'data-model');
    if(VISUAL_FILE.test(file)||UI_FILE.test(file))add(signals,'visual-output');
    if(COPY_FILE.test(file))add(signals,'copy-output');
    if(TEST_FILE.test(file))add(signals,'implementation-correctness');
    else if(CODE_FILE.test(file)&&!VISUAL_FILE.test(file))add(signals,'behavior-output');
  }

  if(signals.size===0){
    add(signals,'implementation-output');
    add(signals,frontend?'visual-output':'implementation-correctness');
  }
  return [...signals];
}

export function materialRevisionSignals(signals:readonly RevisionChangeSignal[]):RevisionChangeSignal[]{return signals.filter(signal=>MATERIAL_REVISION_SIGNALS.has(signal));}
export function invalidatedArtifactsForSignals(signals:readonly RevisionChangeSignal[]):ArtifactDependencyNode[]{const changed=new Set(signals);return ARTIFACT_DEPENDENCY_GRAPH.filter(node=>node.dependsOn.some(dep=>changed.has(dep)));}

export function revisionDependencyPlan(changeSignals:readonly RevisionChangeSignal[]){
  const invalidated=invalidatedArtifactsForSignals(changeSignals),invalidatedArtifacts=invalidated.map(node=>node.id);
  const preservedArtifacts=ARTIFACT_DEPENDENCY_GRAPH.filter(node=>!invalidatedArtifacts.includes(node.id)).map(node=>node.id);
  const revalidateEvidenceKinds=[...new Set(invalidated.flatMap(node=>node.evidenceKinds))];
  if(!revalidateEvidenceKinds.length)revalidateEvidenceKinds.push('revision-validation-report');
  const requiredPhases=[...new Set(invalidated.map(node=>node.phase).filter((phase):phase is TaskPhase=>Boolean(phase)&&phase!=='technical-architecture'))]
    .sort((a,b)=>PHASE_ORDER.indexOf(a)-PHASE_ORDER.indexOf(b));
  if(!requiredPhases.includes('qa-engineer'))requiredPhases.push('qa-engineer');
  return{changeSignals:[...changeSignals],invalidatedArtifacts,preservedArtifacts,revalidateEvidenceKinds,requiredPhases};
}

export function nextRevisionValidationPhase(requiredPhases:readonly string[],after?:TaskPhase):TaskPhase|'final-approval'{const phases=requiredPhases.filter((phase):phase is TaskPhase=>PHASE_ORDER.includes(phase as TaskPhase));if(!after)return phases[0]||'final-approval';const index=PHASE_ORDER.indexOf(after);return phases.find(phase=>PHASE_ORDER.indexOf(phase)>index)||'final-approval';}
