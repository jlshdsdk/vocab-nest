const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const T=fs.existsSync(require('node:path').join(__dirname,'../js/stats.js'))?require('../js/stats.js'):{};
const now=new Date(2026,10,5,12).getTime();
const event=(id,key,at)=>({id,key,at,kind:'quiz',correct:true});
test('empty history stays empty and exposes a full 30-day and 26-week calendar',()=>{
  assert.equal(typeof T.summarize,'function');
  const s=T.summarize([],now,20);
  assert.equal(s.todayWords,0);assert.equal(s.streak,0);assert.equal(s.goalReached,false);
  assert.equal(s.last30.length,30);assert.ok(s.heatmap.length>=182);
});
test('daily goals count distinct words, not repeated answers or duplicate imports',()=>{
  assert.equal(typeof T.summarize,'function');
  const events=[event('a','g01:x',now),event('b','g01:x',now+1),event('a','g01:x',now)];
  assert.equal(T.summarize(events,now,20).todayWords,1);
  assert.equal(T.summarize(Array.from({length:20},(_,i)=>event(String(i),'g01:w'+i,now)),now,20).goalReached,true);
});
test('streak uses calendar days and permits a current streak ending yesterday',()=>{
  assert.equal(typeof T.dayKey,'function');
  assert.equal(T.dayKey(new Date(2026,10,5,0,1).getTime()),'2026-11-05');
  const yesterday=new Date(2026,10,4,12).getTime(),before=new Date(2026,10,3,12).getTime();
  assert.equal(T.summarize([event('a','g01:x',yesterday),event('b','g01:y',before)],now,20).streak,2);
  assert.equal(T.summarize([event('b','g01:y',before)],now,20).streak,0);
});
test('new moon, quarter and full moon map real mastery ratios without division by zero',()=>{
  assert.equal(typeof T.moonPhase,'function');
  assert.equal(T.moonPhase(0,20).ratio,0);assert.equal(T.moonPhase(10,20).ratio,.5);assert.equal(T.moonPhase(20,20).ratio,1);
  assert.equal(T.moonPhase(0,0).ratio,0);assert.match(T.moonPhase(20,20).label,/满月/);
});
test('CSV exports preserve punctuation, Unicode and neutralize spreadsheet formulas',()=>{
  assert.equal(typeof T.toCSV,'function');
  const csv=T.toCSV([['原词','辨析'],['=1+1','含有,逗号与"引号"']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=1+1"));assert.ok(csv.includes('"含有,逗号与""引号"""'));
});
