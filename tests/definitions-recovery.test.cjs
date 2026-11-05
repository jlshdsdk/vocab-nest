const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
test('a transient definition failure recovers in an existing comparison notebook without restarting the app',{timeout:120000},async t=>{
  const b=await browserFixture(t);await b.wait('!!document.querySelector(".group-grid")');
  await b.evaluate('window.__definitionFailure=true;window.__definitionCalls=0;const original=VocabData.loadDefinitions;VocabData.loadDefinitions=function(id){window.__definitionCalls++;return window.__definitionFailure?Promise.reject(Error("simulated offline")):original(id)}');
  await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector("[data-action=retry-definitions]")');
  await b.evaluate('document.querySelector("[data-action=favorite][data-related=receive]").click();window.__definitionFailure=false');
  const stored=await b.evaluate('Object.values(JSON.parse(localStorage.getItem("vocab-learning-v1")).comparisons)[0].meanings');
  assert.ok(stored.every(row=>!row.definition.includes('释义暂未收录')),'missing placeholders must not become saved definitions');
  await b.call('open',b.url+'#/review');await b.wait('!!document.querySelector("[data-book-tab=confusable]")');await b.evaluate('document.querySelector("[data-book-tab=confusable]").click()');await b.wait('!!document.querySelector(".comparison-card")');
  const result=await b.evaluate('({text:document.querySelector(".comparison-card").textContent,calls:window.__definitionCalls})');
  assert.match(result.text,/收到|接收/);assert.equal(result.text.includes('释义暂未收录'),false);assert.ok(result.calls>=2);
});
