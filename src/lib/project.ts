import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireCodeGraphReady } from './codegraph.js';
import type { ProjectConfig, TargetAudienceProfile } from './types.js';

const PROJECT_DOCS: Record<string,string> = {
  'product.md': '# Product\n\nDescribe the product purpose, value, capabilities, and current priorities.\n',
  'product-owner.md': '# Project Product Owner\n\nDefine the product mission, priorities, principles, anti-goals, and decision rules this project Product Owner must protect.\n',
  'users.md': '# Users and Personas\n\nDescribe primary and secondary target-audience profiles, their goals, constraints, knowledge, frustrations, and what useful success means to them. Prefer stable headings such as `## Audience: operator (primary)` so Target Audience reviews can bind to an explicit project profile.\n',
  'architecture.md': '# Architecture\n\nRecord current boundaries, modules, contracts, and important constraints.\n',
  'design-system.md': '# Design System\n\nRecord visual language, tokens, components, responsive rules, and accessibility requirements.\n',
  'runbook.md': '# Runbook\n\nRecord deterministic commands to build, run, test, and inspect the application.\n',
  'learnings.md': '# Project Learnings\n\nAppend durable facts learned from completed tasks.\n',
  'constitution.md': '# Project Constitution\n\nApproved mechanical principles are managed by AI Flow.\n'
};
const REQUIRED_CONTEXT=['product.md','product-owner.md','users.md','architecture.md','runbook.md'];

const PLACEHOLDER=/\b(?:Describe the|Generated and maintained|Record current|Record deterministic)\b/i;
const AUDIENCE_PROFILE_PATTERN=/^#{2,4}\s+(?:target\s+audience|audience|persona|profile|p[uú]blico(?:\s+objetivo)?):\s*(.+?)(?:\s*[\[(](primary|secondary|primar(?:y|io|ia)|secundar(?:y|io|ia))[\])])?\s*$/i;
function audienceProfileSlug(value:string):string{return String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'audience';}
export function configuredProjectAudienceProfiles(root:string):TargetAudienceProfile[]{
  const file=path.join(path.resolve(root),'.ai','project','users.md');
  const users=existsSync(file)?readFileSync(file,'utf8'):'';
  const profiles:TargetAudienceProfile[]=[];let hasExplicitClassification=false;
  for(const line of users.split(/\r?\n/)){
    const match=line.trim().match(AUDIENCE_PROFILE_PATTERN);if(!match)continue;
    const label=String(match[1]||'').trim();if(!label)continue;
    const marker=String(match[2]||'').toLowerCase();if(marker)hasExplicitClassification=true;
    const id=audienceProfileSlug(label);if(profiles.some(profile=>profile.id===id))continue;
    profiles.push({id,label,primary:/primary|primario|primaria/.test(marker),source:'explicit'});
  }
  if(profiles.length&&!profiles.some(profile=>profile.primary)&&!hasExplicitClassification)profiles[0]={...profiles[0]!,primary:true};
  return profiles;
}
function now(): string { return new Date().toISOString(); }
function readJsonObject(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  const parsed=JSON.parse(readFileSync(file,'utf8')) as unknown;
  return parsed && typeof parsed==='object' && !Array.isArray(parsed) ? parsed as Record<string,unknown> : {};
}

export function resolveRepositoryRoot(start=process.cwd()): string {
  const initial=path.resolve(start);let current=initial;
  while(true){if(existsSync(path.join(current,'.ai','config.json')))return current;const parent=path.dirname(current);if(parent===current)break;current=parent;}
  const git=spawnSync('git',['rev-parse','--show-toplevel'],{cwd:initial,encoding:'utf8'});
  if(git.status===0&&String(git.stdout||'').trim())return path.resolve(String(git.stdout).trim());
  return initial;
}

export function findProjectRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, '.ai/config.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('No .ai project found. AI Flow should initialize it automatically for delivery work.');
    current = parent;
  }
}

