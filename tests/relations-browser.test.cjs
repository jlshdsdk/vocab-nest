const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
test('source and target meanings stay visible in word cards, saved comparisons and reload',{timeout:120000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','390','844');await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".wcard-word")');
  const rows=await b.evaluate('Array.from(document.querySelectorAll(".comparison-list li")).map(item=>({word:item.querySelector("strong").textContent,meanings:Array.from(item.querySelectorAll(".comparison-meaning")).map(node=>node.textContent),note:item.querySelector(".comparison-explanation")?.textContent}))');
  assert.equal(rows.length,6);
  for(const row of rows){assert.ok(row.meanings.length>=2,JSON.stringify(row));assert.ok(row.meanings.every(value=>/[\\u4e00-\\u9fff]/.test(value)));}
  const receive=rows.find(row=>row.word==='receive');assert.match(receive.meanings.join(' '),/收到|接收/);assert.ok(receive.note);
  await b.evaluate('document.querySelector("[data-action=favorite][data-related=receive]").click()');
  await b.call('open',b.url+'#/review');await b.wait('!!document.querySelector("[data-book-tab=confusable]")');await b.evaluate('document.querySelector("[data-book-tab=confusable]").click()');await b.wait('!!document.querySelector(".comparison-card")');
  assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card .comparison-meaning").length'),2);
  assert.match(await b.evaluate('document.querySelector(".comparison-card").textContent'),/收到|接收/);
  await b.call('reload');await b.wait('!!document.querySelector("[data-book-tab=confusable]")');await b.evaluate('document.querySelector("[data-book-tab=confusable]").click()');await b.wait('!!document.querySelector(".comparison-card")');
  assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card .comparison-meaning").length'),2);
});
