(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocabRelations=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function terms(raw){
    return String(raw||'').trim().replace(/\s+(?:不存在|无此词|不常用|拼写错|不独立|罕用)$/u,'')
      .split(/\s*(?:与|\s+vs\s+)\s*/iu).map(word=>word.trim()).filter(Boolean);
  }
  function resolvePair(source,related,dictionary){
    const seen=new Set(),out=[];
    [source].concat(terms(related)).forEach(word=>{
      const key=word.toLowerCase();if(seen.has(key))return;seen.add(key);
      const record=dictionary&&dictionary[key];
      out.push({word,definition:record?.definition||'释义暂未收录，请联网后重试。',source:record?.source||'missing',status:record?.status||'word'});
    });
    return out;
  }
  return {terms,resolvePair};
});
