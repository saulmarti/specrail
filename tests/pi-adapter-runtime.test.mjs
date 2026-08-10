import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot=process.cwd();
const packageVersion=JSON.parse(readFileSync(path.join(repoRoot,'package.json'),'utf8')).version;

function typeboxStub(root){
  const dir=path.join(root,'node_modules','typebox');mkdirSync(dir,{recursive:true});
  writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'typebox',version:'0.0.0-test',type:'module',exports:'./index.js'}));
  writeFileSync(path.join(dir,'index.js'),`const schema=(type,extra={})=>({type,...extra});\nexport const Type={String:(o={})=>schema('string',o),Integer:(o={})=>schema('integer',o),Boolean:(o={})=>schema('boolean',o),Optional:(v)=>v,Array:(items,o={})=>schema('array',{items,...o}),Object:(properties,o={})=>schema('object',{properties,...o})};\n`);
}

async function loadAdapter({ codegraphResult }={}){
  const pkgRoot=mkdtempSync(path.join(tmpdir(),'specrail-pi-adapter-'));
  mkdirSync(path.join(pkgRoot,'extensions'),{recursive:true});
  cpSync(path.join(repoRoot,'extensions','specrail.js'),path.join(pkgRoot,'extensions','specrail.js'));
  cpSync(path.join(repoRoot,'scripts'),path.join(pkgRoot,'scripts'),{recursive:true});
  cpSync(path.join(repoRoot,'skills'),path.join(pkgRoot,'skills'),{recursive:true});
  cpSync(path.join(repoRoot,'dist'),path.join(pkgRoot,'dist'),{recursive:true});
  cpSync(path.join(repoRoot,'package.json'),path.join(pkgRoot,'package.json'));
  typeboxStub(pkgRoot);
  const tools=new Map(),commands=new Map(),events=new Map();
  const pi={
    on(name,handler){events.set(name,handler);},
    registerTool(def){tools.set(def.name,def);},
    registerCommand(name,def){commands.set(name,def);},
    async exec(command,args,options={}){
      if(command==='codegraph' || command===process.env.AI_FLOW_CODEGRAPH_COMMAND){
        return codegraphResult ?? {code:0,killed:false,stdout:'graph context',stderr:''};
      }
      const result=spawnSync(command,args,{cwd:options.cwd||repoRoot,encoding:'utf8',timeout:options.timeout});
      return {code:result.status,killed:Boolean(result.signal),stdout:String(result.stdout||''),stderr:String(result.stderr||result.error?.message||'')};
    }
  };
  const mod=await import(`${pathToFileURL(path.join(pkgRoot,'extensions','specrail.js')).href}?t=${Date.now()}-${Math.random()}`);
  mod.default(pi);
  return{pkgRoot,tools,commands,events,mod};
}

function context(cwd,{hasUI=true,mode='interactive',sessionId='pi-session-123',select,input}={}){
  return{
    cwd,hasUI,mode,
    sessionManager:{getSessionId:()=>sessionId,getSessionFile:()=>'/tmp/pi-parent.jsonl'},
    ui:{
      select:select|| (async (_title,options)=>options[0]),
      input:input|| (async ()=> 'custom answer'),
      notify:()=>{}
    }
  };
}

test('Pi adapter executes packaged SpecRail through its Bash shebang and throws on non-zero CLI exits',async()=>{
  const {tools}=await loadAdapter();const cli=tools.get('specrail_cli');assert.ok(cli);
  assert.equal(cli.executionMode,'sequential');
  const cwd=mkdtempSync(path.join(tmpdir(),'specrail-pi-cwd-'));
  const ok=await cli.execute('call-1',{args:['--version']},undefined,undefined,context(cwd));
  assert.equal(ok.details.code,0);assert.equal(ok.content[0].text.trim(),packageVersion);
  await assert.rejects(()=>cli.execute('call-2',{args:['status','TASK-9999','--root',cwd]},undefined,undefined,context(cwd)),/SpecRail project not initialized|No \.ai project found|not found|Could not find|Expected/i);
});


