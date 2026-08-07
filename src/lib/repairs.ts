import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findTask, loadTask } from './task.js';
import { loadProjectConfig } from './project.js';
import type { RepairState } from './types.js';
function file(root:string,id:string){return path.join(path.resolve(root),'.ai','runtime','repairs',`${id}.json`);}
function limitFor(root:string,id:string){const task=loadTask(findTask(root,id)),config=loadProjectConfig(root),defaults:{[k:string]:number}={fast:2,standard:3,rigorous:4};return Number((config.repairs as any)?.profiles?.[task.meta.execution_profile]??defaults[task.meta.execution_profile]??3);}
export function repairStatus(root:string,id:string):RepairState{const target=file(root,id);if(existsSync(target))return JSON.parse(readFileSync(target,'utf8'));return{taskId:id,attempts:{},limit:limitFor(root,id),exhausted:false,history:[]};}
export function registerRepairAttempt(root:string,id:string,phase:string,reason:string):RepairState{const state=repairStatus(root,id),attempt=(state.attempts[phase]||0)+1;state.attempts[phase]=attempt;state.history.push({at:new Date().toISOString(),phase,reason,attempt});state.exhausted=Object.values(state.attempts).reduce((sum,value)=>sum+value,0)>=state.limit;mkdirSync(path.dirname(file(root,id)),{recursive:true});writeFileSync(file(root,id),`${JSON.stringify(state,null,2)}\n`);return state;}
export function resetRepairBudget(root:string,id:string,phase?:string):RepairState{const state=repairStatus(root,id);if(phase)delete state.attempts[phase];else state.attempts={};state.exhausted=false;writeFileSync(file(root,id),`${JSON.stringify(state,null,2)}\n`);return state;}
