import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root=path.resolve('dist/src');
const files=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile()&&entry.name.endsWith('.js'))files.push(file);}}
if(!existsSync(root))throw new Error('dist/src does not exist; run TypeScript build first');
walk(root);
const hash=createHash('sha256');
for(const file of files){const rel=path.relative(root,file).split(path.sep).join('/');hash.update(rel);hash.update('\0');hash.update(readFileSync(file));hash.update('\0');}
writeFileSync(path.resolve('dist/.specrail-build-id'),`${hash.digest('hex')}\n`);
