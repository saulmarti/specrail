#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const home=path.resolve(process.env.AI_FLOW_HOME||os.homedir());
const install=path.join(home,'.ai-flow');

function copyRuntimeDependency(targetRoot,parts){
  const source=path.join(root,'node_modules',...parts);if(!existsSync(source))throw new Error(`Required SpecRail dependency is missing: ${source}. Reinstall @saulmarti/specrail.`);
  const target=path.join(targetRoot,'node_modules',...parts);mkdirSync(path.dirname(target),{recursive:true});rmSync(target,{recursive:true,force:true});cpSync(source,target,{recursive:true});
}
function copyPackage(){
  const same=path.resolve(root)===path.resolve(install);
  if(!same){
    rmSync(install,{recursive:true,force:true});mkdirSync(install,{recursive:true});
    for(const item of ['dist','skills','extensions','docs','evals','scripts','plugin.json','README.md','ROADMAP.md','AGENTS.md','package.json','LICENSE','CHANGELOG.md']){const source=path.join(root,item);if(existsSync(source))cpSync(source,path.join(install,item),{recursive:true});}
    copyRuntimeDependency(install,['typebox']);
    copyRuntimeDependency(install,['@dietrichgebert','ponytail']);
  }
  return same?root:install;
}
async function choosePiInstallation(){
  const args=new Set(process.argv.slice(2));
  if(args.has('--pi')&&args.has('--no-pi'))throw new Error('Choose only one Pi option: --pi or --no-pi.');
  if(args.has('--pi'))return true;
  if(args.has('--no-pi'))return false;
  if(!process.stdin.isTTY||!process.stdout.isTTY)return false;
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{
    const answer=(await rl.question('¿Instalar también la integración de SpecRail para Pi? [s/N] ')).trim().toLowerCase();
    return ['s','si','sí','y','yes'].includes(answer);
  }finally{rl.close();}
}

const installPi=await choosePiInstallation();
const packageRoot=copyPackage();
const managedUrl=pathToFileURL(path.join(packageRoot,'dist','src','lib','managed-installation.js')).href;
const {restoreManagedInstallation}=await import(managedUrl);
const result=restoreManagedInstallation(packageRoot,home,{installPi});
console.log(`SpecRail installed: ${result.bins.join(', ')}`);
console.log(`Official Ponytail bundled: ${result.ponytailRoot} (${result.ponytailSkills} skills).`);
console.log('SpecRail activation installed for Codex repository-delivery requests.');
console.log('Codex native request_user_input was enabled in ~/.codex/config.toml.');
if(result.piInstalled){
  console.log(`Pi integration installed. Package registered in ${result.piSettingsPath}: ${result.piPackageSource}`);
  console.log(`Pi adapter source: ${result.piExtensionPath}`);
}else console.log('Pi integration skipped. Re-run `specrail install --pi` to add it later.');
console.log('Reload/restart the active coding-agent host before the first managed request.');
