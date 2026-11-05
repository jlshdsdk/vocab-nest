const test = require('node:test');
const assert = require('node:assert/strict');
const {browserFixture} = require('./browser-helper.cjs');
test('mobile layout and classical type remain usable across existing routes', {timeout:180000}, async t=>{
  const b=await browserFixture(t);
  await b.wait('!!document.querySelector(".group-grid")');
  await t.test('the complete collection is revealed in small batches without losing any group',async()=>{
    assert.equal(await b.evaluate('document.querySelectorAll(".group-grid .group-card").length'),12);
    await b.evaluate('document.querySelector("[data-action=home-more]").click()');
    assert.equal(await b.evaluate('document.querySelectorAll(".group-grid .group-card").length'),24);
    const result=await b.evaluate('(()=>{while(document.querySelector("[data-action=home-more]"))document.querySelector("[data-action=home-more]").click();return {count:document.querySelectorAll(".group-grid .group-card").length,last:document.querySelector(".group-grid").lastElementChild.getAttribute("href")};})()');
    assert.equal(result.count,134);assert.equal(result.last,'#/group/g134');
  });
  await t.test('360px hero gives its heading a readable full-width line',async()=>{
    await b.call('set','viewport','360','800');
    const m=await b.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,titleWidth:document.querySelector(".home-hero h1").getBoundingClientRect().width})');
    assert.ok(m.scrollWidth<=m.width,'page must not overflow');
    assert.ok(m.titleWidth>=240,'mobile title must not be squeezed into a narrow column: '+m.titleWidth);
  });
  await t.test('word headwords use a literary serif instead of the old system sans',async()=>{
    await b.call('open',b.url+'#/group/g01');
    await b.wait('!!document.querySelector(".wcard-word")');
    const m=await b.evaluate('({family:getComputedStyle(document.querySelector(".wcard-word")).fontFamily,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,phonetics:document.querySelectorAll(".phonetic-btn").length,targets:Array.from(document.querySelectorAll(".phonetic-btn")).map(x=>x.getBoundingClientRect().height)})');
    assert.match(m.family,/Cormorant/);
    assert.ok(m.scrollWidth<=m.width);
    assert.equal(m.phonetics,2);
    assert.ok(m.targets.every(x=>x>=44));
  });
  await t.test('legacy notebook and settings routes still render usable content',async()=>{
    await b.call('open',b.url+'#/review');
    await b.wait('!!document.querySelector("h1")');
    assert.match(await b.evaluate('document.querySelector("h1").textContent'),/生词|收藏/);
    await b.call('open',b.url+'#/settings');
    await b.wait('!!document.querySelector(".settings")');
    assert.ok(await b.evaluate('!!document.querySelector("#bindInput") && !!document.querySelector("#importText")'));
  });
  await t.test('spoken examples inherit the reading surface instead of native button grey',async()=>{
    await b.call('open',b.url+'#/group/g01');
    await b.wait('!!document.querySelector(".example-en")');
    const m=await b.evaluate('({background:getComputedStyle(document.querySelector(".example-en")).backgroundColor,alignment:getComputedStyle(document.querySelector(".example-en")).textAlign})');
    assert.equal(m.background,'rgba(0, 0, 0, 0)');
    assert.equal(m.alignment,'left');
  });
  await t.test('360, 390, 430px and desktop layouts fit without hiding content',async()=>{
    for(const width of [360,390,430,1280]){
      await b.call('set','viewport',String(width),'900');
      const m=await b.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,viewWidth:document.querySelector("#view").getBoundingClientRect().width})');
      assert.ok(m.scrollWidth<=m.width,'overflow at '+width);assert.ok(m.viewWidth<=1080,'desktop width cap');
    }
  });
  await t.test('month-white theme keeps AA text contrast and reduced motion removes animations',async()=>{
    await b.evaluate('if(document.documentElement.dataset.theme!=="light")document.querySelector("#btnTheme").click()');
    assert.equal(await b.evaluate('document.documentElement.dataset.theme'),'light');
    const contrast=await b.evaluate('(()=>{const numbers=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number);const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const style=getComputedStyle(document.body),a=lum(numbers(style.color)),c=lum(numbers(style.backgroundColor));return (Math.max(a,c)+.05)/(Math.min(a,c)+.05);})()');
    assert.ok(contrast>=4.5);
    await b.call('set','media','light','reduced-motion');
    const result=await b.evaluate('({reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,animations:document.getAnimations().filter(a=>a.playState==="running").length})');
    assert.equal(result.reduced,true);assert.equal(result.animations,0);
  });
  await t.test('skip link focuses the current study view without changing its hash route',async()=>{
    await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".wcard-word")');
    const result=await b.evaluate('document.querySelector(".skip-link").click();({hash:location.hash,focus:document.activeElement.id})');
    assert.equal(result.hash,'#/group/g01');assert.equal(result.focus,'view');
  });
  await t.test('a missing group ends its loading state and offers a usable way back',async()=>{
    await b.call('open',b.url+'#/group/missing');await b.wait('!!document.querySelector(".empty-state")');
    assert.equal(await b.evaluate('document.querySelector("#view").getAttribute("aria-busy")'),'false');
  });
  await t.test('pronunciation controls include their visible text in the accessible name',async()=>{
    await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".phonetic-btn")');
    const missing=await b.evaluate('Array.from(document.querySelectorAll(".phonetic-btn,.example-en")).filter(node=>!node.getAttribute("aria-label").replace(/\\s+/g," ").includes(node.textContent.trim().replace(/\\s+/g," "))).map(node=>node.textContent.trim())');
    assert.deepEqual(missing,[]);
  });
});
