const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {browserFixture}=require('./browser-helper.cjs');

test('listening quiz plays American speech on the initiating tap and hides the answer',{timeout:180000},async t=>{
  const b=await browserFixture(t,{initScript:path.join(__dirname,'fixtures/speech-slow.js')});
  await b.call('set','viewport','390','844');
  await b.evaluate('localStorage.setItem("vocab-prefs-v1",JSON.stringify({quizTypes:["listen"]}))');
  await b.call('open',b.url+'#/group/g01');await b.call('reload');await b.wait('!!document.querySelector("[data-mode=quiz]")');
  await b.call('click','[data-mode=quiz]');
  assert.match(await b.evaluate('document.querySelector(".quiz-kind").textContent'),/听音/);
  await b.wait('window.__speechCalls.length>0');
  const question=await b.evaluate(`(()=>({text:document.querySelector('.quiz-shell').innerText,
    call:window.__speechCalls.at(-1),choices:document.querySelectorAll('.quiz-option').length,
    replay:!!document.querySelector('.quiz-shell [data-action=speak]')}))()`);
  assert.doesNotMatch(question.text,/perceive/i);assert.equal(question.choices,4);assert.equal(question.replay,true);
  assert.equal(question.call.text,'perceive');assert.equal(question.call.lang,'en-US');assert.equal(question.call.gesture,true);
  await b.wait('document.querySelector(".quiz-listen").dataset.speechState==="playing"');
  await b.evaluate('Array.from(document.querySelectorAll(".quiz-option")).find(node=>node.textContent.includes("感知，察觉")).click()');
  assert.match(await b.evaluate('document.querySelector(".quiz-feedback").textContent'),/回答正确/);
  assert.equal(await b.evaluate('window.__speechCancels>0'),true,'answering ends the previous sound before its button is replaced');
  assert.equal(await b.evaluate('!!document.querySelector(".letter-feedback")'),false,'a multiple-choice answer must not show spelling-error markers');
  assert.ok(await b.evaluate('JSON.parse(localStorage.getItem("vocab-learning-v1")).review["g01:perceive"].due>Date.now()'));
});

test('unavailable or failed listening audio falls back to a readable choice without recording a guess',{timeout:240000},async t=>{
  const b=await browserFixture(t,{initScript:path.join(__dirname,'fixtures/speech-slow.js')});
  await b.evaluate('localStorage.setItem("vocab-prefs-v1",JSON.stringify({quizTypes:["listen"]}))');
  async function begin(setup){
    await b.call('open',b.url+'#/group/g01');await b.call('reload');await b.wait('!!document.querySelector("[data-mode=quiz]")');
    if(setup)await b.evaluate('(()=>{'+setup+';return true;})()');
    await b.call('click','[data-mode=quiz]');await b.wait('!!document.querySelector(".quiz-shell")');
  }
  async function assertFallback(){
    const state=await b.evaluate(`(()=>({prompt:document.querySelector('.quiz-prompt').textContent,
      kind:document.querySelector('.quiz-kind').textContent,choices:document.querySelectorAll('.quiz-option').length,
      records:JSON.parse(localStorage.getItem('vocab-learning-v1')||'{}').review||{}}))()`);
    assert.match(state.prompt,/perceive/i,'the word becomes visible when audio cannot be used');
    assert.match(state.kind,/看词|文字/,'the changed question is clearly explained');
    assert.equal(state.choices,4);
    assert.equal(Object.keys(state.records).length,0,'audio failure alone must not affect learning records');
  }
  await t.test('no speech interface',async()=>{
    await begin('Object.defineProperty(window,"speechSynthesis",{configurable:true,value:undefined})');
    await assertFallback();
  });
  await t.test('speech engine reports an error after playback starts',async()=>{
    await begin();await b.wait('window.__lastUtterance && document.querySelector(".quiz-listen").dataset.speechState==="playing"');
    await b.evaluate('window.__lastUtterance.onerror({error:"not-allowed"})');
    await assertFallback();
  });
  await t.test('an error after the keyboard replay shortcut also falls back',async()=>{
    await begin();await b.wait('window.__lastUtterance && document.querySelector(".quiz-listen").dataset.speechState==="playing"');
    const before=await b.evaluate('window.__speechCalls.length');
    await b.call('press','s');await b.wait('window.__speechCalls.length>'+before);
    await b.evaluate('window.__lastUtterance.onerror({error:"not-allowed"})');
    await assertFallback();
  });
  await t.test('speech engine never starts',async()=>{
    await begin('window.speechSynthesis.speak=function(utterance){this.pending=true;window.__lastUtterance=utterance;}');
    await b.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),4500))');
    await assertFallback();
    await b.evaluate('Array.from(document.querySelectorAll(".quiz-option")).find(node=>node.textContent.includes("感知，察觉")).click()');
    assert.match(await b.evaluate('document.querySelector(".quiz-feedback").textContent'),/回答正确/);
  });
});
