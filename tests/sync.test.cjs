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
