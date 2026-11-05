const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
const groups=['g01','g02','g03','g04'].map(id=>require('../data/groups/'+id+'.json'));
const words=groups.flatMap(group=>group.words.map(word=>({gid:group.id,word:word.word}))).slice(0,61);
const fixture=Object.fromEntries(words.map((word,i)=>[word.gid+':'+word.word,{s:'hard',t:1700000000000+i}]));
test('saved words fold and paginate thirty at a time without losing mastery or exports',{timeout:180000},async t=>{
  const b=await browserFixture(t);await b.call('set','viewport','360','800');
  await b.evaluate('localStorage.setItem("vocab-progress-v1",'+JSON.stringify(JSON.stringify(fixture))+')');
  await b.call('open',b.url+'#/review');await b.call('reload');await b.wait('!!document.querySelector(".book-word")');
  let firstKeys=[];
  await t.test('first page shows thirty closed word entries and page one of three',async()=>{
    assert.equal(await b.evaluate('document.querySelectorAll(".book-word").length'),30);
    assert.equal(await b.evaluate('document.querySelectorAll(".word-fold[open]").length'),0);
    assert.equal(await b.evaluate('document.querySelector(".book-page-select").value'),'1');
    assert.equal(await b.evaluate('document.querySelectorAll(".book-page-select option").length'),6);
    firstKeys=await b.evaluate('Array.from(document.querySelectorAll(".word-fold")).map(node=>node.dataset.key)');
  });
  await t.test('opening a word exposes meaning and actions while the selection checkbox does not toggle it',async()=>{
    await b.evaluate('document.querySelector(".word-fold summary").click()');
    const result=await b.evaluate('(()=>{const fold=document.querySelector(".word-fold");document.querySelector("[data-action=book-select]").click();return {open:fold.open,meaning:fold.querySelector(".definition").textContent,height:fold.querySelector(".definition").getBoundingClientRect().height,speech:!!fold.querySelector("[data-action=speak]"),master:!!fold.querySelector("[data-action=master-book]")};})()');
    assert.equal(result.open,true);assert.ok(result.height>0);assert.ok(result.meaning);assert.equal(result.speech,true);assert.equal(result.master,true);
  });
  await t.test('page two has thirty different words and clears selections from page one',async()=>{
    await b.evaluate('document.querySelector(".book-pagination [data-direction=next]").click()');
    await b.wait('document.querySelector(".book-page-select")?.value==="2"');
    assert.equal(await b.evaluate('document.querySelectorAll(".book-word").length'),30);
    const keys=await b.evaluate('Array.from(document.querySelectorAll(".word-fold")).map(node=>node.dataset.key)');
    assert.ok(keys.every(key=>!firstKeys.includes(key)));
    assert.equal(await b.evaluate('document.querySelector("[data-action=book-bulk]").disabled'),true);
  });
  await t.test('export on a later page still contains all sixty-one saved words',async()=>{
    const exported=await b.evaluate('(async()=>{const original=URL.createObjectURL;let captured=null;URL.createObjectURL=function(blob){captured=blob;return original.call(URL,blob)};try{document.querySelector("[data-action=export-notebook]").click();const end=Date.now()+10000;while(!captured&&Date.now()<end)await new Promise(r=>setTimeout(r,50));if(!captured)throw Error("export not ready");return Object.keys(JSON.parse(await captured.text()).words).length;}finally{URL.createObjectURL=original;}})()');
    assert.equal(exported,61);
  });
  await t.test('the last page has one word and mastering it preserves its record and clamps back to page two',async()=>{
    await b.evaluate('(()=>{const select=document.querySelector(".book-page-select");select.value="3";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await b.wait('document.querySelector(".book-page-select")?.value==="3"');
    assert.equal(await b.evaluate('document.querySelectorAll(".book-word").length'),1);
    const key=await b.evaluate('document.querySelector(".word-fold").dataset.key');
    await b.evaluate('document.querySelector(".word-fold summary").click();document.querySelector("[data-action=master-book]").click()');
    await b.wait('document.querySelector(".book-page-select")?.value==="2"');
    assert.equal(await b.evaluate('document.querySelectorAll(".book-word").length'),30);
    assert.equal(await b.evaluate('JSON.parse(localStorage.getItem("vocab-progress-v1"))['+JSON.stringify(key)+'].s'),'mastered');
    assert.equal(await b.evaluate('Object.keys(JSON.parse(localStorage.getItem("vocab-progress-v1"))).length'),61);
  });
  await t.test('filters reset to page one, empty results remain usable and mobile width does not overflow',async()=>{
    await b.evaluate('(()=>{const select=document.querySelector("#bookGroup");select.value="g01";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await b.wait('document.querySelector(".book-page-select")?.value==="1"');
    // The oldest g01 word was just marked mastered on the final page.
    assert.equal(await b.evaluate('document.querySelectorAll(".book-word").length'),19);
    await b.evaluate('(()=>{const select=document.querySelector("#bookGroup");select.value="g134";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await b.wait('!!document.querySelector(".empty-state")');
    assert.equal(await b.evaluate('document.querySelectorAll(".book-word").length'),0);
    assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  });
});
