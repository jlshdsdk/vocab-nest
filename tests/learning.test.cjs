const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const L=fs.existsSync(require('node:path').join(__dirname,'../js/learning.js'))?require('../js/learning.js'):{};
const now=1700000000000,DAY=86400000;
test('three grades produce distinct future reviews with a bounded ease',()=>{
  assert.equal(typeof L.schedule,'function');
  assert.equal(L.schedule(null,'known',now).due,now+DAY);
  assert.equal(L.schedule(null,'fuzzy',now).due,now+DAY/2);
  assert.equal(L.schedule(null,'forgot',now).due,now+600000);
  assert.equal(L.schedule({interval:6,ease:2.5,repetitions:2},'known',now).interval,15);
  assert.equal(L.schedule({ease:1.3},'forgot',now).ease,1.3);
});
test('today queue deduplicates marked hard and due words without readding completed words',()=>{
  assert.equal(typeof L.todayQueue,'function');
  const manifest={groups:[{id:'g01',words:['a','b','c']}]};
  const progress={'g01:a':{s:'hard',t:1},'g01:b':{s:'mastered',t:1}};
  const learning={review:{'g01:b':{due:now-1,lastReviewed:0},'g01:c':{due:now+DAY,lastReviewed:now}},wrongQueue:{}};
  assert.deepEqual(L.todayQueue(manifest,progress,learning,now),['g01:a','g01:b']);
  learning.review['g01:a']={due:now+DAY,lastReviewed:now};
  assert.deepEqual(L.todayQueue(manifest,progress,learning,now),['g01:b']);
});
test('case and hyphens are tolerated while wrong letters are identified',()=>{
  assert.equal(typeof L.compareAnswer,'function');
  assert.equal(L.compareAnswer('COOPERATE','co-operate').correct,true);
  assert.equal(L.compareAnswer(' receive ','receive').correct,true);
  const wrong=L.compareAnswer('recieve','receive');
  assert.equal(wrong.correct,false);
  assert.ok(wrong.letters.some(x=>!x.correct));
});
test('wrong queue requires two consecutive correct answers and preserves a sync cancellation',()=>{
  assert.equal(typeof L.updateWrongQueue,'function');
  let q=L.updateWrongQueue({},'g01:a',false,now);
  q=L.updateWrongQueue(q,'g01:a',true,now+1);
  assert.equal(q['g01:a'].active,true);
  q=L.updateWrongQueue(q,'g01:a',false,now+2);
  assert.equal(q['g01:a'].streak,0);
  q=L.updateWrongQueue(L.updateWrongQueue(q,'g01:a',true,now+3),'g01:a',true,now+4);
  assert.equal(q['g01:a'].active,false);
});
test('multiple choice uses four unique real definitions and correct target',()=>{
  assert.equal(typeof L.makeQuestion,'function');
  const words=[{word:'a',definition:'甲'},{word:'b',definition:'乙'},{word:'c',definition:'乙'},{word:'d',definition:'丙'},{word:'e',definition:'丁'}];
  const q=L.makeQuestion('choice',words[0],words,()=>0.4);
  assert.equal(new Set(q.options.map(x=>x.label)).size,4);
  assert.equal(q.options.filter(x=>x.correct).length,1);
  assert.equal(L.makeQuestion('choice',words[0],words.slice(0,2),()=>0.4),null);
});
test('listening questions hide the written word and retain four distinct answer choices',()=>{
  const words=[{word:'perceive',definition:'察觉'},{word:'rescue',definition:'营救'},{word:'revise',definition:'修订'},{word:'suspend',definition:'暂停'}];
  const q=L.makeQuestion('listen',words[0],words,()=>0.4);
  assert.equal(q.type,'listen');assert.equal(q.answer,'perceive');
  assert.ok(!String(q.prompt||'').includes('perceive'));
  assert.equal(new Set(q.options.map(option=>option.label)).size,4);
  assert.equal(q.options.filter(option=>option.correct).length,1);
  assert.equal(L.makeQuestion('listen',words[0],words.slice(0,2),()=>0.4),null);
});
test('cloze removes the whole target, escapes regex syntax and rejects missing examples',()=>{
  assert.equal(typeof L.makeQuestion,'function');
  const q=L.makeQuestion('cloze',{word:'bank',examples:[{en:'Banking is not a bank.',zh:'测试'}]},[],()=>0);
  assert.equal(q.prompt,'Banking is not a _____ .'.replace('_____ .','_____.'));
  assert.equal(L.makeQuestion('cloze',{word:'test',examples:[]},[],()=>0),null);
  assert.equal(L.makeQuestion('cloze',{word:'test',examples:[{en:'Nothing matches.'}]},[],()=>0),null);
});
test('real self-referencing definitions cannot reveal spelling answers or correct choice labels',()=>{
  for(const [gid,name] of [['g12','prior'],['g62','saturate']]){
    const group=require('../data/groups/'+gid+'.json'),word=group.words.find(item=>item.word===name),before=JSON.stringify(word);
    const spelling=L.makeQuestion('spelling',word,group.words,()=>.4);
    assert.equal(spelling.prompt.toLowerCase().includes(name),false,gid+':'+name+' leaked in spelling');
    const choice=L.makeQuestion('choice',word,group.words,()=>.4);
    assert.ok(choice.options.every(option=>!option.label.toLowerCase().includes(name)),gid+':'+name+' leaked in options');
    assert.equal(JSON.stringify(word),before,'original dictionary content must not be changed');
  }
});
test('choice options are deduplicated again after hiding their own headwords',()=>{
  const target={word:'prior',definition:'adj. prior：在前的'};
  const pool=[target,{word:'previous',definition:'adj. previous：在前的'},{word:'middle',definition:'中间的'},{word:'last',definition:'最后的'},{word:'outer',definition:'外侧的'}];
  const question=L.makeQuestion('choice',target,pool,()=>.4);
  assert.deepEqual(question.options.map(option=>option.label).sort(),['adj. _____：在前的','中间的','外侧的','最后的'].sort());
  assert.equal(question.options.filter(option=>option.correct).length,1);
});
