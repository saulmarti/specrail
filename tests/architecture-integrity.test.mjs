import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function sourceFiles(dir){
  const out=[];
  for(const name of readdirSync(dir)){
    const file=path.join(dir,name),stat=statSync(file);
    if(stat.isDirectory()) out.push(...sourceFiles(file));
    else if(name.endsWith('.ts')) out.push(file);
  }
  return out;
}
function localImports(file,known){
  const source=readFileSync(file,'utf8'),out=[];
  const pattern=/\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  for(const match of source.matchAll(pattern)){
    const spec=match[1];
    let resolved=path.resolve(path.dirname(file),spec.replace(/\.js$/u,'.ts'));
    if(!known.has(resolved)&&known.has(path.join(resolved,'index.ts'))) resolved=path.join(resolved,'index.ts');
    if(known.has(resolved)) out.push(resolved);
  }
  return out;
}
function cycles(graph){
  const visiting=new Set(),visited=new Set(),stack=[],found=[];
  function visit(node){
    if(visiting.has(node)){
      const start=stack.indexOf(node);found.push([...stack.slice(start),node]);return;
    }
    if(visited.has(node)) return;
    visiting.add(node);stack.push(node);
    for(const dep of graph.get(node)||[]) visit(dep);
    stack.pop();visiting.delete(node);visited.add(node);
  }
  for(const node of graph.keys()) visit(node);
  return found;
}

test('src/lib ESM dependency graph remains acyclic so governance modules cannot reintroduce initialization-order coupling',()=>{
  const lib=path.resolve(process.cwd(),'src','lib'),files=sourceFiles(lib),known=new Set(files);
  const graph=new Map(files.map(file=>[file,localImports(file,known)]));
  const found=cycles(graph).map(cycle=>cycle.map(file=>path.relative(lib,file)).join(' -> '));
  assert.deepEqual(found,[],`Circular src/lib dependencies:\n${found.join('\n')}`);
});
