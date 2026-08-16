import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SPEC_RAIL_SKILL_NAMES=['ai-flow','ai-flow-multi-agent','ai-flow-product-owner','ai-flow-product-specifier','ai-flow-ux-ui-designer','ai-flow-builder','ai-flow-technical-reviewer','ai-flow-qa-engineer','ai-flow-target-audience','ai-flow-final-customer'] as const;
export const ACTIVATION_START='<!-- AI-FLOW:BEGIN -->';
export const ACTIVATION_END='<!-- AI-FLOW:END -->';
export const PI_ACTIVATION_START='<!-- AI-FLOW:PI-BEGIN -->';
export const PI_ACTIVATION_END='<!-- AI-FLOW:PI-END -->';
export const ACTIVATION_BODY=[
  '# SpecRail delivery router',
  '',
  'Automatically route repository delivery work: create, change, fix, redesign, implement, continue, review, validate, or finish software/UI/UX/architecture/database tasks, including Spanish. Read-only research stays outside SpecRail. For every NEW work item, before any SpecRail CLI/task/CodeGraph/gate/evidence state, ask once through native request_user_input: SpecRail / Directo / Directo + verificar / Other. Never choose a route for the user. Continue/Resume/Retoma TASK-#### keeps its existing SpecRail route. `Sin SpecRail:` / `No SpecRail:` explicitly selects Direct; `Directo + verificar:` / `Direct + Verify:` explicitly selects Direct+Verify; `SpecRail Fast:` explicitly selects governed SpecRail with `--mode fast` and deterministic classification may escalate material/risky work back to normal controls.',
  '',
  'For every delivery request, open and follow `$HOME/.agents/skills/ai-flow/SKILL.md`. Only a selected SpecRail route uses the absolute launcher `$HOME/.local/bin/specrail`; that skill is the complete workflow contract. Direct routes create no SpecRail task, CodeGraph preflight, gate, evidence state, or learning. `specrail next` failure blocks routing; readiness diagnostics never replace it.',
  '',
  'Never assume a material decision: explicit user/approved authority or unique deterministic repository evidence must resolve it, otherwise ask 2-4 concrete choices plus free text. Code-writing requires the official Ponytail plugin/skill in full mode; never imitate or install it silently. At approval gates use a stable session token and the exact SpecRail interaction. For visual gates, host_actions means show the compact Decision Capsule, execute exact actions, record actual outcomes with presentationDigest/action ID, then call next. The full Review Bundle remains available as Review Details/attachment instead of being dumped by default. Required visuals stay in conversation; local paths never count as shown evidence; unavailable required images block approval. Generated Cockpit HTML is not proof of display: record opened only after real open, otherwise expose openUrl and record offered. Never pre-acknowledge or reuse stale/cross-session/tampered acknowledgments. $visualize preparation leaves hostPresentation unverified. Frontend preview uses served presentation.previewUrl, not raw files. Shell localhost failure differs from Browser failure. Codex owns model/effort. Obey next.autonomy. At phase boundaries persist the native choice, end turn, then Continue/Resume enters before generic context reads. Never implement before specification approval or finish before final approval/delivery.'
].join('\n');
export const PI_ACTIVATION_BODY=[
  '# SpecRail delivery router for Pi',
  '',
  'Automatically route repository delivery work: create, change, fix, redesign, implement, continue, review, validate, or finish software/UI/UX/architecture/database tasks, including Spanish. Read-only research stays outside. For every NEW work item without an explicit route prefix or TASK continuation, call `specrail_entry_gate` before any SpecRail state. `Sin SpecRail:` / `No SpecRail:` selects Direct; `Directo + verificar:` / `Direct + Verify:` selects Direct+Verify; `SpecRail Fast:` selects the low-overhead governed route.',
  '',
  'Only after SpecRail is selected call `specrail_skill` with exact name `ai-flow` and follow that packaged orchestrator contract. On Pi use `specrail_cli` for SpecRail argv, `specrail_host_context` for the exact session ID, `specrail_skill` for recommended specialists, and `specrail_codegraph` for structural context. Direct routes do not invoke SpecRail workflow state. The packaged skill is the complete workflow contract; `next` failure blocks routing.',
  '',
  'Never assume a material decision; ask 2-4 choices plus free text when explicit/approved or unique deterministic repository evidence cannot resolve it. Code-writing requires official Ponytail full and may not install third-party code silently. Prefer an attested richer ask_user_question capability when present, otherwise forward exact SpecRail request_user_input payloads through the Pi adapter. Pi owns model/thinking selection. Fresh-session boundaries use `/specrail-handoff TASK-####` or `/new` + `Continue TASK-####`; never depend on Codex deep links. Codex Visualize is optional/host-specific: use canonical inline evidence and compact Review Cockpit/openUrl fallback unless a compatible visualization capability is actually discovered. Do not claim Pi parallel subagents without a truthful host capability attestation.'
].join('\n');

