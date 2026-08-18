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
  'Automatically apply SpecRail routing to repository delivery work. For every NEW work item, before any SpecRail CLI/task/CodeGraph/gate/evidence state, ask once through native request_user_input: SpecRail / Directo / Directo + verificar / Other. Never choose a route for the user. Continue/Resume/Retoma TASK-#### keeps its route. `Sin SpecRail:` / `No SpecRail:` selects Direct; `Directo + verificar:` / `Direct + Verify:` selects Direct+Verify; `SpecRail Fast:` selects governed fast mode. Direct routes create no SpecRail task, CodeGraph preflight, gate, evidence, or learning state.',
  '',
  'For delivery work follow `$HOME/.agents/skills/ai-flow/SKILL.md`; it is the complete workflow contract. Only a selected SpecRail route uses `$HOME/.local/bin/specrail`; `next` failure blocks routing. `readiness` and `why-blocked` are diagnostics and never replace `next`. Never assume a material decision: use explicit/approved authority or unique deterministic repository evidence, otherwise ask 2-4 choices plus free text. Code-writing requires official Ponytail `full`; missing Ponytail blocks mutation and is never silently installed or bypassed. Use one stable session token and the exact SpecRail interaction; never invent request_user_input. At approvals show the compact Decision Capsule and required evidence first; the complete Review Bundle stays available as Review Details/attachment. For frontend presentation use `presentation.previewUrl` when present; local paths never count as shown evidence. Generated Cockpit HTML is not proof of display. $visualize preparation leaves hostPresentation unverified. Never implement before specification approval or finish before final approval/delivery.'
].join('\n');
export const PI_ACTIVATION_BODY=[
  '# SpecRail delivery router for Pi',
  '',
  'Automatically apply SpecRail routing to repository delivery work. For NEW work without a route prefix or TASK continuation, call `specrail_entry_gate` before any SpecRail state. `Sin SpecRail:` / `No SpecRail:` selects Direct; `Directo + verificar:` / `Direct + Verify:` selects Direct+Verify; `SpecRail Fast:` selects governed fast mode. Direct routes create no SpecRail workflow state.',
  '',
  'After SpecRail is selected call `specrail_skill` with exact name `ai-flow`; that shared skill is the complete workflow contract. Use `specrail_cli` for SpecRail argv, `specrail_host_context` for the exact session ID, and `specrail_codegraph` for structural context. `next` failure blocks routing; `readiness` and `why-blocked` are diagnostics and never replace `next`. Never assume material decisions; ask 2-4 choices plus free text when authority/evidence is not unique. Code-writing requires official Ponytail `full`; missing Ponytail blocks mutation and may not be silently installed or bypassed. Prefer an attested richer ask_user_question capability, otherwise forward exact request_user_input through the adapter. Pi owns model/thinking. Fresh boundaries use `/specrail-handoff TASK-####` or `/new` + `Continue TASK-####`. Use canonical inline evidence and compact Review Cockpit/openUrl unless a compatible visualization capability is attested.'
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
