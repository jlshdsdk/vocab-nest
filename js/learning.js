(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocabLearning=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var DAY=86400000;
  function finite(n,fallback){return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:fallback;}
  function dayKey(t){var d=new Date(t);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
  function schedule(previous,grade,now){
    previous=previous||{};
    var ease=Math.max(1.3,finite(previous.ease,2.5)),interval=finite(previous.interval,0),repetitions=Math.floor(finite(previous.repetitions,0));
    if(grade==='known'){repetitions++;interval=repetitions===1?1:repetitions===2?6:Math.max(1,Math.round(interval*ease));}
    else if(grade==='fuzzy'){ease=Math.max(1.3,ease-.15);interval=Math.max(.5,interval*.5);}
    else if(grade==='forgot'){ease=Math.max(1.3,ease-.2);interval=0;repetitions=0;}
    else throw new Error('未知复习评分');
    return {ease:ease,interval:interval,repetitions:repetitions,due:Math.round(now+(grade==='forgot'?600000:interval*DAY)),lastReviewed:now,updatedAt:now};
  }
  function todayQueue(manifest,progress,learning,now){
    var allowed=new Set(),out=[];learning=learning||{};
    (manifest.groups||[]).forEach(function(g){g.words.forEach(function(w){allowed.add(g.id+':'+(typeof w==='string'?w:w.word));});});
    var review=learning.review||{},wrong=learning.wrongQueue||{};
    allowed.forEach(function(key){
      var mark=progress[key],r=review[key],isDue=r&&r.due<=now;
      var hard=mark&&mark.s==='hard'&&(!r||!r.lastReviewed||dayKey(r.lastReviewed)!==dayKey(now));
      var legacyDue=mark&&mark.s==='mastered'&&!r&&mark.t+DAY<=now;
      if(isDue||hard||legacyDue||(wrong[key]&&wrong[key].active!==false&&wrong[key].streak<2))out.push(key);
    });
    return out;
  }
  function dailyPlan(manifest,progress,learning,activity,goal,now){
    progress=progress||{};learning=learning||{};
    var ordered=[],allowed=new Set(),seen=new Set(),completed=new Set();
    (manifest.groups||[]).forEach(function(group){group.words.forEach(function(word){
      var key=group.id+':'+(typeof word==='string'?word:word.word);ordered.push(key);allowed.add(key);
    });});
    (Array.isArray(activity)?activity:[]).forEach(function(event){
      if(!event||!allowed.has(event.key)||!Number.isFinite(event.at))return;
      seen.add(event.key);if(event.at<=now&&dayKey(event.at)===dayKey(now))completed.add(event.key);
    });
    var due=todayQueue(manifest,progress,learning,now),covered=new Set(due);
    completed.forEach(function(key){covered.add(key);});
    var remaining=Math.max(0,Math.floor(finite(goal,20))-covered.size),fresh=[];
    for(var i=0;i<ordered.length&&fresh.length<remaining;i++){
      var key=ordered[i];
      if(!progress[key]&&!(learning.review||{})[key]&&!seen.has(key)&&!covered.has(key))fresh.push(key);
    }
    return {due:due,fresh:fresh};
  }
  function normalizeAnswer(value){return String(value==null?'':value).normalize('NFKC').trim().toLowerCase().replace(/[-\u2010-\u2015\u2212]/g,'');}
  function compareAnswer(input,expected){
    var actual=normalizeAnswer(input),answer=normalizeAnswer(expected),letters=[];
    for(var i=0;i<Math.max(actual.length,answer.length);i++)letters.push({char:actual[i]||'·',correct:i<answer.length&&actual[i]===answer[i]});
    return {correct:!!answer&&actual===answer,letters:letters};
  }
  function shuffle(list,rng){
    var a=list.slice();
    for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.min(.999999,Math.max(0,rng()))*(i+1));var v=a[i];a[i]=a[j];a[j]=v;}
    return a;
  }
  function escaped(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function makeQuestion(type,word,pool,rng){
    rng=rng||Math.random;
    if(!word||!word.word)return null;
    function conceal(text,term){return String(text||'').replace(new RegExp(escaped(String(term)),'gi'),'_____');}
    if(type==='listen'){
      var listening=makeQuestion('choice',word,pool,rng);
      if(listening){listening.type='listen';listening.prompt='听发音，选择正确释义';}
      return listening;
    }
    if(type==='spelling')return word.definition?{type:type,prompt:conceal(word.definition,word.word),answer:word.word}:null;
    if(type==='cloze'){
      var pattern=new RegExp('(^|[^\\p{L}\\p{N}])('+escaped(word.word)+')(?=$|[^\\p{L}\\p{N}])','giu');
      var examples=(word.examples||[]).filter(function(ex){pattern.lastIndex=0;return ex&&typeof ex.en==='string'&&pattern.test(ex.en);});
      if(!examples.length)return null;
      var example=examples[Math.floor(Math.min(.999999,rng())*examples.length)];pattern.lastIndex=0;
      return {type:type,prompt:example.en.replace(pattern,function(match,prefix){return prefix+'_____';}),translation:example.zh||'',answer:word.word};
    }
    if(type!=='choice'||!word.definition)return null;
    var related=new Set((word.synonyms||[]).concat(word.confusables||[]).map(function(r){return normalizeAnswer(r.word);}));
    var candidates=shuffle(pool||[],rng).sort(function(a,b){return Number(related.has(normalizeAnswer(b.word)))-Number(related.has(normalizeAnswer(a.word)));});
    var targetLabel=conceal(word.definition,word.word).trim();
    var seen=new Set([targetLabel]),choices=[{label:targetLabel,correct:true}];
    candidates.forEach(function(w){var label=conceal(conceal(w.definition,w.word),word.word).trim();if(choices.length<4&&label&&!seen.has(label)){seen.add(label);choices.push({label:label,correct:false});}});
    if(choices.length!==4)return null;
    return {type:type,prompt:word.word,answer:word.word,options:shuffle(choices,rng)};
  }
  function updateWrongQueue(queue,key,correct,now){
    var out=Object.assign({},queue),old=out[key];
    if(correct&&!old)return out;
    var streak=correct?Math.min(2,(old&&old.streak||0)+1):0;
    out[key]={streak:streak,active:streak<2,updatedAt:now};
    return out;
  }
  return {schedule:schedule,todayQueue:todayQueue,dailyPlan:dailyPlan,normalizeAnswer:normalizeAnswer,compareAnswer:compareAnswer,makeQuestion:makeQuestion,updateWrongQueue:updateWrongQueue};
});
