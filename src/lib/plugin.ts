import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const SCHEMA='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const ALLOWED=new Set(['$schema','name','version','description','author','homepage','repository','license','keywords','extensions']);
const NAME=/^(?=.{1,64}$)[a-z0-9](?!.*(?:--|\.\.))[a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/;

export interface AgentPluginValidation {
  valid:boolean;
  root:string;
  manifestPath:string;
  name:string|null;
  version:string|null;
  skills:string[];
  errors:string[];
  warnings:string[];
}

function within(root:string,target:string):boolean{
  const base=realpathSync(root),resolved=realpathSync(target);
  return resolved===base||resolved.startsWith(`${base}${path.sep}`);
}
function frontmatter(file:string):Record<string,string>{
  const text=readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  if(!text.startsWith('---\n'))return{};
  const end=text.indexOf('\n---\n',4);if(end<0)return{};
  const result:Record<string,string>={};
  for(const line of text.slice(4,end).split('\n')){const match=line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);if(match)result[match[1]!]=match[2]!.trim();}
  return result;
}

export function validateAgentPlugin(pluginRoot:string):AgentPluginValidation{
  const root=path.resolve(pluginRoot),manifestPath=path.join(root,'plugin.json'),errors:string[]=[],warnings:string[]=[],skills:string[]=[];
  let manifest:Record<string,unknown>={};
  if(!existsSync(manifestPath)||!statSync(manifestPath).isFile())errors.push('plugin.json is missing');
  else{
    try{const value=JSON.parse(readFileSync(manifestPath,'utf8')) as unknown;if(!value||typeof value!=='object'||Array.isArray(value))errors.push('plugin.json must contain an object');else manifest=value as Record<string,unknown>;}catch(error){errors.push(`plugin.json is invalid JSON: ${error instanceof Error?error.message:String(error)}`);}
  }
  for(const key of Object.keys(manifest))if(!ALLOWED.has(key))warnings.push(`Unknown portable manifest field ignored: ${key}`);
  if(manifest.$schema!==SCHEMA)errors.push(`plugin.json $schema must be ${SCHEMA}`);
  const name=typeof manifest.name==='string'?manifest.name:null;if(!name||!NAME.test(name))errors.push('plugin.json name violates Agent Plugins 1.0 constraints');
  const version=typeof manifest.version==='string'?manifest.version:null;if('version'in manifest&&!version)errors.push('plugin.json version must be a string');
  if('description'in manifest&&typeof manifest.description!=='string')errors.push('plugin.json description must be a string');
  if('license'in manifest&&typeof manifest.license!=='string')errors.push('plugin.json license must be a string');
  if('keywords'in manifest&&(!Array.isArray(manifest.keywords)||manifest.keywords.some(item=>typeof item!=='string')))errors.push('plugin.json keywords must be an array of strings');
  if('extensions'in manifest&&(manifest.extensions===null||typeof manifest.extensions!=='object'||Array.isArray(manifest.extensions)))warnings.push('plugin.json extensions is not an object and will be ignored');

  const skillsDir=path.join(root,'skills');
  if(existsSync(skillsDir)){
    if(!lstatSync(skillsDir).isDirectory())errors.push('skills must be a directory');
    else if(!within(root,skillsDir))errors.push('skills resolves outside plugin root');
    else for(const entry of readdirSync(skillsDir,{withFileTypes:true})){
      if(!entry.isDirectory())continue;
      const directory=path.join(skillsDir,entry.name),file=path.join(directory,'SKILL.md');
      if(!within(root,directory)){errors.push(`Skill ${entry.name} resolves outside plugin root`);continue;}
      if(!existsSync(file)||!statSync(file).isFile()){warnings.push(`Skill directory ${entry.name} has no SKILL.md`);continue;}
      if(!within(root,file)){errors.push(`Skill ${entry.name}/SKILL.md resolves outside plugin root`);continue;}
      const meta=frontmatter(file);
      if(meta.name!==entry.name)errors.push(`Skill ${entry.name} frontmatter name must match its directory`);
      if(!meta.description)errors.push(`Skill ${entry.name} requires a non-empty description`);
      skills.push(entry.name);
    }
  }
  return{valid:errors.length===0,root,manifestPath,name,version,skills:skills.sort(),errors,warnings};
}