test('Pi native package can load every deterministic specialist without a managed .agents path',async()=>{
  const {tools}=await loadAdapter();const skill=tools.get('specrail_skill');assert.ok(skill);
  const orchestrator=await skill.execute('skill-0',{name:'ai-flow'});
  assert.match(orchestrator.content[0].text,/^---[\s\S]*name: ai-flow/m);assert.equal(orchestrator.details.source,'packaged-specrail-skill');
  const qa=await skill.execute('skill-1',{name:'ai-flow-qa-engineer'});
  assert.match(qa.content[0].text,/^---[\s\S]*name: ai-flow-qa-engineer/m);assert.equal(qa.details.source,'packaged-specrail-skill');
  await assert.rejects(()=>skill.execute('skill-2',{name:'../../arbitrary'}),/Unknown packaged SpecRail skill/);
});

test('Pi adapter marks CodeGraph transport failures as tool failures and leaves read-only graph calls parallel',async()=>{
  const {tools}=await loadAdapter({codegraphResult:{code:7,killed:false,stdout:'',stderr:'index unavailable'}});const graph=tools.get('specrail_codegraph');assert.ok(graph);
  assert.notEqual(graph.executionMode,'sequential');
  const cwd=mkdtempSync(path.join(tmpdir(),'specrail-pi-cwd-'));
  await assert.rejects(()=>graph.execute('cg-1',{query:'impact of UserService'},undefined,undefined,context(cwd)),/index unavailable/);
});

test('Pi human gate is sequential, uses native UI exactly, and fails closed headlessly',async()=>{
  const {tools}=await loadAdapter();const ask=tools.get('request_user_input');assert.equal(ask.executionMode,'sequential');
  const cwd=mkdtempSync(path.join(tmpdir(),'specrail-pi-cwd-'));let seen=[];
  const ctx=context(cwd,{select:async(title,options)=>{seen.push({title,options});return options[1];}});
  const result=await ask.execute('q-1',{questions:[{id:'decision',header:'Approval',question:'Choose',options:[{label:'Approve'},{label:'Revise',description:'Return to spec'}],isOther:false}]},undefined,undefined,ctx);
  assert.deepEqual(result.details.answers,[{id:'decision',label:'Revise'}]);assert.equal(seen.length,1);assert.match(seen[0].options[1],/^2\. Revise/);
  await assert.rejects(()=>ask.execute('q-2',{questions:[{id:'decision',question:'Choose',options:[{label:'Approve'}]}]},undefined,undefined,context(cwd,{hasUI:false,mode:'print'})),/requires an interactive Pi UI/);
});

test('Pi activation honors delivery, continuation, fast, bypass, and managed-context deduplication',async()=>{
  const {events}=await loadAdapter();const before=events.get('before_agent_start');assert.ok(before);
  const base={systemPrompt:'base',systemPromptOptions:{contextFiles:[]}};
  assert.equal(await before({...base,prompt:'Explain this function'}),undefined);
  assert.equal(await before({...base,prompt:'Sin SpecRail: fix this bug'}),undefined);
  const delivery=await before({...base,prompt:'Implement login'});
  assert.match(delivery.systemPrompt,/SpecRail Pi adapter is active/);
  assert.match(delivery.systemPrompt,/specrail_skill.*ai-flow/i);
  assert.match((await before({...base,prompt:'SpecRail Fast: cambia el copy'})).systemPrompt,/SpecRail Pi adapter is active/);
  assert.match((await before({...base,prompt:'Continue TASK-0007'})).systemPrompt,/SpecRail Pi adapter is active/);
  const managed={...base,systemPromptOptions:{contextFiles:[{content:'<!-- AI-FLOW:PI-BEGIN --> managed'}]}};
  assert.equal(await before({...managed,prompt:'Implement login'}),undefined);
});

test('Pi host context returns the real session and fresh handoff replaces the session with Continue TASK',async()=>{
  const {tools,commands}=await loadAdapter();const cwd=mkdtempSync(path.join(tmpdir(),'specrail-pi-cwd-'));
  const host=await tools.get('specrail_host_context').execute('h-1',{},undefined,undefined,context(cwd,{sessionId:'pi-real-session'}));
  assert.equal(host.details.sessionId,'pi-real-session');assert.equal(host.details.host,'pi');
  let sent=null,optionsSeen=null;
  const cmdCtx={...context(cwd),newSession:async options=>{optionsSeen=options;await options.withSession({sendUserMessage:async message=>{sent=message;}});return{cancelled:false};}};
  await commands.get('specrail-handoff').handler('TASK-0042',cmdCtx);
  assert.equal(sent,'Continue TASK-0042');assert.equal(optionsSeen.parentSession,'/tmp/pi-parent.jsonl');
});
