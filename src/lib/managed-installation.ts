import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SPEC_RAIL_SKILL_NAMES=['ai-flow','ai-flow-multi-agent','ai-flow-product-owner','ai-flow-product-specifier','ai-flow-ux-ui-designer','ai-flow-builder','ai-flow-technical-reviewer','ai-flow-qa-engineer','ai-flow-target-audience','ai-flow-final-customer'] as const;
export const ACTIVATION_START='<!-- AI-FLOW:BEGIN -->';
export const ACTIVATION_END='<!-- AI-FLOW:END -->';
export const PI_ACTIVATION_START='<!-- AI-FLOW:PI-BEGIN -->';
export const PI_ACTIVATION_END='<!-- AI-FLOW:PI-END -->';
// Managed review contract: Generated Cockpit HTML is not proof of display. The complete Review Bundle stays available as Review Details. Local paths never count as shown evidence; use presentation.previewUrl for served previews. `$visualize` remains optional and its full semantics are delegated to ai-flow/SKILL.md.
export const ACTIVATION_BODY=[
  '# SpecRail delivery router',
  '',
  'Automatically apply SpecRail routing to repository delivery work. For every NEW work item, before any SpecRail CLI/task/CodeGraph/gate/evidence state, ask once through native request_user_input: SpecRail / Directo / Directo + verificar / Other. Never choose a route for the user. Continue/Resume/Retoma TASK-#### keeps its route. `Sin SpecRail:` / `No SpecRail:` selects Direct; `Directo + verificar:` / `Direct + Verify:` selects Direct+Verify; `SpecRail Fast:` selects governed fast mode. Direct routes create no SpecRail task, CodeGraph preflight, gate, evidence, or learning state.',
  '',
  'For delivery work follow `$HOME/.agents/skills/ai-flow/SKILL.md`; it is the complete workflow contract. Only a selected SpecRail route uses `$HOME/.local/bin/specrail`; Brain/Worker-routed heavy phases use `$HOME/.local/bin/specrail-worker` while the current chat model remains Brain. `next` failure blocks routing. `readiness` and `why-blocked` are diagnostics and never replace `next`. Never assume a material decision: use explicit/approved authority or unique deterministic repository evidence, otherwise ask 2-4 choices plus free text. The SpecRail installer also installs the official `@dietrichgebert/ponytail` skills; code-writing must load/use official Ponytail in `full` mode before mutation and run `ponytail-review` before the mutation phase completes. A missing Ponytail skill is an installation defect, not a prerequisite the user must fix manually. Use one stable session token and the exact SpecRail interaction; never invent request_user_input. Before an approval selector, show exactly one concise Decision Capsule summary in chat; Review Details stay available on demand. Do not generate or open Review Cockpit in the normal workflow. Required visual evidence is still surfaced inline before approval. Never implement before specification approval or finish before final approval/delivery.'
].join('\n');
export const PI_ACTIVATION_BODY=[
  '# SpecRail delivery router for Pi',
  '',
  'Automatically apply SpecRail routing to repository delivery work. For NEW work without a route prefix or TASK continuation, call `specrail_entry_gate` before any SpecRail state. `Sin SpecRail:` / `No SpecRail:` selects Direct; `Directo + verificar:` / `Direct + Verify:` selects Direct+Verify; `SpecRail Fast:` selects governed fast mode. Direct routes create no SpecRail workflow state.',
  '',
  'After SpecRail is selected call `specrail_skill` with exact name `ai-flow`; that shared skill is the complete workflow contract. Use `specrail_cli` for SpecRail argv, `specrail_host_context` for the exact Brain session ID, `specrail_codegraph` for structural context, and the packaged `specrail-worker` launcher for Brain/Worker-routed heavy phases. `next` failure blocks routing; `readiness` and `why-blocked` are diagnostics and never replace `next`. Never assume material decisions; ask 2-4 choices plus free text when authority/evidence is not unique. SpecRail ships and loads the official `@dietrichgebert/ponytail` Pi extension and skills; code-writing requires its literal `full` mode, which is the official default. If Ponytail is absent, treat the SpecRail installation as broken instead of asking the user to install another package. Prefer an attested richer ask_user_question capability, otherwise forward exact request_user_input through the adapter. Before any approval selector, show exactly one concise Decision Capsule summary in chat; do not generate or open Review Cockpit. Required visual evidence remains inline. The current Pi model remains Brain; Workers run in explicit isolated model-pinned processes. Fresh boundaries use `/specrail-handoff TASK-####` or `/new` + `Continue TASK-####`.'
].join('\n');

