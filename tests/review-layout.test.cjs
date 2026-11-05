const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
test('a short mobile review can read the example and reach all grades without controls covering it',{timeout:120000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','360','740');
  await b.evaluate('localStorage.setItem("vocab-progress-v1",JSON.stringify({"g01:perceive":{s:"hard",t:1}}))');
  await b.call('open',b.url+'#/today');await b.call('reload');await b.wait('!!document.querySelector("[data-action=start-review]")');
  await b.call('click','[data-action=start-review]');await b.wait('!!document.querySelector("[data-action=reveal]")');
  await b.call('click','[data-action=reveal]');
  const result=await b.evaluate('(()=>{const controls=document.querySelector(".review-controls").getBoundingClientRect(),example=document.querySelector(".flip-back .example").getBoundingClientRect(),nav=document.querySelector(".tabbar").getBoundingClientRect();return {controlsTop:controls.top,controlsBottom:controls.bottom,exampleBottom:example.bottom,navTop:nav.top,height:controls.height,grades:Array.from(document.querySelectorAll("[data-action=rate]")).map(node=>node.getBoundingClientRect().toJSON())};})()');
  assert.ok(result.exampleBottom<=result.controlsTop,JSON.stringify(result));
  assert.ok(result.controlsBottom<=result.navTop,JSON.stringify(result));
  for(const grade of result.grades)assert.ok(grade.height>=44);
});