function backupOnce(file:string):void{if(existsSync(file)&&!existsSync(`${file}.ai-flow.bak`))cpSync(file,`${file}.ai-flow.bak`);}
function managedBlock(content:string,start:string,end:string,body:string):string{
  const block=`${start}\n${body.trim()}\n${end}`;const from=content.indexOf(start),to=content.indexOf(end,Math.max(0,from));
  if(from>=0&&to>=from)return `${content.slice(0,from).trimEnd()}\n\n${block}\n${content.slice(to+end.length).trimStart()}`.trim()+"\n";
  return `${content.trimEnd()}${content.trim()?"\n\n":""}${block}\n`;
}
function enableFeature(content:string,key:string):string{
  const lines=String(content||'').replace(/\r\n/g,'\n').split('\n');let start=lines.findIndex(line=>line.trim()==='[features]');
  if(start<0){while(lines.length&&lines.at(-1)==='')lines.pop();lines.push('', '[features]', `${key} = true`, '');return lines.join('\n');}
  let end=lines.length;for(let i=start+1;i<lines.length;i++)if(/^\s*\[[^\]]+\]\s*$/.test(lines[i]!)){end=i;break;}
  const rx=new RegExp(`^\\s*${key}\\s*=`);const existing=lines.findIndex((line,i)=>i>start&&i<end&&rx.test(line));
  if(existing>=0)lines[existing]=`${key} = true`;else lines.splice(end,0,`${key} = true`);
  return lines.join('\n').replace(/\n*$/,'\n');
}
function installSkills(packageRoot:string,base:string):void{
  mkdirSync(base,{recursive:true});rmSync(path.join(base,'ai-flow-orchestrator'),{recursive:true,force:true});
  for(const name of SPEC_RAIL_SKILL_NAMES){const source=path.join(packageRoot,'skills',name,'SKILL.md');if(!existsSync(source))throw new Error(`Packaged SpecRail skill is missing: ${source}`);const target=path.join(base,name);rmSync(target,{recursive:true,force:true});cpSync(path.join(packageRoot,'skills',name),target,{recursive:true});}
}
function installLaunchers(packageRoot:string,home:string):string[]{
  const cli=path.join(packageRoot,'dist','src','cli.js'),dispatcher=path.join(packageRoot,'scripts','specrail-fast.sh');if(!existsSync(cli))throw new Error(`Packaged SpecRail CLI is missing: ${cli}`);if(!existsSync(dispatcher))throw new Error(`Packaged SpecRail persistent dispatcher is missing: ${dispatcher}`);
  const binDir=path.join(home,'.local','bin');mkdirSync(binDir,{recursive:true});const wrapper=`#!/bin/sh\nexec ${JSON.stringify(dispatcher)} \"$@\"\n`;const bins:string[]=[];
  for(const name of ['specrail','ai-flow']){const bin=path.join(binDir,name);writeFileSync(bin,wrapper);chmodSync(bin,0o755);bins.push(bin);}return bins;
}
function configureCodex(home:string):void{
  const codex=path.join(home,'.codex');mkdirSync(codex,{recursive:true});
  const configFile=path.join(codex,'config.toml');backupOnce(configFile);const currentConfig=existsSync(configFile)?readFileSync(configFile,'utf8'):'';writeFileSync(configFile,enableFeature(currentConfig,'default_mode_request_user_input'));
  const agentsFile=path.join(codex,'AGENTS.md');backupOnce(agentsFile);const currentAgents=existsSync(agentsFile)?readFileSync(agentsFile,'utf8'):'';writeFileSync(agentsFile,managedBlock(currentAgents,ACTIVATION_START,ACTIVATION_END,ACTIVATION_BODY));
}
function piPackageSource(entry:unknown):string|null{
  if(typeof entry==='string')return entry;
  if(entry&&typeof entry==='object'&&typeof (entry as {source?:unknown}).source==='string')return String((entry as {source:string}).source);
  return null;
}
function configurePi(packageRoot:string,home:string):{activationPath:string;settingsPath:string;packageSource:string;extensionPath:string}{
  const piRoot=path.join(home,'.pi','agent');mkdirSync(piRoot,{recursive:true});
  const agentsFile=path.join(piRoot,'AGENTS.md');backupOnce(agentsFile);const currentAgents=existsSync(agentsFile)?readFileSync(agentsFile,'utf8'):'';writeFileSync(agentsFile,managedBlock(currentAgents,PI_ACTIVATION_START,PI_ACTIVATION_END,PI_ACTIVATION_BODY));
  const extensionPath=path.join(packageRoot,'extensions','specrail.js');if(!existsSync(extensionPath))throw new Error(`Packaged SpecRail Pi extension is missing: ${extensionPath}`);
  const settingsFile=path.join(piRoot,'settings.json');backupOnce(settingsFile);let settings:Record<string,unknown>={};
  if(existsSync(settingsFile)){
    try{const parsed=JSON.parse(readFileSync(settingsFile,'utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('root must be an object');settings=parsed as Record<string,unknown>;}catch(error){throw new Error(`Cannot safely update Pi settings ${settingsFile}: ${error instanceof Error?error.message:String(error)}`);}
  }
  const packageSource=path.resolve(packageRoot);const current=Array.isArray(settings.packages)?settings.packages:[];const managedRoot=path.resolve(home,'.ai-flow');
  settings.packages=current.filter(entry=>{const source=piPackageSource(entry);if(!source)return true;if(/^npm:@saulmarti\/specrail(?:@|$)/i.test(source))return false;try{return path.resolve(source)!==packageSource&&path.resolve(source)!==managedRoot;}catch{return true;}});
  (settings.packages as unknown[]).push(packageSource);writeFileSync(settingsFile,`${JSON.stringify(settings,null,2)}\n`);
  rmSync(path.join(piRoot,'extensions','specrail.js'),{force:true});
  return{activationPath:agentsFile,settingsPath:settingsFile,packageSource,extensionPath};
}
export function restoreManagedInstallation(packageRoot:string,home:string):{bins:string[];skills:number;activationPath:string;configPath:string;piActivationPath:string;piSettingsPath:string;piPackageSource:string;piExtensionPath:string}{
  const root=path.resolve(packageRoot),targetHome=path.resolve(home);const bins=installLaunchers(root,targetHome);installSkills(root,path.join(targetHome,'.agents','skills'));installSkills(root,path.join(targetHome,'.codex','skills'));configureCodex(targetHome);const pi=configurePi(root,targetHome);
  return{bins,skills:SPEC_RAIL_SKILL_NAMES.length,activationPath:path.join(targetHome,'.codex','AGENTS.md'),configPath:path.join(targetHome,'.codex','config.toml'),piActivationPath:pi.activationPath,piSettingsPath:pi.settingsPath,piPackageSource:pi.packageSource,piExtensionPath:pi.extensionPath};
}
