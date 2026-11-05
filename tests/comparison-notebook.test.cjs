const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
function fixture(){
  const records={};let counter=0;
  for(const kind of ['confusable','synonym']){
    let offset=0;
    for(const [gid,count]of [['g01',16],['g02',15]]){
      const group=require('../data/groups/'+gid+'.json');
      const pairs=group.words.flatMap(word=>(word[kind==='confusable'?'confusables':'synonyms']||[]).map(related=>({sourceWord:word.word,related}))).slice(0,count);
      assert.equal(pairs.length,count);
      for(const pair of pairs){
        const r={gid,sourceWord:pair.sourceWord,kind,word:pair.related.word,note:pair.related.note,active:true,updatedAt:1700000000000+offset++};
        records[JSON.stringify([gid,r.sourceWord,kind,r.word])]=r;counter++;
      }
    }
  }
  assert.equal(counter,62);return records;
}
test('comparison collections fold and page correctly on a phone without losing saved data',{timeout:180000},async t=>{
  const b=await browserFixture(t);await b.call('set','viewport','360','800');
  await b.evaluate('localStorage.setItem("vocab-learning-v1",JSON.stringify({comparisons:'+JSON.stringify(fixture())+'}))');
  await b.call('open',b.url+'#/review');await b.call('reload');await b.wait('!!document.querySelector("[data-book-tab=confusable]")');
  await b.evaluate('document.querySelector("[data-book-tab=confusable]").click()');await b.wait('!!document.querySelector(".comparison-card")');
  let firstKeys=[];
  await t.test('first page contains 15 closed entries and accessible page navigation',async()=>{
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card").length'),15);
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-fold[open]").length'),0);
    assert.equal(await b.evaluate('document.querySelector(".book-pagination [data-direction=prev]").disabled'),true);
    assert.equal(await b.evaluate('document.querySelector(".book-pagination [data-direction=next]").disabled'),false);
    firstKeys=await b.evaluate('Array.from(document.querySelectorAll(".comparison-fold")).map(node=>node.dataset.key)');
  });
  await t.test('opening shows both meanings, selecting does not accidentally collapse the entry',async()=>{
    await b.evaluate('document.querySelector(".comparison-fold summary").click()');
    assert.equal(await b.evaluate('document.querySelector(".comparison-fold").open'),true);
    assert.ok(await b.evaluate('document.querySelector(".comparison-fold .comparison-meanings").getBoundingClientRect().height')>0);
    await b.evaluate('document.querySelector("[data-action=book-select]").click()');
    assert.equal(await b.evaluate('document.querySelector(".comparison-fold").open'),true);
    assert.equal(await b.evaluate('document.querySelector("[data-action=book-select]").checked'),true);
  });
  await t.test('next page has different 15 entries, clears hidden selection, and returns to list start',async()=>{
    await b.evaluate('document.querySelector(".book-pagination [data-direction=next]").click()');
    await b.wait('document.querySelector(".book-page-select")?.value==="2"');
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card").length'),15);
    const keys=await b.evaluate('Array.from(document.querySelectorAll(".comparison-fold")).map(node=>node.dataset.key)');
    assert.ok(keys.every(key=>!firstKeys.includes(key)));
    assert.equal(await b.evaluate('document.querySelector("[data-action=book-bulk]").disabled'),true);
    assert.ok(await b.evaluate('document.querySelector("#bookPanel").getBoundingClientRect().top')>=0);
  });
  await t.test('page-number selection reaches the one-entry final page and deletion clamps to page two',async()=>{
    await b.evaluate('(()=>{const select=document.querySelector(".book-page-select");select.value="3";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await b.wait('document.querySelector(".book-page-select")?.value==="3"');
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card").length'),1);
    assert.equal(await b.evaluate('document.querySelector(".book-pagination [data-direction=next]").disabled'),true);
    await b.evaluate('document.querySelector(".comparison-fold summary").click();document.querySelector("[data-action=remove-comparison]").click()');
    await b.wait('document.querySelector(".book-page-select")?.value==="2"');
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card").length'),15);
    assert.equal(await b.evaluate('Object.values(JSON.parse(localStorage.getItem("vocab-learning-v1")).comparisons).filter(item=>item.active&&item.kind==="confusable").length'),30);
  });
  await t.test('filters reset pagination and synonym collection independently has 15 folded entries',async()=>{
    await b.evaluate('(()=>{const select=document.querySelector("#bookGroup");select.value="g02";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await b.wait('document.querySelector(".book-page-select")?.value==="1"');
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card").length'),15);
    await b.evaluate('(()=>{const select=document.querySelector("#bookGroup");select.value="all";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await b.wait('document.querySelector("#bookGroup")?.value==="all"');
    await b.evaluate('document.querySelector("[data-book-tab=synonym]").click()');
    await b.wait('document.querySelector("#bookTab_synonym")?.getAttribute("aria-selected")==="true"');
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card").length'),15);
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-fold[open]").length'),0);
    assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    assert.equal(await b.evaluate('Object.values(JSON.parse(localStorage.getItem("vocab-learning-v1")).comparisons).filter(item=>item.active&&item.kind==="synonym").length'),31);
  });
});
