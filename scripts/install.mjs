#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const home=path.resolve(process.env.AI_FLOW_HOME||os.homedir());
const install=path.join(home,'.ai-flow');

function copyPackage(){
  const same=path.resolve(root)===path.resolve(install);
  if(!same){rmSync(install,{recursive:true,force:true});mkdirSync(install,{recursive:true});for(const item of ['dist','skills','docs','evals','scripts','plugin.json','README.md','ROADMAP.md','AGENTS.md','package.json','LICENSE','CHANGELOG.md']){const source=path.join(root,item);if(existsSync(source))cpSync(source,path.join(install,item),{recursive:true});}}
  return same?root:install;
}

const packageRoot=copyPackage();
const managedUrl=pathToFileURL(path.join(packageRoot,'dist','src','lib','managed-installation.js')).href;
const {restoreManagedInstallation}=await import(managedUrl);
const result=restoreManagedInstallation(packageRoot,home);
console.log(`SpecRail installed: ${result.bins.join(', ')}`);
console.log('Codex will apply SpecRail automatically to repository delivery requests after restart.');
console.log('Native request_user_input was enabled in ~/.codex/config.toml.');
