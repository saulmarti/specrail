import { readFileSync, writeFileSync } from 'node:fs';
import { writeReviewCockpit, type CockpitResult, type CockpitStage } from './cockpit.js';
import { acceptanceCoverage } from './acceptance.js';
import { scopeGuardStatus } from './scope-guard.js';
import { findTask, getSection, loadTask } from './task.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function summary(value: unknown, fallback: string, max=220): string {
  const clean=String(value??'').replace(/<!--[^]*?-->/g,'').replace(/\s+/g,' ').trim()||fallback;
  return clean.length>max?`${clean.slice(0,max-1)}…`:clean;
}

export function writeCompactReviewCockpit(root:string,id:string,stage:CockpitStage='auto'):CockpitResult{
  const result=writeReviewCockpit(root,id,stage);
  const task=loadTask(findTask(root,id));
  const acceptance=acceptanceCoverage(root,id);
  const scope=scopeGuardStatus(root,id);
  const outcome=summary(getSection(task.body,'Product Value')||getSection(task.body,'Need'),task.meta.title);
  const scopeText=task.meta.file_scope?.length?`${task.meta.file_scope.length} scoped file/glob ${task.meta.file_scope.length===1?'entry':'entries'}`:summary(getSection(task.body,'Scope'),'Scope pending');
  const proof=[`Readiness ${result.readiness.passed}/${result.readiness.total}`,`AC ${acceptance.criteria.filter(item=>item.proven).length}/${acceptance.criteria.length}`,scope.applicable?(scope.valid?'Scope clean':'Scope violation'):'Scope N/A'];
  const risk=summary(task.meta.risk,'unspecified',80);
  const blocker=result.blockers[0]?summary(result.blockers[0],'',180):'';
  let html=readFileSync(result.path,'utf8');
  const open='<div id="overview" class="view active">';
  const close='<div id="acceptance" class="view">';
  const from=html.indexOf(open),to=html.indexOf(close,from+open.length);
  if(from<0||to<0)throw new Error('Compact Cockpit could not locate the canonical Overview surface');
  const compact=`${open}\n<section class="decision-capsule" data-specrail-decision-capsule="v1" aria-label="Decision summary">\n<div class="eyebrow">${result.stage==='final'?'READY FOR FINAL APPROVAL':result.stage==='spec'?'READY FOR SPEC APPROVAL':'CURRENT DECISION'}</div>\n<h2>${escapeHtml(outcome)}</h2>\n<dl class="capsule-facts"><div><dt>Scope</dt><dd>${escapeHtml(scopeText)}</dd></div><div><dt>Proof</dt><dd>${escapeHtml(proof.join(' · '))}</dd></div><div><dt>Risk</dt><dd>${escapeHtml(risk)}</dd></div></dl>\n${blocker?`<div class="callout danger"><strong>Blocker</strong><div>${escapeHtml(blocker)}</div></div>`:`<div class="callout"><strong>Next</strong><div>${escapeHtml(result.nextAction)}</div></div>`}\n</section>\n<details class="review-details"><summary>Review details</summary><dl class="facts"><div class="fact"><dt>Need</dt><dd>${escapeHtml(summary(getSection(task.body,'Need'),'Not documented yet.'))}</dd></div><div class="fact"><dt>Out of scope</dt><dd>${escapeHtml(summary(getSection(task.body,'Out of Scope'),'Not documented yet.'))}</dd></div><div class="fact"><dt>QA mission</dt><dd>${escapeHtml(summary(getSection(task.body,'QA Mission'),'Not documented yet.'))}</dd></div></dl></details>\n</div>\n`;
  html=html.slice(0,from)+compact+html.slice(to);
  html=html.replace('</style>',`.decision-capsule{border:1px solid var(--border);border-radius:16px;padding:18px;background:var(--panel)}.decision-capsule h2{font-size:20px;margin:7px 0 14px}.capsule-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0}.capsule-facts div{border-top:1px solid var(--border);padding-top:10px}.capsule-facts dt{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}.capsule-facts dd{margin:5px 0 0}.review-details{margin-top:14px;border-top:1px solid var(--border);padding-top:12px}.review-details summary{cursor:pointer;font-weight:650}.review-details[open] summary{margin-bottom:12px}@media(max-width:780px){.capsule-facts{grid-template-columns:1fr}.metrics .metric:nth-child(n+3){display:none}}\n</style>`);
  writeFileSync(result.path,html);
  return{...result,presentationHint:'Compact Decision Capsule generated. Supporting specification, evidence, files, trace, experiments, and logs remain available through Review Details/tabs. HTML remains read-only and does not prove host presentation.'};
}
