import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { NativeInteraction } from './types.js';

export interface TaskLease {
  taskId:string;
  owner:string;
  phase:string;
  acquiredAt:string;
  heartbeatAt:string;
  expiresAt:string;
}
export interface LeaseOptions {sessionId?:string|undefined;ttlMs?:number|undefined;phase?:string;force?:boolean}
export interface LeaseStatus {
  active:boolean;
  expired?:boolean;
  conflict:boolean;
  owner:string|null;
  session:string;
  lease?:TaskLease;
}
function now(): string {return new Date().toISOString();}
function leaseFile(root:string,id:string): string {return path.join(path.resolve(root),'.ai','runtime','leases',`${id}.json`);}
function lockDir(root:string,id:string): string {return `${leaseFile(root,id)}.lock`;}
function defaultSession(): string {return process.env.AI_FLOW_SESSION_ID||process.env.CODEX_THREAD_ID||process.env.CODEX_SESSION_ID||process.env.CHATGPT_THREAD_ID||`local:${os.userInfo().username}`;}
function sleep(ms:number): void {const buffer=new SharedArrayBuffer(4);Atomics.wait(new Int32Array(buffer),0,0,ms);}
function isErrno(error:unknown): error is NodeJS.ErrnoException {return error instanceof Error;}
function withMutex<T>(root:string,id:string,fn:()=>T): T {
 const lock=lockDir(root,id);mkdirSync(path.dirname(lock),{recursive:true});
 for(let attempt=0;attempt<100;attempt++){
  try{mkdirSync(lock);break;}catch(error){if(!isErrno(error)||error.code!=='EEXIST')throw error;try{if(Date.now()-statSync(lock).mtimeMs>10000)rmSync(lock,{recursive:true,force:true});}catch{/* best effort */}if(attempt===99)throw new Error(`Could not acquire lease mutex for ${id}`);sleep(5);}
 }
 try{return fn();}finally{rmSync(lock,{recursive:true,force:true});}
}
function read(root:string,id:string): TaskLease|null {const file=leaseFile(root,id);if(!existsSync(file))return null;try{return JSON.parse(readFileSync(file,'utf8')) as TaskLease;}catch{return null;}}
function write(root:string,id:string,lease:TaskLease): TaskLease {const file=leaseFile(root,id),tmp=`${file}.${process.pid}.${Date.now()}.tmp`;mkdirSync(path.dirname(file),{recursive:true});writeFileSync(tmp,`${JSON.stringify(lease,null,2)}\n`);renameSync(tmp,file);return lease;}
function expired(lease:TaskLease|null): boolean {return !lease||Date.parse(lease.expiresAt)<=Date.now();}
export function leaseStatus(root:string,id:string,sessionId?:string): LeaseStatus {
 const lease=read(root,id),session=sessionId||defaultSession();
 if(!lease)return{active:false,conflict:false,owner:null,session};
 if(expired(lease))return{active:false,expired:true,conflict:false,owner:lease.owner,session,lease};
 return{active:true,expired:false,conflict:lease.owner!==session,owner:lease.owner,session,lease};
}
export function acquireTaskLease(root:string,id:string,{sessionId,ttlMs=30*60*1000,phase='execution',force=false}:LeaseOptions={}): TaskLease {
 return withMutex(root,id,()=>{const owner=sessionId||defaultSession(),current=read(root,id);if(current&&!expired(current)&&current.owner!==owner&&!force)throw new Error(`Task is locked by another session: ${current.owner}`);const stamp=now();return write(root,id,{taskId:id,owner,phase,acquiredAt:current?.owner===owner?current.acquiredAt||stamp:stamp,heartbeatAt:stamp,expiresAt:new Date(Date.now()+ttlMs).toISOString()});});
}
export function assertTaskLease(root:string,id:string,{sessionId,ttlMs}:LeaseOptions={}): TaskLease {const status=leaseStatus(root,id,sessionId);if(status.conflict)throw new Error(`Task is locked by another session: ${status.owner}`);return acquireTaskLease(root,id,{sessionId,ttlMs,phase:status.lease?.phase||'execution'});}
export function takeTaskLease(root:string,id:string,{sessionId,ttlMs}:LeaseOptions={}): TaskLease {return acquireTaskLease(root,id,{sessionId,ttlMs,force:true,phase:'taken-over'});}
export function releaseTaskLease(root:string,id:string,{sessionId,force=false}:LeaseOptions={}): {released:boolean;owner?:string} {
 return withMutex(root,id,()=>{const current=read(root,id);if(!current)return{released:false};const owner=sessionId||defaultSession();if(!force&&!expired(current)&&current.owner!==owner)throw new Error(`Task is locked by another session: ${current.owner}`);rmSync(leaseFile(root,id),{force:true});return{released:true,owner:current.owner};});
}
export function leaseConflictInteraction(root:string,id:string,sessionId?:string,title=id): NativeInteraction|null {
 const status=leaseStatus(root,id,sessionId);if(!status.conflict)return null;
 return{tool:'request_user_input',questions:[{id:'task-lease',header:'Sesión activa',question:`${id} — ${title} ya está siendo ejecutada por otra sesión.`,options:[{label:'Ver estado',description:'Mantener el lease actual y revisar la fase'},{label:'Tomar control',description:'Transferir el lease a este chat'},{label:'Cancelar',description:'No modificar la tarea'}],isOther:false}]};
}
