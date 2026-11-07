const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');

test('home filters distinguish untouched, active, due and completed groups',{timeout:180000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','375','812');
  await b.evaluate(`(async()=>{
    const manifest=await (await fetch('data/manifest.json')).json();
    const progress={'g01:perceive':{s:'hard',t:1},'g02:refute':{s:'mastered',t:Date.now()}};
    manifest.groups.find(group=>group.id==='g03').words.forEach(word=>{progress['g03:'+word]={s:'mastered',t:Date.now()};});
    localStorage.setItem('vocab-progress-v1',JSON.stringify(progress));
    localStorage.setItem('vocab-learning-v1',JSON.stringify({resume:{gid:'g04',idx:7,updatedAt:Date.now()}}));
  })()`);
  await b.call('reload');await b.wait('!!document.querySelector(".group-grid")');
  assert.equal(await b.evaluate('document.querySelectorAll("[data-action=home-filter]").length'),5,'group filters should be available');
  async function select(name){
    return b.evaluate(`(()=>{document.querySelector('[data-action=home-filter][data-filter="${name}"]').click();return {
      selected:document.querySelector('[data-action=home-filter][data-filter="${name}"]').getAttribute('aria-pressed'),
      groups:Array.from(document.querySelectorAll('.group-grid .group-card')).map(node=>node.getAttribute('href')),
      width:document.documentElement.scrollWidth,viewport:innerWidth};})()`);
  }
  let result=await select('due');assert.equal(result.selected,'true');assert.deepEqual(result.groups,['#/group/g01']);
  result=await select('active');assert.deepEqual(result.groups,['#/group/g01','#/group/g02','#/group/g04']);
  result=await select('done');assert.deepEqual(result.groups,['#/group/g03']);
  result=await select('new');assert.equal(result.groups[0],'#/group/g05');assert.ok(!result.groups.includes('#/group/g04'));
  assert.ok(result.width<=result.viewport);
  result=await select('all');assert.equal(result.groups.length,12);assert.equal(result.groups[0],'#/group/g01');
});
