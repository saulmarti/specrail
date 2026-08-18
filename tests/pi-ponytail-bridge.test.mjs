import test from 'node:test';
import assert from 'node:assert/strict';
import specRailPonytailBridge from '../extensions/specrail-ponytail-bridge.js';

function harness(entries=[]) {
  const handlers=new Map();
  const appended=[];
  const pi={
    on(name,handler){handlers.set(name,handler);},
    appendEntry(type,data){appended.push({type:'custom',customType:type,data});entries.push({type:'custom',customType:type,data});},
  };
  const ctx={sessionManager:{getBranch(){return entries;}}};
  specRailPonytailBridge(pi);
  return{handlers,appended,ctx};
}

async function withDefault(mode,fn){
  const before=process.env.PONYTAIL_DEFAULT_MODE;
  process.env.PONYTAIL_DEFAULT_MODE=mode;
  try{return await fn();}finally{if(before===undefined)delete process.env.PONYTAIL_DEFAULT_MODE;else process.env.PONYTAIL_DEFAULT_MODE=before;}
}

test('bridge materializes Ponytail official default full so SpecRail does not report it unavailable',async()=>{
  await withDefault('full',async()=>{
    const {handlers,appended,ctx}=harness();
    await handlers.get('session_start')({},ctx);
    assert.deepEqual(appended,[{type:'custom',customType:'ponytail-mode',data:{mode:'full',source:'specrail-official-ponytail-default-bridge'}}]);
  });
});

test('bridge preserves explicit Ponytail session mode instead of overwriting it',async()=>{
  await withDefault('full',async()=>{
    const entries=[{type:'custom',customType:'ponytail-mode',data:{mode:'lite'}}];
    const {handlers,appended,ctx}=harness(entries);
    await handlers.get('session_start')({},ctx);
    assert.deepEqual(appended,[]);
  });
});

test('bridge reflects a non-full official default so SpecRail still fails closed',async()=>{
  await withDefault('off',async()=>{
    const {handlers,appended,ctx}=harness();
    await handlers.get('session_start')({},ctx);
    assert.equal(appended[0]?.data?.mode,'off');
  });
});
