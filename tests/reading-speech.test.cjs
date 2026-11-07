const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {browserFixture}=require('./browser-helper.cjs');
const {createPlayer}=require('../js/speech.js');

test('comparison words and review examples speak with honest visual state',{timeout:180000},async t=>{
  const b=await browserFixture(t,{initScript:path.join(__dirname,'fixtures/speech-slow.js')});
  await b.call('set','viewport','390','844');
  await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".relation-item")');
  await b.wait('window.__speechTouches>0');

  await t.test('each comparison term speaks separately, highlights, and remains usable after saving',async()=>{
    await b.evaluate('document.querySelector("details[data-section=confusable]").open=true;document.querySelector(".relation-item").open=true');
    const words=await b.evaluate('Array.from(document.querySelectorAll(".relation-item[open] .comparison-meaning [data-action=speak]")).map(node=>({text:node.dataset.text,accent:node.dataset.accent}))');
    assert.deepEqual(words,[{text:'perceive',accent:'us'},{text:'conceive',accent:'us'}]);
    const source='.relation-item[open] .comparison-meaning [data-text="perceive"]';
    const target='.relation-item[open] .comparison-meaning [data-text="conceive"]';
    const original=await b.evaluate('getComputedStyle(document.querySelector('+JSON.stringify(source)+')).color');
    await b.call('scrollintoview',source);await b.call('click',source);
    await b.wait('document.querySelector('+JSON.stringify(source)+')?.dataset.speechState==="playing"');
    let state=await b.evaluate('(()=>{const s=document.querySelector('+JSON.stringify(source)+'),t=document.querySelector('+JSON.stringify(target)+');return {call:window.__speechCalls.at(-1),source:s.dataset.speechState,target:t.dataset.speechState,color:getComputedStyle(s).color};})()');
    assert.equal(state.call.text,'perceive');assert.equal(state.call.lang,'en-US');assert.equal(state.call.voice,'us-local');assert.equal(state.call.gesture,true);
    assert.equal(state.source,'playing');assert.equal(state.target,'idle');assert.notEqual(state.color,original);

    await b.call('scrollintoview',target);await b.call('click',target);
    await b.wait('document.querySelector('+JSON.stringify(target)+')?.dataset.speechState==="playing"');
    state=await b.evaluate('(()=>({call:window.__speechCalls.at(-1),source:document.querySelector('+JSON.stringify(source)+').dataset.speechState,target:document.querySelector('+JSON.stringify(target)+').dataset.speechState}))()');
    assert.equal(state.call.text,'conceive');assert.equal(state.call.lang,'en-US');assert.equal(state.source,'idle');assert.equal(state.target,'playing');
    await b.evaluate('window.speechSynthesis.speaking=false;window.__lastUtterance.onend({})');
    assert.equal(await b.evaluate('document.querySelector('+JSON.stringify(target)+').dataset.speechState'),'idle');

    await b.call('scrollintoview','[data-action="favorite"][data-related="conceive"]');
    await b.call('click','[data-action="favorite"][data-related="conceive"]');
    await b.evaluate('location.hash="#/review"');await b.wait('!!document.querySelector("[data-book-tab=confusable]")');
    await b.evaluate('document.querySelector("[data-book-tab=confusable]").click()');await b.wait('!!document.querySelector(".comparison-fold")');
    await b.evaluate('document.querySelector(".comparison-fold").open=true');
    const savedWords=await b.evaluate('Array.from(document.querySelectorAll(".comparison-card .comparison-meaning [data-action=speak]")).map(node=>node.dataset.text)');
    assert.deepEqual(savedWords,['perceive','conceive']);
    const savedTarget='.comparison-card .comparison-meaning [data-text="conceive"]';
    await b.call('scrollintoview',savedTarget);await b.call('click',savedTarget);
    await b.wait('document.querySelector('+JSON.stringify(savedTarget)+')?.dataset.speechState==="playing"');
    const savedCall=await b.evaluate('window.__speechCalls.at(-1)');
    assert.equal(savedCall.text,'conceive');assert.equal(savedCall.lang,'en-US');
    assert.equal(await b.evaluate('document.getElementById("speechStatus")?.textContent'),'正在播放','saved comparisons announce playback');
  });

  await t.test('review sentence indicates playback, word boundary, error and background cancellation',async()=>{
    await b.evaluate('localStorage.setItem("vocab-progress-v1",JSON.stringify({"g01:perceive":{s:"hard",t:1}}))');
    await b.call('open',b.url+'#/today');await b.call('reload');await b.wait('!!document.querySelector("[data-action=start-review]")');
    await b.evaluate('document.querySelector("[data-action=start-review]").click()');await b.wait('!!document.querySelector("[data-action=reveal]")');
    await b.evaluate('document.querySelector("[data-action=reveal]").click()');
    const sentence='.flip-back button.example-en[data-action="speak"]';
    assert.equal(await b.evaluate('!!document.querySelector('+JSON.stringify(sentence)+')'),true,'the review example must be a speech control');
    const before=await b.evaluate('getComputedStyle(document.querySelector('+JSON.stringify(sentence)+')).color');
    await b.call('scrollintoview',sentence);await b.call('click',sentence);
    await b.wait('document.querySelector('+JSON.stringify(sentence)+')?.dataset.speechState==="playing"');
    let state=await b.evaluate('(()=>({call:window.__speechCalls.at(-1),color:getComputedStyle(document.querySelector('+JSON.stringify(sentence)+')).color,word:document.querySelector('+JSON.stringify(sentence)+'+" .speech-current")?.textContent||null}))()');
    assert.equal(state.call.text,'We perceived a subtle change in her attitude.');assert.equal(state.call.lang,'en-US');
    assert.notEqual(state.color,before,'whole sentence changes color without boundary events');assert.equal(state.word,null);
    assert.equal(await b.evaluate('document.getElementById("speechStatus")?.textContent'),'正在播放','review announces playback');
    await b.evaluate('window.__lastUtterance.onboundary({name:"word",charIndex:3,charLength:9})');
    assert.equal(await b.evaluate('document.querySelector('+JSON.stringify(sentence)+'+" .speech-current")?.textContent'),'perceived');
    await b.evaluate('window.speechSynthesis.speaking=false;window.__lastUtterance.onend({})');
    state=await b.evaluate('(()=>{const x=document.querySelector('+JSON.stringify(sentence)+');return {status:x.dataset.speechState,color:getComputedStyle(x).color,word:!!x.querySelector(".speech-current")};})()');
    assert.deepEqual(state,{status:'idle',color:before,word:false});

    const retaps=await b.evaluate('(()=>{const x=document.querySelector('+JSON.stringify(sentence)+'),before=window.__speechCalls.length;x.click();x.click();return window.__speechCalls.length-before;})()');
    assert.equal(retaps,1,'rapid taps must not queue duplicate speech');
    await b.wait('document.querySelector('+JSON.stringify(sentence)+')?.dataset.speechState==="playing"');
    await b.evaluate('window.__lastUtterance.onerror({error:"network"})');
    state=await b.evaluate('(()=>{const x=document.querySelector('+JSON.stringify(sentence)+');return {status:x.dataset.speechState,color:getComputedStyle(x).color};})()');
    assert.deepEqual(state,{status:'error',color:before});
    await b.evaluate('document.querySelector('+JSON.stringify(sentence)+').click()');
    await b.wait('document.querySelector('+JSON.stringify(sentence)+')?.dataset.speechState==="playing"');
    const hidden=await b.evaluate('(()=>{const x=document.querySelector('+JSON.stringify(sentence)+'),old=window.__lastUtterance,before=window.__speechCancels;Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));old.onend({});delete document.visibilityState;return {status:x.dataset.speechState,cancelled:window.__speechCancels>before,color:getComputedStyle(x).color};})()');
    assert.deepEqual(hidden,{status:'idle',cancelled:true,color:before});
  });
});

test('a populated voice list without an American voice gives a fallback notice',()=>{
  const notices=[],synth={speaking:false,pending:false,paused:false,getVoices:()=>[{lang:'en-GB',localService:true}],addEventListener(){},cancel(){},speak(u){u.onstart();}};
  const player=createPlayer({getSynthesis:()=>synth,createUtterance:text=>({text}),onNotice:message=>notices.push(message)});
  player.prepare();player.play('perceive','us');player.stop();
  assert.equal(notices.length,1);assert.match(notices[0],/美音|美式/);
});
