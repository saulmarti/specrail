import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TaskDocument } from './types.js';

const SNAPSHOT_SKIP = new Set(['.git','.ai','.codegraph','.ai-flow-worktrees','node_modules','dist','build','.next','coverage','.turbo','.cache']);
type Snapshot = Record<string,string>;

function stable(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
  const record=value as Record<string,unknown>;
  return`{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
}
function digest(value:unknown):string{return createHash('sha256').update(stable(value)).digest('hex');}
function workspace(root:string,task:TaskDocument){return task.meta.worktree_path&&existsSync(task.meta.worktree_path)?task.meta.worktree_path:path.resolve(root);}
function snapshotFile(root:string,taskId:string,revisionId:string){return path.join(path.resolve(root),'.ai','revisions',taskId,'.snapshots',`${revisionId}.json`);}
function relevant(name:string){const normalized=name.replace(/\\/g,'/').replace(/^\.\//,'');return Boolean(normalized)&&!normalized.startsWith('.ai/')&&!normalized.startsWith('.codegraph/')&&!normalized.startsWith('.ai-flow-worktrees/');}
function snapshot(root:string):Snapshot {
  const base=path.resolve(root),out:Snapshot={};
  function walk(dir:string,rel=''){
    for(const entry of readdirSync(dir,{withFileTypes:true})){
      if(SNAPSHOT_SKIP.has(entry.name))continue;
      const childRel=rel?`${rel}/${entry.name}`:entry.name,absolute=path.join(dir,entry.name);
      if(entry.isDirectory()){walk(absolute,childRel);continue;}
      try{
        const stat=lstatSync(absolute),mode=(stat.mode&0o777).toString(8),key=childRel.replace(/\\/g,'/');
        if(!relevant(key))continue;
        if(stat.isSymbolicLink())out[key]=`symlink:${readlinkSync(absolute)}|mode:${mode}`;
        else if(stat.isFile())out[key]=`${createHash('sha256').update(readFileSync(absolute)).digest('hex')}|mode:${mode}`;
      }catch{}
    }
  }
  walk(base);return out;
}

export function captureRevisionBaseline(root:string,task:TaskDocument,revisionId:string):{digest:string;fileCount:number}{
  const value=snapshot(workspace(root,task)),target=snapshotFile(root,task.meta.id,revisionId);
  mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,`${JSON.stringify(value,null,2)}\n`);
  return{digest:digest(value),fileCount:Object.keys(value).length};
}

export function revisionDeltaFiles(root:string,task:TaskDocument,revisionId:string):string[]|null {
  const target=snapshotFile(root,task.meta.id,revisionId);if(!existsSync(target))return null;
  const before=JSON.parse(readFileSync(target,'utf8')) as Snapshot,after=snapshot(workspace(root,task));
  return [...new Set([...Object.keys(before),...Object.keys(after)].filter(name=>before[name]!==after[name]).filter(relevant))].sort();
}

export function revisionBaselineDigestValid(root:string,taskId:string,revisionId:string,expected:string|null|undefined):boolean {
  if(!expected)return false;const target=snapshotFile(root,taskId,revisionId);if(!existsSync(target))return false;
  try{return digest(JSON.parse(readFileSync(target,'utf8')) as Snapshot)===expected;}catch{return false;}
}
