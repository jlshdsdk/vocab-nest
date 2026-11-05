const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {browserFixture}=require('./browser-helper.cjs');
test('word pronunciation is prepared before tapping and favors a local accent',{timeout:120000},async t=>{
  const b=await browserFixture(t,{initScript:path.join(__dirname,'fixtures/speech-slow.js')});
  await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".phonetic-btn")');
  await b.evaluate('new Promise(r=>setTimeout(r,700))');
  await t.test('cold voice lookup is not on the playback-click path',async()=>{
    const result=await b.evaluate('(()=>{const button=document.querySelector(".phonetic-btn[data-accent=uk]");const start=performance.now();button.click();return {ms:performance.now()-start,calls:window.__speechCalls.length,voice:window.__speechCalls[0]?.voice};})()');
    console.log(JSON.stringify({case:'warm pronunciation click',handlerMilliseconds:result.ms,voice:result.voice}));
    assert.ok(result.ms<60,'speech handler blocked '+result.ms+'ms');assert.equal(result.voice,'gb-local');assert.equal(result.calls,1);
  });
  await t.test('a repeated tap while the same word is pending does not cancel and restart',async()=>{
    const result=await b.evaluate('(()=>{window.speechSynthesis.speaking=false;window.speechSynthesis.pending=true;const before=window.__speechCalls.length,cancels=window.__speechCancels;const button=document.querySelector(".phonetic-btn[data-accent=uk]");button.click();button.click();return {added:window.__speechCalls.length-before,cancels:window.__speechCancels-cancels,pressed:button.getAttribute("aria-pressed"),state:button.dataset.speechState};})()');
    assert.equal(result.added,0);assert.equal(result.cancels,0);assert.ok(['loading','playing'].includes(result.state));
  });
  await t.test('moving to the next word stops the previous word rather than playing behind it',async()=>{
    const result=await b.evaluate('(()=>{const before=window.__speechCancels;document.querySelector("[data-action=next]").click();return {cancelled:window.__speechCancels>before,word:document.querySelector(".wcard-word").textContent};})()');
    assert.equal(result.cancelled,true);assert.equal(result.word,'aggravate');
  });
  await t.test('entering a quiz and advancing a review both stop the previous pronunciation',async()=>{
    await b.evaluate('document.querySelector(".phonetic-btn[data-accent=us]").click()');
    let result=await b.evaluate('const before=window.__speechCancels;document.querySelector("[data-mode=quiz]").click();({stopped:window.__speechCancels>before})');
    assert.equal(result.stopped,true);
    await b.evaluate('localStorage.setItem("vocab-progress-v1",JSON.stringify({"g01:perceive":{s:"hard",t:1},"g01:aggravate":{s:"hard",t:1}}))');
    await b.call('open',b.url+'#/today');await b.call('reload');await b.wait('!!document.querySelector("[data-action=start-review]")');
    await b.evaluate('document.querySelector("[data-action=start-review]").click()');await b.wait('!!document.querySelector("[data-action=reveal]")');
    result=await b.evaluate('document.querySelector("[data-action=speak]").click();const before=window.__speechCancels;document.querySelector("[data-action=reveal]").click();document.querySelector("[data-grade=known]").click();({stopped:window.__speechCancels>before,word:document.querySelector(".flip-front .wcard-word").textContent})');
    assert.equal(result.stopped,true);assert.equal(result.word,'aggravate');
  });
});
