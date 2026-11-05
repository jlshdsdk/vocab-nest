const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const base = path.join(__dirname, '..');
const file = path.join(base, 'js/data-loader.js');
const D = fs.existsSync(file) ? require(file) : {};
const group = {id:'g01',name:'第一组',words:[{word:'perceive',definition:'察觉',examples:[{en:'We perceive a change.',zh:'察觉变化'}],collocations:['perceive risk']}]};
const manifest = {version:'fixture',totalWords:1,groups:[{id:'g01',name:'第一组',count:1,words:['perceive'],file:'data/groups/g01.json'}]};
test('split dictionary preserves every original field across all 134 groups', () => {
  const generator = path.join(base, 'tools/split-data.cjs');
  assert.equal(fs.existsSync(generator), true, 'generator is not implemented');
  execFileSync(process.execPath,[generator],{cwd:base});
  const ctx = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(base,'js/data.js'),'utf8')+';window.canonical=GROUPS;',ctx);
  const canonical = JSON.parse(JSON.stringify(ctx.window.canonical));
  const actualManifest = JSON.parse(fs.readFileSync(path.join(base,'data/manifest.json'),'utf8'));
  assert.equal(actualManifest.groups.length,134);
  assert.equal(actualManifest.totalWords,2679);
  for (const g of canonical) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(base,'data/groups',g.id+'.json'),'utf8')),g);
  const index = JSON.parse(fs.readFileSync(path.join(base,'data/search-index.json'),'utf8'));
  assert.equal(index.length,2679);
  assert.ok(index.find(x=>x.word==='perceive').text.includes('察觉'));
});
test('manifest and group requests are deduplicated and return original objects', async () => {
  assert.equal(typeof D.createLoader,'function');
  const calls = [];
  const data = D.createLoader({fetch:async url => {calls.push(url);return {ok:true,json:async()=>url.includes('manifest')?manifest:group};}});
  const values = await Promise.all([data.loadGroup('g01'),data.loadGroup('g01')]);
  assert.deepEqual(values,[group,group]);
  assert.equal(calls.filter(x=>x.includes('g01.json')).length,1);
  assert.equal(calls.some(x=>x.includes('search-index') || x.includes('js/data.js')),false);
});
test('a failed chunk is retryable and missing groups report a useful error', async () => {
  assert.equal(typeof D.createLoader,'function');
  let fail = true;
  const data = D.createLoader({fetch:async url=>({ok:!(!url.includes('manifest')&&fail),status:503,json:async()=>url.includes('manifest')?manifest:group})});
  await assert.rejects(data.loadGroup('g01'),/加载|503/);
  fail=false;
  assert.deepEqual(await data.loadGroup('g01'),group);
  await assert.rejects(data.loadGroup('missing'),/不存在|找到/);
});
test('an existing legacy GROUPS dictionary remains usable when manifest cannot load', async () => {
  assert.equal(typeof D.createLoader,'function');
  const data = D.createLoader({fetch:async()=>{throw Error('offline');},legacy:()=>[group]});
  assert.equal((await data.loadManifest()).totalWords,1);
  assert.deepEqual(await data.loadGroup('g01'),group);
  assert.ok((await data.loadSearchIndex())[0].text.includes('perceive risk'));
});
test('search index is fetched only on demand, once per version', async () => {
  assert.equal(typeof D.createLoader,'function');
  let indexRequests=0;
  const data = D.createLoader({fetch:async url=>{if(url.includes('search-index'))indexRequests++;return {ok:true,json:async()=>url.includes('search-index')?[{gid:'g01',word:'perceive',text:'察觉'}]:manifest};}});
  await data.loadManifest();
  assert.equal(indexRequests,0);
  await Promise.all([data.loadSearchIndex(),data.loadSearchIndex()]);
  assert.equal(indexRequests,1);
});
test('a group loads only its small supplementary meanings and retries after failure',async()=>{
  let fail=true,requests=0;
  const definitions={gid:'g01',entries:{perceive:{definition:'察觉'},receive:{definition:'收到'}}};
  const data=D.createLoader({fetch:async url=>{
    if(url.includes('definitions')){requests++;return {ok:!fail,status:503,json:async()=>definitions};}
    return {ok:true,json:async()=>manifest};
  }});
  assert.equal(typeof data.loadDefinitions,'function');
  await assert.rejects(data.loadDefinitions('g01'));
  fail=false;
  assert.deepEqual(await data.loadDefinitions('g01'),definitions.entries);
  await data.loadDefinitions('g01');assert.equal(requests,2);
});
