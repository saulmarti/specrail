export type DecisionCapsuleStage = 'spec' | 'final' | 'blocked';

export interface DecisionCapsule {
  stage: DecisionCapsuleStage;
  title: string;
  outcome: string;
  scopeSummary: string;
  proofSummary: string[];
  riskSummary?: string;
  blocker?: string;
  primaryEvidenceId?: string;
  detailSections: string[];
}

function oneLine(value: unknown, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g,' ').trim();
}

export function createDecisionCapsule(input: DecisionCapsule): DecisionCapsule {
  const proof=[...new Set((input.proofSummary??[]).map(item=>oneLine(item)).filter(Boolean))].slice(0,4);
  return{
    stage:input.stage,
    title:oneLine(input.title,'Decision'),
    outcome:oneLine(input.outcome,'No outcome summary available.'),
    scopeSummary:oneLine(input.scopeSummary,'Scope not summarized.'),
    proofSummary:proof,
    ...(input.riskSummary?{riskSummary:oneLine(input.riskSummary)}:{}),
    ...(input.blocker?{blocker:oneLine(input.blocker)}:{}),
    ...(input.primaryEvidenceId?{primaryEvidenceId:oneLine(input.primaryEvidenceId)}:{}),
    detailSections:[...new Set((input.detailSections??[]).map(item=>oneLine(item)).filter(Boolean))]
  };
}

export function renderDecisionCapsuleMarkdown(input: DecisionCapsule): string {
  const capsule=createDecisionCapsule(input);
  const heading=capsule.stage==='spec'?'READY FOR SPEC APPROVAL':capsule.stage==='final'?'READY FOR FINAL APPROVAL':'BLOCKED';
  const lines=[
    `# ${heading}`,
    '',
    `**Outcome:** ${capsule.outcome}`,
    `**Scope:** ${capsule.scopeSummary}`
  ];
  if(capsule.proofSummary.length)lines.push(`**Proof:** ${capsule.proofSummary.join(' · ')}`);
  if(capsule.riskSummary)lines.push(`**Risk:** ${capsule.riskSummary}`);
  if(capsule.blocker)lines.push(`**Blocker:** ${capsule.blocker}`);
  lines.push('', '_Supporting specification, evidence, files, trace, and logs remain available in Review Details._');
  return lines.join('\n');
}

export function conciseProgress(input:{percent?:number|null;changed?:string;validated?:string;blocker?:string|null;next?:string}):string{
  const lines:string[]=[];
  if(Number.isFinite(input.percent))lines.push(`${Math.max(0,Math.min(100,Math.round(Number(input.percent))))}%`);
  if(input.changed)lines.push(`- Implementado: ${oneLine(input.changed)}`);
  if(input.validated)lines.push(`- Validado: ${oneLine(input.validated)}`);
  lines.push(`- Bloqueo: ${input.blocker?oneLine(input.blocker):'ninguno'}`);
  if(input.next)lines.push(`- Siguiente: ${oneLine(input.next)}`);
  return lines.slice(0,5).join('\n');
}
