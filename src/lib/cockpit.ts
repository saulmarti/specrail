import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { contextStatus } from './context.js';
import { listEvidence, matchesAnyExpectedVisualContext } from './evidence.js';
import { taskMetrics } from './metrics.js';
import { repairStatus } from './repairs.js';
import { findTask, getSection, loadTask } from './task.js';
import { listTrace } from './trace.js';
import { taskReadiness } from './readiness.js';
import { latestReplayComparison } from './replay.js';
import { recommendHarness } from './policy.js';
import { acceptanceCoverage } from './acceptance.js';
import { scopeGuardStatus } from './scope-guard.js';
import { listAmendments } from './amendments.js';
import type { EvidenceRecord, TaskDocument } from './types.js';

export type CockpitStage = 'auto' | 'status' | 'spec' | 'final';
type CheckStatus = 'pass' | 'fail' | 'pending' | 'warning';

export interface CockpitCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface CockpitResult {
  schemaVersion: 2;
  taskId: string;
  stage: Exclude<CockpitStage, 'auto'>;
  path: string;
  relativePath: string;
  openUrl: string;
  readiness: { score: number; passed: number; total: number; label: string };
  blockers: string[];
  checks: CockpitCheck[];
  nextAction: string;
  sourceDigest: string;
  generatedAt: string;
  hostPresentation: 'unverified';
  hostPresentationVerified: false;
  openActionRequired: true;
  presentationHint: string;
}

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};
const MAX_EMBEDDED_VISUAL_BYTES = 8 * 1024 * 1024;
const VISUAL_GROUP: Record<string, 'before' | 'proposal' | 'after' | undefined> = {
  'frontend-before': 'before',
  'frontend-mobile-before': 'before',
  'frontend-proposal': 'proposal',
  'frontend-mobile-proposal': 'proposal',
  'frontend-after': 'after',
  'frontend-mobile-after': 'after'
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function stageFor(task: TaskDocument, requested: CockpitStage): Exclude<CockpitStage, 'auto'> {
  if (requested !== 'auto') return requested;
  if (['final-customer', 'final-approval', 'delivery', 'done'].includes(task.meta.phase) || ['awaiting_final_approval', 'awaiting_delivery', 'done'].includes(task.meta.status)) return 'final';
  if (task.meta.phase === 'spec-approval' || task.meta.status === 'awaiting_spec_approval') return 'spec';
  return 'status';
}
function check(id: string, label: string, status: CheckStatus, detail: string): CockpitCheck { return { id, label, status, detail }; }
function statusClass(status: CheckStatus): string { return `status-${status}`; }
function evidenceAbsolute(root: string, id: string, item: EvidenceRecord): string { return path.resolve(root, '.ai', 'evidence', id, item.path); }
function dataUri(file: string): { uri: string | null; error: string | null } {
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()];
  if (!existsSync(file)) return { uri: null, error: 'Canonical evidence file is missing.' };
  if (!mime) return { uri: null, error: `Unsupported visual format: ${path.extname(file) || 'unknown'}.` };
  const size = statSync(file).size;
  if (size > MAX_EMBEDDED_VISUAL_BYTES) return { uri: null, error: `Visual evidence is too large to embed safely (${Math.ceil(size / 1024 / 1024)} MB).` };
  return { uri: `data:${mime};base64,${readFileSync(file).toString('base64')}`, error: null };
}
function visualDisplayLabel(item: EvidenceRecord, group: 'before' | 'proposal' | 'after'): string {
  const role = group === 'before' ? 'Before' : group === 'proposal' ? 'Proposal' : 'After';
  const context = [item.route, item.target, item.viewport, item.captureScope].filter(Boolean).join(' · ');
  const custom = item.label && item.label !== item.kind ? ` · ${item.label}` : '';
  return `${role}${custom}${context ? ` · ${context}` : ''}`;
}
function section(task: TaskDocument, heading: string): string { return getSection(task.body, heading).trim(); }
function fmt(value:number|null|undefined):string{return value===null||value===undefined?'—':new Intl.NumberFormat('en-US').format(value);}
function summaryText(value: string, max = 500): string {
  const clean = value.replace(/<!--[^]*?-->/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
function phaseLabel(phase: string): string {
  return ({
    'product-specifier': 'Product specification', 'ux-ui-designer': 'UX/UI design', 'technical-architecture': 'Architecture',
    'spec-approval': 'Specification approval', builder: 'Implementation', 'technical-reviewer': 'Technical review',
    'qa-engineer': 'QA', 'final-customer': 'Final customer', 'final-approval': 'Final approval', delivery: 'Delivery', done: 'Done'
  } as Record<string, string>)[phase] ?? phase.replace(/-/g, ' ');
}
function decisions(task: TaskDocument): Array<{ label: string; detail: string }> {
  if (task.meta.phase === 'spec-approval') return [
    { label: 'Approve specification', detail: 'Start the approved execution route.' },
    { label: 'Request refinement', detail: 'Return to Product Specifier with concrete feedback.' },
    { label: 'Reject task', detail: 'Close without implementation.' }
  ];
  if (task.meta.phase === 'final-approval') return [
    { label: 'Approve result', detail: 'Accept the result and continue to delivery.' },
    { label: 'Request changes', detail: 'Return to the appropriate implementation or review phase.' },
    { label: 'Keep open', detail: 'Leave the task pending without approving it.' }
  ];
  if (task.meta.phase === 'delivery') return [
    { label: 'Merge locally', detail: 'Merge the task branch and clean the worktree.' },
    { label: 'Confirm external delivery', detail: 'Confirm an external merge or handoff.' },
    { label: 'Keep worktree', detail: 'Preserve the branch without closing the task.' }
  ];
  if (task.meta.status === 'blocked') return [
    { label: 'Retry phase', detail: 'Resume from the interrupted phase.' },
    { label: 'Return to specification', detail: 'Refine scope or decisions.' },
    { label: 'Reject task', detail: 'Close without implementation.' }
  ];
  return [];
}
function visualEvidence(root: string, task: TaskDocument, items: EvidenceRecord[]) {
  const canonical=new Map<string,EvidenceRecord>();
  for(const item of items){
    const group=VISUAL_GROUP[item.kind];
    if(!group) continue;
    if(!matchesAnyExpectedVisualContext(task,item)) continue;
    const key=`${group}|${item.viewport||'unspecified'}|${item.route||''}|${item.target||''}|${item.captureScope||''}`;
    canonical.set(key,item);
  }
  return [...canonical.values()].map(item => {
    const group = VISUAL_GROUP[item.kind]!;
    const absolute = evidenceAbsolute(root, task.meta.id, item);
    const embedded = dataUri(absolute);
    return { group, id: item.id, label: visualDisplayLabel(item, group), viewport: item.viewport || 'unspecified', target: item.target || '', route: item.route || '', captureScope: item.captureScope || '', runtimeUrl: item.runtimeUrl || '', uri: embedded.uri, renderError: embedded.error, sha256: item.sha256 };
  });
}
function renderHtml(input: {
  task: TaskDocument;
  stage: Exclude<CockpitStage, 'auto'>;
  checks: CockpitCheck[];
  blockers: string[];
  readiness: CockpitResult['readiness'];
  metrics: ReturnType<typeof taskMetrics>;
  repairs: ReturnType<typeof repairStatus>;
  context: ReturnType<typeof contextStatus>;
  trace: ReturnType<typeof listTrace>;
  evidence: EvidenceRecord[];
  visuals: ReturnType<typeof visualEvidence>;
  nextAction: string;
  sourceDigest: string;
  replayComparison: ReturnType<typeof latestReplayComparison>;
  harnessRecommendation: ReturnType<typeof recommendHarness>;
  acceptance: ReturnType<typeof acceptanceCoverage>;
  scopeGuard: ReturnType<typeof scopeGuardStatus>;
  amendments: ReturnType<typeof listAmendments>;
}): string {
  const { task, stage, checks, blockers, readiness: ready, metrics, repairs, context, trace, evidence, visuals, nextAction: action, sourceDigest, replayComparison, harnessRecommendation, acceptance, scopeGuard, amendments } = input;
  const overview = {
    need: summaryText(section(task, 'Need')) || 'Not documented yet.',
    scope: summaryText(section(task, 'Scope')) || 'Not documented yet.',
    outOfScope: summaryText(section(task, 'Out of Scope')) || 'Not documented yet.',
    qaMission: summaryText(section(task, 'QA Mission')) || 'Not documented yet.'
  };
  const isFrontend = task.meta.route.design || task.meta.surfaces.some(item => ['frontend','ui','ux'].includes(item.toLowerCase()));
  const requiredRoles = isFrontend ? (stage === 'final' ? ['before','proposal','after'] : stage === 'spec' ? ['before','proposal'] : []) : [];
  const data = JSON.stringify({ visuals, comparator: { schemaVersion: 2, requiredRoles, modes: ['side-by-side','slider','overlay'], defaultMode: 'side-by-side', stage } }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const decisionItems = decisions(task);
  const traceRows = trace.slice(-16).reverse();
  const generated = new Date().toISOString();
  const coverageRows=acceptance.criteria;
  const coverageHtml=`<h2 class="section-title">Acceptance coverage</h2><p><strong>${acceptance.coverage}%</strong> · ${coverageRows.filter(row=>row.proven).length}/${coverageRows.length} required criteria proven by canonical evidence.</p>${coverageRows.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Criterion</th><th align="left">Evidence</th><th align="right">Status</th></tr></thead><tbody>${coverageRows.map(row=>`<tr><td><span class="mono">${escapeHtml(row.id)}</span> · ${escapeHtml(row.text)}</td><td>${row.evidence.length?row.evidence.map(item=>`${escapeHtml(item.label)} <span class="mono">${escapeHtml(item.kind)}</span>`).join('<br>'):'—'}</td><td align="right">${row.proven?'PASS':'MISSING'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No acceptance criteria are defined yet.</div>'}${acceptance.invalidReferences.length?`<div class="callout danger"><strong>Invalid evidence references</strong><div>${escapeHtml(acceptance.invalidReferences.join(', '))}</div></div>`:''}`;
  const amendmentHtml=amendments.length?amendments.map(item=>`<li><strong>${escapeHtml(item.id)} · ${escapeHtml(item.title)}</strong><div>${escapeHtml(item.status)} · ${escapeHtml(item.reason)}</div>${item.acceptanceCriteria.length?`<div class="mono">Adds ${item.acceptanceCriteria.map(x=>x.id).join(', ')}</div>`:''}</li>`).join(''):'<li>No specification amendments.</li>';
  const scopeHtml=`<h2 class="section-title">Scope Guard / blast radius</h2><div class="check ${scopeGuard.valid?'status-pass':'status-fail'}"><span class="dot"></span><div><strong>${scopeGuard.applicable?(scopeGuard.valid?'Inside approved blast radius':'Scope drift detected'):'Not applicable'}</strong><span>${escapeHtml(scopeGuard.detail)}</span></div></div>${scopeGuard.applicable?`<dl class="facts"><div class="fact"><dt>Allowed</dt><dd>${escapeHtml(scopeGuard.allowedFiles.join(', ')||'none')}</dd></div><div class="fact"><dt>Actual changes</dt><dd>${escapeHtml(scopeGuard.actualFiles.join(', ')||'none')}</dd></div><div class="fact"><dt>Unexpected</dt><dd>${escapeHtml(scopeGuard.unexpectedFiles.join(', ')||'none')}</dd></div><div class="fact"><dt>Protected changes</dt><dd>${escapeHtml(scopeGuard.protectedChanges.join(', ')||'none')}</dd></div></dl>`:''}<h3>Specification amendments</h3><ul class="evidence-list">${amendmentHtml}</ul>`;
  const experimentRows=replayComparison?.rows??[];
  const experimentHtml=experimentRows.length?`<h2 class="section-title">Harness experiments</h2><p>Latest replay: <span class="mono">${escapeHtml(replayComparison!.replayId)}</span>. Token values are shown only when reported by the host/API; cached input is a subset of input and is not double-counted.</p><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Harness</th><th align="right">Accepted</th><th align="right">Repairs</th><th align="right">Tokens</th><th align="right">Cached</th><th align="right">Elapsed</th></tr></thead><tbody>${experimentRows.map(row=>`<tr><td>${escapeHtml(row.variant)}</td><td align="right">${row.accepted?'yes':'no'}</td><td align="right">${fmt(row.repairAttempts)}</td><td align="right">${fmt(row.totalTokens)}</td><td align="right">${fmt(row.cachedInputTokens)}</td><td align="right">${row.elapsedSeconds===null?'—':`${fmt(row.elapsedSeconds)}s`}</td></tr>`).join('')}</tbody></table></div><p class="mono">Token source: ${escapeHtml([...new Set(experimentRows.map(row=>row.tokenUsageSource).filter(Boolean))].join(', ')||'unavailable')}</p><div class="callout"><strong>Adaptive policy</strong><div>${escapeHtml(harnessRecommendation.status==='recommendation'?`${harnessRecommendation.recommendedProfile}: ${harnessRecommendation.reason}`:harnessRecommendation.reason)}</div></div>`:`<h2 class="section-title">Harness experiments</h2><div class="empty">No comparable replay has been recorded for this task yet.</div><div class="callout"><strong>Adaptive policy</strong><div>${escapeHtml(harnessRecommendation.reason)}</div></div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(task.meta.id)} · SpecRail Review Cockpit</title>
<style>
:root{color-scheme:light dark;--bg:#f5f6f3;--panel:#fff;--text:#17191c;--muted:#687078;--border:#d9ddd8;--accent:#167a52;--accent-soft:#e5f6ee;--danger:#b42318;--danger-soft:#feeceb;--warn:#8a5a00;--warn-soft:#fff4d6;--pending:#4b5563;--shadow:0 10px 35px rgba(23,25,28,.07)}
@media(prefers-color-scheme:dark){:root{--bg:#111315;--panel:#191c1f;--text:#f5f7f5;--muted:#a9b0b7;--border:#343a40;--accent:#56d59a;--accent-soft:#173b2c;--danger:#ff8a80;--danger-soft:#40211f;--warn:#ffd166;--warn-soft:#3d3219;--pending:#bdc5ce;--shadow:none}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{max-width:1120px;margin:auto;padding:20px}.top{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.eyebrow{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.title{margin:4px 0;font-size:clamp(24px,4vw,38px);line-height:1.1}.subtitle{margin:0;color:var(--muted);max-width:760px}.badge{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;padding:7px 11px;background:var(--panel);font-weight:650}.grid{display:grid;gap:14px}.metrics{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:20px}.metric,.panel{background:var(--panel);border:1px solid var(--border);border-radius:18px}.metric{padding:15px}.metric small{color:var(--muted);display:block}.metric strong{display:block;margin-top:5px;font-size:24px}.layout{grid-template-columns:minmax(0,1.65fr) minmax(280px,.8fr);margin-top:14px}.panel{padding:18px}.tabs,.controls{display:flex;gap:8px;flex-wrap:wrap}.tab,.choice,select{appearance:none;border:1px solid var(--border);border-radius:12px;background:var(--panel);color:var(--text);padding:9px 12px;font:inherit}.tab[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#fff}.view{display:none;margin-top:16px}.view.active{display:block}.section-title{margin:0 0 12px;font-size:18px}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fact{border-top:1px solid var(--border);padding-top:10px}.fact dt{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.fact dd{margin:5px 0 0}.callout{border-radius:14px;padding:13px 14px;background:var(--accent-soft);margin-top:14px}.danger{background:var(--danger-soft)}.warning{background:var(--warn-soft)}.comparator-shell{margin-top:10px}.comparator-controls{align-items:center}.control-group{display:flex;gap:8px;flex-wrap:wrap}.comparator-mode[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#fff}.visual-context-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.context-chip{border:1px solid var(--border);border-radius:999px;padding:5px 9px;color:var(--muted);font-size:12px;background:var(--panel)}.visual-frame{margin-top:14px;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--bg);min-height:260px;display:grid;place-items:center;padding:12px}.visual-gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:100%;align-items:start}.visual-item{margin:0;min-width:0}.visual-card{border:1px solid var(--border);border-radius:14px;padding:10px;background:var(--panel)}.visual-card.missing{border-color:var(--danger);background:var(--danger-soft)}.visual-role{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.visual-item img{display:block;width:100%;max-height:650px;object-fit:contain;border-radius:10px;background:var(--panel)}.visual-item figcaption{margin-top:7px;color:var(--muted);font-size:12px}.visual-meta{font-size:13px;color:var(--muted);margin-top:10px}.compare-stage{position:relative;width:100%;min-height:420px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:var(--panel)}.compare-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.compare-stage .layer-top{clip-path:inset(0 50% 0 0)}.compare-stage.overlay .layer-top{clip-path:none;opacity:.5}.compare-range{width:min(620px,100%);margin-top:12px}.compare-labels{display:flex;justify-content:space-between;width:100%;font-size:12px;color:var(--muted);margin-top:8px}.missing-banner{width:100%;border:1px solid var(--danger);background:var(--danger-soft);border-radius:12px;padding:12px;color:var(--text)}@media(max-width:760px){.visual-gallery{grid-template-columns:1fr}.compare-stage{min-height:300px}.layout{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}.check{display:grid;grid-template-columns:12px minmax(0,1fr);gap:10px;padding:11px 0;border-bottom:1px solid var(--border)}.check:last-child{border-bottom:0}.dot{width:10px;height:10px;border-radius:50%;margin-top:6px;background:var(--pending)}.status-pass .dot{background:var(--accent)}.status-fail .dot{background:var(--danger)}.status-warning .dot{background:var(--warn)}.check strong{display:block}.check span{color:var(--muted);font-size:13px}.choice{width:100%;text-align:left;margin-top:8px}.choice strong,.choice span{display:block}.choice span{color:var(--muted);font-size:13px;margin-top:2px}.evidence-list,.trace-list{list-style:none;margin:0;padding:0}.evidence-list li,.trace-list li{padding:10px 0;border-bottom:1px solid var(--border)}.evidence-list li:last-child,.trace-list li:last-child{border:0}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow-wrap:anywhere}.footer{color:var(--muted);font-size:12px;margin-top:18px}.empty{color:var(--muted);padding:40px;text-align:center}.progress{height:10px;background:var(--border);border-radius:999px;overflow:hidden;margin-top:10px}.progress>span{display:block;height:100%;background:var(--accent)}
@media(max-width:780px){.shell{padding:14px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.layout{grid-template-columns:1fr}.facts{grid-template-columns:1fr}.panel{padding:15px}.title{font-size:27px}}
</style>
</head>
<body>
<main class="shell">
<header class="top">
<div><div class="eyebrow">${escapeHtml(task.meta.id)} · ${escapeHtml(stage)} review</div><h1 class="title">${escapeHtml(task.meta.title)}</h1><p class="subtitle">${escapeHtml(overview.need)}</p></div>
<span class="badge">${escapeHtml(ready.label)} · ${ready.score}%</span>
</header>
<section class="grid metrics" aria-label="Delivery summary">
<div class="metric"><small>Readiness</small><strong>${ready.passed}/${ready.total}</strong><div class="progress"><span style="width:${ready.score}%"></span></div></div>
<div class="metric"><small>Current phase</small><strong style="font-size:18px">${escapeHtml(phaseLabel(task.meta.phase))}</strong></div>
<div class="metric"><small>Trace</small><strong>${metrics.traceIntegrity.valid ? 'PASS' : 'FAIL'}</strong><small>${metrics.events} events · ${metrics.branches} branches</small></div>
<div class="metric"><small>Repairs</small><strong>${metrics.repairAttempts}/${repairs.limit}</strong><small>${repairs.exhausted ? 'Budget exhausted' : 'Within budget'}</small></div>
</section>
<div class="grid layout">
<section class="panel">
<nav class="tabs" aria-label="Cockpit views">
<button class="tab" data-view="overview" aria-selected="true">Overview</button>
<button class="tab" data-view="acceptance" aria-selected="false">Acceptance</button>
<button class="tab" data-view="evidence" aria-selected="false">Evidence</button>
<button class="tab" data-view="checks" aria-selected="false">Checks</button>
<button class="tab" data-view="trace" aria-selected="false">Trace</button>
<button class="tab" data-view="experiments" aria-selected="false">Experiments</button>
</nav>
<div id="overview" class="view active">
<h2 class="section-title">Approved outcome and scope</h2>
<dl class="facts"><div class="fact"><dt>Scope</dt><dd>${escapeHtml(overview.scope)}</dd></div><div class="fact"><dt>Out of scope</dt><dd>${escapeHtml(overview.outOfScope)}</dd></div><div class="fact"><dt>QA mission</dt><dd>${escapeHtml(overview.qaMission)}</dd></div><div class="fact"><dt>Context budget</dt><dd>${context.files.length}/${context.policy.maxFiles} files · ${context.expansionCount}/${context.policy.maxAutomaticExpansions} expansions</dd></div></dl>
<div class="callout${blockers.length ? ' danger' : ''}"><strong>${blockers.length ? 'Why blocked / not ready' : 'Next safe action'}</strong><div>${escapeHtml(blockers[0] || action)}</div></div>
${blockers.length > 1 ? `<ul>${blockers.slice(1).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
</div>
<div id="acceptance" class="view">${coverageHtml}${scopeHtml}</div>
<div id="evidence" class="view">
<h2 class="section-title">Before / proposal / after</h2>
<div class="comparator-shell" data-specrail-comparator="v2">
<div class="controls comparator-controls"><div class="control-group" role="group" aria-label="Comparison mode"><button class="tab comparator-mode" data-mode="side-by-side" aria-selected="true">Side by side</button><button class="tab comparator-mode" data-mode="slider" aria-selected="false">Slider</button><button class="tab comparator-mode" data-mode="overlay" aria-selected="false">Overlay</button></div><select id="viewport" data-specrail-control="viewport" aria-label="Viewport filter"><option value="all">All viewports</option></select><select id="visual-context" data-specrail-control="route-target" aria-label="Route and target filter"><option value="all">All targets</option></select><select id="capture-scope" data-specrail-control="capture-scope" aria-label="Capture scope filter"><option value="all">All capture scopes</option></select></div>
<div id="visual-context-meta" class="visual-context-meta" data-specrail-context="route-target"></div>
<div id="visual-frame" class="visual-frame"><div class="empty">No visual evidence for this comparison.</div></div><div id="visual-meta" class="visual-meta"></div>
</div>
<h3>All registered evidence</h3><ul class="evidence-list">${evidence.length ? evidence.map(item => { const group=VISUAL_GROUP[item.kind]; const label=group?visualDisplayLabel(item,group):item.label; return `<li><strong>${escapeHtml(label)}</strong><div class="mono">${escapeHtml(item.kind)} · ${escapeHtml(item.source)}${item.runtimeUrl ? ` · ${escapeHtml(item.runtimeUrl)}` : ''}</div></li>`; }).join('') : '<li>No evidence registered yet.</li>'}</ul>
</div>
<div id="checks" class="view"><h2 class="section-title">Deterministic delivery checks</h2>${checks.map(item => `<div class="check ${statusClass(item.status)}"><span class="dot"></span><div><strong>${escapeHtml(item.label)} · ${item.status.toUpperCase()}</strong><span>${escapeHtml(item.detail)}</span></div></div>`).join('')}</div>
<div id="trace" class="view"><h2 class="section-title">Recent signed trace events</h2><ul class="trace-list">${traceRows.length ? traceRows.map(item => `<li><strong>${escapeHtml(item.event)}</strong> · ${escapeHtml(phaseLabel(item.phase))}<div class="mono">${escapeHtml(item.at)} · ${escapeHtml(item.branchId)} · ${escapeHtml(item.eventHash.slice(0, 16))}…</div></li>`).join('') : '<li>No trace event recorded yet.</li>'}</ul></div>
<div id="experiments" class="view">${experimentHtml}</div>
</section>
<aside class="panel">
<h2 class="section-title">Decision and delivery</h2><p>${escapeHtml(action)}</p>
${decisionItems.length ? decisionItems.map(item => `<button type="button" class="choice" data-choice="${escapeHtml(item.label)}"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></button>`).join('') : '<div class="callout">No user decision is required at the current phase.</div>'}
<div id="decision-note" class="callout" aria-live="polite">This Cockpit is read-only. Make the decision through the native Codex prompt so SpecRail can update the task deterministically.</div>
<h3>Delivery metrics</h3><ul class="evidence-list"><li>Elapsed: <strong>${metrics.elapsedSeconds}s</strong></li><li>Context expansions: <strong>${metrics.contextExpansions}</strong></li><li>User rejections: <strong>${metrics.userRejections}</strong></li><li>QA returns: <strong>${metrics.qaReturns}</strong></li><li>Delivery: <strong>${escapeHtml(String(metrics.deliveryStatus))}</strong></li></ul>
</aside>
</div>
<p class="footer">Generated ${escapeHtml(generated)} · Source digest <span class="mono">${escapeHtml(sourceDigest)}</span> · SpecRail Cockpit never replaces Markdown, evidence or native approval gates.</p>
</main>
<script>const cockpit=${data};const roles=['before','proposal','after'];let comparatorMode=cockpit.comparator.defaultMode;const frame=document.getElementById('visual-frame');const meta=document.getElementById('visual-meta');const contextMeta=document.getElementById('visual-context-meta');const viewport=document.getElementById('viewport');const contextSelect=document.getElementById('visual-context');const captureSelect=document.getElementById('capture-scope');const contextKey=item=>(item.route||'')+'|'+(item.target||'');const exactKey=item=>contextKey(item)+'|'+item.viewport+'|'+(item.captureScope||'');const humanRole=role=>role==='before'?'Before':role==='proposal'?'Proposal':'After';const viewportValues=[...new Set(cockpit.visuals.map(item=>item.viewport))].sort();for(const value of viewportValues){const option=document.createElement('option');option.value=value;option.textContent=value;viewport.appendChild(option)}const contexts=[...new Map(cockpit.visuals.map(item=>[contextKey(item),{key:contextKey(item),route:item.route||'—',target:item.target||'—'}])).values()];for(const item of contexts){const option=document.createElement('option');option.value=item.key;option.textContent=(item.route||'—')+' · '+(item.target||'—');contextSelect.appendChild(option)}const captureValues=[...new Set(cockpit.visuals.map(item=>item.captureScope||'unspecified'))].sort();for(const value of captureValues){const option=document.createElement('option');option.value=value;option.textContent=value;captureSelect.appendChild(option)}function selectedVisuals(){return cockpit.visuals.filter(item=>(viewport.value==='all'||item.viewport===viewport.value)&&(contextSelect.value==='all'||contextKey(item)===contextSelect.value)&&(captureSelect.value==='all'||(item.captureScope||'unspecified')===captureSelect.value))}function grouped(items){const groups=new Map();for(const item of items){const key=exactKey(item);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}return [...groups.entries()].map(([key,value])=>({key,items:value,route:value[0]?.route||'—',target:value[0]?.target||'—',viewport:value[0]?.viewport||'unspecified',captureScope:value[0]?.captureScope||'unspecified'}))}function latestByRole(items){const map=new Map();for(const item of items)map.set(item.group,item);return map}function missingCard(role){const card=document.createElement('div');card.className='visual-card missing';card.dataset.specrailMissingRole=role;card.innerHTML='<div class="visual-role"><span>'+humanRole(role)+'</span><span>MISSING</span></div><div>Required canonical '+humanRole(role)+' evidence is not available for this exact route, target, viewport and capture scope. Do not treat this comparison as complete.</div>';return card}function imageFigure(item){const figure=document.createElement('figure');figure.className='visual-item visual-card';figure.dataset.specrailEvidenceId=item.id;const head=document.createElement('div');head.className='visual-role';head.innerHTML='<span>'+humanRole(item.group)+'</span><span>'+item.viewport+'</span>';figure.appendChild(head);if(!item.uri){const empty=document.createElement('div');empty.className='missing-banner';empty.textContent=item.renderError||'Visual evidence could not be embedded.';figure.appendChild(empty)}else{const image=document.createElement('img');image.src=item.uri;image.alt=item.label;image.dataset.specrailEvidenceId=item.id;image.dataset.specrailComparatorSource='v2';image.dataset.specrailReviewRole=item.group;image.dataset.specrailRoute=item.route||'';image.dataset.specrailTarget=item.target||'';image.dataset.specrailViewport=item.viewport||'';image.dataset.specrailCaptureScope=item.captureScope||'';figure.appendChild(image)}const caption=document.createElement('figcaption');caption.textContent=item.label+(item.target?' · '+item.target:'');figure.appendChild(caption);return figure}function contextHeading(group){const wrap=document.createElement('div');wrap.className='visual-context-meta';for(const [label,value] of [['Route',group.route],['Target',group.target],['Viewport',group.viewport],['Capture',group.captureScope]]){const chip=document.createElement('span');chip.className='context-chip';chip.textContent=label+': '+value;wrap.appendChild(chip)}return wrap}function choosePair(map){const candidates=[['proposal','after'],['before','proposal'],['before','after']];for(const pair of candidates)if(map.has(pair[0])&&map.has(pair[1]))return pair;return null}function renderPair(group,mode){const map=latestByRole(group.items),pair=choosePair(map);frame.appendChild(contextHeading(group));if(!pair){const missing=document.createElement('div');missing.className='missing-banner';missing.textContent='A two-image canonical pair is required for '+mode+' comparison in this exact route/target/viewport/capture scope. Use Side by side to inspect missing roles.';frame.appendChild(missing);return}const a=map.get(pair[0]),b=map.get(pair[1]);if(!a.uri||!b.uri){const missing=document.createElement('div');missing.className='missing-banner';missing.textContent='The selected comparison pair contains evidence that could not be embedded.';frame.appendChild(missing);return}const wrap=document.createElement('div');wrap.style.width='100%';const stage=document.createElement('div');stage.className='compare-stage'+(mode==='overlay'?' overlay':'');stage.dataset.specrailPair=pair.join('-');const bottom=document.createElement('img');bottom.src=a.uri;bottom.alt=a.label;bottom.dataset.specrailEvidenceId=a.id;bottom.dataset.specrailComparatorSource='v2';bottom.dataset.specrailReviewRole=a.group;bottom.dataset.specrailRoute=a.route||'';bottom.dataset.specrailTarget=a.target||'';bottom.dataset.specrailViewport=a.viewport||'';bottom.dataset.specrailCaptureScope=a.captureScope||'';const top=document.createElement('img');top.src=b.uri;top.alt=b.label;top.className='layer-top';top.dataset.specrailEvidenceId=b.id;top.dataset.specrailComparatorSource='v2';top.dataset.specrailReviewRole=b.group;top.dataset.specrailRoute=b.route||'';top.dataset.specrailTarget=b.target||'';top.dataset.specrailViewport=b.viewport||'';top.dataset.specrailCaptureScope=b.captureScope||'';stage.append(bottom,top);const range=document.createElement('input');range.type='range';range.min='0';range.max='100';range.value='50';range.className='compare-range';range.setAttribute('aria-label',mode==='overlay'?'Overlay opacity':'Comparison split');range.dataset.specrailControl=mode==='overlay'?'opacity':'split';range.addEventListener('input',()=>{if(mode==='overlay')top.style.opacity=String(Number(range.value)/100);else top.style.clipPath='inset(0 '+(100-Number(range.value))+'% 0 0)'});const labels=document.createElement('div');labels.className='compare-labels';labels.innerHTML='<span>'+humanRole(pair[0])+'</span><span>'+humanRole(pair[1])+'</span>';wrap.append(stage,range,labels);frame.appendChild(wrap)}function renderSideBySide(groups){for(const group of groups){const section=document.createElement('section');section.style.width='100%';section.appendChild(contextHeading(group));const gallery=document.createElement('div');gallery.className='visual-gallery';const map=latestByRole(group.items);for(const role of roles){const item=map.get(role);if(item)gallery.appendChild(imageFigure(item));else if(cockpit.comparator.requiredRoles.includes(role))gallery.appendChild(missingCard(role))}section.appendChild(gallery);frame.appendChild(section)}}function renderVisual(){const items=selectedVisuals(),groups=grouped(items);frame.replaceChildren();if(!items.length){const empty=document.createElement('div');empty.className='missing-banner';empty.textContent='No canonical visual evidence matches this viewport/route/target/capture selection.';frame.appendChild(empty)}else if(comparatorMode==='side-by-side')renderSideBySide(groups);else if(groups.length!==1){const warning=document.createElement('div');warning.className='missing-banner';warning.textContent='Slider and Overlay require one exact route, target, viewport and capture scope. Select viewport, route/target and capture scope before comparing; SpecRail will not mix captures from different contexts.';frame.appendChild(warning)}else renderPair(groups[0],comparatorMode);contextMeta.replaceChildren();const selectedContext=contextSelect.value==='all'?null:contexts.find(item=>item.key===contextSelect.value);for(const [label,value] of [['Route',selectedContext?.route||'all'],['Target',selectedContext?.target||'all'],['Viewport',viewport.value],['Capture',captureSelect.value],['Mode',comparatorMode]]){const chip=document.createElement('span');chip.className='context-chip';chip.textContent=label+': '+value;contextMeta.appendChild(chip)}const urls=[...new Set(items.map(item=>item.runtimeUrl).filter(Boolean))];meta.textContent=urls.length?'Runtime: '+urls.join(' · '):'';document.querySelectorAll('.comparator-mode').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.mode===comparatorMode)))}document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id===button.dataset.view))}));document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{comparatorMode=button.dataset.mode;renderVisual()}));viewport.addEventListener('change',renderVisual);contextSelect.addEventListener('change',renderVisual);captureSelect.addEventListener('change',renderVisual);document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{document.getElementById('decision-note').textContent='Selected for review: “'+button.dataset.choice+'”. Confirm it in the native Codex decision prompt; this HTML remains read-only.'}));renderVisual();</script>
</body>
</html>`;
}

export function writeReviewCockpit(root: string, id: string, requestedStage: CockpitStage = 'auto'): CockpitResult {
  const projectRoot = path.resolve(root);
  const task = loadTask(findTask(projectRoot, id));
  const stage = stageFor(task, requestedStage);
  const evidence = listEvidence(projectRoot, task.meta.id);
  const trace = listTrace(projectRoot, task.meta.id);
  const metrics = taskMetrics(projectRoot, task.meta.id);
  const repairs = repairStatus(projectRoot, task.meta.id);
  const context = contextStatus(projectRoot, task.meta.id);
  const readiness = taskReadiness(projectRoot, task.meta.id);
  const replayComparison = latestReplayComparison(projectRoot, task.meta.id);
  const harnessRecommendation = recommendHarness(projectRoot, task.meta.id);
  const acceptance = acceptanceCoverage(projectRoot, task.meta.id);
  const scopeGuard = scopeGuardStatus(projectRoot, task.meta.id);
  const amendments = listAmendments(projectRoot, task.meta.id);
  const checks: CockpitCheck[] = readiness.gates
    .filter(item => item.status !== 'not-applicable')
    .map(item => ({ id: item.id, label: item.label, status: item.status === 'stale' ? 'fail' : item.status, detail: item.detail } as CockpitCheck));
  const blockers = readiness.blockers.map(item => item.detail);
  const ready: CockpitResult['readiness'] = { score: readiness.score.value, passed: readiness.score.passed, total: readiness.score.applicable, label: readiness.blockers.length ? 'Blocked by failed checks' : readiness.score.passed === readiness.score.applicable ? 'Ready' : 'Progressing' };
  const action = readiness.next.action;
  const visuals = visualEvidence(projectRoot, task, evidence);
  const sourceDigest = digest({ task: task.meta, body: task.body, evidence: evidence.map(item => ({ id: item.id, sha256: item.sha256 })), trace: trace.map(item => item.eventHash), checks, acceptance:{coverage:acceptance.coverage,uncovered:acceptance.uncovered}, scope:{effectiveDigest:scopeGuard.effectiveDigest,actualFiles:scopeGuard.actualFiles}, amendments:amendments.map(item=>({id:item.id,status:item.status,digest:item.digest})), metrics: { events: metrics.events, branches: metrics.branches, repairAttempts: metrics.repairAttempts }, replay: replayComparison?.rows.map(row=>({variant:row.variant,totalTokens:row.totalTokens,repairs:row.repairAttempts}))??[] });
  const target = path.join(projectRoot, '.ai', 'reviews', `${task.meta.id}-${stage}-cockpit.html`);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, renderHtml({ task, stage, checks, blockers, readiness: ready, metrics, repairs, context, trace, evidence, visuals, nextAction: action, sourceDigest, replayComparison, harnessRecommendation, acceptance, scopeGuard, amendments }));
  return {
    schemaVersion: 2,
    taskId: task.meta.id,
    stage,
    path: target,
    relativePath: path.relative(projectRoot, target).split(path.sep).join('/'),
    openUrl: pathToFileURL(target).href,
    readiness: ready,
    blockers,
    checks,
    nextAction: action,
    sourceDigest,
    generatedAt: new Date().toISOString(),
    hostPresentation: 'unverified',
    hostPresentationVerified: false,
    openActionRequired: true,
    presentationHint: 'Cockpit HTML was generated locally. This does not confirm that the current host opened, rendered, attached, or displayed it. Use openUrl as the explicit browser fallback action instead of asking the user to navigate to a filesystem path.'
  };
}
