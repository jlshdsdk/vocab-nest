const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
test('a real old service worker upgrades with legacy data and keeps visited groups offline',{timeout:180000},async t=>{
  const b=await browserFixture(t,{ref:'2174639bf5568b9f6dc23b1198e1eee041a31807',cacheSeconds:600,controlPage:true});
  await b.wait('!!document.querySelector(".group-grid")');
  await b.evaluate('localStorage.setItem("vocab-progress-v1",JSON.stringify({"g01:perceive":{s:"hard",t:1234},"unloaded:forgotten":{s:"hard",t:42}}));localStorage.setItem("vocab-prefs-v1",JSON.stringify({theme:"dark",customPreference:7}));navigator.serviceWorker.ready.then(()=>true)');
  b.setRef(null);
  await b.evaluate('navigator.serviceWorker.getRegistration().then(registration=>registration.update()).then(()=>true)');
  await b.wait('navigator.serviceWorker.getRegistration().then(registration=>!!registration.waiting)');
  await b.call('open',b.url.replace('/vocab-nest/','/__test_control__'));
  await b.wait('navigator.serviceWorker.getRegistration("/vocab-nest/").then(registration=>registration && !registration.waiting && !registration.installing && registration.active.state==="activated")');
  await b.call('open',b.url);await b.wait('!!document.querySelector(".group-grid")');
  assert.deepEqual(await b.evaluate('JSON.parse(localStorage.getItem("vocab-progress-v1"))'),{'g01:perceive':{s:'hard',t:1234},'unloaded:forgotten':{s:'hard',t:42}});
  assert.equal(await b.evaluate('JSON.parse(localStorage.getItem("vocab-prefs-v1")).customPreference'),7);
  await b.call('open',b.url+'#/review');await b.wait('!!document.querySelector(".book-view")');
  assert.match(await b.evaluate('document.querySelector(".book-view").textContent'),/forgotten/);
  await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".wcard-word")');
  b.setOriginOffline(true);await b.call('set','offline','on');await b.call('reload');await b.wait('!!document.querySelector(".wcard-word")');
  assert.equal(await b.evaluate('document.querySelector(".wcard-word").textContent'),'perceive');
  await b.call('open',b.url+'#/group/g02');await b.wait('!!document.querySelector("[data-action=retry]") || !!document.querySelector(".wcard-word")');
  const offlineResult=await b.evaluate('({retry:!!document.querySelector("[data-action=retry]"),word:document.querySelector(".wcard-word")?.textContent})');
  assert.equal(offlineResult.retry,true,'uncached offline result: '+JSON.stringify(offlineResult)+'; origin received g02='+b.requests.some(url=>url.includes('/data/groups/g02.json')));
  assert.match(await b.evaluate('document.querySelector(".empty-state").textContent'),/暂时|加载|重试/);
  b.setOriginOffline(false);await b.call('set','offline','off');await b.evaluate('document.querySelector("[data-action=retry]").click()');
  await b.wait('!!document.querySelector(".wcard-word")');
  assert.ok(await b.evaluate('document.querySelector(".wcard-word").textContent.length>0'));
});

test('an upgrade keeps old scripts together while an old page is open, then starts the new shell',{timeout:180000},async t=>{
  const b=await browserFixture(t,{ref:'dd88c73d7df0789f83982464c7b67830e80a2f11',controlPage:true});
  await b.wait('!!document.querySelector(".group-grid") && !!navigator.serviceWorker.controller');
  await b.evaluate('localStorage.setItem("vocab-progress-v1",JSON.stringify({"g01:perceive":{s:"hard",t:1234}}))');
  b.setRef(null);
  await b.evaluate('navigator.serviceWorker.getRegistration().then(registration=>registration.update()).then(()=>true)');
  const result=await b.evaluate(`(async()=>{
    const registration=await navigator.serviceWorker.getRegistration();
    if(registration.installing)await new Promise(resolve=>{const worker=registration.installing;worker.addEventListener('statechange',()=>{if(worker.state==='installed'||worker.state==='activated'||worker.state==='redundant')resolve();});});
    await new Promise(resolve=>setTimeout(resolve,100));
    return {waiting:!!registration.waiting,oldLearning:typeof VocabLearning.dailyPlan==='undefined',
      oldApp:!(await (await fetch('js/app.js')).text()).includes('L.dailyPlan')};
  })()`);
  assert.equal(result.waiting,true,'the new worker must wait while the old document is alive');
  assert.equal(result.oldLearning,true);assert.equal(result.oldApp,true,'the old document must continue to receive its matching script');
  await b.call('open',b.url.replace('/vocab-nest/','/__test_control__'));
  await b.wait('navigator.serviceWorker.getRegistration("/vocab-nest/").then(registration=>registration && !registration.waiting && !registration.installing && registration.active.state==="activated")');
  await b.call('open',b.url);await b.wait('typeof VocabLearning.dailyPlan === "function" && !!document.querySelector(".group-grid")');
  assert.deepEqual(await b.evaluate('JSON.parse(localStorage.getItem("vocab-progress-v1"))["g01:perceive"]'),{s:'hard',t:1234});
  b.setFutureWorker(true);
  await b.evaluate('navigator.serviceWorker.getRegistration().then(registration=>registration.update()).then(()=>true)');
  await b.wait('navigator.serviceWorker.getRegistration().then(registration=>!!registration.waiting)');
  await b.wait('!document.querySelector("#updateNotice").hidden');
  assert.match(await b.evaluate('document.querySelector("#updateNotice").textContent'),/关闭.*标签|退出.*主屏/);
  await b.call('reload');await b.wait('!!document.querySelector(".group-grid")');
  await b.evaluate('new Promise(resolve=>setTimeout(()=>resolve(true),1000))');
  assert.equal(await b.evaluate('document.querySelector("#updateNotice").hidden'),false,'an already waiting update remains visible after refresh');
});
