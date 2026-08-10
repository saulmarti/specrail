import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, serializeDocument } from './frontmatter.js';
import { defaultRoute, type NativeInteraction, type TaskDocument, type TaskInput, type TaskMeta, type TaskStatus, type TaskSummary } from './types.js';
import { applyControlProfile, applyFastModeRoute } from './control-profile.js';

const SECTION_NAMES = ['Need','Product Value','Users','Product Owner Review','Product Owner Final Review','Scope','UI Target','Blast Radius','Out of Scope','Questions','Acceptance Criteria','Gherkin','QA Mission','Quality Strategy','Operational Evidence','Vertical Slices','Constitution Impact','UX/UI Proposal','Architecture and Data Design','Implementation Plan','Decisions','Evidence','QA','Target Audience Review','Final Customer','Handoff','Workflow Log'] as const;
const FOLDER_BY_STATUS: Record<TaskStatus, string> = {
  draft:'inbox', refining:'refining', awaiting_spec_approval:'ready', ready:'ready', active:'active', review:'review', qa:'review', customer_validation:'review', awaiting_final_approval:'review', awaiting_delivery:'review', blocked:'blocked', done:'done', rejected:'done'
};

function slugify(value: string): string {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || 'task';
}
function now(): string { return new Date().toISOString(); }
function taskBody(title: string): string {
  return `# ${title}\n\n${SECTION_NAMES.map(name => {
    if (name === 'Questions') return `## Questions\n\n<!-- AI-FLOW:QUESTIONS-DATA\n[]\nAI-FLOW:QUESTIONS-DATA -->\n\n_No open questions._`;
    if (name === 'Workflow Log') return `## Workflow Log\n\n- ${now()} — Task created.`;
    return `## ${name}\n\n`;
  }).join('\n\n')}\n`;
}
function scan(root: string): string[] {
  const base = path.join(path.resolve(root), '.ai/tasks');
  if (!existsSync(base)) return [];
  const files: string[] = [];
  for (const folder of readdirSync(base, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const dir = path.join(base, folder.name);
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isFile() && item.name.endsWith('.md')) files.push(path.join(dir, item.name));
    }
  }
  return files;
}
const CLOSED_STATUSES = new Set<TaskStatus>(['done','rejected']);
const REFERENCE_STOPWORDS = new Set([
  'a','al','and','aplica','aplicar','con','continue','continua','continuar','de','del','do','el','en','execute','ejecuta','ejecutar','feature','implement','implementa','implementar','la','las','los','me','of','para','por','retoma','retomar','resume','run','sobre','task','tarea','the','trabaja','trabajar','work','with','y'
]);
function normalizeReference(value: unknown): string { return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' '); }
function referenceTokens(value: unknown): string[] { return normalizeReference(value).split(' ').filter(token => token.length > 1 && !REFERENCE_STOPWORDS.has(token)); }
function summary(task: TaskDocument): TaskSummary { return { id:task.meta.id,title:task.meta.title,status:task.meta.status,phase:task.meta.phase,path:task.path }; }
function tokenMatches(query: string, title: string): boolean { if (query === title) return true; const size = Math.min(query.length,title.length,7); return size >= 6 && query.slice(0,size) === title.slice(0,size); }
function candidateScore(task: TaskDocument, reference: string): number {
  const ref=normalizeReference(reference), title=normalizeReference(task.meta.title), id=normalizeReference(task.meta.id);
  if (!ref) return 0; if (ref === id) return 1000; if (ref === title) return 950;
  const tokens=referenceTokens(reference), titleTokens=new Set(referenceTokens(task.meta.title));
  if (!tokens.length) return 0;
  const titleList=[...titleTokens]; const overlap=tokens.filter(token=>titleList.some(candidate=>tokenMatches(token,candidate))).length, ratio=overlap/tokens.length;
  let score=Math.round(ratio*100);
  if (title.includes(ref)||ref.includes(title)) score=Math.max(score,90);
  if (tokens.every(token=>titleList.some(candidate=>tokenMatches(token,candidate)))) score=Math.max(score,85+Math.min(tokens.length,5));
  if (!CLOSED_STATUSES.has(task.meta.status)) score+=8;
  return score;
}
function selectionInteraction(reference: string, tasks: TaskDocument[]): NativeInteraction {
  const options=tasks.slice(0,4).map(task=>({label:`${task.meta.id} — ${task.meta.title}`.slice(0,120),description:`${task.meta.status} · ${task.meta.phase}`}));
  const question=referenceTokens(reference).length?`¿A qué tarea te refieres con «${reference}»?`:'¿Qué tarea quieres continuar?';
  return {tool:'request_user_input',questions:[{id:'task-selection',header:'Tarea',question,options,isOther:true}]};
}

export type TaskResolution =
  | { status:'matched'; reference:string; task:TaskDocument; candidates:TaskSummary[]; interaction:null }
  | { status:'ambiguous'; reference:string; candidates:TaskSummary[]; interaction:NativeInteraction }
  | { status:'not-found'; reference:string; candidates:TaskSummary[]; interaction:null };

function asString(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`Task metadata field ${field} is invalid`); return value; }
function asStringArray(value: unknown): string[] { return Array.isArray(value) ? value.map(String) : []; }
function asTaskMeta(raw: Record<string, unknown>): TaskMeta {
  const routeRaw = (raw.route && typeof raw.route === 'object' && !Array.isArray(raw.route)) ? raw.route as Record<string, unknown> : {};
  const surfaces = asStringArray(raw.surfaces);
  const type = typeof raw.type === 'string' ? raw.type : 'task';
  const defaults = defaultRoute(surfaces, type);
  return {
    ...raw,
    id: asString(raw.id,'id'),
    title: asString(raw.title,'title'),
    type,
    status: asString(raw.status,'status') as TaskStatus,
    phase: asString(raw.phase,'phase') as TaskMeta['phase'],
    size: typeof raw.size === 'string' ? raw.size : 'small',
    risk: typeof raw.risk === 'string' ? raw.risk : 'low',
    execution_profile: typeof raw.execution_profile === 'string' ? raw.execution_profile : 'standard',
    workflow_mode: raw.workflow_mode === 'fast' ? 'fast' : 'standard',
    fast_authorized_at: typeof raw.fast_authorized_at === 'string' ? raw.fast_authorized_at : null,
    surfaces,
    route: { ...defaults, ...routeRaw } as TaskMeta['route'],
    spec_approval: typeof raw.spec_approval === 'string' ? raw.spec_approval : 'pending',
    spec_approval_hash: typeof raw.spec_approval_hash === 'string' ? raw.spec_approval_hash : null,
    spec_effective_hash: typeof raw.spec_effective_hash === 'string' ? raw.spec_effective_hash : null,
    spec_approved_at: typeof raw.spec_approved_at === 'string' ? raw.spec_approved_at : null,
    spec_integrity_version: typeof raw.spec_integrity_version === 'number' ? raw.spec_integrity_version : 1,
    project_governance_hash: typeof raw.project_governance_hash === 'string' ? raw.project_governance_hash : null,
    qa_mission_hash: typeof raw.qa_mission_hash === 'string' ? raw.qa_mission_hash : null,
    scope_guard_hash: typeof raw.scope_guard_hash === 'string' ? raw.scope_guard_hash : null,
    scope_baseline_commit: typeof raw.scope_baseline_commit === 'string' ? raw.scope_baseline_commit : null,
    delivery_strategy: typeof raw.delivery_strategy === 'string' ? raw.delivery_strategy : (raw.size === 'large' && type === 'feature' ? 'vertical-slices' : 'single'),
    slice_ids: asStringArray(raw.slice_ids),
    final_approval: typeof raw.final_approval === 'string' ? raw.final_approval : 'pending',
    final_approved_at: typeof raw.final_approved_at === 'string' ? raw.final_approved_at : null,
    waiting_for: typeof raw.waiting_for === 'string' ? raw.waiting_for : 'none',
    open_questions: typeof raw.open_questions === 'number' ? raw.open_questions : 0,
    learning_recorded: raw.learning_recorded === true,
    dependencies: asStringArray(raw.dependencies),
    parent_id: typeof raw.parent_id === 'string' ? raw.parent_id : null,
    file_scope: asStringArray(raw.file_scope),
    resume_status: typeof raw.resume_status === 'string' ? raw.resume_status as TaskStatus : null,
    resume_phase: typeof raw.resume_phase === 'string' ? raw.resume_phase as TaskMeta['phase'] : null,
    block_reason: typeof raw.block_reason === 'string' ? raw.block_reason : null,
    worktree_path: typeof raw.worktree_path === 'string' ? raw.worktree_path : null,
    worktree_branch: typeof raw.worktree_branch === 'string' ? raw.worktree_branch : null,
    worktree_base: typeof raw.worktree_base === 'string' ? raw.worktree_base : null,
    delivery_status: typeof raw.delivery_status === 'string' ? raw.delivery_status : 'not_required',
    delivered_at: typeof raw.delivered_at === 'string' ? raw.delivered_at : null,
    delivery_action: typeof raw.delivery_action === 'string' ? raw.delivery_action : null,
    completed_design: raw.completed_design === true,
    completed_architecture: raw.completed_architecture === true,
    product_owner_review_digest: typeof raw.product_owner_review_digest === 'string' ? raw.product_owner_review_digest : null,
    product_owner_final_review_digest: typeof raw.product_owner_final_review_digest === 'string' ? raw.product_owner_final_review_digest : null,
    target_audience_review_digest: typeof raw.target_audience_review_digest === 'string' ? raw.target_audience_review_digest : null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : now(),
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : now()
  };
}

export function resolveTaskReference(root: string, reference: string, {includeClosed=true}: {includeClosed?:boolean}={}): TaskResolution {
  const tasks=scan(root).map(loadTask), ref=String(reference||'').trim(), normalized=normalizeReference(ref);
  const exactId=tasks.find(task=>normalizeReference(task.meta.id)===normalized);
  if (exactId) return {status:'matched',reference:ref,task:exactId,candidates:[summary(exactId)],interaction:null};
  const exactTitles=tasks.filter(task=>normalizeReference(task.meta.title)===normalized), openExact=exactTitles.filter(task=>!CLOSED_STATUSES.has(task.meta.status));
  if (openExact.length===1) return {status:'matched',reference:ref,task:openExact[0]!,candidates:[summary(openExact[0]!)],interaction:null};
  if (openExact.length>1) return {status:'ambiguous',reference:ref,candidates:openExact.map(summary),interaction:selectionInteraction(ref,openExact)};
  if (exactTitles.length===1) return {status:'matched',reference:ref,task:exactTitles[0]!,candidates:[summary(exactTitles[0]!)],interaction:null};
  if (exactTitles.length>1) return {status:'ambiguous',reference:ref,candidates:exactTitles.map(summary),interaction:selectionInteraction(ref,exactTitles)};
  let pool=includeClosed?tasks:tasks.filter(task=>!CLOSED_STATUSES.has(task.meta.status));
  const open=pool.filter(task=>!CLOSED_STATUSES.has(task.meta.status)); if (open.length) pool=open;
  const tokens=referenceTokens(ref);
  if (!tokens.length) {
    const recent=[...pool].sort((a,b)=>String(b.meta.updated_at||'').localeCompare(String(a.meta.updated_at||''))||b.meta.id.localeCompare(a.meta.id));
    if (recent.length===1) return {status:'matched',reference:ref,task:recent[0]!,candidates:[summary(recent[0]!)],interaction:null};
    if (recent.length>1) return {status:'ambiguous',reference:ref,candidates:recent.slice(0,4).map(summary),interaction:selectionInteraction(ref,recent)};
    return {status:'not-found',reference:ref,candidates:[],interaction:null};
  }
  const scored=pool.map(task=>({task,score:candidateScore(task,ref)})).filter(item=>item.score>=60).sort((a,b)=>b.score-a.score||String(b.task.meta.updated_at||'').localeCompare(String(a.task.meta.updated_at||''))||a.task.meta.id.localeCompare(b.task.meta.id));
  if (!scored.length) return {status:'not-found',reference:ref,candidates:[],interaction:null};
  const best=scored[0]!.score, candidates=scored.filter(item=>item.score>=best-4).slice(0,4);
  if (candidates.length===1) return {status:'matched',reference:ref,task:candidates[0]!.task,candidates:[summary(candidates[0]!.task)],interaction:null};
  const tasksForSelection=candidates.map(({task})=>task);
  return {status:'ambiguous',reference:ref,candidates:tasksForSelection.map(summary),interaction:selectionInteraction(ref,tasksForSelection)};
}

export function findTask(root: string, reference: string): string {
  const result=resolveTaskReference(root,reference);
  if (result.status==='matched') return result.task.path;
  if (result.status==='ambiguous') throw new Error(`Ambiguous task reference: ${reference}. Candidates: ${result.candidates.map(x=>`${x.id} (${x.title})`).join(', ')}`);
  throw new Error(`Task not found: ${reference}`);
}
export function loadTask(file: string): TaskDocument {
  const parsed = parseDocument(readFileSync(file, 'utf8'));
  return { path: file, meta: asTaskMeta(parsed.meta), body: parsed.body };
}
export function saveTask(task: TaskDocument): TaskDocument {
  task.meta.updated_at = now();
  writeFileSync(task.path, serializeDocument(task.meta as Record<string, unknown>, task.body));
  const folder = FOLDER_BY_STATUS[task.meta.status];
  if (!folder) throw new Error(`Unknown task status: ${task.meta.status}`);
  const marker = `${path.sep}.ai${path.sep}`;
  const markerIndex = task.path.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Task is outside an AI Flow project: ${task.path}`);
  const root = task.path.slice(0, markerIndex);
  const target = path.join(root, '.ai/tasks', folder, path.basename(task.path));
  if (target !== task.path) { renameSync(task.path, target); task.path = target; }
  return task;
}
export function setSection(body: string, heading: string, content: string): string {
  const marker = `## ${heading}`;
  const start = body.indexOf(marker);
  if (start < 0) return `${body.trimEnd()}\n\n${marker}\n\n${String(content).trim()}\n`;
  const contentStart = start + marker.length;
  const next = body.indexOf('\n## ', contentStart);
  const end = next < 0 ? body.length : next;
  return `${body.slice(0, contentStart)}\n\n${String(content).trim()}\n${body.slice(end).replace(/^\n*/, '\n')}`;
}
export function getSection(body: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = body.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + marker.length;
  const next = body.indexOf('\n## ', contentStart);
  return body.slice(contentStart, next < 0 ? body.length : next).trim();
}
export function appendLog(task: TaskDocument, message: string): void {
  const current = getSection(task.body, 'Workflow Log');
  task.body = setSection(task.body, 'Workflow Log', `${current}\n- ${now()} — ${message}`.trim());
}
export function createTask(root: string, input: TaskInput): TaskDocument {
  const projectRoot = path.resolve(root);
  const counterPath = path.join(projectRoot, '.ai/counter.json');
  const counter = JSON.parse(readFileSync(counterPath, 'utf8')) as {nextTask:number};
  const id = `TASK-${String(counter.nextTask).padStart(4,'0')}`;
  counter.nextTask += 1; writeFileSync(counterPath, `${JSON.stringify(counter)}\n`);
  const surfaces = input.surfaces || [];
  const stamp=now();
  const meta: TaskMeta = {
    id, title: input.title, type: input.type || 'task', status: 'draft', phase: 'product-specifier', size: input.size || 'small', risk: input.risk || 'low',
    execution_profile: input.executionProfile || 'standard', workflow_mode: input.workflowMode === 'fast' ? 'fast' : 'standard', fast_authorized_at: input.workflowMode === 'fast' ? stamp : null, surfaces, route: defaultRoute(surfaces, input.type || 'task'),
    spec_approval: 'pending', spec_approval_hash: null, spec_effective_hash: null, spec_approved_at: null, spec_integrity_version: 1, project_governance_hash: null, qa_mission_hash: null, scope_guard_hash: null, scope_baseline_commit: null, delivery_strategy: input.size === 'large' && (input.type || 'task') === 'feature' ? 'vertical-slices' : 'single', slice_ids: [], final_approval: 'pending', waiting_for: 'none', open_questions: 0, learning_recorded: false,
    dependencies: [], parent_id: input.parentId || null, file_scope: input.fileScope || [], resume_status: null, resume_phase: null,
    worktree_path: null, worktree_branch: null, worktree_base: null, delivery_status: 'not_required',
    created_at: stamp, updated_at: stamp
  };
  const file = path.join(projectRoot, '.ai/tasks/inbox', `${id}-${slugify(input.title)}.md`);
  let body = taskBody(input.title);
  if (input.need) body = setSection(body, 'Need', String(input.need));
  const task: TaskDocument = { path: file, meta, body };
  applyControlProfile(task,{lock:false});
  applyFastModeRoute(task);
  saveTask(task); return task;
}
export function listTasks(root: string): TaskDocument[] { return scan(root).map(loadTask).sort((a,b)=>a.meta.id.localeCompare(b.meta.id)); }
export function addDependency(root: string, id: string, dependencyId: string): TaskDocument {
  if (id === dependencyId) throw new Error('A task cannot depend on itself');
  findTask(root, dependencyId);
  const task = loadTask(findTask(root,id));
  task.meta.dependencies = [...new Set([...(task.meta.dependencies || []), dependencyId])]; appendLog(task, `Dependency added: ${dependencyId}.`); return saveTask(task);
}
export function createSubtask(root: string, parentId: string, input: TaskInput): TaskDocument {
  const child = createTask(root,{...input,parentId});
  addDependency(root,parentId,child.meta.id);
  const parent = loadTask(findTask(root,parentId));
  appendLog(parent, `Subtask created: ${child.meta.id}.`); saveTask(parent); return child;
}
export function unfinishedDependencies(root: string, task: TaskDocument): TaskDocument[] {
  return (task.meta.dependencies || []).map(id=>loadTask(findTask(root,id))).filter(dep=>dep.meta.status!=='done');
}
export function patchTask(root: string,id: string,patch: Record<string, unknown>): TaskDocument {
  const task=loadTask(findTask(root,id));
  const allowed=new Set(['title','type','size','risk','execution_profile','surfaces','route','file_scope']);
  for (const [key,value] of Object.entries(patch)) {
    if (!allowed.has(key)) throw new Error(`Field cannot be patched directly: ${key}`);
    task.meta[key]=value;
  }
  if(task.meta.phase==='product-specifier'&&task.meta.spec_approval!=='approved'){applyControlProfile(task,{lock:false});applyFastModeRoute(task);}
  appendLog(task,'Task classification updated.'); return saveTask(task);
}
