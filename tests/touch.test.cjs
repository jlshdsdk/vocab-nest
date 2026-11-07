const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');
test('a cancelled mobile gesture cannot leak into a later favorite-button tap',{timeout:120000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','360','800');
  await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".wcard-word")');
  const result=await b.evaluate('(()=>{document.querySelector("#view").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));const before=document.querySelector(".wcard-word").textContent;const button=document.querySelector("[data-action=favorite]"),target=button.closest("li").querySelector("strong");button.closest("details.word-section").open=true;target.scrollIntoView({block:"center"});const box=button.getBoundingClientRect(),y=box.y+box.height/2;function send(type,node,x){const touch=new Touch({identifier:1,target:node,clientX:x,clientY:y});node.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:type==="touchstart"?[touch]:[],targetTouches:type==="touchstart"?[touch]:[],changedTouches:[touch]}));}send("touchstart",target,60);send("touchcancel",target,60);send("touchstart",button,box.x+box.width/2);send("touchend",button,box.x+box.width/2);return {before,after:document.querySelector(".wcard-word").textContent};})()');
  assert.equal(result.before,'aggravate');
  assert.equal(result.after,result.before);
});
