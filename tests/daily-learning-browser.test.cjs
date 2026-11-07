const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');

test('today learning combines due review with new words without changing old progress',{timeout:180000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','390','844');
  await b.evaluate(`(()=>{
    localStorage.setItem('vocab-prefs-v1',JSON.stringify({dailyGoal:3}));
    localStorage.setItem('vocab-progress-v1',JSON.stringify({'g01:aggravate':{s:'hard',t:Date.now()-2*86400000}}));
    localStorage.setItem('vocab-learning-v1',JSON.stringify({review:{'g01:aggravate':{ease:2.5,interval:1,repetitions:1,due:Date.now()-1,lastReviewed:Date.now()-86400000,updatedAt:1}}}));
  })()`);
  await b.call('open',b.url+'#/today');await b.call('reload');await b.wait('!!document.querySelector(".today-view")');
  assert.equal(await b.evaluate('!!document.querySelector("[data-action=start-learning]")'),true,'today learning should be available');
  assert.equal(await b.evaluate('!!document.querySelector("[data-action=start-review]")'),true,'review-only remains available');
  await b.evaluate('document.querySelector("[data-action=start-learning]").click()');
  await b.wait('!!document.querySelector("[data-action=reveal]")');
  for(const word of ['aggravate','perceive','susceptible']){
    assert.equal(await b.evaluate('document.querySelector(".flip-front .wcard-word").textContent'),word);
    await b.evaluate('document.querySelector("[data-action=reveal]").click();document.querySelector("[data-action=rate][data-grade=known]").click()');
  }
  const result=await b.evaluate(`(()=>({text:document.querySelector('#cardArea').textContent,
    progress:JSON.parse(localStorage.getItem('vocab-progress-v1')),
    reviews:Object.keys(JSON.parse(localStorage.getItem('vocab-learning-v1')).review).sort()}))()`);
  assert.match(result.text,/新学\s*2/);assert.match(result.text,/复习\s*1/);assert.match(result.text,/正确率/);assert.match(result.text,/明日/);
  assert.match(result.text,/明日预告：3\s*词/,'tomorrow includes hard words even when their interval is longer');
  assert.equal(result.progress['g01:aggravate'].s,'hard');
  assert.deepEqual(result.reviews,['g01:aggravate','g01:perceive','g01:susceptible']);
});
