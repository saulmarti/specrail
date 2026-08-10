import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { codeGraphStatus, prepareCodeGraph } from './codegraph.js';
import { validateAgentPlugin } from './plugin.js';
import { restoreManagedInstallation } from './managed-installation.js';

export interface DoctorCheck { name:string; ok:boolean; required:boolean; detail:string; fixId?:string|null; }
export interface DoctorResult { ok:boolean; checks:DoctorCheck[]; }
export interface DoctorFix {
  id:string;
  title:string;
  description:string;
  scope:'user-config'|'repository'|'external';
  reversible:boolean;
  automatic:boolean;
  resolves:string[];
}
export interface DoctorFixPlan {
  schemaVersion:1;
  ok:boolean;
  fixes:DoctorFix[];
  safeFixIds:string[];
  manualFixes:DoctorFix[];
  interaction:null|{tool:'request_user_input';questions:Array<{id:string;header:string;question:string;options:Array<{label:string;description:string}>;isOther:boolean}>};
}

function launcherHealth(file:string):{ok:boolean;detail:string}{
  if(!existsSync(file))return{ok:false,detail:`Missing launcher: ${file}`};
  const result=spawnSync(file,['--version'],{encoding:'utf8'});
  return result.status===0?{ok:true,detail:`${file} → ${String(result.stdout||'').trim()||'healthy'}`}:{ok:false,detail:`Launcher failed: ${file}: ${String(result.stderr||result.stdout||'').trim()}`};
}
function hasTasteSkill(home:string,name:string):boolean{
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const frontmatter=new RegExp(`^name:\s*${escaped}\s*$`,'im');
  for(const base of ['.agents/skills','.codex/skills']){
    const dir=path.join(home,base);if(!existsSync(dir))continue;
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      if(!entry.isDirectory())continue;
      const file=path.join(dir,entry.name,'SKILL.md');
      if(!existsSync(file))continue;
      try{if(frontmatter.test(readFileSync(file,'utf8')))return true;}catch{}
    }
  }
  return false;
}
function addManagedCheck(checks:DoctorCheck[],name:string,ok:boolean,detail:string,fixId:string,required=true):void{checks.push({name,ok,required,detail,fixId:ok?null:fixId});}

