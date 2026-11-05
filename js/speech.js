/* Keep voice discovery off a user's pronunciation click and never queue duplicate taps. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocabSpeech=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function selectVoice(voices,lang){
    const exact=voices.filter(voice=>(voice.lang||'').replace('_','-').toLowerCase()===lang.toLowerCase());
    return exact.find(voice=>voice.localService===true)||exact.find(voice=>voice.default)||exact[0]||null;
  }
  function createPlayer(options){
    let engine=null,voices=[],prepared=false,active=null,sequence=0,timer=null;
    function synthesis(){if(!engine)engine=options.getSynthesis();return engine;}
    function emit(state,record){if(options.onState)options.onState({state,text:record?.text||'',accent:record?.accent||'us'});}
    function clear(){clearTimeout(timer);timer=null;}
    function discover(){try{voices=synthesis().getVoices()||[];}catch(e){voices=[];}}
    function prepare(){
      if(prepared)return;
      prepared=true;
      try{const synth=synthesis();discover();if(synth.addEventListener)synth.addEventListener('voiceschanged',discover);else synth.onvoiceschanged=discover;}catch(e){prepared=false;}
    }
    function stop(){
      clear();sequence++;
      const previous=active;active=null;
      if(engine)try{if(engine.speaking||engine.pending)engine.cancel();}catch(e){}
      if(previous)emit('idle',previous);
    }
    function play(text,accent='us'){
      if(!text)return false;
      const key=accent+':'+text;
      if(active&&active.key===key&&(active.state==='loading'||engine?.pending))return true;
      const synth=synthesis();
      if(active)stop();
      else if(synth.speaking||synth.pending)try{synth.cancel();}catch(e){}
      const token=++sequence,record={key,text,accent,state:'loading'};active=record;
      emit('loading',record);
      try{
        if(synth.paused)synth.resume();
        const utterance=options.createUtterance(text),lang=accent==='uk'?'en-GB':'en-US';
        utterance.lang=lang;utterance.rate=.95;
        const voice=selectVoice(voices,lang);if(voice)utterance.voice=voice;
        record.utterance=utterance; // WebKit needs a live strong reference until completion.
        utterance.onstart=()=>{if(token!==sequence)return;clear();record.state='playing';emit('playing',record);};
        utterance.onend=()=>{if(token!==sequence)return;clear();active=null;emit('idle',record);};
        utterance.onerror=event=>{
          if(token!==sequence)return;clear();active=null;
          if(['interrupted','canceled'].includes(event.error)){emit('idle',record);return;}
          emit('error',record);if(options.onError)options.onError('语音未能播放，请重试或检查系统英语语音。');
        };
        synth.speak(utterance); // synchronous with the user's gesture; no timeout/audio-unlock hack.
        if(active===record&&record.state==='loading')timer=setTimeout(()=>{
          if(token!==sequence||!active||active.state!=='loading')return;
          active=null;sequence++;try{synth.cancel();}catch(e){}emit('error',record);
          if(options.onError)options.onError('系统语音启动较慢，请再点一次；也可检查是否已下载英语音色。');
        },4000);
        return true;
      }catch(e){clear();active=null;emit('error',record);if(options.onError)options.onError('语音暂未播放，请检查设备语音设置。');return false;}
    }
    return {prepare,play,stop};
  }
  return {createPlayer,selectVoice};
});
