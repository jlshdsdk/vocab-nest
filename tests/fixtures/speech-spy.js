/* Test-only native API boundary. The browser still drives the real UI and user gesture. */
window.__speechTouches=0;
window.__speechCalls=[];
const speechFixture={
  speaking:false,pending:false,paused:false,
  getVoices(){return [];},addEventListener(){},cancel(){},resume(){},
  speak(utterance){window.__speechCalls.push({text:utterance.text,lang:utterance.lang,rate:utterance.rate,gesture:navigator.userActivation.isActive});}
};
Object.defineProperty(window,'speechSynthesis',{configurable:true,get(){window.__speechTouches++;return speechFixture;}});