export function doctor(root=process.cwd(),home=os.homedir()):DoctorResult{
 const checks:DoctorCheck[]=[];
 const add=(name:string,ok:boolean,detail:string,required=true,fixId:string|null=null):void=>{checks.push({name,ok,required,detail,fixId:ok?null:fixId});};
 const nodeMajor=Number(process.versions.node.split('.')[0]??0);add('node',nodeMajor>=22,process.version,true,null);
 const git=spawnSync('git',['--version'],{encoding:'utf8'});add('git',git.status===0,String(git.stdout||git.stderr).trim(),true,null);
 const command=process.env.AI_FLOW_CODEGRAPH_COMMAND||'codegraph';const cg=spawnSync(command,['--version'],{encoding:'utf8'});add('codegraph-command',cg.status===0,cg.status===0?String(cg.stdout||cg.stderr).trim():`${command} not found in this environment`,true,null);
 add('codegraph-index',existsSync(path.join(root,'.codegraph')),path.join(root,'.codegraph'),true,'codegraph-preflight');
 const cgState=codeGraphStatus(root);add('codegraph-preflight',cgState.status==='ready'&&cgState.contract?.compatible===true,cgState.detail||cgState.action||'Run SpecRail CodeGraph preflight',true,'codegraph-preflight');
 const host=String(process.env.SPEC_RAIL_HOST||'codex').trim().toLowerCase();
 const piPackageHost=host==='pi'&&Boolean(String(process.env.SPEC_RAIL_PACKAGE_ROOT||'').trim());
 const configPath=path.join(home,'.codex','config.toml'),config=existsSync(configPath)?readFileSync(configPath,'utf8'):'';
 if(piPackageHost){
   add('codegraph-mcp-config',true,'Pi MCP wiring is host/extension-specific; SpecRail verifies the CodeGraph CLI/index separately and does not guess Pi extension configuration.',false,null);
   addManagedCheck(checks,'native-question-ui',true,'Pi adapter provides exact request_user_input through ctx.ui','managed-installation');
   addManagedCheck(checks,'specrail-launcher',true,'Pi adapter executes the bundled SpecRail dispatcher through specrail_cli','managed-installation');
   add('ai-flow-compat-launcher',true,'Pi package uses specrail_cli; the terminal ai-flow compatibility launcher is optional.',false,null);
   addManagedCheck(checks,'automatic-activation',true,'Pi package before_agent_start adapter is active','managed-installation');
   const piRoot=path.resolve(String(process.env.SPEC_RAIL_PACKAGE_ROOT));
   addManagedCheck(checks,'skill-pi-package',existsSync(path.join(piRoot,'skills','ai-flow','SKILL.md')),path.join(piRoot,'skills','ai-flow','SKILL.md'),'managed-installation');
   addManagedCheck(checks,'pi-package-extension',existsSync(path.join(piRoot,'extensions','specrail.js')),path.join(piRoot,'extensions','specrail.js'),'managed-installation');
 }else{
   const configured=/codegraph[\s\S]{0,300}serve[\s\S]{0,100}--mcp|command\s*=\s*["']codegraph["'][\s\S]{0,300}--mcp/i.test(config);add('codegraph-mcp-config',configured,configured?'codegraph serve --mcp found in Codex config':'CodeGraph MCP configuration is missing or not recognized',true,null);
   const nativeInput=/\[features\][\s\S]*default_mode_request_user_input\s*=\s*true/i.test(config);addManagedCheck(checks,'native-question-ui',nativeInput,nativeInput?'request_user_input enabled in Default mode':'SpecRail can safely restore request_user_input in Codex config','managed-installation');
   const specrailLauncher=launcherHealth(path.join(home,'.local','bin','specrail'));addManagedCheck(checks,'specrail-launcher',specrailLauncher.ok,specrailLauncher.detail,'managed-installation');
   const legacyLauncher=launcherHealth(path.join(home,'.local','bin','ai-flow'));add('ai-flow-compat-launcher',legacyLauncher.ok,legacyLauncher.detail,false,'managed-installation');
   const agentsPath=path.join(home,'.codex','AGENTS.md'),agents=existsSync(agentsPath)?readFileSync(agentsPath,'utf8'):'';addManagedCheck(checks,'automatic-activation',agents.includes('AI-FLOW:BEGIN'),agentsPath,'managed-installation');
   for(const base of ['.codex/skills','.agents/skills'])addManagedCheck(checks,`skill-${base}`,existsSync(path.join(home,base,'ai-flow','SKILL.md')),path.join(home,base,'ai-flow','SKILL.md'),'managed-installation');
 }
 add('taste-core',hasTasteSkill(home,'design-taste-frontend')||hasTasteSkill(home,'gpt-taste'),'Expected design-taste-frontend or gpt-taste for UI/UX tasks',false,null);
 add('taste-redesign',hasTasteSkill(home,'redesign-existing-projects'),'Expected redesign-existing-projects for existing-product redesigns',false,null);
 add('taste-imagegen-web',hasTasteSkill(home,'imagegen-frontend-web'),'Expected imagegen-frontend-web for web proposals',false,null);
 add('taste-image-to-code',hasTasteSkill(home,'image-to-code'),'Expected image-to-code for implementation from an approved visual reference',false,null);
 add('ai-project',existsSync(path.join(root,'.ai','config.json')),path.join(root,'.ai','config.json'),true,null);
 const packageRoot=piPackageHost?path.resolve(String(process.env.SPEC_RAIL_PACKAGE_ROOT)):path.join(home,'.ai-flow');const plugin=validateAgentPlugin(packageRoot);
 add('agent-plugin-manifest',plugin.valid,plugin.valid?`${plugin.manifestPath} (${plugin.name||'invalid'} ${plugin.version||''}; ${plugin.skills.length} skills)`:plugin.errors.join('; '),true,'managed-installation');
 add('visualize-host-capability',true,piPackageHost?'Pi uses canonical evidence + Review Cockpit fallback unless a compatible visualization capability is independently attested.':'Session-specific: Codex must confirm whether the current skill catalog exposes `visualize` / `$visualize`; this is optional and non-blocking.',false,null);
 return{ok:checks.filter(check=>check.required).every(check=>check.ok),checks};
}

function fixCatalog(result:DoctorResult,packageRoot:string):DoctorFix[]{
  const failed=new Set(result.checks.filter(check=>!check.ok).map(check=>check.name));
  const fixes:DoctorFix[]=[];
  if([...failed].some(name=>['native-question-ui','specrail-launcher','ai-flow-compat-launcher','automatic-activation','skill-.codex/skills','skill-.agents/skills','agent-plugin-manifest'].includes(name))){
    fixes.push({id:'managed-installation',title:'Restore SpecRail managed files',description:`Re-run the packaged installer from ${packageRoot} to restore launchers, SpecRail skills, the compact Codex activation block, and native question UI. Existing Codex files are backed up by the installer.`,scope:'user-config',reversible:true,automatic:true,resolves:['native-question-ui','specrail-launcher','ai-flow-compat-launcher','automatic-activation','skill-.codex/skills','skill-.agents/skills','agent-plugin-manifest']});
  }
  if(failed.has('codegraph-index')||failed.has('codegraph-preflight'))fixes.push({id:'codegraph-preflight',title:'Repair CodeGraph local index',description:'Run explicit CodeGraph recovery (health/sync and, only when required, a full rebuild) in this repository. This only changes the repository-local .codegraph index.',scope:'repository',reversible:true,automatic:true,resolves:['codegraph-index','codegraph-preflight']});
  if(failed.has('codegraph-command'))fixes.push({id:'install-codegraph',title:'Install or expose CodeGraph',description:'CodeGraph is an external dependency. SpecRail will not install it silently; install it using its official instructions, then rerun doctor.',scope:'external',reversible:false,automatic:false,resolves:['codegraph-command']});
  if(failed.has('codegraph-mcp-config'))fixes.push({id:'configure-codegraph-mcp',title:'Configure CodeGraph MCP in Codex',description:'Configure the installed CodeGraph server as `codegraph serve --mcp` using the Codex MCP settings available in the current host. SpecRail does not guess or rewrite an unknown host MCP schema.',scope:'external',reversible:true,automatic:false,resolves:['codegraph-mcp-config']});
  if(failed.has('node'))fixes.push({id:'upgrade-node',title:'Upgrade Node.js',description:'Install Node.js 22 or newer. SpecRail will not replace the system/runtime Node installation automatically.',scope:'external',reversible:false,automatic:false,resolves:['node']});
  if(failed.has('git'))fixes.push({id:'install-git',title:'Install Git',description:'Install Git and ensure it is available on PATH. SpecRail will not install system packages automatically.',scope:'external',reversible:false,automatic:false,resolves:['git']});
  return fixes;
}

export function doctorFixPlan(root=process.cwd(),home=os.homedir(),packageRoot=path.join(home,'.ai-flow')):DoctorFixPlan{
  const result=doctor(root,home),fixes=fixCatalog(result,packageRoot),safeFixIds=fixes.filter(fix=>fix.automatic&&fix.reversible).map(fix=>fix.id),manualFixes=fixes.filter(fix=>!fix.automatic);
  const interaction=safeFixIds.length?{tool:'request_user_input' as const,questions:[{id:'doctor-fix',header:'Reparar entorno',question:`SpecRail ha encontrado ${safeFixIds.length} reparación(es) local(es) y reversibles. ¿Qué quieres hacer?`,options:[{label:'Aplicar reparaciones seguras',description:'Aplicar únicamente cambios locales y reversibles listados en el plan'},{label:'Solo mostrar pasos manuales',description:'No modificar nada y revisar dependencias/configuración externas'},{label:'Cancelar',description:'Mantener el entorno sin cambios'}],isOther:true}]}:null;
  return{schemaVersion:1,ok:result.ok,fixes,safeFixIds,manualFixes,interaction};
}

export function applyDoctorFixes(root=process.cwd(),home=os.homedir(),packageRoot=path.join(home,'.ai-flow'),selection:string[]=['safe']):{applied:string[];skipped:string[];before:DoctorResult;after:DoctorResult}{
  const before=doctor(root,home),plan=doctorFixPlan(root,home,packageRoot),requested=new Set(selection.includes('safe')?plan.safeFixIds:selection),applied:string[]=[],skipped:string[]=[];
  for(const fix of plan.fixes){
    if(!requested.has(fix.id)){skipped.push(fix.id);continue;}
    if(!fix.automatic||!fix.reversible)throw new Error(`Doctor fix requires manual action and cannot be auto-applied: ${fix.id}`);
    if(fix.id==='managed-installation'){restoreManagedInstallation(packageRoot,home);applied.push(fix.id);continue;}
    if(fix.id==='codegraph-preflight'){
      const result=prepareCodeGraph(root,{force:true,forceSync:true,allowFullReindex:true,reason:'doctor-repair'});if(!result.ok)throw new Error(`CodeGraph repair failed: ${result.detail||result.action}`);applied.push(fix.id);continue;
    }
  }
  const after=doctor(root,home);return{applied,skipped,before,after};
}