export interface ManagedInstallationOptions { installPi?: boolean; }

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
function ponytailRoot(packageRoot:string):string{
  const root=path.join(packageRoot,'node_modules','@dietrichgebert','ponytail');
  const manifest=path.join(root,'package.json');
  if(!existsSync(manifest))throw new Error(`Bundled official Ponytail dependency is missing: ${root}. Reinstall @saulmarti/specrail.`);
  const parsed=JSON.parse(readFileSync(manifest,'utf8')) as {name?:string};
  if(parsed.name!=='@dietrichgebert/ponytail')throw new Error(`Invalid Ponytail dependency at ${root}`);
  return root;
}
function installPonytailSkills(packageRoot:string,base:string):number{
  const sourceRoot=path.join(ponytailRoot(packageRoot),'skills');
  if(!existsSync(sourceRoot))throw new Error(`Official Ponytail skills are missing: ${sourceRoot}`);
  mkdirSync(base,{recursive:true});let installed=0;
  for(const entry of readdirSync(sourceRoot,{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    const source=path.join(sourceRoot,entry.name);const skill=path.join(source,'SKILL.md');if(!existsSync(skill))continue;
    const target=path.join(base,entry.name);rmSync(target,{recursive:true,force:true});cpSync(source,target,{recursive:true});installed++;
  }
  if(installed===0)throw new Error(`Official Ponytail package contains no installable skills: ${sourceRoot}`);
  return installed;
}
function installLaunchers(packageRoot:string,home:string):string[]{
  const cli=path.join(packageRoot,'dist','src','cli.js'),dispatcher=path.join(packageRoot,'scripts','specrail-fast.sh'),worker=path.join(packageRoot,'scripts','specrail-worker.mjs');
  if(!existsSync(cli))throw new Error(`Packaged SpecRail CLI is missing: ${cli}`);if(!existsSync(dispatcher))throw new Error(`Packaged SpecRail persistent dispatcher is missing: ${dispatcher}`);if(!existsSync(worker))throw new Error(`Packaged SpecRail Worker launcher is missing: ${worker}`);
  const binDir=path.join(home,'.local','bin');mkdirSync(binDir,{recursive:true});const bins:string[]=[];
  const dispatcherWrapper=`#!/bin/sh\nexec ${JSON.stringify(dispatcher)} \"$@\"\n`;
  for(const name of ['specrail','ai-flow']){const bin=path.join(binDir,name);writeFileSync(bin,dispatcherWrapper);chmodSync(bin,0o755);bins.push(bin);}
  const workerBin=path.join(binDir,'specrail-worker');writeFileSync(workerBin,`#!/bin/sh\nexec ${JSON.stringify(worker)} \"$@\"\n`);chmodSync(workerBin,0o755);bins.push(workerBin);return bins;
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
  const ponytailExtension=path.join(ponytailRoot(packageRoot),'pi-extension','index.js');if(!existsSync(ponytailExtension))throw new Error(`Bundled official Ponytail Pi extension is missing: ${ponytailExtension}`);
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
export function restoreManagedInstallation(packageRoot:string,home:string,options:ManagedInstallationOptions={}):{bins:string[];skills:number;ponytailSkills:number;ponytailRoot:string;activationPath:string;configPath:string;piInstalled:boolean;piActivationPath:string|null;piSettingsPath:string|null;piPackageSource:string|null;piExtensionPath:string|null}{
  const root=path.resolve(packageRoot),targetHome=path.resolve(home),installPi=options.installPi!==false;const bins=installLaunchers(root,targetHome);
  installSkills(root,path.join(targetHome,'.agents','skills'));installSkills(root,path.join(targetHome,'.codex','skills'));
  const ponytailSkills=Math.max(installPonytailSkills(root,path.join(targetHome,'.agents','skills')),installPonytailSkills(root,path.join(targetHome,'.codex','skills')));configureCodex(targetHome);
  const pi=installPi?configurePi(root,targetHome):null;
  return{bins,skills:SPEC_RAIL_SKILL_NAMES.length,ponytailSkills,ponytailRoot:ponytailRoot(root),activationPath:path.join(targetHome,'.codex','AGENTS.md'),configPath:path.join(targetHome,'.codex','config.toml'),piInstalled:installPi,piActivationPath:pi?.activationPath??null,piSettingsPath:pi?.settingsPath??null,piPackageSource:pi?.packageSource??null,piExtensionPath:pi?.extensionPath??null};
}
