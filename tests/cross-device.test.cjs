const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {browserFixture}=require('./browser-helper.cjs');
const initScript=path.join(__dirname,'fixtures/cloud-proxy.js');
function cloudFixture(){
  const entries=new Map(),releases=[],waiting=[];let held=false,failReads=false,failAux=false;
  async function cloud(req,res,key){
    if(held&&req.method!=='POST')await new Promise(resolve=>{releases.push(resolve);waiting.splice(0).forEach(notify=>notify());});
    if(req.method==='POST'){
      let data='';for await(const chunk of req)data+=chunk;
      const form=new URLSearchParams(data);entries.set(form.get('key'),JSON.parse(form.get('value')));
      res.setHeader('Content-Type','application/json');res.end('{"status":1}');return;
    }
    if(failReads||(failAux&&key.startsWith('vocab-learning-'))){res.writeHead(503);res.end('unavailable');return;}
    res.setHeader('Content-Type','text/plain');res.end(entries.has(key)?JSON.stringify(entries.get(key)):'');
  }
  return {entries,cloud,hold:()=>{held=true;},waitHeld:()=>releases.length?Promise.resolve():new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('sync did not request the held cloud read')),5000);waiting.push(()=>{clearTimeout(timer);resolve();});}),resume:()=>{held=false;releases.splice(0).forEach(release=>release());},fail:value=>{failReads=value;},failMetadata:value=>{failAux=value;}};
}
async function route(b,hash,selector){await b.call('open',b.url+hash);await b.wait('!!document.querySelector('+JSON.stringify(selector)+')');}
test('an unpaired desktop explains its local empty state and does not imply the mobile collection was deleted',{timeout:120000},async t=>{
  const b=await browserFixture(t);await b.call('set','viewport','1920','1080');await route(b,'#/review','.book-view');
  const state=await b.evaluate('({text:document.querySelector(".book-sync-panel")?.textContent,link:document.querySelector(".book-sync-panel a")?.getAttribute("href"),hasCode:!!localStorage.getItem("vocab-sync-v1")})');
  assert.match(state.text||'',/未配对|尚未配对/);assert.match(state.text||'',/电脑|手机|其他设备/);
  assert.equal(state.link,'#/settings');assert.equal(state.hasCode,false);
});
test('desktop and mobile exchange all three collections through the same code and surface sync errors',{timeout:240000},async t=>{
  const c=cloudFixture(),phone=await browserFixture(t,{initScript,cloud:c.cloud});
  await phone.call('set','viewport','390','844');await route(phone,'#/group/g01','.wcard-word');
  await phone.evaluate('document.querySelector(".btn-hard").click();document.querySelector("[data-action=favorite][data-kind=confusable]").click();document.querySelector("[data-action=favorite][data-kind=synonym]").click()');
  await route(phone,'#/settings','.settings');await phone.evaluate('document.querySelector("[data-action=gen-code]").click()');
  await phone.wait('JSON.parse(localStorage.getItem("vocab-sync-v1")||"null")?.lastSync>0');
  const code=await phone.evaluate('JSON.parse(localStorage.getItem("vocab-sync-v1")).code');
  const desk=await browserFixture(t,{initScript,cloud:c.cloud});await desk.call('set','viewport','1440','1000');
  await t.test('an unknown code does not replace the pairing or create an empty cloud account',async()=>{
    await route(desk,'#/settings','.settings');const before=c.entries.size;
    await desk.call('fill','#bindInput','vocab-code-that-does-not-exist');
    await desk.evaluate('document.querySelector("[data-action=bind-code]").click()');
    await desk.evaluate('new Promise(resolve=>setTimeout(resolve,500))');
    assert.equal(await desk.evaluate('localStorage.getItem("vocab-sync-v1")'),null);
    assert.equal(c.entries.size,before);
    assert.match(await desk.evaluate('document.querySelector("#syncStatus").textContent'),/找到|不存在|检查/);
  });
  await t.test('binding the same code populates words and both comparison categories without refreshing',async()=>{
    await desk.call('fill','#bindInput',code);await desk.evaluate('document.querySelector("[data-action=bind-code]").click()');
    await desk.wait('Object.values(JSON.parse(localStorage.getItem("vocab-learning-v1")||"{}").comparisons||{}).filter(x=>x.active).length===2');
    await route(desk,'#/review','.word-fold');
    await desk.wait('document.querySelector(".book-sync-panel")?.dataset.syncState==="ready"');
    assert.match(await desk.evaluate('document.querySelector("#bookTab_words").textContent'),/1 条/);
    assert.match(await desk.evaluate('document.querySelector("#bookTab_confusable").textContent'),/1 条/);
    assert.match(await desk.evaluate('document.querySelector("#bookTab_synonym").textContent'),/1 条/);
    assert.match(await desk.evaluate('document.querySelector(".book-sync-panel").textContent'),/同步|连接/);
  });
  await t.test('incoming favorites repaint while a group filter is focused instead of leaving old counts',async()=>{
    await route(phone,'#/group/g01','.wcard-word');
    await phone.evaluate('document.querySelector("[data-action=favorite][data-related=receive]").click()');
    await route(phone,'#/settings','.settings');await phone.evaluate('document.querySelector("[data-action=sync-now]").click()');
    await phone.wait('!document.querySelector("[data-action=sync-now]").disabled');
    await desk.wait('document.querySelector(".book-sync-panel")?.dataset.syncState==="ready"');
    c.hold();
    try{
      await desk.evaluate('(()=>{const button=document.querySelector(".book-sync-panel [data-action=sync-now]");if(button.disabled)throw Error("sync button unexpectedly disabled");button.click();document.querySelector("#bookGroup").focus();})()');
      await c.waitHeld();
      assert.match(await desk.evaluate('document.querySelector(".book-sync-panel").textContent'),/正在核对|正在读取|正在同步/);
    }finally{c.resume();}
    await desk.wait('document.querySelector("#bookTab_confusable")?.textContent.includes("2 条")');
    assert.equal(await desk.evaluate('document.activeElement.id'),'bookGroup');
    assert.equal(await desk.evaluate('document.querySelector(".word-fold").open'),false);
  });
  await t.test('a network failure is visible on the collection page and retry recovers with no data loss',async()=>{
    await desk.wait('document.querySelector(".book-sync-panel")?.dataset.syncState==="ready"');
    c.fail(true);await desk.evaluate('document.querySelector(".book-sync-panel [data-action=sync-now]").click()');
    await desk.wait('document.querySelector(".book-sync-panel")?.textContent.includes("未完成")');
    assert.equal(await desk.evaluate('Object.values(JSON.parse(localStorage.getItem("vocab-progress-v1"))).filter(x=>x.s==="hard").length'),1);
    await route(desk,'#/settings','.settings');
    assert.match(await desk.evaluate('document.querySelector("#syncStatus").textContent'),/未完成/);
    await route(desk,'#/review','.book-view');
    c.fail(false);await desk.evaluate('document.querySelector(".book-sync-panel [data-action=sync-now]").click()');
    await desk.wait('document.querySelector(".book-sync-panel")?.dataset.syncState==="ready"');
    assert.equal(await desk.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  });
  await t.test('unavailable comparison metadata is shown as partial sync, not an empty successful collection',async()=>{
    await desk.wait('document.querySelector(".book-sync-panel")?.dataset.syncState==="ready"');
    c.failMetadata(true);await desk.evaluate('document.querySelector(".book-sync-panel [data-action=sync-now]").click()');
    await desk.wait('document.querySelector(".book-sync-panel")?.dataset.syncState==="partial"');
    assert.match(await desk.evaluate('document.querySelector(".book-sync-panel").textContent'),/辨析收藏尚未同步/);
    assert.equal(await desk.evaluate('Object.values(JSON.parse(localStorage.getItem("vocab-learning-v1")).comparisons).filter(x=>x.active).length'),3);
    c.failMetadata(false);await desk.evaluate('document.querySelector(".book-sync-panel [data-action=sync-now]").click()');
    await desk.wait('document.querySelector(".book-sync-panel")?.dataset.syncState==="ready"');
  });
  await t.test('desktop changes return to the phone and a browser reload preserves them',async()=>{
    await route(desk,'#/group/g01','.wcard-word');await desk.evaluate('document.querySelector("[data-action=favorite][data-related=deceive]").click()');
    await route(desk,'#/settings','.settings');await desk.evaluate('document.querySelector("[data-action=sync-now]").click()');await desk.wait('!document.querySelector("[data-action=sync-now]").disabled');
    await route(phone,'#/review','.word-fold');await phone.evaluate('document.querySelector(".book-sync-panel [data-action=sync-now]").click()');
    await phone.wait('document.querySelector("#bookTab_confusable")?.textContent.includes("3 条")');
    await phone.call('reload');await phone.wait('document.querySelector("#bookTab_confusable")?.textContent.includes("3 条")');
    assert.match(await phone.evaluate('document.querySelector("#bookTab_synonym").textContent'),/1 条/);
    assert.equal(await phone.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  });
  await t.test('desktop viewport and pagination do not hide a large comparison collection',async()=>{
    await desk.call('set','viewport','1920','1080');await route(desk,'#/review','.book-view');
    await desk.evaluate('document.querySelector("[data-book-tab=confusable]").click()');
    await desk.wait('!!document.querySelector(".comparison-fold")');
    assert.equal(await desk.evaluate('document.querySelectorAll(".comparison-card").length'),3);
    assert.equal(await desk.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    assert.match(await desk.evaluate('document.querySelector(".book-sync-panel").textContent'),/已完成本轮同步|已配对/);
  });
});
test('two tabs in the same browser update saved collections immediately without a cloud code',{timeout:120000},async t=>{
  const b=await browserFixture(t);await b.call('set','viewport','1440','1000');await route(b,'#/review','.book-view');
  const tabs=await b.call('tab','list'),firstId=(tabs.tabs.find(tab=>tab.active)||tabs.tabs[0]).tabId;
  await b.call('tab','new',b.url+'#/group/g01');await b.wait('!!document.querySelector(".wcard-word")');
  await b.evaluate('document.querySelector(".btn-hard").click();document.querySelector("[data-action=favorite][data-kind=confusable]").click()');
  await b.call('tab',String(firstId));
  await b.wait('document.querySelector("#bookTab_words")?.textContent.includes("1 条")&&document.querySelector("#bookTab_confusable")?.textContent.includes("1 条")');
  assert.ok(await b.evaluate('!!document.querySelector(".word-fold")'));
  assert.equal(await b.evaluate('localStorage.getItem("vocab-sync-v1")'),null);
  assert.match(await b.evaluate('document.querySelector(".book-sync-panel").textContent'),/未配对/);
});
test('pairing changed in another tab updates settings controls without losing an in-progress backup',{timeout:120000},async t=>{
  const c=cloudFixture(),b=await browserFixture(t,{initScript,cloud:c.cloud});await route(b,'#/settings','.settings');
  await b.call('fill','#importText','unsubmitted backup draft');
  const first=(await b.call('tab','list')).tabs.find(tab=>tab.active).tabId;
  await b.call('tab','new',b.url+'#/settings');await b.wait('!!document.querySelector("[data-action=gen-code]")');
  await b.evaluate('document.querySelector("[data-action=gen-code]").click()');
  await b.wait('JSON.parse(localStorage.getItem("vocab-sync-v1")||"null")?.lastSync>0');
  const originalCode=await b.evaluate('JSON.parse(localStorage.getItem("vocab-sync-v1")).code');
  await b.call('tab',first);
  assert.equal(await b.evaluate('!!document.querySelector("[data-action=gen-code]")'),false);
  assert.equal(await b.evaluate('document.querySelector(".code-text")?.textContent'),originalCode);
  assert.equal(await b.evaluate('document.querySelector("#importText").value'),'unsubmitted backup draft');
  const replacement='vocab-verified-replacement',record={v:1,words:{},updatedAt:1};c.entries.set(replacement,record);
  await b.call('tab','new',b.url+'#/settings');await b.wait('!!document.querySelector("#bindInput")');
  await b.call('fill','#bindInput',replacement);await b.evaluate('document.querySelector("[data-action=bind-code]").click()');
  const rebound=await b.evaluate('(async()=>{const end=Date.now()+6000;while(Date.now()<end){if(JSON.parse(localStorage.getItem("vocab-sync-v1")||"null")?.code==="vocab-verified-replacement")return {matched:true};await new Promise(resolve=>setTimeout(resolve,100));}return {matched:false,status:document.querySelector("#syncStatus")?.textContent,proxyInstalled:typeof cloudSession!=="undefined",buttonBusy:document.querySelector("[data-action=bind-code]")?.disabled};})()');
  assert.equal(rebound.matched,true,JSON.stringify(rebound));
  await b.call('tab',first);
  await b.wait('document.querySelector(".code-text")?.textContent==="vocab-verified-replacement"');
  assert.equal(await b.evaluate('document.querySelector("#importText").value'),'unsubmitted backup draft');
});
