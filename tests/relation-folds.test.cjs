const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');

test('individual word comparisons open independently and favorite separately',{timeout:120000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','390','844');
  await b.call('open',b.url+'#/group/g01');
  await b.wait('!!document.querySelector(".comparison-list")');
  const initial=await b.evaluate('Array.from(document.querySelectorAll(".comparison-list .relation-item")).map(node=>node.open)');
  assert.equal(initial.length,6,'each near-form and synonym needs its own disclosure');
  assert.ok(initial.every(open=>!open),'individual comparisons start closed');
  await b.evaluate('document.querySelector("details[data-section=confusable]").open=true');

  await b.call('scrollintoview','[data-action="favorite"][data-related="receive"]');
  await b.call('click','[data-action="favorite"][data-related="receive"]');
  const saved=await b.evaluate('(()=>{const button=document.querySelector("[data-action=favorite][data-related=receive]");return {saved:button.getAttribute("aria-pressed"),open:button.closest("li").querySelector("details").open};})()');
  assert.deepEqual(saved,{saved:'true',open:false},'favoriting must not open the related entry');

  await b.call('scrollintoview','.comparison-list .relation-item summary');
  await b.call('click','.comparison-list .relation-item summary');
  const opened=await b.evaluate('(()=>{const entries=document.querySelectorAll(".comparison-list .relation-item"),first=entries[0];return {first:first.open,next:entries[1].open,meanings:Array.from(first.querySelectorAll(".comparison-meaning")).map(row=>row.textContent),note:first.querySelector(".comparison-explanation")?.textContent};})()');
  assert.equal(opened.first,true);assert.equal(opened.next,false);
  assert.equal(opened.meanings.length,2);assert.match(opened.meanings[0],/perceive/);assert.match(opened.meanings[1],/conceive/);
  assert.match(opened.note,/构想|设想/);

  await b.call('reload');await b.wait('!!document.querySelector("[data-action=favorite][data-related=receive]")');
  const reloaded=await b.evaluate('(()=>{const button=document.querySelector("[data-action=favorite][data-related=receive]");return {saved:button.getAttribute("aria-pressed"),open:button.closest("li").querySelector("details").open};})()');
  assert.deepEqual(reloaded,{saved:'true',open:false},'favorite persists while disclosure starts closed');
});
