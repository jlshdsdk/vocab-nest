/* A deliberately slow cold native-voice list, to reproduce first-tap main-thread blocking. */
window.__speechTouches=0;window.__speechCalls=[];window.__speechCancels=0;
const voiceList=[{name:'Network first',lang:'en-GB',localService:false,voiceURI:'remote'},{name:'Local British',lang:'en-GB',localService:true,voiceURI:'gb-local'},{name:'Local American',lang:'en-US',localService:true,voiceURI:'us-local'}];
const speechSlowFixture={
  speaking:false,pending:false,paused:false,
  getVoices(){window.__speechTouches++;if(window.__speechTouches===1){const start=performance.now();while(performance.now()-start<180){}}return voiceList;},
  addEventListener(){},cancel(){window.__speechCancels++;this.speaking=false;this.pending=false;},resume(){this.paused=false;},
  speak(utterance){this.pending=true;window.__speechCalls.push({text:utterance.text,lang:utterance.lang,voice:utterance.voice?.voiceURI,gesture:navigator.userActivation.isActive,at:performance.now()});window.__lastUtterance=utterance;setTimeout(()=>{this.pending=false;this.speaking=true;if(utterance.onstart)utterance.onstart({});},20);}
};
Object.defineProperty(window,'speechSynthesis',{configurable:true,get(){return speechSlowFixture;}});
/* Permit platform-independent fixture voices while preserving the actual application's event path. */
window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
