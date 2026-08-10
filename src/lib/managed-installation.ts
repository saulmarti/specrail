import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SPEC_RAIL_SKILL_NAMES=['ai-flow','ai-flow-multi-agent','ai-flow-product-owner','ai-flow-product-specifier','ai-flow-ux-ui-designer','ai-flow-builder','ai-flow-technical-reviewer','ai-flow-qa-engineer','ai-flow-target-audience','ai-flow-final-customer'] as const;
export const ACTIVATION_START='<!-- AI-FLOW:BEGIN -->';
export const ACTIVATION_END='<!-- AI-FLOW:END -->';
export const ACTIVATION_BODY=[
  '# Automatic SpecRail',
  '',
  'Automatically apply SpecRail to repository delivery work: create, change, fix, redesign, implement, continue, review, validate, or finish software/UI/UX/architecture/database tasks, including Spanish. Read-only research does not create tasks. `Sin SpecRail:` / `No SpecRail:` is an explicit total bypass: do not invoke SpecRail. `SpecRail Fast:` is an explicit low-overhead governed path: invoke SpecRail with `--mode fast`; deterministic classification escalates material/risky work back to normal controls.',
  '',
  'For every delivery request, open and follow `$HOME/.agents/skills/ai-flow/SKILL.md`, using the absolute launcher `$HOME/.local/bin/specrail`. That skill is the complete workflow contract. `specrail next` failure blocks routing; readiness diagnostics never replace it.',
  '',
  'At approval gates use a stable session token and the exact SpecRail interaction; never invent request_user_input. For visual gates, host_actions means show the complete Review Bundle, execute exact actions, record actual outcomes with presentationDigest/action ID, then call next. Required visuals stay in conversation; local paths never count as shown evidence; unavailable required images block approval. Generated Cockpit HTML is not proof of display: record opened only after real open, otherwise expose openUrl and record offered. Never pre-acknowledge or reuse stale/cross-session/tampered acknowledgments. $visualize preparation leaves hostPresentation unverified. Frontend preview uses served presentation.previewUrl, not raw files. Shell localhost failure differs from Browser failure. Codex owns model/effort. Obey next.autonomy. At phase boundaries persist the native choice, end turn, then Continue/Resume enters before generic context reads. Never implement before specification approval or finish before final approval/delivery.'
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
export function restoreManagedInstallation(packageRoot:string,home:string):{bins:string[];skills:number;activationPath:string;configPath:string}{
  const root=path.resolve(packageRoot),targetHome=path.resolve(home);const bins=installLaunchers(root,targetHome);installSkills(root,path.join(targetHome,'.agents','skills'));installSkills(root,path.join(targetHome,'.codex','skills'));configureCodex(targetHome);
  return{bins,skills:SPEC_RAIL_SKILL_NAMES.length,activationPath:path.join(targetHome,'.codex','AGENTS.md'),configPath:path.join(targetHome,'.codex','config.toml')};
}
