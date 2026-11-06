const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const S=require('../js/storage.js');
const C=fs.existsSync(path.join(__dirname,'../js/sync.js'))?require('../js/sync.js'):{};
function fixture(initial={}){
  const state={progress:{},learning:S.normalizeLearning({}),activity:[],sync:{code:'vocab-disposable-test',lastSync:0},...initial};
  const remote=new Map();
  const fetch=async(url,options={})=>{
    if(options.method==='POST'){
      const form=new URLSearchParams(options.body);remote.set(form.get('key'),JSON.parse(form.get('value')));
      return {ok:true,status:200,text:async()=>'{"status":1}'};
    }
    const key=decodeURIComponent(url.split('/').pop());
    return {ok:true,status:200,text:async()=>remote.has(key)?JSON.stringify(remote.get(key)):''};
  };
  return {state,remote,fetch,options:{fetch,getState:()=>state,applyRemote:value=>Object.assign(state,value)}};
}
test('auxiliary metadata key fits every valid original code and is deterministic',async()=>{
  assert.equal(typeof S.metadataKey,'function');
  const key=await S.metadataKey('a'.repeat(60));
  assert.match(key,/^[A-Za-z0-9_-]{6,60}$/);
  assert.equal(key,await S.metadataKey('a'.repeat(60)));
  assert.notEqual(key,await S.metadataKey('b'.repeat(60)));
});
test('primary sync keeps the original format and merges latest local progress',async()=>{
  assert.equal(typeof C.createClient,'function');
  const f=fixture({progress:{'g01:x':{s:'hard',t:10}}});
  f.remote.set(f.state.sync.code,{v:1,words:{'g01:x':{s:'mastered',t:20}},updatedAt:20});
  const client=C.createClient(f.options);const result=await client.sync(true);client.cancelScheduled();
  assert.equal(result.ok,true);assert.equal(f.state.progress['g01:x'].s,'mastered');
  const primary=f.remote.get(f.state.sync.code);
  assert.equal(primary.v,1);assert.deepEqual(primary.words,{'g01:x':{s:'mastered',t:20}});
  assert.equal('learning' in primary,false);
});
test('edits during an in-flight write are flushed rather than silently dropped',async()=>{
  assert.equal(typeof C.createClient,'function');
  const f=fixture({progress:{'g01:x':{s:'hard',t:10}}});
  let release,started;const waiting=new Promise(r=>{started=r;}),hold=new Promise(r=>{release=r;});let intercepted=false;
  const original=f.options.fetch;
  f.options.fetch=async(url,options)=>{if(options.method==='POST'&&!intercepted){intercepted=true;started();await hold;}return original(url,options);};
  const client=C.createClient(f.options),work=client.sync(false);
  await waiting;f.state.progress['g01:x']={s:'mastered',t:30};client.markDirty();release();await work;client.cancelScheduled();
  assert.deepEqual(f.remote.get(f.state.sync.code).words['g01:x'],{s:'mastered',t:30});
});
test('cancelled comparison favorites are not resurrected by an older auxiliary payload',async()=>{
  assert.equal(typeof C.createClient,'function');
  const f=fixture(),item={gid:'g01',sourceWord:'perceive',kind:'synonym',word:'sense',note:'凭直觉感到',active:true,updatedAt:1};
  const key=S.comparisonKey(item);f.state.learning.comparisons[key]={...item,active:false,updatedAt:2};
  const auxiliary=await S.metadataKey(f.state.sync.code);
  f.remote.set(auxiliary,{v:1,learning:{comparisons:{[key]:item}},activity:[]});
  const client=C.createClient(f.options);await client.sync(true);client.cancelScheduled();
  assert.equal(f.remote.get(auxiliary).learning.comparisons[key].active,false);
});
test('automatic pushes merge other-device favorites before writing their auxiliary payload',async()=>{
  const f=fixture(),a={gid:'g01',sourceWord:'perceive',kind:'synonym',word:'sense',note:'直觉',active:true,updatedAt:1};
  const b={...a,word:'discern',note:'辨识',updatedAt:2};
  f.state.learning.comparisons[S.comparisonKey(b)]=b;
  const auxiliary=await S.metadataKey(f.state.sync.code);
  f.remote.set(auxiliary,{v:1,learning:{comparisons:{[S.comparisonKey(a)]:a}},activity:[]});
  const client=C.createClient(f.options);await client.sync(false);client.cancelScheduled();
  assert.equal(Object.keys(f.remote.get(auxiliary).learning.comparisons).length,2);
});
test('clearing an existing marked word is not undone by the merge-before-push cycle',async()=>{
  const f=fixture({learning:{...S.normalizeLearning({}),clearedProgress:{'g01:x':20}}});
  f.remote.set(f.state.sync.code,{v:1,words:{'g01:x':{s:'hard',t:10}},updatedAt:10});
  const client=C.createClient(f.options);await client.sync(false);client.cancelScheduled();
  assert.equal(Object.hasOwn(f.state.progress,'g01:x'),false);
  assert.equal(Object.hasOwn(f.remote.get(f.state.sync.code).words,'g01:x'),false);
});
test('a sync announces its active state before a slow first read completes',async()=>{
  const f=fixture(),states=[];let release;const gate=new Promise(resolve=>{release=resolve;});
  const original=f.options.fetch;f.options.fetch=async(url,options)=>{if(options.method!=='POST')await gate;return original(url,options);};
  f.options.onState=value=>states.push(value.status);
  const client=C.createClient(f.options),pending=client.sync(true);
  await new Promise(resolve=>setTimeout(resolve,20));
  const announced=states.includes('syncing');release();await pending;client.cancelScheduled();
  assert.equal(announced,true,'a waiting client needs an explicit sync-in-progress state');
});
test('pairing an existing code verifies cloud presence without creating empty records',async()=>{
  const f=fixture(),client=C.createClient(f.options);
  assert.equal(typeof client.verifyCode,'function');
  const missing=await client.verifyCode('vocab-not-created');
  assert.equal(missing.ok,false);assert.equal(missing.notFound,true);assert.equal(f.remote.size,0);
  const known='vocab-known-test';
  f.remote.set(known,{v:1,words:{'g01:x':{s:'hard',t:1}},updatedAt:1});
  assert.equal((await client.verifyCode(known)).ok,true);
  assert.equal(f.state.sync.code,'vocab-disposable-test','verification must not silently rebind');
  client.cancelScheduled();
});
test('pairing accepts a valid auxiliary-only collection and does not mistake network failure for a new empty account',async()=>{
  const f=fixture(),client=C.createClient(f.options);assert.equal(typeof client.verifyCode,'function');
  const code='vocab-auxiliary-only',key=await S.metadataKey(code);
  f.remote.set(key,{v:1,learning:{comparisons:{}},activity:[]});
  assert.equal((await client.verifyCode(code)).ok,true);
  const failed=C.createClient({...f.options,fetch:async()=>{throw Error('offline');}});
  const result=await failed.verifyCode('vocab-network-failed');
  assert.equal(result.ok,false);assert.notEqual(result.notFound,true);
  assert.equal(f.remote.size,1);client.cancelScheduled();failed.cancelScheduled();
});
test('an incompatible primary cannot be hidden by valid auxiliary metadata during pairing verification',async()=>{
  const f=fixture(),code='vocab-incompatible-primary',client=C.createClient(f.options);
  f.remote.set(code,{v:2,words:{},updatedAt:1});
  f.remote.set(await S.metadataKey(code),{v:1,learning:{comparisons:{}},activity:[]});
  const result=await client.verifyCode(code);
  assert.equal(result.ok,false);assert.match(result.error,/格式|兼容/);
  assert.equal(f.state.sync.code,'vocab-disposable-test');
  assert.equal(f.remote.size,2);client.cancelScheduled();
});
test('a failed primary read cannot be treated as safe pairing just because metadata is readable',async()=>{
  const f=fixture(),code='vocab-primary-unreadable',auxiliary=await S.metadataKey(code);
  f.remote.set(auxiliary,{v:1,learning:{comparisons:{}},activity:[]});
  const original=f.options.fetch;f.options.fetch=async(url,options)=>{if(!options?.method?.includes('POST')&&url.endsWith('/'+code))throw Error('offline');return original(url,options);};
  const client=C.createClient(f.options),result=await client.verifyCode(code);
  assert.equal(result.ok,false);assert.notEqual(result.notFound,true);client.cancelScheduled();
});
