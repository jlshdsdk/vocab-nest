const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {browserFixture}=require('./browser-helper.cjs');
test('speech initialization is deferred without breaking the first user-gesture pronunciation',{timeout:120000},async t=>{
  const b=await browserFixture(t,{initScript:path.join(__dirname,'fixtures/speech-spy.js')});
  await b.wait('!!document.querySelector(".group-grid")');
  await t.test('homepage does not initialize the native speech engine',async()=>{
    const touches=await b.evaluate('window.__speechTouches');
    assert.equal(touches,0,'startup accessed native speech '+touches+' times');
  });
  await t.test('the first UK button still speaks in its synchronous user-gesture stack',async()=>{
    await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".phonetic-btn")');
    await b.call('click','.phonetic-btn[data-accent="uk"]');
    const call=await b.evaluate('window.__speechCalls[0]');
    assert.deepEqual({text:call.text,lang:call.lang,gesture:call.gesture},{text:'perceive',lang:'en-GB',gesture:true});
    assert.ok(Math.abs(call.rate-.85)<0.000001,'Web Speech exposes rate as a float32');
  });
});
