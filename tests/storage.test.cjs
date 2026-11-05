const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../js/storage.js');
const S = fs.existsSync(modulePath) ? require(modulePath) : {};
const legacy = {'g01:perceive': {s: 'hard', t: 1700000000000}, 'unloaded:unknown': {s: 'mastered', t: 9}};
function memory(values) {
  const data = {...values};
  return {getItem: key => data[key] ?? null, setItem: (key, value) => {data[key] = value;}, data};
}

test('legacy progress survives without needing the full word dictionary', () => {
  assert.equal(typeof S.normalizeProgress, 'function');
  assert.deepEqual(S.normalizeProgress(legacy), legacy);
});
test('newer per-word timestamp wins and equal timestamps keep local data', () => {
  assert.equal(typeof S.mergeProgress, 'function');
  assert.deepEqual(S.mergeProgress({'g01:x':{s:'hard',t:2}}, {'g01:x':{s:'mastered',t:1}}), {'g01:x':{s:'hard',t:2}});
  assert.deepEqual(S.mergeProgress({'g01:x':{s:'hard',t:2}}, {'g01:x':{s:'mastered',t:2}}), {'g01:x':{s:'hard',t:2}});
});
test('malformed records and prototype keys cannot poison the progress map', () => {
  assert.equal(typeof S.normalizeProgress, 'function');
  const raw = JSON.parse('{"__proto__":{"polluted":true},"x":{"s":"hard","t":5},"g01:ok":{"s":"hard","t":4},"g01:bad":{"s":"broken","t":3}}');
  assert.deepEqual(S.normalizeProgress(raw), {'g01:ok':{s:'hard',t:4}});
  assert.equal({}.polluted, undefined);
  assert.deepEqual(S.normalizeProgress([]), {});
});
test('old state loads with no invented activity and no changed preferences or sync code', () => {
  assert.equal(typeof S.readState, 'function');
  const prefs = {theme:'dark', customPreference:7};
  const sync = {code:'vocab-disposable-fixture',lastSync:123};
  const storage = memory({'vocab-progress-v1':JSON.stringify(legacy),'vocab-prefs-v1':JSON.stringify(prefs),'vocab-sync-v1':JSON.stringify(sync),'vocab-learning-v1':'invalid'});
  const state = S.readState(storage);
  assert.deepEqual(state.progress, legacy);
  assert.deepEqual(state.prefs, prefs);
  assert.deepEqual(state.sync, sync);
  assert.deepEqual(state.activity, []);
  assert.deepEqual(state.learning.comparisons, {});
  assert.deepEqual(storage.data['vocab-progress-v1'], JSON.stringify(legacy));
});
test('unavailable storage leaves a usable empty state and reports save failure', () => {
  assert.equal(typeof S.readState, 'function');
  const storage = {getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  assert.deepEqual(S.readState(storage).progress, {});
  assert.equal(S.writeJSON(storage, 'test', {}), false);
});
test('legacy backups and additive full backups import without replacing existing progress', () => {
  assert.equal(typeof S.parseBackup, 'function');
  assert.deepEqual(S.parseBackup(JSON.stringify(legacy)).progress, legacy);
  assert.deepEqual(S.parseBackup(JSON.stringify({v:1,words:legacy})).progress, legacy);
  const full = S.parseBackup(JSON.stringify({v:2,words:legacy,learning:{comparisons:{}},activity:[]}));
  assert.deepEqual(full.progress, legacy);
  assert.throws(() => S.parseBackup('not JSON'));
  assert.throws(() => S.parseBackup('[]'));
});
test('immutable activity events merge idempotently and reject malformed entries', () => {
  assert.equal(typeof S.mergeActivity, 'function');
  const event = {id:'event-1',key:'g01:x',at:12345,kind:'quiz',correct:true};
  assert.deepEqual(S.mergeActivity([event], [event,null,{id:'bad'}]), [event]);
});
test('default review metadata does not pretend a word was reviewed', () => {
  assert.equal(typeof S.defaultReview, 'function');
  const r = S.defaultReview({s:'hard',t:100}, 200);
  assert.equal(r.ease, 2.5);
  assert.equal(r.interval, 0);
  assert.equal(r.lastReviewed, 0);
  assert.equal(r.due, 200);
});
test('comparison favorites retain distinct source contexts and both relation types', () => {
  assert.equal(typeof S.comparisonKey, 'function');
  const a = {gid:'g01',sourceWord:'perceive',kind:'confusable',word:'conceive',note:'构想，而非察觉',active:true,updatedAt:20};
  const b = {...a,sourceWord:'receive'};
  const c = {...a,kind:'synonym'};
  const raw = {[S.comparisonKey(a)]:a,[S.comparisonKey(b)]:b,[S.comparisonKey(c)]:c};
  assert.equal(Object.keys(S.normalizeComparisons(raw)).length, 3);
  const state = S.readState(memory({'vocab-learning-v1':JSON.stringify({comparisons:raw})}));
  assert.deepEqual(state.learning.comparisons, raw);
  assert.deepEqual(S.parseBackup(JSON.stringify({v:2,words:{},learning:{comparisons:raw},activity:[]})).learning.comparisons, raw);
});
test('a newer cancellation stays cancelled when older cloud favorites are merged', () => {
  assert.equal(typeof S.mergeLearning, 'function');
  const item = {gid:'g01',sourceWord:'perceive',kind:'synonym',word:'sense',note:'凭直觉感到',active:true,updatedAt:10};
  const key = S.comparisonKey(item);
  const merged = S.mergeLearning({comparisons:{[key]:{...item,active:false,updatedAt:20}}}, {comparisons:{[key]:item}});
  assert.equal(merged.comparisons[key].active, false);
});
test('cleared progress timestamps suppress older marks but allow a genuinely newer mark',()=>{
  assert.equal(typeof S.applyProgressClears,'function');
  const learning=S.normalizeLearning({clearedProgress:{'g01:x':20}});
  assert.deepEqual(S.applyProgressClears({'g01:x':{s:'hard',t:10}},learning),{});
  assert.deepEqual(S.applyProgressClears({'g01:x':{s:'mastered',t:30}},learning),{'g01:x':{s:'mastered',t:30}});
  const state=S.readState(memory({'vocab-progress-v1':'{"g01:x":{"s":"hard","t":10}}','vocab-learning-v1':JSON.stringify(learning)}));
  assert.deepEqual(state.progress,{});
});
test('comparison backup keeps both meanings as optional additive metadata',()=>{
  const item={gid:'g01',sourceWord:'perceive',kind:'confusable',word:'receive',note:'词义不同',active:true,updatedAt:20,meanings:[{word:'perceive',definition:'察觉'},{word:'receive',definition:'收到'}]};
  const key=S.comparisonKey(item),backup={v:2,words:{},learning:{comparisons:{[key]:item}},activity:[]};
  assert.deepEqual(S.parseBackup(JSON.stringify(backup)).learning.comparisons[key].meanings,item.meanings);
});
