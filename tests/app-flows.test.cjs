const test=require('node:test');
const assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
test('real learning, contextual favorites and settings survive reload',{timeout:180000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','360','800');
  await b.call('open',b.url+'#/group/g01');
  await b.wait('!!document.querySelector(".wcard-word")');
  await t.test('each related-word comparison has an independent accessible favorite action',async()=>{
    assert.equal(await b.evaluate('document.querySelectorAll("[data-action=favorite]").length'),6);
    await b.evaluate('document.querySelector("[data-action=favorite][data-kind=confusable]").click()');
    assert.equal(await b.evaluate('document.querySelector("[data-action=favorite][data-kind=confusable]").getAttribute("aria-pressed")'),'true');
    await b.call('open',b.url+'#/review');
    await b.wait('!!document.querySelector("[data-book-tab=confusable]")');
    await b.evaluate('document.querySelector("[data-book-tab=confusable]").click()');
    await b.wait('!!document.querySelector(".comparison-card")');
    const text=await b.evaluate('document.querySelector(".comparison-card").textContent');
    assert.match(text,/perceive/);assert.match(text,/conceive/);assert.match(text,/构想/);
    await b.call('reload');
    await b.wait('!!document.querySelector("[data-book-tab=confusable]")');
    await b.evaluate('document.querySelector("[data-book-tab=confusable]").click()');
    await b.wait('!!document.querySelector(".comparison-card")');
    assert.match(await b.evaluate('document.querySelector(".comparison-card").textContent'),/conceive/);
  });
  await t.test('objective quiz grades only once and records a real learning event',async()=>{
    await b.call('open',b.url+'#/group/g01');
    await b.wait('!!document.querySelector("[data-mode=quiz]")');
    await b.evaluate('document.querySelector("[data-mode=quiz]").click()');
    assert.equal(await b.evaluate('document.querySelectorAll(".quiz-option").length'),4);
    await b.evaluate('document.querySelector(".quiz-option").click()');
    assert.ok(await b.evaluate('!!document.querySelector(".quiz-feedback")'));
    const before=await b.evaluate('JSON.parse(localStorage.getItem("vocab-activity-v1")||"[]").length');
    await b.evaluate('document.querySelector(".quiz-option").click()');
    const after=await b.evaluate('JSON.parse(localStorage.getItem("vocab-activity-v1")||"[]").length');
    assert.equal(before,1);assert.equal(after,before);
  });
  await t.test('the same session rotates into spelling and cloze without revealing the target',async()=>{
    await b.evaluate('document.querySelector("[data-action=session-next]").click()');
    assert.match(await b.evaluate('document.querySelector(".quiz-kind").textContent'),/拼写/);
    await b.call('fill','#answerInput','AGGRAVATE');await b.call('press','Enter');
    assert.match(await b.evaluate('document.querySelector(".quiz-feedback").textContent'),/回答正确/);
    await b.evaluate('document.querySelector("[data-action=session-next]").click()');
    const prompt=await b.evaluate('document.querySelector(".quiz-prompt").textContent');
    assert.ok(prompt.includes('_____'));assert.equal(prompt.toLowerCase().includes('susceptible'),false);
    await b.call('fill','#answerInput','susceptible');await b.call('press','Enter');
    assert.match(await b.evaluate('document.querySelector(".quiz-feedback").textContent'),/回答正确/);
  });
  await t.test('reading settings and daily target persist without losing comparison favorites',async()=>{
    await b.call('open',b.url+'#/settings');
    await b.wait('!!document.querySelector(".settings")');
    assert.ok(await b.evaluate('!!document.querySelector("#dailyGoal")'));
    await b.evaluate('const input=document.querySelector("#dailyGoal");input.value="12";input.dispatchEvent(new Event("change",{bubbles:true}))');
    await b.call('reload');
    await b.wait('!!document.querySelector("#dailyGoal")');
    assert.equal(await b.evaluate('document.querySelector("#dailyGoal").value'),'12');
    assert.equal(await b.evaluate('Object.values(JSON.parse(localStorage.getItem("vocab-learning-v1")).comparisons).filter(x=>x.active).length'),1);
  });
  await t.test('review reveal preserves its 3D element so the flip can animate',async()=>{
    await b.evaluate('localStorage.setItem("vocab-progress-v1",JSON.stringify({"g01:perceive":{s:"hard",t:Date.now()}})); const saved=JSON.parse(localStorage.getItem("vocab-learning-v1"));delete saved.review["g01:perceive"];delete saved.wrongQueue["g01:perceive"];localStorage.setItem("vocab-learning-v1",JSON.stringify(saved))');
    await b.call('open',b.url+'#/today');await b.call('reload');
    await b.wait('!!document.querySelector("[data-action=start-review]")');
    await b.evaluate('document.querySelector("[data-action=start-review]").click()');
    await b.wait('!!document.querySelector(".flip-inner")');
    const result=await b.evaluate('const original=document.querySelector(".flip-inner");document.querySelector("[data-action=reveal]").click();({same:original===document.querySelector(".flip-inner"),visible:document.querySelector(".flip-back").getAttribute("aria-hidden")})');
    assert.equal(result.same,true);assert.equal(result.visible,'false');
  });
  await t.test('rating shortcuts still work when a rating button has keyboard focus',async()=>{
    const result=await b.evaluate('const before=JSON.parse(localStorage.getItem("vocab-activity-v1")||"[]").length;const button=document.querySelector("[data-grade=known]");button.focus();button.dispatchEvent(new KeyboardEvent("keydown",{key:"3",bubbles:true}));({added:JSON.parse(localStorage.getItem("vocab-activity-v1")||"[]").length-before})');
    assert.equal(result.added,1);
  });
  await t.test('a complete wrong-word practice loop clears only after two correct retries and reaches a real daily goal',async()=>{
    await b.evaluate('const p=JSON.parse(localStorage.getItem("vocab-prefs-v1"));p.quizTypes=["spelling"];p.dailyGoal=20;localStorage.setItem("vocab-prefs-v1",JSON.stringify(p));const l=JSON.parse(localStorage.getItem("vocab-learning-v1"));l.review={};l.wrongQueue={};l.celebrations={};localStorage.setItem("vocab-learning-v1",JSON.stringify(l));localStorage.setItem("vocab-activity-v1","[]")');
    await b.call('open',b.url+'#/group/g01');await b.call('reload');await b.wait('!!document.querySelector("[data-mode=quiz]")');
    await b.evaluate('document.querySelector("[data-mode=quiz]").click()');
    const words=require('../data/groups/g01.json').words.map(w=>w.word);
    const result=await b.evaluate('(()=>{const words='+JSON.stringify(words)+';const answer=value=>{const input=document.querySelector("#answerInput");if(!input)throw Error("missing question input");input.value=value;document.querySelector("#answerForm").requestSubmit();if(!document.querySelector(".quiz-feedback"))throw Error("missing answer feedback");document.querySelector("[data-action=session-next]").click();};answer("not-the-word");for(const word of words.slice(1))answer(word.toUpperCase());answer(words[0]);answer(words[0]);const activity=JSON.parse(localStorage.getItem("vocab-activity-v1"));const learning=JSON.parse(localStorage.getItem("vocab-learning-v1"));return {events:activity.length,uniqueWords:new Set(activity.map(e=>e.key)).size,wrongActive:Object.values(learning.wrongQueue).filter(x=>x.active).length,celebrations:Object.keys(learning.celebrations).length,summary:document.querySelector(".empty-state").textContent};})()');
    assert.equal(result.events,22);assert.equal(result.uniqueWords,20);assert.equal(result.wrongActive,0);assert.equal(result.celebrations,1);assert.match(result.summary,/完成 22 次/);
    await b.call('open',b.url+'#/stats');await b.call('reload');await b.wait('!!document.querySelector(".statistics-cards")');
    assert.equal(await b.evaluate('document.querySelector(".metric-card b").textContent'),'20');
    assert.equal(await b.evaluate('document.querySelectorAll(".heat-cell.l4").length>=1'),true);
  });
  await t.test('cancelling a word mark records its timestamp so an old cloud mark cannot return',async()=>{
    await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".btn-hard")');
    await b.evaluate('document.querySelector(".btn-hard").click()');
    const result=await b.evaluate('(()=>{const progress=JSON.parse(localStorage.getItem("vocab-progress-v1"));const learning=JSON.parse(localStorage.getItem("vocab-learning-v1"));return {removed:!progress["g01:perceive"],clearedAt:learning.clearedProgress&&learning.clearedProgress["g01:perceive"]};})()');
    assert.equal(result.removed,true);assert.equal(typeof result.clearedAt,'number');
    await b.evaluate('document.querySelector(".btn-hard").click()');
    assert.ok(await b.evaluate('JSON.parse(localStorage.getItem("vocab-progress-v1"))["g01:perceive"].t')>result.clearedAt);
  });
  await t.test('backup preview merges comparison notes without restoring an older cancelled word or inventing activity',async()=>{
    await b.evaluate('const p=JSON.parse(localStorage.getItem("vocab-progress-v1"));delete p["g01:perceive"];localStorage.setItem("vocab-progress-v1",JSON.stringify(p));const l=JSON.parse(localStorage.getItem("vocab-learning-v1"));l.clearedProgress["g01:perceive"]=20;localStorage.setItem("vocab-learning-v1",JSON.stringify(l))');
    await b.call('open',b.url+'#/settings');await b.call('reload');await b.wait('!!document.querySelector("#importText")');
    const before=await b.evaluate('JSON.parse(localStorage.getItem("vocab-activity-v1")).length');
    const relation={gid:'g01',sourceWord:'perceive',kind:'synonym',word:'sense',note:'辨析 <img src=x onerror=alert(1)> 保留为文字',active:true,updatedAt:30};
    const key=JSON.stringify(['g01','perceive','synonym','sense']);
    const backup={v:2,words:{'g01:perceive':{s:'hard',t:10}},learning:{comparisons:{[key]:relation}},activity:[]};
    await b.call('fill','#importText',JSON.stringify(backup));await b.evaluate('document.querySelector("[data-action=import-preview]").click()');
    assert.equal(await b.evaluate('document.querySelector("#importApply").disabled'),false);
    await b.evaluate('document.querySelector("#importApply").click()');
    assert.equal(await b.evaluate('Object.hasOwn(JSON.parse(localStorage.getItem("vocab-progress-v1")),"g01:perceive")'),false);
    assert.equal(await b.evaluate('JSON.parse(localStorage.getItem("vocab-activity-v1")).length'),before);
    await b.call('open',b.url+'#/review');await b.wait('!!document.querySelector("[data-book-tab=synonym]")');
    await b.evaluate('document.querySelector("[data-book-tab=synonym]").click()');await b.wait('!!document.querySelector(".comparison-card")');
    assert.equal(await b.evaluate('document.querySelectorAll(".comparison-card img").length'),0);
    assert.match(await b.evaluate('document.querySelector(".comparison-note").textContent'),/<img/);
  });
  await t.test('leaving a quiz for settings then navigating back never leaves an empty study area',async()=>{
    await b.call('open',b.url+'#/');await b.wait('!!document.querySelector(".group-grid")');
    await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector("[data-mode=quiz]")');
    await b.evaluate('document.querySelector("[data-mode=quiz]").click()');
    await b.call('open',b.url+'#/settings');await b.wait('!!document.querySelector(".settings")');
    await b.call('back');await b.wait('!!document.querySelector(".mode-pills")');
    assert.ok(await b.evaluate('document.querySelector("#cardArea").textContent.trim().length>0'));
    assert.ok(await b.evaluate('!!document.querySelector(".wcard-word") || !!document.querySelector(".quiz-shell")'));
  });
});
