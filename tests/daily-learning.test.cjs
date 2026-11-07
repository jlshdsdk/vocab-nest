const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../js/learning.js');

test('a daily plan puts reviews first and fills the remaining goal with unseen words in group order',()=>{
  const now=new Date(2026,10,7,12).getTime(),day=86400000;
  const manifest={groups:[{id:'g01',words:['a','b','c']},{id:'g02',words:['d','e','f']}]};
  const progress={'g01:a':{s:'hard',t:now-day},'g01:b':{s:'mastered',t:now-day},'g01:c':{s:'mastered',t:now-day}};
  const learning={review:{'g01:b':{due:now-1000,lastReviewed:now-day},'g01:c':{due:now+day,lastReviewed:now}},wrongQueue:{}};
  const activity=[{key:'g02:d',at:now-1000,kind:'study'}];
  assert.deepEqual(L.dailyPlan(manifest,progress,learning,activity,4,now),{due:['g01:a','g01:b'],fresh:['g02:e']});
});

test('the daily goal counts distinct words today but never suppresses due reviews',()=>{
  const now=new Date(2026,10,7,12).getTime(),day=86400000;
  const manifest={groups:[{id:'g01',words:['a','b','c','d']}]};
  const progress={'g01:a':{s:'hard',t:now-day}};
  const learning={review:{},wrongQueue:{}};
  const activity=[{key:'g01:b',at:now-2000},{key:'g01:b',at:now-1000},{key:'g01:c',at:now-1000}];
  assert.deepEqual(L.dailyPlan(manifest,progress,learning,activity,2,now),{due:['g01:a'],fresh:[]});
  assert.deepEqual(L.dailyPlan(manifest,progress,learning,activity,4,now),{due:['g01:a'],fresh:['g01:d']});
});

test('previously studied words and unknown activity keys do not become new words or inflate today',()=>{
  const now=new Date(2026,10,7,12).getTime(),day=86400000;
  const manifest={groups:[{id:'g01',words:['a','b','c']}]};
  const activity=[{key:'g01:a',at:now-day},{key:'missing:x',at:now}];
  assert.deepEqual(L.dailyPlan(manifest,{}, {review:{},wrongQueue:{}},activity,2,now),{due:[],fresh:['g01:b','g01:c']});
});

test('a future timestamp is remembered as seen without counting it toward today’s goal',()=>{
  const now=new Date(2026,10,7,12).getTime();
  const manifest={groups:[{id:'g01',words:['a','b','c']}]};
  assert.deepEqual(L.dailyPlan(manifest,{}, {review:{},wrongQueue:{}},[{key:'g01:a',at:now+60000}],2,now),{due:[],fresh:['g01:b','g01:c']});
});
