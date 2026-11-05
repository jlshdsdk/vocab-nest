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
    function cancelScheduled(){clearTimeout(timer);timer=null;}
    function markDirty(){revision++;cancelScheduled();timer=setTimeout(function(){timer=null;sync(false);},5000);}
    async function sync(pull){
      cancelScheduled();
      if(running){await running;return sync(pull);}
      if(!currentCode())return {ok:false,noCode:true};
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
              if(remote&&!(remote.v===1&&remote.words&&typeof remote.words==='object'))throw new Error('云端进度格式不兼容，未覆盖');
              if(auxiliary)try{meta=await read(auxiliary);if(meta&&meta.v!==1)throw new Error('增强同步格式不兼容');}catch(e){metadataOk=false;}
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
          var result={ok:true,metadataOk:metadataOk,changed:changed};
          if(options.onResult)options.onResult(result);
          return result;
        }catch(e){var result={ok:false,error:e.message};if(options.onResult)options.onResult(result);return result;}
        finally{cancelScheduled();}
      })();
      try{return await running;}finally{running=null;}
    }
    return {sync:sync,markDirty:markDirty,cancelScheduled:cancelScheduled};
  }
  return {createClient:createClient};
});
