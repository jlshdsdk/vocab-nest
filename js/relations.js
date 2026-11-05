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
  function paginate(items,value,pageSize=15){
    const size=pageSize===30?30:15;
    const total=items.length,totalPages=Math.max(1,Math.ceil(total/size)),requested=Number(value);
    const page=Math.min(totalPages,Math.max(1,Number.isFinite(requested)?Math.floor(requested):1));
    const start=(page-1)*size;
    return {page,total,totalPages,size,visible:items.slice(start,start+size),first:total?start+1:0,last:Math.min(start+size,total)};
  }
  return {terms,resolvePair,paginate};
});