export function initProject(root: string, options: {name?:string} = {}): ProjectConfig {
  const projectRoot = path.resolve(root),ai = path.join(projectRoot, '.ai');
  for (const directory of ['project','tasks/inbox','tasks/refining','tasks/ready','tasks/active','tasks/blocked','tasks/review','tasks/done','evidence','decisions','reviews','runtime/leases','runtime/concurrency','runtime/context','runtime/capabilities','runtime/host-capabilities','runtime/visualizations','runtime/presentations','runtime/traces','runtime/failures','runtime/repairs','runtime/slices','runtime/constitution','product-intelligence/product-owner','product-intelligence/audience','metrics','evals/candidates','evals/active','replays','amendments','scope','overrides']) mkdirSync(path.join(ai, directory), { recursive: true });
  const configPath = path.join(ai, 'config.json'),hadExistingConfig = existsSync(configPath),existing = readJsonObject(configPath);
  const existingCodegraph=(existing.codegraph&&typeof existing.codegraph==='object')?existing.codegraph as Record<string,unknown>:{};
  const existingContextBudget=(existing.contextBudget&&typeof existing.contextBudget==='object')?existing.contextBudget as Record<string,unknown>:{};
  const existingProfiles=(existingContextBudget.profiles&&typeof existingContextBudget.profiles==='object')?existingContextBudget.profiles as Record<string,unknown>:{};
  const { modelRouting: _legacyModelRouting, ...existingWithoutModelRouting } = existing;
  const config: ProjectConfig = {
    ...existingWithoutModelRouting,
    version: 14,
    name: options.name || (typeof existing.name==='string'?existing.name:path.basename(projectRoot)),
    projectRoot,
    codegraph: {
      ...existingCodegraph,
      mode: 'mcp', required: true, command: 'codegraph serve --mcp', supportedContract:'codegraph-cli-v1',
      preflight: {
        missing: 'codegraph init PROJECT --index', existing: 'codegraph sync PROJECT', recovery: 'codegraph index PROJECT --force --quiet', validate: 'codegraph status PROJECT',
        ...((existingCodegraph.preflight&&typeof existingCodegraph.preflight==='object')?existingCodegraph.preflight as Record<string,string>:{})
      }
    },
    context: (existing.context&&typeof existing.context==='object') ? existing.context as ProjectConfig['context'] : {status:'pending',initializedAt:null,updatedAt:null},
    subagents: { maxParallel: 3, maxDepth: 1, coordination: 'local-filesystem', requireParallelHostAttestation: true, defaultAccess: 'read-only', writeRequiresApprovedNonOverlappingSubtasks: true, ...((existing.subagents&&typeof existing.subagents==='object')?existing.subagents as Record<string,unknown>:{}) },
    autonomy: { level: 'guided', delivery: 'ask', ...((existing.autonomy&&typeof existing.autonomy==='object')?existing.autonomy as Record<string,unknown>:{}) },
    productIntelligence: { enabled: !hadExistingConfig, requireProductOwner: true, requireFinalProductOwnerReview: true, requireTargetAudience: true, minPrimaryAudienceProfiles: 1, ...((existing.productIntelligence&&typeof existing.productIntelligence==='object')?existing.productIntelligence as Record<string,unknown>:{}) },
    evidence: { ...((existing.evidence&&typeof existing.evidence==='object')?existing.evidence as Record<string,unknown>:{}), requireRealArtifacts: true, embedVisualsInMarkdown: false },
    visualize: {
      enabled: ((existing.visualize&&typeof existing.visualize==='object') ? (existing.visualize as Record<string,unknown>).enabled : undefined) !== false,
      capability:'visualize', discovery:'codex-skill-catalog', skill:'visualize', invocation:'$visualize', mode:'adaptive', maxPerGate:1,
      fallback:'markdown-and-attachments', sourceOfTruth:'markdown', qualityGate:'risk-based'
    },
    repairs: { profiles: { fast: 2, standard: 3, rigorous: 4 }, stopAndAsk: true, ...((existing.repairs&&typeof existing.repairs==='object')?existing.repairs as Record<string,unknown>:{}) },
    quality: { propertyTesting: 'risk-based', mutationTesting: 'risk-based', ...((existing.quality&&typeof existing.quality==='object')?existing.quality as Record<string,unknown>:{}) },
    observability: { mode: 'risk-based', ...((existing.observability&&typeof existing.observability==='object')?existing.observability as Record<string,unknown>:{}) },
    failures: { evalThreshold: 2, requireUserApproval: true, ...((existing.failures&&typeof existing.failures==='object')?existing.failures as Record<string,unknown>:{}) },
    metrics: { enabled: true, telemetry: false, ...((existing.metrics&&typeof existing.metrics==='object')?existing.metrics as Record<string,unknown>:{}) },
    leases: { ttlMinutes: 30, releaseAtUserGate: true, ...((existing.leases&&typeof existing.leases==='object')?existing.leases as Record<string,unknown>:{}) },
    adaptivePolicy: { enabled: true, minSamplesPerHarness: 3, lowRiskAcceptanceDelta: 0.05, tokenCoverageThreshold: 0.6, ...((existing.adaptivePolicy&&typeof existing.adaptivePolicy==='object')?existing.adaptivePolicy as Record<string,unknown>:{}) },
    contextBudget: {
      ...existingContextBudget,
      fullRepositoryScan: false,
      expansionRequiresReason: true,
      profiles: {
        fast: { initialFiles: 8, maxFiles: 16, codegraphDepth: 1, maxDepth: 2, handoffMaxWords: 180, maxAutomaticExpansions: 2 },
        standard: { initialFiles: 12, maxFiles: 28, codegraphDepth: 2, maxDepth: 3, handoffMaxWords: 300, maxAutomaticExpansions: 3 },
        rigorous: { initialFiles: 18, maxFiles: 45, codegraphDepth: 3, maxDepth: 4, handoffMaxWords: 450, maxAutomaticExpansions: 4 },
        ...existingProfiles
      } as ProjectConfig['contextBudget']['profiles']
    }
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const counter = path.join(ai, 'counter.json');if (!existsSync(counter)) writeFileSync(counter, '{"nextTask":1}\n');
  for (const [file, content] of Object.entries(PROJECT_DOCS)) {const target = path.join(ai, 'project', file);if (!existsSync(target)) writeFileSync(target, content);}
  return config;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Return the effective current project configuration without mutating legacy
 * `.ai/config.json` files. Older projects may legitimately predate newer
 * optional policy blocks (for example `visualize`). Runtime readers must see
 * current defaults while preserving every explicit user-owned value.
 */
export function normalizeProjectConfig(root: string, value: unknown): ProjectConfig {
  const projectRoot = path.resolve(root);
  const existing = objectValue(value);
  const codegraph = objectValue(existing.codegraph);
  const preflight = objectValue(codegraph.preflight);
  const contextBudget = objectValue(existing.contextBudget);
  const profiles = objectValue(contextBudget.profiles);
  const visualize = objectValue(existing.visualize);

  return {
    ...existing,
    version: Number.isFinite(Number(existing.version)) ? Number(existing.version) : 14,
    name: typeof existing.name === 'string' && existing.name.trim() ? existing.name : path.basename(projectRoot),
    projectRoot: typeof existing.projectRoot === 'string' && existing.projectRoot.trim() ? existing.projectRoot : projectRoot,
    codegraph: {
      mode: 'mcp', required: true, command: 'codegraph serve --mcp', supportedContract: 'codegraph-cli-v1',
      ...codegraph,
      preflight: {
        missing: 'codegraph init PROJECT --index', existing: 'codegraph sync PROJECT', recovery: 'codegraph index PROJECT --force --quiet', validate: 'codegraph status PROJECT',
        ...preflight
      }
    } as ProjectConfig['codegraph'],
    context: Object.keys(objectValue(existing.context)).length ? objectValue(existing.context) as ProjectConfig['context'] : { status: 'pending', initializedAt: null, updatedAt: null },
    subagents: { maxParallel: 3, maxDepth: 1, defaultAccess: 'read-only', writeRequiresApprovedNonOverlappingSubtasks: true, ...objectValue(existing.subagents) },
    evidence: { requireRealArtifacts: true, embedVisualsInMarkdown: false, ...objectValue(existing.evidence) },
    visualize: {
      enabled: true, capability: 'visualize', discovery: 'codex-skill-catalog', skill: 'visualize', invocation: '$visualize', mode: 'adaptive', maxPerGate: 1,
      fallback: 'markdown-and-attachments', sourceOfTruth: 'markdown', qualityGate: 'risk-based',
      ...visualize
    } as ProjectConfig['visualize'],
    repairs: { profiles: { fast: 2, standard: 3, rigorous: 4 }, stopAndAsk: true, ...objectValue(existing.repairs) },
    quality: { propertyTesting: 'risk-based', mutationTesting: 'risk-based', ...objectValue(existing.quality) },
    observability: { mode: 'risk-based', ...objectValue(existing.observability) },
    failures: { evalThreshold: 2, requireUserApproval: true, ...objectValue(existing.failures) },
    metrics: { enabled: true, telemetry: false, ...objectValue(existing.metrics) },
    leases: { ttlMinutes: 30, releaseAtUserGate: true, ...objectValue(existing.leases) } as ProjectConfig['leases'],
    adaptivePolicy: { enabled: true, minSamplesPerHarness: 3, lowRiskAcceptanceDelta: 0.05, tokenCoverageThreshold: 0.6, ...objectValue(existing.adaptivePolicy) } as ProjectConfig['adaptivePolicy'],
    contextBudget: {
      fullRepositoryScan: false, expansionRequiresReason: true,
      ...contextBudget,
      profiles: {
        fast: { initialFiles: 8, maxFiles: 16, codegraphDepth: 1, maxDepth: 2, handoffMaxWords: 180, maxAutomaticExpansions: 2 },
        standard: { initialFiles: 12, maxFiles: 28, codegraphDepth: 2, maxDepth: 3, handoffMaxWords: 300, maxAutomaticExpansions: 3 },
        rigorous: { initialFiles: 18, maxFiles: 45, codegraphDepth: 3, maxDepth: 4, handoffMaxWords: 450, maxAutomaticExpansions: 4 },
        ...profiles
      } as ProjectConfig['contextBudget']['profiles']
    } as ProjectConfig['contextBudget']
  } as ProjectConfig;
}

export function loadProjectConfig(root: string): ProjectConfig {
  const projectRoot = path.resolve(root);
  const parsed = JSON.parse(readFileSync(path.join(projectRoot, '.ai/config.json'), 'utf8')) as unknown;
  return normalizeProjectConfig(projectRoot, parsed);
}
export function projectContextStatus(root: string): ProjectConfig['context'] { const config=loadProjectConfig(root);return config.context||{status:'pending'}; }
export function validateProjectContext(root: string): {valid:boolean;errors:string[];required:string[]} {
  const base=path.join(path.resolve(root),'.ai','project'),errors:string[]=[];
  for(const name of REQUIRED_CONTEXT){const file=path.join(base,name),content=existsSync(file)?readFileSync(file,'utf8').trim():'';if(!content||content.length<60||PLACEHOLDER.test(content))errors.push(`${name} is still a placeholder`);}
  const config=loadProjectConfig(root);
  const policy=config.productIntelligence&&typeof config.productIntelligence==='object'&&!Array.isArray(config.productIntelligence)?config.productIntelligence as Record<string,unknown>:null;
  if(policy&&policy.enabled!==false&&policy.requireTargetAudience!==false){
    const minimumRaw=Number(policy.minPrimaryAudienceProfiles??1),minimum=Number.isFinite(minimumRaw)?Math.max(1,Math.floor(minimumRaw)):1;
    const primary=configuredProjectAudienceProfiles(root).filter(profile=>profile.primary).length;
    if(primary<minimum)errors.push(`users.md defines ${primary} primary Target Audience profile(s), but productIntelligence.minPrimaryAudienceProfiles requires ${minimum}`);
  }
  return{valid:errors.length===0,errors,required:REQUIRED_CONTEXT};
}
export function completeProjectContext(root: string,summary='Project context generated by Product Specifier'): ProjectConfig['context'] {
  requireCodeGraphReady(root);
  const validation=validateProjectContext(root);if(!validation.valid)throw new Error(`Project context is incomplete: ${validation.errors.join(', ')}`);
  const config=loadProjectConfig(root),stamp=now();config.context={status:'ready',initializedAt:config.context?.initializedAt||stamp,updatedAt:stamp,summary};writeFileSync(path.join(path.resolve(root),'.ai','config.json'),`${JSON.stringify(config,null,2)}\n`);return config.context;
}
export function appendProjectLearning(root: string,{taskId='PROJECT',text}:{taskId?:string;text:string}): {taskId:string;text:string;path:string} {
  const value=String(text||'').trim();if(!value)throw new Error('Learning text is required');const file=path.join(path.resolve(root),'.ai','project','learnings.md');appendFileSync(file,`\n## ${taskId} — ${now()}\n\n${value}\n`);const config=loadProjectConfig(root);config.context={...(config.context||{}),updatedAt:now()};writeFileSync(path.join(path.resolve(root),'.ai','config.json'),`${JSON.stringify(config,null,2)}\n`);return{taskId,text:value,path:file};
}
