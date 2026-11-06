/* Primary v1 progress stays interoperable; auxiliary learning data has its own KV. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./storage.js'));
  else root.VocabSync=factory(root.VocabStorage);
})(typeof globalThis!=='undefined'?globalThis:this,function(S){
  'use strict';
  function createClient(options){
    var running=null,timer=null,revision=0;
    function currentCode(){var state=options.getState();return state.sync&&state.sync.code;}
    async function request(url,opts){
      var controller=typeof AbortController!=='undefined'?new AbortController():null;
      var timeout=controller?setTimeout(function(){controller.abort();},8000):null;
      try{return await options.fetch(url,Object.assign({},opts,{signal:controller?controller.signal:undefined}));}
      finally{if(timeout)clearTimeout(timeout);}
    }
    async function read(code){
      var r=await request('https://textdb.online/'+encodeURIComponent(code),{cache:'no-store'});
      if(r.status===404)return null;
      if(!r.ok)throw new Error('同步服务暂不可用');
      var text=(await r.text()).trim();
      if(!text||text==='null')return null;
      try{return JSON.parse(text);}catch(e){throw new Error('云端数据格式异常，未覆盖云端记录');}
    }
    async function write(code,data){
      var r=await request('https://textdb.online/update',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'key='+encodeURIComponent(code)+'&value='+encodeURIComponent(JSON.stringify(data))});
      if(!r.ok)throw new Error('同步服务暂不可用');
      var result;try{result=JSON.parse(await r.text());}catch(e){throw new Error('云端未确认保存');}
      if(!result||result.status!==1)throw new Error('云端未确认保存');
    }
    function validPrimary(value){return !!value&&value.v===1&&!!value.words&&typeof value.words==='object'&&!Array.isArray(value.words);}
    function validMetadata(value){return !!value&&value.v===1&&((value.learning&&typeof value.learning==='object'&&!Array.isArray(value.learning))||Array.isArray(value.activity));}
    async function verifyCode(code){
      if(!/^[A-Za-z0-9_-]{6,60}$/.test(code))return {ok:false,error:'同步码格式不正确'};
      var reads=await Promise.allSettled([read(code),S.metadataKey(code).then(read)]);
      var primary=reads[0],metadata=reads[1];
      if(primary.status==='rejected')return {ok:false,error:'暂时无法读取这个同步码的进度，请检查网络后重试。原配对和本机记录保留。'};
      if(primary.value!=null&&!validPrimary(primary.value))return {ok:false,error:'这个同步码下的进度格式不兼容，原配对和本机记录保留。'};
      if(validPrimary(primary.value))return {ok:true};
      if(metadata.status==='rejected')return {ok:false,error:'暂时无法验证同步码，请检查网络后重试。原配对和本机记录保留。'};
      if(metadata.value!=null&&!validMetadata(metadata.value))return {ok:false,error:'这个同步码下的收藏格式不兼容，原配对和本机记录保留。'};
      if(validMetadata(metadata.value))return {ok:true};
      return {ok:false,notFound:true,error:'没有找到这个同步码。请在有收藏的手机或电脑设置中复制已有同步码，并先完成一次同步。'};
    }
    function cancelScheduled(){clearTimeout(timer);timer=null;}
    function markDirty(){revision++;cancelScheduled();timer=setTimeout(function(){timer=null;sync(false);},5000);}
    async function sync(pull){
      cancelScheduled();
      if(running){await running;return sync(pull);}
      if(!currentCode())return {ok:false,noCode:true};
      if(options.onState)options.onState({status:'syncing'});
      running=(async function(){
        var code=currentCode(),changed=0,metadataOk=true,first=true;
        try{
          var captured;
          do{
            captured=revision;
            if(currentCode()!==code)return {ok:false,stale:true};
            var auxiliary=null;
            try{auxiliary=await S.metadataKey(code);}catch(e){metadataOk=false;}
            if(first){
              var remote=await read(code),meta=null;
              if(remote&&!validPrimary(remote))throw new Error('云端进度格式不兼容，未覆盖');
              if(auxiliary)try{meta=await read(auxiliary);if(meta&&!validMetadata(meta)){meta=null;throw new Error('增强同步格式不兼容');}}catch(e){metadataOk=false;}
              if(currentCode()!==code)return {ok:false,stale:true};
              var local=options.getState(),mergedLearning=S.mergeLearning(local.learning,meta&&meta.learning);
              var next={progress:S.applyProgressClears(S.mergeProgress(local.progress,remote&&remote.words),mergedLearning),
                learning:mergedLearning,activity:S.mergeActivity(local.activity,meta&&meta.activity)};
              if(JSON.stringify([next.progress,next.learning,next.activity])!==JSON.stringify([local.progress,local.learning,local.activity])){
                changed++;options.applyRemote(next);
              }
              first=false;
            }
            if(currentCode()!==code)return {ok:false,stale:true};
            var state=options.getState();
            await write(code,{v:1,words:state.progress,updatedAt:Date.now()});
            if(currentCode()!==code)return {ok:false,stale:true};
            if(auxiliary&&metadataOk){
              state=options.getState();
              try{await write(auxiliary,{v:1,learning:state.learning,activity:state.activity,updatedAt:Date.now()});}catch(e){metadataOk=false;}
            }
          }while(revision!==captured);
          if(currentCode()!==code)return {ok:false,stale:true};
          var result={ok:true,metadataOk:metadataOk,changed:changed};
          if(options.onResult)options.onResult(result);
          return result;
        }catch(e){var result={ok:false,error:e.message};if(options.onResult)options.onResult(result);return result;}
        finally{cancelScheduled();}
      })();
      try{return await running;}finally{running=null;}
    }
    return {sync:sync,verifyCode:verifyCode,markDirty:markDirty,cancelScheduled:cancelScheduled};
  }
  return {createClient:createClient};
});
