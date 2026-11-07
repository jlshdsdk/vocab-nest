const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
test('marking and navigation do not rebuild or jerk the mobile reading controls',{timeout:120000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','390','844');
  await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".wcard-word")');
  await t.test('marking keeps the card, focus, expanded sections and exact scroll position',async()=>{
    const result=await b.evaluate('(async()=>{const card=document.querySelector(".wcard"),button=document.querySelector(".btn-mastered"),details=card.querySelector("details");details.open=true;button.scrollIntoView({block:"center"});button.focus({preventScroll:true});const before={y:scrollY,height:card.getBoundingClientRect().height};button.click();await new Promise(r=>setTimeout(r,300));return {sameCard:card===document.querySelector(".wcard"),sameButton:button===document.querySelector(".btn-mastered"),focus:document.activeElement===button,open:details.open,yChange:scrollY-before.y,heightChange:document.querySelector(".wcard").getBoundingClientRect().height-before.height,active:document.querySelector(".btn-mastered").getAttribute("aria-pressed")};})()');
    assert.equal(result.sameCard,true);assert.equal(result.sameButton,true);assert.equal(result.focus,true);
    assert.equal(result.open,true);assert.ok(Math.abs(result.yChange)<=1,JSON.stringify(result));assert.ok(Math.abs(result.heightChange)<=1,JSON.stringify(result));assert.equal(result.active,'true');
  });
  await t.test('pressing next from the top keeps the header stable and never runs card entrance motion',async()=>{
    const result=await b.evaluate('(async()=>{window.scrollTo(0,0);const header=document.querySelector(".group-header"),before={y:scrollY,top:header.getBoundingClientRect().top};document.querySelector("[data-action=next]").click();const immediate={y:scrollY,animated:document.getAnimations().some(a=>a.effect?.target?.id==="cardWrap")};await new Promise(r=>setTimeout(r,250));return {word:document.querySelector(".wcard-word").textContent,y:scrollY,before,immediate,headerSame:header===document.querySelector(".group-header")};})()');
    assert.equal(result.word,'aggravate');assert.equal(result.headerSame,true);
    assert.ok(Math.abs(result.y-result.before.y)<=1,JSON.stringify(result));assert.equal(result.immediate.animated,false);
  });
  await t.test('mark and navigation targets are reachable together above the mobile tabbar',async()=>{
    const result=await b.evaluate('(()=>{const selectors=[".btn-hard",".btn-mastered","[data-action=next]"];return {height:innerHeight,navTop:document.querySelector(".tabbar").getBoundingClientRect().top,targets:selectors.map(selector=>{const box=document.querySelector(selector).getBoundingClientRect();return {selector,top:box.top,bottom:box.bottom,height:box.height};})};})()');
    for(const target of result.targets){assert.ok(target.top>=0&&target.bottom<=result.navTop,JSON.stringify(result));assert.ok(target.height>=44);}
  });
  await t.test('a readers collapsed comparison and expanded usage stay that way on the next word',async()=>{
    const result=await b.evaluate('(()=>{const sections=Array.from(document.querySelectorAll(".word-section"));const usage=sections.find(node=>node.querySelector("summary").textContent.includes("用法"));const comparisons=sections.find(node=>node.querySelector("summary").textContent.includes("近形"));usage.open=true;comparisons.open=false;document.querySelector("[data-action=next]").click();const after=Array.from(document.querySelectorAll(".word-section"));return {usage:after.find(node=>node.querySelector("summary").textContent.includes("用法")).open,comparisons:after.find(node=>node.querySelector("summary").textContent.includes("近形")).open};})()');
    assert.equal(result.usage,true);assert.equal(result.comparisons,false);
  });
  await t.test('switching between cards, list and quiz keeps the group heading in place',async()=>{
    const positions=await b.evaluate(`(()=>{
      window.scrollTo(0,0);const top=()=>document.querySelector('.group-header').getBoundingClientRect().top;
      const cards=top();document.querySelector('[data-mode=list]').click();const list=top();
      document.querySelector('[data-mode=cards]').click();document.querySelector('[data-mode=quiz]').click();const quiz=top();
      document.querySelector('[data-mode=cards]').click();return {cards,list,quiz};
    })()`);
    assert.ok(Math.abs(positions.cards-positions.list)<=1,JSON.stringify(positions));
    assert.ok(Math.abs(positions.cards-positions.quiz)<=1,JSON.stringify(positions));
  });
  await t.test('choosing a word near the bottom of a list shows its headword rather than a random lower section',async()=>{
    await b.evaluate('document.querySelector("[data-mode=list]").click()');
    await b.call('scrollintoview','[data-action=goto][data-index="19"]');
    await b.call('click','[data-action=goto][data-index="19"]');
    const box=await b.evaluate('document.querySelector(".wcard-word").getBoundingClientRect().toJSON()');
    assert.ok(box.top>=0&&box.bottom<=600,JSON.stringify(box));
  });
});
