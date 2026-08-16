export const DECISION_SOURCES = ['active_user','approved_decision','repository_contract','established_pattern','tool_fact'] as const;
export type DecisionSource = typeof DECISION_SOURCES[number];

export interface DecisionEvidence {
  source: DecisionSource;
  value: string;
  ref: string;
}

export interface DecisionResolutionInput {
  id: string;
  material: boolean;
  evidence?: DecisionEvidence[];
}

export type DecisionResolution =
  | { status: 'resolved'; id: string; material: boolean; source: DecisionSource; value: string; evidenceRefs: string[] }
  | { status: 'unresolved'; id: string; material: boolean; reason: string; conflicts: DecisionEvidence[] };

const PRIORITY = new Map<DecisionSource, number>(DECISION_SOURCES.map((source,index)=>[source,index]));

function normalizedEvidence(values: DecisionEvidence[]): DecisionEvidence[] {
  return values.map(item=>({source:item.source,value:String(item.value??'').trim(),ref:String(item.ref??'').trim()}))
    .filter(item=>item.value.length>0&&item.ref.length>0);
}

export function resolveDecision(input: DecisionResolutionInput): DecisionResolution {
  const id=String(input.id??'').trim();
  if(!id)throw new Error('Decision resolution requires an id');
  const evidence=normalizedEvidence(input.evidence??[]);
  if(!evidence.length)return{status:'unresolved',id,material:input.material===true,reason:'No authoritative or deterministic evidence resolves this decision.',conflicts:[]};
  const bestPriority=Math.min(...evidence.map(item=>PRIORITY.get(item.source)??Number.MAX_SAFE_INTEGER));
  const best=evidence.filter(item=>(PRIORITY.get(item.source)??Number.MAX_SAFE_INTEGER)===bestPriority);
  const values=new Set(best.map(item=>item.value));
  if(values.size!==1)return{status:'unresolved',id,material:input.material===true,reason:`Conflicting ${best[0]?.source??'decision'} evidence requires user resolution.`,conflicts:best};
  const value=best[0]!.value;
  return{status:'resolved',id,material:input.material===true,source:best[0]!.source,value,evidenceRefs:best.filter(item=>item.value===value).map(item=>item.ref)};
}

export function unresolvedMaterialDecisions(inputs: DecisionResolutionInput[]): DecisionResolution[] {
  return inputs.map(resolveDecision).filter(result=>result.status==='unresolved'&&result.material);
}

export function assertNoUnresolvedMaterialDecisions(inputs: DecisionResolutionInput[]): void {
  const unresolved=unresolvedMaterialDecisions(inputs);
  if(unresolved.length)throw new Error(`UNRESOLVED_MATERIAL_DECISION: ${unresolved.map(item=>item.id).join(', ')}`);
}
