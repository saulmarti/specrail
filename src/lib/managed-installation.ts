import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SPEC_RAIL_SKILL_NAMES=['ai-flow','ai-flow-product-specifier','ai-flow-ux-ui-designer','ai-flow-builder','ai-flow-technical-reviewer','ai-flow-qa-engineer','ai-flow-final-customer'] as const;
export const ACTIVATION_START='<!-- AI-FLOW:BEGIN -->';
export const ACTIVATION_END='<!-- AI-FLOW:END -->';
export const ACTIVATION_BODY=[
  '# Automatic SpecRail',
  '',
  'Automatically apply SpecRail to repository delivery requests that create, change, fix, redesign, implement, execute, continue, review, validate, or finish software, UI/UX, architecture, or database work, including equivalent Spanish requests. Read-only explanations and research do not create tasks. Do not require the user to name SpecRail, a skill, a task ID, or a CLI command.',
  '',
  'For every delivery request, open and follow `$HOME/.agents/skills/ai-flow/SKILL.md`, using the absolute launcher `$HOME/.local/bin/specrail`. That skill is the complete workflow contract. Never imitate CLI state changes or bypass a failed deterministic gate.',
  '',
  'At approval gates use one stable session token and the exact SpecRail interaction; never invent request_user_input. Show the complete Review Bundle and required evidence first. Generated Cockpit HTML is not proof of display. When planned, emit the native $visualize reference before the questions; required visual IDs must be on `<img>` elements with local bytes embedded as data URIs, never local-path image sources. Frontend review uses the served `presentation.previewUrl`, never raw index.html/file://. Codex selector owns model/effort. Follow `next.runtime` only for context and handoffs. When `stopBeforePhaseWork` is true, show the notice and end the turn before implementation/review. On continuation, enter the phase boundary before work. Follow its recommendation: same chat is allowed for small low-risk work; otherwise prefer a fresh chat. Resume from the compiled handoff; prior chat reasoning is non-authoritative. Never implement before specification approval or finish before final approval and delivery.'
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
  const cli=path.join(packageRoot,'dist','src','cli.js');if(!existsSync(cli))throw new Error(`Packaged SpecRail CLI is missing: ${cli}`);
  const binDir=path.join(home,'.local','bin');mkdirSync(binDir,{recursive:true});const wrapper=`#!${process.execPath}\nimport(${JSON.stringify(cli)});\n`;const bins:string[]=[];
  for(const name of ['specrail','ai-flow']){const bin=path.join(binDir,name);writeFileSync(bin,wrapper);chmodSync(bin,0o755);bins.push(bin);}return bins;
}
function configureCodex(home:string):void{
  const codex=path.join(home,'.codex');mkdirSync(codex,{recursive:true});
  const configFile=path.join(codex,'config.toml');backupOnce(configFile);const currentConfig=existsSync(configFile)?readFileSync(configFile,'utf8'):'';writeFileSync(configFile,enableFeature(currentConfig,'default_mode_request_user_input'));
  const agentsFile=path.join(codex,'AGENTS.md');backupOnce(agentsFile);const currentAgents=existsSync(agentsFile)?readFileSync(agentsFile,'utf8'):'';writeFileSync(agentsFile,managedBlock(currentAgents,ACTIVATION_START,ACTIVATION_END,ACTIVATION_BODY));
}
export function restoreManagedInstallation(packageRoot:string,home:string):{bins:string[];skills:number;activationPath:string;configPath:string}{
  const root=path.resolve(packageRoot),targetHome=path.resolve(home);const bins=installLaunchers(root,targetHome);installSkills(root,path.join(targetHome,'.agents','skills'));installSkills(root,path.join(targetHome,'.codex','skills'));configureCodex(targetHome);
  return{bins,skills:SPEC_RAIL_SKILL_NAMES.length,activationPath:path.join(targetHome,'.codex','AGENTS.md'),configPath:path.join(targetHome,'.codex','config.toml')};
}
