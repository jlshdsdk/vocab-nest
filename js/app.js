/* Selene's Lexicon. Page orchestration only; algorithms and persistence are independent modules. */
(function () {
  'use strict';
  const S=window.VocabStorage,L=window.VocabLearning,T=window.VocabStats,D=window.VocabData;
  const $=selector=>document.querySelector(selector), $$=selector=>Array.from(document.querySelectorAll(selector));
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const array=value=>Array.isArray(value)?value:[];
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const keyOf=(gid,word)=>gid+':'+word;
  const timestamp=previous=>Math.max(Date.now(),(Number(previous)||0)+1);
  const view=$('#view');
  let storage;
  try {storage=window.localStorage;} catch(e) {storage={getItem:()=>null,setItem:()=>{throw Error('unavailable');}};}
  const initial=S.readState(storage);
  let progress=initial.progress,learning=initial.learning,activity=initial.activity,sync=initial.sync;
  const prefs=Object.assign({theme:'dark',fontSize:'medium',englishFont:'serif',dailyGoal:20,quizTypes:['choice','spelling','cloze','listen']},initial.prefs);
  if(!['dark','light',null].includes(prefs.theme))prefs.theme='dark';
  if(!['small','medium','large'].includes(prefs.fontSize))prefs.fontSize='medium';
  if(!['serif','sans'].includes(prefs.englishFont))prefs.englishFont='serif';
  if(!Number.isSafeInteger(prefs.dailyGoal)||prefs.dailyGoal<1)prefs.dailyGoal=20;
  prefs.quizTypes=Array.from(new Set(array(prefs.quizTypes).filter(type=>['choice','spelling','cloze','listen'].includes(type))));
  if(!prefs.quizTypes.length)prefs.quizTypes=['choice','spelling','cloze','listen'];
  let manifest=null,routeVersion=0,searchVersion=0,searchTimer=null,toastTimer=null,storageWarned=false;
  const loaded=new Map();
  const definitions=new Map(),definitionErrors=new Map();
  const groupState={gid:null,idx:0,mode:'cards',concealed:false};
  const readingSections=new Map();
  const bookState={tab:'words',group:'all',since:'all',sort:'newest',pages:{words:1,confusable:1,synonym:1},openWords:new Set(),openComparisons:new Set(),selected:new Set(),items:[]};
  let session=null,pendingWord=null,importCandidate=null,homeLimit=12,homeFilter='all';
  let syncView={status:sync?'waiting':'unpaired',error:''},lastSyncRequest=0,notebookRefresh=0,pairAttempt=0;

  function toast(message) {
    const node=$('#toast');node.textContent=message;node.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2300);
  }
  function write(key,value) {
    const ok=S.writeJSON(storage,key,value);
    if(!ok&&!storageWarned){storageWarned=true;toast('本地存储空间不足或不可用，请先导出备份');}
    return ok;
  }
  function persist(dirty=true) {
    write(S.keys.progress,progress);write(S.keys.learning,learning);write(S.keys.activity,activity);
    if(dirty&&sync&&sync.code)client.markDirty();
  }
  function persistResume() {
    write(S.keys.learning,learning);
    if(sync&&sync.code)client.markDirty();
  }
  function savePrefs(){write(S.keys.prefs,prefs);applyTheme();}
  function fullBackup(){return {v:2,words:progress,learning:learning,activity:activity,exportedAt:Date.now()};}
  const client=window.VocabSync.createClient({
    fetch:window.fetch.bind(window),getState:()=>({progress,learning,activity,sync}),
    applyRemote:next=>{
      progress=next.progress;learning=next.learning;activity=next.activity;persist(false);
      const typing=document.activeElement&&document.activeElement.matches('input,textarea,select,[contenteditable=true]');
      if(location.hash==='#/review')refreshNotebook();
      else if(!typing&&!session&&!location.hash.startsWith('#/group/'))renderRoute(false);
      else paintFavorites();
    },
    onState:()=>{
      lastSyncRequest=Date.now();syncView={status:'syncing',error:''};paintSyncStatus();
    },
    onResult:result=>{
      if(result.ok&&sync){sync.lastSync=Date.now();if(result.metadataOk)sync.lastFullSync=sync.lastSync;write(S.keys.sync,sync);}
      syncView={status:result.ok?(result.metadataOk?'ready':'partial'):'error',error:result.error||''};paintSyncStatus();
    }
  });
  function syncPresentation(){
    if(!sync)return {status:'unpaired',title:'本机收藏 · 尚未配对',message:'电脑与手机分别保存记录。手机已有收藏时，请到设置输入手机的同步码，或导入手机的备份。'};
    if(['waiting','syncing'].includes(syncView.status))return {status:'syncing',title:'正在同步这台设备',message:'正在读取并合并生词、辨析收藏与学习记录。当前数量是本机已有记录，请等本轮同步完成。'};
    if(syncView.status==='error')return {status:'error',title:'同步未完成 · 本机记录已保留',message:'网络或同步服务暂不可用。若手机已有收藏，请重试同步；不能用当前空列表判断另一台设备是否有数据。'};
    if(syncView.status==='partial')return {status:'partial',title:'生词进度已同步 · 辨析收藏尚未同步',message:'复习和辨析记录暂未完整读取或保存，本机数据已保留。请重试后再核对近形、近义收藏数量。'};
    if(syncView.status==='ready')return {status:'ready',title:'本机与云端已完成本轮同步',message:'生词、辨析收藏和学习记录已合并。其他设备需要使用同一同步码。'};
    return {status:'idle',title:'已配对 · 可同步其他设备记录',message:'记录保存在当前浏览器，并通过同步码与其他设备合并。'};
  }
  function bookSyncHTML(){
    const info=syncPresentation(),busy=info.status==='syncing';
    return '<section class="book-sync-panel" data-sync-state="'+info.status+'" aria-label="收藏来源与同步状态"><div><p class="book-sync-title" role="status" aria-live="polite">'+info.title+'</p><p class="book-sync-message">'+info.message+'</p></div><div class="book-sync-actions">'+(sync?'<button type="button" class="btn" data-action="sync-now"'+(busy?' disabled':'')+'>'+(busy?'同步中…':'立即同步')+'</button>':'')+'<a class="btn btn-quiet" href="#/settings">'+(sync?'同步设置 / 导入备份':'配对其他设备 / 导入备份')+'</a></div></section>';
  }
  function notebookEmptyHTML(counts){
    const hasFilters=bookState.group!=='all'||bookState.since!=='all';
    if(hasFilters&&counts[bookState.tab]>0)return empty('当前筛选没有匹配的条目。','收藏仍在，可以清除筛选后查看。','<button class="btn" data-action="clear-book-filters">清除筛选</button>');
    const info=syncPresentation();
    if(info.status==='syncing')return empty('正在核对其他设备的收藏。','当前浏览器尚无这类记录，云端读取完成后会自动更新。','<a class="btn" href="#/settings">查看同步状态</a>');
    if(info.status==='error'||info.status==='partial')return empty('这台设备暂未显示这类收藏。','同步尚未完整完成，请重试后再核对；本机已有数据保留。','<button class="btn btn-primary" data-action="sync-now">重试同步</button>');
    if(!sync&&!Object.values(counts).some(count=>count>0))return empty('这台设备还没有收藏记录。','如果手机里已经有记录，请在这里配对同一个同步码，或导入手机备份。','<a class="btn btn-primary" href="#/settings">配对手机 / 导入备份</a>');
    return empty('还没有这类收藏。',sync?'当前同步码下尚未找到这类记录。另一设备有记录时，请确认同步码一致并在那台设备完成同步。':bookState.tab==='words'?'学习时标记生词，就能在这里重逢。':'在词条的辨析旁点击星标，就会保留这段联系。');
  }
  function paintSyncStatus(){
    const panel=$('.book-sync-panel');
    if(panel)panel.outerHTML=bookSyncHTML();
    const blank=$('[data-notebook-empty]');
    if(blank&&manifest&&!notebookItems().length)blank.innerHTML=notebookEmptyHTML(notebookCounts());
    const status=$('#syncStatus');
    if(status){
      const info=syncPresentation();status.className='sync-status '+(info.status==='error'||info.status==='partial'?'error':info.status==='ready'?'ok':'');
      const times=sync?.lastFullSync?' · 上次完整同步：'+formatTime(sync.lastFullSync):sync?.lastSync?' · 上次进度同步：'+formatTime(sync.lastSync):'';
      status.textContent=info.title+times+(syncView.error?'。'+syncView.error:'');
    }
  }
  async function refreshNotebook(){
    const token=++notebookRefresh,active=document.activeElement,focusId=active?.id,wasPage=active?.matches('.book-page-select'),key=active?.dataset?.key,y=window.scrollY;
    await renderRoute(false);
    if(token!==notebookRefresh||location.hash!=='#/review')return;
    let target=focusId?document.getElementById(focusId):wasPage?$('.book-page-select'):null;
    if(!target&&key)target=$$('[data-action="book-select"]').find(node=>node.dataset.key===key);
    window.scrollTo({top:y,behavior:'instant'});if(target)target.focus({preventScroll:true});
  }
  const mediaDark=window.matchMedia('(prefers-color-scheme: dark)');
  function icon(name) {
    const paths={
      arrow:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m15 5-7 7 7 7"/>',
      search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
      sound:'<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
      star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
      sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
      moon:'<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
      check:'<path d="m5 12 4.5 4.5L20 6"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.arrow)+'</svg>';
  }
  function applyTheme() {
    const theme=prefs.theme||(mediaDark.matches?'dark':'light'),html=document.documentElement;
    html.dataset.theme=theme;html.dataset.size=prefs.fontSize;html.dataset.english=prefs.englishFont;
    $('meta[name="theme-color"]').content=theme==='dark'?'#07090f':'#f6f3ec';
    const button=$('#btnTheme');button.innerHTML=icon(theme==='dark'?'sun':'moon');
    button.setAttribute('aria-label',theme==='dark'?'切换为月白主题':'切换为月黑主题');
  }
  if(mediaDark.addEventListener)mediaDark.addEventListener('change',()=>{if(!prefs.theme)applyTheme();});
  let speechState={state:'idle',text:'',accent:'us'},speechPrepared=false;
  const speechPlayer=VocabSpeech.createPlayer({
    getSynthesis:()=>window.speechSynthesis,createUtterance:text=>new SpeechSynthesisUtterance(text),
    onState:state=>{speechState=state;paintSpeechState();if(state.state==='error')fallbackListening(state.origin);},onError:toast,onNotice:toast
  });
  function paintSpeechBoundary(button,state){
    const text=button.dataset.text||'',point=state==='playing'&&speechState.boundary;
    if(point&&point.index>=0&&point.index<text.length){
      const start=point.index,match=text.slice(start).match(/^[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/);
      const length=Math.min(text.length-start,point.length>0?point.length:(match?match[0].length:0));
      if(length){button.innerHTML=esc(text.slice(0,start))+'<span class="speech-current">'+esc(text.slice(start,start+length))+'</span>'+esc(text.slice(start+length));return;}
    }
    if(button.querySelector('.speech-current'))button.textContent=text;
  }
  function paintSpeechState(){
    $$('[data-action="speak"]').forEach(button=>{
      const matches=button.dataset.text===speechState.text&&(button.dataset.accent||'us')===speechState.accent&&(!speechState.origin||button===speechState.origin);
      const state=matches?speechState.state:'idle';
      button.dataset.speechState=state;button.setAttribute('aria-pressed',String(['loading','playing'].includes(state)));
      button.setAttribute('aria-busy',String(state==='loading'));
      if(!button.dataset.baseLabel)button.dataset.baseLabel=button.getAttribute('aria-label')||button.textContent.trim();
      button.setAttribute('aria-label',button.dataset.baseLabel+(state==='loading'?'，正在准备播放':state==='playing'?'，正在播放':state==='error'?'，未能播放，可重试':''));
      if(button.classList.contains('example-en'))paintSpeechBoundary(button,state);
    });
    $$('.wcard-word').forEach(word=>{const main=!speechState.origin||speechState.origin.classList.contains('phonetic-btn')||speechState.origin.classList.contains('review-speak');word.dataset.speechState=main&&word.textContent===speechState.text?speechState.state:'idle';});
    const status=$('#speechStatus');if(status)status.textContent=speechState.state==='loading'?'正在准备语音…':speechState.state==='playing'?'正在播放':speechState.state==='error'?'语音未播放，请重试':'';
  }
  function prepareSpeech(){
    if(speechPrepared||!('speechSynthesis' in window))return;speechPrepared=true;
    const prepare=()=>{speechPlayer.prepare();speechPlayer.warm();};
    if(window.requestIdleCallback)requestIdleCallback(prepare,{timeout:1000});else setTimeout(prepare,120);
    // 首次触碰/按键时再补一次预热（iOS 要求手势栈内发起语音），点音标即是二响应
    const warmOnce=()=>speechPlayer.warm();
    document.addEventListener('pointerdown',warmOnce,{passive:true});
    document.addEventListener('keydown',warmOnce);
  }
  function fallbackListening(origin){
    if(!origin?.isConnected||!origin.classList.contains('quiz-listen')||!session||session.kind!=='quiz'||session.graded||session.question?.type!=='listen')return false;
    session.question.audioUnavailable=true;renderSession();return true;
  }
  function speak(text,accent='us',origin=null) {
    if(!window.speechSynthesis||typeof window.SpeechSynthesisUtterance!=='function'){toast(fallbackListening(origin)?'当前设备不能播放语音，听音题已改为看词辨义。':'当前设备不能播放语音，请检查语音设置。');return;}
    speechPlayer.play(text,accent,origin);
  }
  function formatTime(t){return t?new Date(t).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'时间未记录';}
  function moon(mastered,total,label) {
    const phase=T.moonPhase(mastered,total);
    return '<svg class="moon-icon" viewBox="0 0 24 24" role="img" aria-label="'+esc(label||phase.label+'，'+Math.round(phase.ratio*100)+'%')+'"><circle class="moon-disc" cx="12" cy="12" r="10"/><path class="moon-light" d="'+phase.path+'"/></svg>';
  }
  function intro(title,english,description){return '<div class="page-intro"><p class="eyebrow">'+english+'</p><h1>'+title+'</h1>'+(description?'<p>'+description+'</p>':'')+'</div>';}
  function back(){return '<a class="back-link" href="#/">'+icon('back')+'回到词组</a>';}
  function empty(title,description,action){return '<div class="empty-state">'+moon(0,1)+'<h2>'+title+'</h2><p>'+description+'</p>'+(action||'<a class="btn" href="#/">去拾取新词</a>')+'</div>';}
  function loading(){return '<div class="loading-shell" role="status"><span class="loading-moon" aria-hidden="true"></span><p>正在取出月下的这一页…</p><div class="skeleton"></div><div class="skeleton short"></div></div>';}
  function footer(){return '<footer class="page-footer"><span>每个记住的词，都是一束月光。</span>SELENE’S LEXICON · VOCAB NEST</footer>';}
  function statusOf(gid,word){const record=progress[keyOf(gid,word)];return record?record.s:'new';}
  function groupStats(group) {
    let mastered=0,hard=0;
    group.words.forEach(value=>{const status=statusOf(group.id,typeof value==='string'?value:value.word);if(status==='mastered')mastered++;if(status==='hard')hard++;});
    return {mastered,hard,total:group.words.length};
  }
  function totals(){return manifest.groups.reduce((out,g)=>{const n=groupStats(g);out.mastered+=n.mastered;out.hard+=n.hard;return out;},{mastered:0,hard:0});}
  function groupName(gid){const meta=manifest.groups.find(g=>g.id===gid);return meta?meta.name:gid;}
  async function hydrate(gids) {
    const unique=Array.from(new Set(gids)).filter(id=>!loaded.has(id)||!definitions.has(id));let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,unique.length)},async()=>{
      while(cursor<unique.length){const gid=unique[cursor++];
        const [group,meanings]=await Promise.all([D.loadGroup(gid),D.loadDefinitions(gid).catch(error=>{definitionErrors.set(gid,error.message);return null;})]);
        loaded.set(gid,group);if(meanings){definitions.set(gid,meanings);definitionErrors.delete(gid);}
      }
    }));
  }
  function getItem(gid,word) {
    const group=loaded.get(gid),w=group&&group.words.find(item=>item.word===word);
    return w?{gid,gname:group.name,w,key:keyOf(gid,word)}:null;
  }
  function recordActivity(key,kind,correct) {
    const at=Date.now(),id=window.crypto&&crypto.randomUUID?crypto.randomUUID():at.toString(36)+'-'+Math.random().toString(36).slice(2);
    activity=T.recordActivity(activity,{id,key,at,kind,correct:typeof correct==='boolean'?correct:null});
    const stats=T.summarize(activity,at,prefs.dailyGoal),day=T.dayKey(at);
    if(stats.goalReached&&!learning.celebrations[day]){
      learning.celebrations[day]=at;const node=$('#celebration');node.hidden=false;setTimeout(()=>{node.hidden=true;},1450);
    }
  }
  function renderHome() {
    const total=totals(),stats=T.summarize(activity,Date.now(),prefs.dailyGoal),due=L.todayQueue(manifest,progress,learning,Date.now());
    const resume=learning.resume&&manifest.groups.some(g=>g.id===learning.resume.gid)?learning.resume:null;
    const first=manifest.groups[0],resumeGid=resume?resume.gid:first&&first.id;
    const date=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
    const started=new Set(Object.keys(progress).concat(Object.keys(learning.review),activity.map(event=>event.key)).map(key=>key.slice(0,key.indexOf(':'))));
    if(resume)started.add(resume.gid);
    const dueGroups=new Set(due.map(key=>key.slice(0,key.indexOf(':'))));
    const filtered=manifest.groups.filter(g=>{
      const stats=groupStats(g),done=stats.total>0&&stats.mastered===stats.total;
      return homeFilter==='all'||homeFilter==='new'&&!started.has(g.id)||homeFilter==='active'&&started.has(g.id)&&!done||homeFilter==='due'&&dueGroups.has(g.id)||homeFilter==='done'&&done;
    });
    const filters=[['all','全部'],['new','未开始'],['active','进行中'],['due','有待复习'],['done','已完成']];
    const cards=filtered.slice(0,homeLimit).map(g=>{
      const index=manifest.groups.indexOf(g);
      const st=groupStats(g),pct=st.total?Math.round(st.mastered/st.total*100):0;
      return '<a class="group-card" href="#/group/'+esc(g.id)+'" aria-label="'+esc(g.name)+'，'+st.total+'词，掌握'+pct+'%"><span class="group-index" aria-hidden="true">'+String(index+1).padStart(2,'0')+'</span><div class="group-card-body"><h3>'+esc(g.name)+'</h3><p class="group-note">'+esc(g.preview.word||g.note||'月下的下一页')+'</p><div class="group-info"><span>'+st.total+' 词</span><span>掌握 '+st.mastered+'</span>'+(st.hard?'<span>生词 '+st.hard+'</span>':'')+'</div></div><div class="group-moon">'+moon(st.mastered,st.total,g.name+'，掌握'+pct+'%')+'<span>'+pct+'%</span></div></a>';
    }).join('');
    view.innerHTML='<div class="home-greeting"><span>'+esc(date)+'</span><span>A QUIET MOMENT TO LEARN</span></div>'+
      '<section class="home-hero"><img class="hero-art" src="assets/art/selene-moon.webp" width="1200" height="800" alt="" decoding="async" fetchpriority="low"><p class="eyebrow">SELENE’S LEXICON · 月下藏书室</p><h1><span>在月光下，</span><span>拾起新知。</span></h1><p class="hero-desc">把偶然遇见的词，<br>变成记忆里长久的光。</p><div class="hero-actions"><a class="btn btn-primary" href="#/group/'+esc(resumeGid||'')+'">'+(resume?'继续学习':'开始拾词')+icon('arrow')+'</a><a class="btn btn-secondary" href="#/today">今日学习'+(due.length?' · '+due.length+' 待复习':'')+'</a></div></section>'+
      '<section class="dashboard-row" aria-label="学习概览"><div class="goal-card"><div class="goal-copy"><div class="goal-title">今日的月亮 · 每日目标</div><div class="goal-value">'+stats.todayWords+' <small>/ '+prefs.dailyGoal+' 词</small></div><div class="goal-track" role="progressbar" aria-label="今日目标完成词数" aria-valuemin="0" aria-valuemax="'+prefs.dailyGoal+'" aria-valuenow="'+Math.min(prefs.dailyGoal,stats.todayWords)+'"><i style="width:'+clamp(stats.todayWords/prefs.dailyGoal*100,0,100)+'%"></i></div></div>'+moon(stats.todayWords,prefs.dailyGoal)+'</div><div class="quick-metrics"><div><b>'+manifest.totalWords+'</b><span>馆藏词汇</span></div><div><b>'+total.mastered+'</b><span>已掌握</span></div><div><b>'+stats.streak+'</b><span>连续学习 / 天</span></div></div></section>'+
      '<section class="search-box" aria-label="搜索词库">'+icon('search')+'<label class="sr-only" for="searchInput">搜索单词、释义、例句或搭配</label><input id="searchInput" type="search" placeholder="搜索单词、释义、例句或搭配…" autocomplete="off"><div id="searchResults" class="search-results" aria-live="polite"></div></section>'+
      '<section class="groups"><div class="section-heading"><h2>月下词集</h2><span>'+manifest.groups.length+' COLLECTIONS</span></div><div class="group-filters" role="group" aria-label="词集筛选">'+filters.map(pair=>'<button type="button" data-action="home-filter" data-filter="'+pair[0]+'" aria-pressed="'+(homeFilter===pair[0])+'">'+pair[1]+'</button>').join('')+'</div><div class="group-grid">'+cards+'</div>'+(!filtered.length?'<p class="setting-note">当前筛选没有词组。</p>':'')+(homeLimit<filtered.length?'<button class="btn load-more" data-action="home-more">继续翻阅 · 已展示 '+homeLimit+' / '+filtered.length+' 组</button>':'')+'</section>'+footer();
  }
  function highlighted(text,query) {
    const source=String(text||''),q=query.toLowerCase();if(!q)return esc(source);
    const lower=source.toLowerCase();let cursor=0,result='',index;
    while((index=lower.indexOf(q,cursor))!==-1){result+=esc(source.slice(cursor,index))+'<mark>'+esc(source.slice(index,index+q.length))+'</mark>';cursor=index+q.length;}
    return result+esc(source.slice(cursor));
  }
  async function search(query) {
    const version=++searchVersion,box=$('#searchResults'),q=query.trim().toLowerCase();
    if(!box)return;if(!q){box.innerHTML='';return;}
    box.textContent='正在查阅词库…';
    try{
      const index=await D.loadSearchIndex();
      if(version!==searchVersion||!box.isConnected)return;
      const hits=index.filter(item=>item.text.toLowerCase().includes(q)).slice(0,30);
      box.innerHTML=hits.length?hits.map(item=>{
        const found=item.text.toLowerCase().indexOf(q),snippet=item.text.slice(Math.max(0,found-25),Math.max(0,found-25)+110);
        return '<button class="search-hit" type="button" data-action="jump" data-gid="'+esc(item.gid)+'" data-word="'+esc(item.word)+'"><b>'+highlighted(item.word,q)+'</b><span class="search-source">'+esc(item.gname)+'</span><p>'+highlighted(item.definition,q)+'</p>'+(!item.word.toLowerCase().includes(q)&&!item.definition.toLowerCase().includes(q)?'<p>'+highlighted(snippet,q)+'</p>':'')+'</button>';
      }).join(''):'<p class="setting-note">暂未找到这个词，试试其他表达。</p>';
    }catch(e){if(version===searchVersion&&box.isConnected)box.innerHTML='<p class="setting-note">'+esc(e.message)+'，可重新输入搜索。</p>';}
  }
  function speechButton(word,accent,phonetic) {
    const visible=(accent==='uk'?'UK':'US')+' ['+(phonetic||'音标待补充')+']';
    return '<button type="button" class="phonetic-btn" data-action="speak" data-text="'+esc(word)+'" data-accent="'+accent+'" aria-label="朗读'+(accent==='uk'?'英音':'美音')+'：'+esc(visible)+'">'+icon('sound')+'<span>'+(accent==='uk'?'UK':'US')+'</span> ['+esc(phonetic||'音标待补充')+']</button>';
  }
  function examplesHTML(word,limit,start=0,disabled=false) {
    return array(word.examples).filter(ex=>ex&&ex.en).slice(start,start+(limit||10)).map(ex=>'<div class="example"><button type="button" class="example-en" data-action="speak" data-text="'+esc(ex.en)+'" aria-label="朗读例句：'+esc(ex.en)+'"'+(disabled?' disabled':'')+'>'+esc(ex.en)+'</button>'+(ex.zh?'<p class="example-zh">'+esc(ex.zh)+'</p>':'')+'</div>').join('');
  }
  function relationHTML(item,kind) {
    const list=array(kind==='confusable'?item.w.confusables:item.w.synonyms).filter(r=>r&&r.word),label=kind==='confusable'?'近形辨析':'近义辨析';
    if(!list.length)return '';
    return '<details class="word-section" data-section="'+kind+'"><summary>'+label+' <span class="setting-note">'+list.length+' 组</span></summary><ul class="comparison-list">'+list.map(r=>{
      const relation={gid:item.gid,sourceWord:item.w.word,kind,word:r.word},saved=learning.comparisons[S.comparisonKey(relation)],active=!!(saved&&saved.active);
      return '<li><details class="relation-item"><summary><strong>'+esc(VocabRelations.terms(r.word).join(' / '))+'</strong></summary>'+comparisonMeaningsHTML(item.gid,item.w.word,r.word)+'<p class="comparison-explanation"><span>辨析</span>'+esc(r.note)+'</p></details><button type="button" class="favorite-btn" data-action="favorite" data-gid="'+esc(item.gid)+'" data-source="'+esc(item.w.word)+'" data-kind="'+kind+'" data-related="'+esc(r.word)+'" aria-pressed="'+active+'" aria-label="'+(active?'取消收藏':'收藏')+esc(item.w.word)+' 与 '+esc(r.word)+' 的'+label+'">'+icon('star')+'</button></li>';
    }).join('')+'</ul></details>';
  }
  function comparisonMeanings(gid,source,related,saved){
    const dictionary=Object.assign({},definitions.get(gid)||{});
    const item=getItem(gid,source);if(item)dictionary[source.toLowerCase()]={definition:item.w.definition,source:'site'};
    for(const meaning of saved?.meanings||[])if(!dictionary[meaning.word.toLowerCase()])dictionary[meaning.word.toLowerCase()]={definition:meaning.definition,source:'backup'};
    return VocabRelations.resolvePair(source,related,dictionary);
  }
  function comparisonMeaningsHTML(gid,source,related,saved){
    return '<div class="comparison-meanings">'+comparisonMeanings(gid,source,related,saved).map(row=>'<p class="comparison-meaning"><button type="button" class="relation-word-speak" data-action="speak" data-accent="us" data-text="'+esc(row.word)+'" aria-label="美音朗读 '+esc(row.word)+'">'+esc(row.word)+icon('sound')+'</button><span>'+esc(row.definition)+'</span>'+(row.status==='spelling'?'<small>拼写提示，非独立词义</small>':'')+'</p>').join('')+'</div>';
  }
  function definitionWarning(gid){
    return definitionErrors.has(gid)?'<p class="setting-note">双方释义尚未完整下载。<button type="button" class="btn" data-action="retry-definitions" data-gid="'+esc(gid)+'">重试释义</button></p>':'';
  }
  function wordCardHTML(item) {
    const w=item.w,status=statusOf(item.gid,w.word),exampleCount=array(w.examples).filter(ex=>ex&&ex.en).length;
    return '<article class="wcard" data-gid="'+esc(item.gid)+'" data-word="'+esc(w.word)+'"><div class="wcard-word-row"><h2 class="wcard-word'+(w.word.length>16?' long':'')+'">'+esc(w.word)+'</h2><span class="wcard-status '+status+'" data-status-badge'+(status==='new'?' hidden':'')+'>'+(status==='hard'?'生词':status==='mastered'?'已掌握':'')+'</span></div><div class="wcard-phonetics">'+speechButton(w.word,'us',w.phoneticUs)+speechButton(w.word,'uk',w.phoneticUk)+'</div>'+
      '<div class="word-body"'+(groupState.concealed?' hidden':'')+'><p class="definition">'+esc(w.definition)+'</p>'+examplesHTML(w,1)+(exampleCount>1?'<details class="word-section" data-section="examples"><summary>更多例句 <span class="setting-note">'+(exampleCount-1)+' 条</span></summary>'+examplesHTML(w,9,1)+'</details>':'')+
      definitionWarning(item.gid)+
      (w.usage?'<details class="word-section" data-section="usage"><summary>用法</summary><p>'+esc(w.usage)+'</p></details>':'')+relationHTML(item,'confusable')+relationHTML(item,'synonym')+
      (array(w.collocations).length?'<details class="word-section" data-section="collocations"><summary>词组搭配</summary><ul class="collocations">'+w.collocations.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul></details>':'')+
      (w.mnemonic?'<details class="word-section" data-section="mnemonic"><summary>记忆口诀</summary><p>'+esc(w.mnemonic)+'</p></details>':'')+'</div></article>';
  }
  function markControlsHTML(item) {
    return '<div class="wcard-actions" aria-label="标记当前单词"><button type="button" class="btn btn-hard" data-action="mark" data-gid="'+esc(item.gid)+'" data-word="'+esc(item.w.word)+'" data-status="hard" aria-pressed="false">标记生词</button><button type="button" class="btn btn-mastered" data-action="mark" data-gid="'+esc(item.gid)+'" data-word="'+esc(item.w.word)+'" data-status="mastered" aria-pressed="false">标记掌握</button></div>';
  }
  function paintWordStatus(item) {
    const status=statusOf(item.gid,item.w.word),badge=$('[data-status-badge]');
    if(badge){badge.className='wcard-status '+status;badge.hidden=status==='new';badge.textContent=status==='hard'?'生词':status==='mastered'?'已掌握':'';}
    $$('[data-action="mark"]').forEach(button=>{
      const hard=button.dataset.status==='hard',active=button.dataset.status===status;
      button.dataset.gid=item.gid;button.dataset.word=item.w.word;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
      button.textContent=hard?(active?'已加入生词本':'标记生词'):(active?'已掌握':'标记掌握');
    });
    const group=loaded.get(item.gid);
    if(group)$$('.dot-strip span').forEach((dot,index)=>{dot.className=statusOf(group.id,group.words[index].word)+(index===groupState.idx?' current':'');});
  }
  function paintFavorites() {
    $$('[data-action="favorite"]').forEach(button=>{
      const item={gid:button.dataset.gid,sourceWord:button.dataset.source,kind:button.dataset.kind,word:button.dataset.related};
      const saved=learning.comparisons[S.comparisonKey(item)],active=!!(saved&&saved.active);
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',(active?'取消收藏':'收藏')+item.sourceWord+' 与 '+item.word+' 的'+(item.kind==='confusable'?'近形辨析':'近义辨析'));
    });
  }
  function renderGroup(group) {
    rememberSections();
    view.innerHTML='<div class="group-header">'+back()+'<div class="group-topline"><p class="eyebrow">THE COLLECTION · '+esc(group.id.replace(/^g/,''))+'</p><span class="book-item-meta">'+group.words.length+' 词</span></div><h1 class="group-title">'+esc(group.name)+'</h1><div class="mode-pills" role="group" aria-label="学习方式">'+[['cards','卡片'],['quiz','自测'],['list','列表']].map(pair=>'<button class="pill'+(groupState.mode===pair[0]?' active':'')+'" type="button" data-action="mode" data-mode="'+pair[0]+'" aria-pressed="'+(groupState.mode===pair[0])+'">'+pair[1]+'</button>').join('')+'</div></div><div id="cardArea"></div><p class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd>切词 · <kbd>空格</kbd>回忆/下一题 · <kbd>S</kbd>发音 · <kbd>Esc</kbd>返回</p>';
    renderGroupContent();
    prepareSpeech();
  }
  function rememberSections(){ $$('.wcard details[data-section]').forEach(node=>readingSections.set(node.dataset.section,node.open)); }
  function restoreSections(){ $$('.wcard details[data-section]').forEach(node=>{if(readingSections.has(node.dataset.section))node.open=readingSections.get(node.dataset.section);}); }
  function renderGroupContent() {
    const group=loaded.get(groupState.gid),area=$('#cardArea');if(!group||!area)return;
    if(!group.words.length){area.innerHTML=empty('这一页还留着空白。','新的词，正在路上。');return;}
    if(groupState.mode==='quiz'){renderSession();return;}
    if(groupState.mode==='list'){
      area.innerHTML='<ul class="word-list">'+group.words.map((w,i)=>'<li><button class="list-row" type="button" data-action="goto" data-index="'+i+'"><strong>'+esc(w.word)+'</strong><span>'+({hard:'生词',mastered:'已掌握',new:''}[statusOf(group.id,w.word)])+'</span><p>'+esc(w.definition)+'</p></button></li>').join('')+'</ul>';return;
    }
    groupState.idx=clamp(groupState.idx,0,group.words.length-1);
    const item=getItem(group.id,group.words[groupState.idx].word),resume=learning.resume;
    if(!resume||resume.gid!==group.id||resume.idx!==groupState.idx){learning.resume={gid:group.id,idx:groupState.idx,updatedAt:timestamp(resume&&resume.updatedAt)};persistResume();}
    if(!area.querySelector('.study-controls')){
      area.innerHTML='<div class="card-meta"><span data-word-counter></span><span class="dot-strip" aria-hidden="true">'+group.words.map(()=>'<span></span>').join('')+'</span></div><div id="cardWrap"></div><aside class="study-controls" aria-label="单词学习操作">'+markControlsHTML(item)+'<div class="nav-row"><button type="button" class="btn btn-quiet" data-action="prev">'+icon('back')+'上一词</button><button type="button" class="btn btn-quiet" data-action="conceal">回忆释义</button><button type="button" class="btn btn-quiet" data-action="next">下一词'+icon('arrow')+'</button></div></aside>';
    }
    const wrap=$('#cardWrap'),previous=wrap.querySelector('.wcard');
    if(!previous||previous.dataset.word!==item.w.word||previous.dataset.gid!==item.gid){rememberSections();wrap.innerHTML=wordCardHTML(item);restoreSections();}
    const body=wrap.querySelector('.word-body');if(body)body.hidden=groupState.concealed;
    $('[data-word-counter]').textContent='第 '+(groupState.idx+1)+' / '+group.words.length+' 词';
    $('[data-action="prev"]').disabled=groupState.idx===0;
    $('[data-action="next"]').disabled=groupState.idx===group.words.length-1;
    $('[data-action="conceal"]').textContent=groupState.concealed?'查看释义':'回忆释义';
    paintWordStatus(item);
  }
  function changeCard(offset) {
    const group=loaded.get(groupState.gid);if(!group)return;
    const index=clamp(groupState.idx+offset,0,group.words.length-1);if(index===groupState.idx)return;
    speechPlayer.stop();
    const wrap=$('#cardWrap'),top=wrap&&wrap.getBoundingClientRect().top,oldScroll=window.scrollY;
    groupState.idx=index;groupState.concealed=false;renderGroupContent();
    if(top<0&&wrap)window.scrollTo({top:Math.max(0,oldScroll+top-12),behavior:'instant'});
  }
  function makeSession(kind,items) {
    return {kind,queue:items.map(item=>Object.assign({retry:false},item)),index:0,initial:items.length,answered:0,correct:0,graded:false,flipped:false,question:null,input:'',choice:null,scheduled:new Set()};
  }
  function startQuiz() {
    const group=loaded.get(groupState.gid);groupState.mode='quiz';
    session=makeSession('quiz',group.words.map(w=>getItem(group.id,w.word)));renderGroup(group);
  }
  async function startReview(daily=false) {
    const version=++routeVersion,plan=daily?L.dailyPlan(manifest,progress,learning,activity,prefs.dailyGoal,Date.now()):null;
    const keys=plan?plan.due.concat(plan.fresh):L.todayQueue(manifest,progress,learning,Date.now());
    if(!keys.length){renderToday();return;}
    view.innerHTML=loading();
    try{
      await hydrate(keys.map(key=>key.slice(0,key.indexOf(':'))));if(version!==routeVersion)return;
      const items=keys.map(key=>getItem(key.slice(0,key.indexOf(':')),key.slice(key.indexOf(':')+1))).filter(Boolean);
      session=makeSession('review',items);if(plan)session.daily={fresh:plan.fresh.length,due:plan.due.length};renderToday();
    }catch(e){if(version===routeVersion)showError(e);}
  }
  function activeSessionItem(){return session&&session.queue[session.index];}
  function prepareQuestion(item) {
    const types=prefs.quizTypes,preferred=types[session.index%types.length],order=[preferred].concat(types.filter(t=>t!==preferred));
    const pool=loaded.get(item.gid).words;
    for(const type of order){const q=L.makeQuestion(type,item.w,pool);if(q)return q;}
    return L.makeQuestion('spelling',item.w,pool);
  }
  function reviewControlsHTML(item,flipped) {
    return '<div class="review-action-row"><div class="review-main-action">'+(!flipped?'<button class="btn btn-primary review-reveal" data-action="reveal">查看答案</button>':'<div class="rating-row"><button class="btn btn-hard" data-action="rate" data-grade="forgot">忘了<small>稍后再见</small></button><button class="btn" data-action="rate" data-grade="fuzzy">模糊<small>缩短间隔</small></button><button class="btn btn-primary" data-action="rate" data-grade="known">认识<small>留待下次</small></button></div>')+'</div><button class="btn review-speak" data-action="speak" data-text="'+esc(item.w.word)+'" aria-label="朗读单词">'+icon('sound')+'</button></div>';
  }
  function revealReview() {
    if(!session||session.kind!=='review'||session.flipped)return;
    speechPlayer.stop();
    session.flipped=true;
    const card=$('.flip-card');
    if(!card)return;
    card.classList.add('is-revealed');
    $('.flip-front').setAttribute('aria-hidden','true');$('.flip-front').setAttribute('inert','');
    $('.flip-back').setAttribute('aria-hidden','false');$('.flip-back').removeAttribute('inert');
    $$('.flip-back .example-en').forEach(button=>{button.disabled=false;});
    $('.review-controls').innerHTML=reviewControlsHTML(activeSessionItem(),true);
  }
  function renderSession() {
    const area=$('#cardArea');if(!area||!session)return;
    while(session.index<session.queue.length){
      const current=activeSessionItem(),wrong=learning.wrongQueue[current.key];
      if(!session.graded&&current.retry&&(!wrong||wrong.active===false)){session.index++;session.question=null;continue;}
      if(session.kind==='quiz'&&!session.question){session.question=prepareQuestion(current);if(!session.question){session.index++;continue;}}
      break;
    }
    if(session.index>=session.queue.length){
      let description='完成 '+session.answered+' 次练习'+(session.kind==='quiz'?'，答对 '+session.correct+' 次。':'。')+'学习记录已经保存。';
      if(session.daily){
        const tomorrow=new Date();tomorrow.setHours(24,0,0,0);const end=new Date(tomorrow);end.setDate(end.getDate()+1);
        const upcoming=L.todayQueue(manifest,progress,learning,end.getTime()-1).length;
        description='新学 '+session.daily.fresh+' 词，复习 '+session.daily.due+' 词；本轮正确率 '+Math.round(session.correct/Math.max(1,session.answered)*100)+'%。明日预告：'+upcoming+' 词待复习（按当前记录预计）。学习记录已经保存。';
      }
      area.innerHTML=empty('这一轮，月光已收好。',description,'<a class="btn btn-primary" href="#/">回到月下词集</a>');
      return;
    }
    const item=activeSessionItem(),s=session,percent=clamp(session.index/Math.max(1,s.queue.length)*100,0,100);
    let content='<div class="card-meta"><span>'+esc(item.gname)+'</span><span>'+(s.index+1)+' / '+s.queue.length+'</span></div><div class="session-progress" aria-hidden="true"><i style="width:'+percent+'%"></i></div>'+(item.retry?'<p class="retry-note">错词重练 · 连续答对两次，才会离开队列。</p>':'');
    if(s.kind==='review'){
      content+='<div class="flip-card'+(s.flipped?' is-revealed':'')+'"><div class="flip-inner"><div class="flip-face flip-front" aria-hidden="'+s.flipped+'"'+(s.flipped?' inert':'')+'><p class="eyebrow">RECALL IN MOONLIGHT</p><h2 class="wcard-word">'+esc(item.w.word)+'</h2><p class="flip-hint">先回忆释义，再查看答案。</p></div><div class="flip-face flip-back" aria-hidden="'+(!s.flipped)+'"'+(!s.flipped?' inert':'')+'><p class="definition">'+esc(item.w.definition)+'</p>'+examplesHTML(item.w,1,0,!s.flipped)+'</div></div></div>'+
        '<div class="review-controls">'+reviewControlsHTML(item,s.flipped)+'</div>';
      area.innerHTML=content;return;
    }
    const q=s.question,audioFallback=q.type==='listen'&&q.audioUnavailable,names={choice:'英 → 义 · 选择正确释义',spelling:'义 → 英 · 拼写单词',cloze:'例句挖空 · 补全单词',listen:audioFallback?'语音不可用 · 已改为看词辨义':'听音辨义 · 选择正确释义'};
    content+='<div class="quiz-shell"><p class="quiz-kind">'+names[q.type]+'</p><h2 class="quiz-prompt '+(q.type==='choice'||audioFallback?'english':q.type==='cloze'?'cloze':'')+'">'+esc(audioFallback?item.w.word:q.prompt)+'</h2>';
    if(q.translation)content+='<p class="example-zh">'+esc(q.translation)+'</p>';
    if(q.type==='listen'&&!audioFallback)content+='<button type="button" class="btn quiz-listen" data-action="speak" data-text="'+esc(item.w.word)+'" data-accent="us" aria-label="播放本题美音">'+icon('sound')+' 再听一次</button>';
    if(q.type==='choice'||q.type==='listen'){
      content+='<div class="quiz-options">'+q.options.map((option,i)=>'<button type="button" class="quiz-option'+(s.graded?(option.correct?' is-correct':s.choice===i?' is-wrong':''):'')+'" data-action="answer-choice" data-index="'+i+'"'+(s.graded?' disabled':'')+'><span class="option-index">'+String.fromCharCode(65+i)+'</span><span>'+esc(option.label)+'</span></button>').join('')+'</div>';
    }else{
      content+='<form class="answer-form" id="answerForm"><label class="sr-only" for="answerInput">输入英文答案</label><input class="text-input answer-input" id="answerInput" type="text" value="'+esc(s.input)+'" placeholder="在这里拼写…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"'+(s.graded?' disabled':'')+'><button class="btn btn-primary" type="submit"'+(s.graded?' disabled':'')+'>检查答案</button></form>';
    }
    if(s.graded){
      content+='<div class="quiz-feedback" role="status"><strong>'+(s.lastCorrect?'回答正确。':'这次没记住，已加入错词重练。')+'</strong><p class="feedback-word">'+esc(item.w.word)+'</p><p>'+esc(item.w.definition)+'</p>'+
        (!['choice','listen'].includes(q.type)?'<div class="letter-feedback" aria-label="拼写逐字反馈">'+L.compareAnswer(s.input,item.w.word).letters.map(letter=>'<span class="'+(letter.correct?'':'incorrect')+'">'+esc(letter.char)+'</span>').join('')+'</div>':'')+
        '<button class="btn btn-primary session-next" data-action="session-next">下一题'+icon('arrow')+'</button></div>';
    }
    area.innerHTML=content+'</div>';
    if(q.type==='listen'&&!q.played&&!audioFallback){q.played=true;speak(item.w.word,'us',$('.quiz-listen'));}
    if(s.graded){const next=$('[data-action="session-next"]');if(next)next.focus({preventScroll:true});}
  }
  function finishAnswer(grade,correct) {
    if(!session||session.graded)return;
    const item=activeSessionItem();if(!item)return;
    speechPlayer.stop();
    session.graded=true;session.lastCorrect=correct;session.answered++;if(correct)session.correct++;
    if(!session.scheduled.has(item.key)){
      const previous=learning.review[item.key];
      learning.review[item.key]=L.schedule(previous,grade,Date.now());
      learning.review[item.key].updatedAt=timestamp(previous&&previous.updatedAt);session.scheduled.add(item.key);
    }
    if(session.kind==='quiz'||grade==='forgot'||(learning.wrongQueue[item.key]&&learning.wrongQueue[item.key].active)){
      const old=learning.wrongQueue[item.key];
      learning.wrongQueue=L.updateWrongQueue(learning.wrongQueue,item.key,correct,timestamp(old&&old.updatedAt));
      if(!correct){session.queue.push(Object.assign({},item,{retry:true}),Object.assign({},item,{retry:true}));}
    }
    recordActivity(item.key,session.kind==='quiz'?'quiz':'review',correct);persist();
    if(session.kind==='review')advanceSession();else renderSession();
  }
  function answerChoice(index){if(!session||session.graded||!session.question||!['choice','listen'].includes(session.question.type))return;const option=session.question.options[index];if(!option)return;session.choice=index;finishAnswer(option.correct?'known':'forgot',option.correct);}
  function answerInput(){if(!session||session.graded)return;const input=$('#answerInput');if(!input||!input.value.trim()){toast('先写下你的答案，再检查。');return;}session.input=input.value;const correct=L.compareAnswer(input.value,activeSessionItem().w.word).correct;finishAnswer(correct?'known':'forgot',correct);}
  function advanceSession(){if(!session||!session.graded)return;speechPlayer.stop();session.index++;session.graded=false;session.flipped=false;session.question=null;session.input='';session.choice=null;renderSession();}
  function renderToday() {
    prepareSpeech();
    const plan=L.dailyPlan(manifest,progress,learning,activity,prefs.dailyGoal,Date.now()),queue=plan.due;
    view.innerHTML='<div class="today-view">'+back()+intro('今日学习','THE RETURNING MOON','记忆如月相，重逢会让它渐渐圆满。')+'<div id="cardArea"></div></div>';
    if(session&&session.kind==='review'){renderSession();return;}
    $('#cardArea').innerHTML=queue.length||plan.fresh.length?'<section class="review-start">'+moon(1,2)+'<h2>今天，从这里开始。</h2><p>先复习 '+queue.length+' 词，再学习 '+plan.fresh.length+' 个新词；新词按词组顺序补足每日目标。</p><div class="panel-row"><button class="btn btn-primary" data-action="start-learning">开始今日学习'+icon('arrow')+'</button>'+(queue.length?'<button class="btn" data-action="start-review">只复习到期词</button>':'')+'</div></section>':empty('今夜，记忆已安放。','今日目标已完成，暂时没有到期的词。也可以去词集中继续学习。');
  }
  function notebookItems() {
    let items;
    if(bookState.tab==='words'){
      const allowed=new Set();manifest.groups.forEach(g=>g.words.forEach(w=>allowed.add(keyOf(g.id,w))));
      items=Object.keys(progress).filter(key=>progress[key].s==='hard').map(key=>{const index=key.indexOf(':');return {key,gid:key.slice(0,index),word:key.slice(index+1),updatedAt:progress[key].t,available:allowed.has(key)};});
    }else items=Object.entries(learning.comparisons).filter(pair=>pair[1].active&&pair[1].kind===bookState.tab).map(pair=>Object.assign({key:pair[0]},pair[1]));
    const cutoff=bookState.since==='all'?0:Date.now()-Number(bookState.since)*86400000;
    return items.filter(item=>(bookState.group==='all'||item.gid===bookState.group)&&(!cutoff||item.updatedAt>=cutoff)).sort((a,b)=>bookState.sort==='alpha'?a.word.localeCompare(b.word):bookState.sort==='oldest'?a.updatedAt-b.updatedAt:b.updatedAt-a.updatedAt);
  }
  function notebookCounts(){return {words:Object.values(progress).filter(r=>r.s==='hard').length,confusable:Object.values(learning.comparisons).filter(r=>r.active&&r.kind==='confusable').length,synonym:Object.values(learning.comparisons).filter(r=>r.active&&r.kind==='synonym').length};}
  function selectionCheckbox(item){return '<label><input type="checkbox" data-action="book-select" data-key="'+esc(item.key)+'" aria-label="选择 '+esc(item.word)+'"'+(bookState.selected.has(item.key)?' checked':'')+'><span class="sr-only">选择条目</span></label>';}
  function bookPager(page,position){
    const label=bookState.tab==='words'?'生词':bookState.tab==='confusable'?'近形辨析':'近义辨析';
    return '<nav class="book-pagination" aria-label="'+label+position+'分页"><button type="button" class="btn" data-action="book-page" data-direction="prev" data-page="'+(page.page-1)+'"'+(page.page===1?' disabled':'')+'>上一页</button><label class="book-page-position">第 <select class="book-page-select" aria-label="跳转'+label+'页码">'+Array.from({length:page.totalPages},(_,i)=>'<option value="'+(i+1)+'"'+(page.page===i+1?' selected':'')+'>'+(i+1)+'</option>').join('')+'</select><span> / '+page.totalPages+' 页</span></label><button type="button" class="btn" data-action="book-page" data-direction="next" data-page="'+(page.page+1)+'"'+(page.page===page.totalPages?' disabled':'')+'>下一页</button></nav>';
  }
  async function changeBookPage(value){
    const tab=bookState.tab,page=VocabRelations.paginate(notebookItems(),value,tab==='words'?30:15).page;
    if(page===bookState.pages[tab])return;
    bookState.pages[tab]=page;bookState.selected.clear();
    await renderRoute(false);
    if(location.hash==='#/review'&&bookState.tab===tab&&bookState.pages[tab]===page){
      const panel=$('#bookPanel');if(panel)panel.scrollIntoView({block:'start',behavior:'instant'});
      const selector=$('.book-page-select');if(selector)selector.focus({preventScroll:true});
    }
  }
  async function renderNotebook(version) {
    prepareSpeech();
    const counts=notebookCounts(),items=notebookItems();
    const page=VocabRelations.paginate(items,bookState.pages[bookState.tab],bookState.tab==='words'?30:15);
    bookState.pages[bookState.tab]=page.page;
    const visible=page.visible,visibleKeys=new Set(visible.map(item=>item.key));
    bookState.selected=new Set(Array.from(bookState.selected).filter(key=>visibleKeys.has(key)));
    await hydrate(visible.filter(item=>bookState.tab==='words'?item.available:manifest.groups.some(g=>g.id===item.gid)).map(item=>item.gid));
    if(version!==routeVersion)return;
    bookState.items=items;
    const groupOptions='<option value="all">所有词组</option>'+manifest.groups.map(g=>'<option value="'+esc(g.id)+'"'+(bookState.group===g.id?' selected':'')+'>'+esc(g.name)+'</option>').join('');
    let content='<div class="book-view">'+back()+intro('我的生词本','WORDS & CONNECTIONS','留下难记的词，也留下词与词之间细微的不同。')+bookSyncHTML()+
      '<div class="book-tabs" role="tablist" aria-label="收藏分类">'+[['words','生词'],['confusable','近形辨析'],['synonym','近义辨析']].map(pair=>'<button id="bookTab_'+pair[0]+'" type="button" role="tab" aria-controls="bookPanel" class="book-tab'+(bookState.tab===pair[0]?' active':'')+'" data-action="book-tab" data-book-tab="'+pair[0]+'" aria-selected="'+(bookState.tab===pair[0])+'" tabindex="'+(bookState.tab===pair[0]?'0':'-1')+'">'+pair[1]+'<small>'+counts[pair[0]]+' 条</small></button>').join('')+'</div>'+
      '<div class="book-filters"><label>所属词组<select id="bookGroup">'+groupOptions+'</select></label><label>收藏时间<select id="bookSince">'+[['all','全部时间'],['7','近 7 天'],['30','近 30 天']].map(pair=>'<option value="'+pair[0]+'"'+(bookState.since===pair[0]?' selected':'')+'>'+pair[1]+'</option>').join('')+'</select></label><label>排序<select id="bookSort">'+[['newest','最近收藏'],['oldest','最早收藏'],['alpha','字母顺序']].map(pair=>'<option value="'+pair[0]+'"'+(bookState.sort===pair[0]?' selected':'')+'>'+pair[1]+'</option>').join('')+'</select></label></div>'+
      '<div class="book-tools"><label class="selection-label"><input type="checkbox" id="bookSelectAll">选择本页</label><button class="btn" data-action="book-bulk"'+(!bookState.selected.size?' disabled':'')+'>'+(bookState.tab==='words'?'批量掌握':'取消所选收藏')+' ('+bookState.selected.size+')</button><button class="btn" data-action="export-csv">导出 CSV</button><button class="btn" data-action="export-notebook">导出 JSON</button></div><section id="bookPanel" role="tabpanel" aria-labelledby="bookTab_'+bookState.tab+'">';
    if(!items.length)content+='<div data-notebook-empty>'+notebookEmptyHTML(counts)+'</div>';
    else content+='<p class="book-page-summary" role="status" aria-live="polite">共 '+page.total+' 条 · 第 '+page.first+'–'+page.last+' 条 · 每页 '+page.size+' 条</p>'+bookPager(page,'顶部')+'<div class="book-stack">'+visible.map(item=>{
      if(bookState.tab==='words'){
        const full=getItem(item.gid,item.word);
        return '<article class="book-word foldable"><div class="comparison-selection">'+selectionCheckbox(item)+'</div><details class="word-fold" data-key="'+esc(item.key)+'"'+(bookState.openWords.has(item.key)?' open':'')+'><summary class="comparison-summary word-summary"><span class="comparison-pair">'+esc(item.word)+'</span><span class="comparison-summary-meta">'+esc(groupName(item.gid))+' · 生词<span class="comparison-toggle" aria-hidden="true"><span class="fold-closed">展开 ⌄</span><span class="fold-open">收起 ⌃</span></span></span></summary><div class="comparison-detail-content"><p class="definition">'+esc(full?full.w.definition:'这条记录来自旧词库，状态与备份仍完整保留。')+'</p><p class="book-item-meta">'+esc(formatTime(item.updatedAt))+'</p><div class="book-item-actions"><button class="btn" data-action="speak" data-text="'+esc(item.word)+'">'+icon('sound')+'发音</button><button class="btn" data-action="jump" data-gid="'+esc(item.gid)+'" data-word="'+esc(item.word)+'"'+(full?'':' disabled')+'>'+(full?'查看词条':'旧词库记录')+'</button><button class="btn btn-mastered" data-action="master-book" data-key="'+esc(item.key)+'">掌握并移出</button></div></div></details></article>';
      }
      return '<article class="comparison-card foldable"><div class="comparison-selection">'+selectionCheckbox(item)+'</div><details class="comparison-fold" data-key="'+esc(item.key)+'"'+(bookState.openComparisons.has(item.key)?' open':'')+'><summary class="comparison-summary"><span class="comparison-pair">'+esc(item.sourceWord)+'<i aria-hidden="true">↔</i>'+esc(VocabRelations.terms(item.word).join(' / '))+'</span><span class="comparison-summary-meta">'+esc(groupName(item.gid))+' · '+(item.kind==='confusable'?'近形辨析':'近义辨析')+'<span class="comparison-toggle" aria-hidden="true"><span class="fold-closed">展开 ⌄</span><span class="fold-open">收起 ⌃</span></span></span></summary><div class="comparison-detail-content">'+comparisonMeaningsHTML(item.gid,item.sourceWord,item.word,item)+definitionWarning(item.gid)+'<p class="comparison-note"><span class="comparison-label">辨析</span>'+esc(item.note)+'</p><p class="book-item-meta">'+esc(formatTime(item.updatedAt))+'</p><div class="book-item-actions"><button class="btn" data-action="speak" data-text="'+esc(VocabRelations.terms(item.word).join(', '))+'">'+icon('sound')+'发音</button><button class="btn" data-action="jump" data-gid="'+esc(item.gid)+'" data-word="'+esc(item.sourceWord)+'">回看原词</button><button class="btn" data-action="remove-comparison" data-key="'+esc(item.key)+'">取消收藏</button></div></div></details></article>';
    }).join('')+'</div>'+bookPager(page,'底部');
    view.innerHTML=content+'</section></div>';
  }
  async function exportNotebook(csv) {
    const items=notebookItems();if(!items.length){toast('当前筛选下还没有可导出的条目');return;}
    await hydrate(items.filter(item=>bookState.tab==='words'?item.available:manifest.groups.some(g=>g.id===item.gid)).map(item=>item.gid));
    const rows=[['类别','原词','关联词','双方释义','辨析说明','所属词组','记录时间']],words={},comparisons={};
    items.forEach(item=>{
      if(bookState.tab==='words'){const full=getItem(item.gid,item.word);words[item.key]=progress[item.key];rows.push(['生词',item.word,'',full?full.w.definition:'','',groupName(item.gid),formatTime(item.updatedAt)]);}
      else{const meanings=comparisonMeanings(item.gid,item.sourceWord,item.word,item).filter(row=>row.source!=='missing').map(row=>({word:row.word,definition:row.definition}));comparisons[item.key]=Object.assign({},learning.comparisons[item.key],{meanings});rows.push([item.kind==='confusable'?'近形辨析':'近义辨析',item.sourceWord,item.word,meanings.map(row=>row.word+'：'+row.definition).join('\n'),item.note,groupName(item.gid),formatTime(item.updatedAt)]);}
    });
    if(csv)download('vocab-notebook-'+T.dayKey(Date.now())+'.csv',T.toCSV(rows),'text/csv;charset=utf-8');
    else download('vocab-notebook-'+T.dayKey(Date.now())+'.json',JSON.stringify({v:2,words,learning:{comparisons},activity:[]},null,2),'application/json');
  }
  function renderStats() {
    const stats=T.summarize(activity,Date.now(),prefs.dailyGoal),total=totals(),max=Math.max(1,...stats.last30.map(day=>day.count));
    const points=stats.last30.map((day,i)=>[10+i*580/29,130-day.count/max*105]);
    const plot=points.map(point=>point.join(',')).join(' '),area='10,140 '+plot+' 590,140';
    view.innerHTML='<div class="stats-view">'+back()+intro('月光有迹','YOUR LEARNING CONSTELLATION','慢慢积累的日子，会在这里发光。')+
      '<div class="statistics-cards"><div class="metric-card"><b>'+stats.todayWords+'</b><span>今日学习 / 词</span></div><div class="metric-card"><b>'+stats.streak+'</b><span>连续学习 / 天</span></div><div class="metric-card"><b>'+total.mastered+'</b><span>已掌握 / 词</span></div></div>'+
      '<section class="chart-panel"><h2>星月历</h2><p>近 26 周，每一天实际学习过的不同单词。空白的日子也值得被温柔对待。</p><div class="heatmap-scroll"><div class="heatmap" role="img" aria-label="近26周学习热力图，今日'+stats.todayWords+'词">'+stats.heatmap.map(day=>'<span class="heat-cell'+(day.count?' l'+Math.min(4,Math.ceil(day.count/Math.max(1,prefs.dailyGoal)*4)):'')+'" title="'+day.day+'：'+day.count+' 词"></span>').join('')+'</div></div><div class="heat-legend">少<span class="heat-cell"></span><span class="heat-cell l1"></span><span class="heat-cell l2"></span><span class="heat-cell l3"></span><span class="heat-cell l4"></span>多</div></section>'+
      '<section class="chart-panel"><h2>三十日的回响</h2><p>每个词在同一天只记一次，重复练习不会虚增每日目标。</p><svg class="learning-chart" viewBox="0 0 600 150" role="img" aria-label="最近30天每日学习词数曲线，最高每天'+max+'词"><path d="M10 140H590M10 80H590M10 20H590" stroke="currentColor" stroke-opacity=".12" fill="none"/><polygon points="'+area+'" fill="currentColor" fill-opacity=".08"/><polyline points="'+plot+'" stroke="currentColor" stroke-width="2" fill="none"/>'+points.map((point,i)=>stats.last30[i].count?'<circle cx="'+point[0]+'" cy="'+point[1]+'" r="3" fill="currentColor"><title>'+stats.last30[i].day+'：'+stats.last30[i].count+'词</title></circle>':'').join('')+'</svg><div class="chart-labels"><span>'+stats.last30[0].day+'</span><span>今日</span></div><details class="word-section"><summary>查看每日数据</summary><table class="stats-table"><thead><tr><th scope="col">日期</th><th scope="col">学习词数</th></tr></thead><tbody>'+stats.last30.slice().reverse().map(day=>'<tr><td>'+day.day+'</td><td>'+day.count+'</td></tr>').join('')+'</tbody></table></details></section>'+
      (!activity.length?'<p class="setting-note">详细学习日志从这次升级后开始记录；旧版的生词与掌握状态已保留，不会据此推造过去的打卡。</p>':'')+
      '<div class="section-heading"><h2>词集月相</h2><span>MASTERY</span></div><div class="group-grid">'+manifest.groups.map(g=>{const st=groupStats(g);return '<a class="group-card" href="#/group/'+esc(g.id)+'"><div class="group-card-body"><h3>'+esc(g.name)+'</h3><p class="group-note">掌握 '+st.mastered+' / '+st.total+' 词</p></div><div class="group-moon">'+moon(st.mastered,st.total)+'<span>'+Math.round(st.mastered/Math.max(1,st.total)*100)+'%</span></div></a>';}).join('')+'</div></div>';
  }
  function syncSettingsHTML(){
    const has=!!sync;
    return '<section class="panel panel-sync"><h2 class="panel-title">跨设备同步</h2><p class="panel-desc">手机已有收藏时：先在手机复制已有同步码并完成同步，再在这台电脑输入同一码配对。为另一台设备重新生成不同的码，不会自动带来原收藏。也可在下方导入手机的完整备份。</p><p class="panel-desc">同步码即访问权限，请勿公开。网络不通时仍可在本机学习；配对和导入按时间合并，不清空已有记录。</p>'+
      (has?'<div class="code-box"><span class="code-text">'+esc(sync.code)+'</span></div><div class="panel-row"><button class="btn" data-action="copy-code">复制同步码</button><button class="btn btn-primary" data-action="sync-now">立即同步</button><button class="btn" data-action="unbind-code">解绑</button></div>':'<button class="btn btn-primary" data-action="gen-code">生成同步码</button>')+
      '<div class="panel-row"><label class="sr-only" for="bindInput">输入已有同步码</label><input class="text-input" id="bindInput" placeholder="输入已有同步码" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="btn" data-action="bind-code">'+(has?'更换同步码':'配对')+'</button></div><p class="sync-status" id="syncStatus"></p></section>';
  }
  function refreshSyncSettings(){
    const panel=$('.panel-sync');if(!panel)return;
    const focused=panel.contains(document.activeElement)?document.activeElement:null,id=focused?.id,action=focused?.dataset?.action,value=$('#bindInput')?.value||'';
    panel.outerHTML=syncSettingsHTML();
    $('#bindInput').value=value;
    const target=id?document.getElementById(id):action?$$('.panel-sync [data-action]').find(node=>node.dataset.action===action):null;
    if(target)target.focus({preventScroll:true});
    paintSyncStatus();
  }
  function renderSettings() {
    view.innerHTML='<div class="reading-width">'+back()+intro('整理你的藏书室','THE READING ROOM','按自己的节奏，让每一次重逢更舒适。')+'</div><div class="settings">'+
      '<section class="panel"><h2 class="panel-title">阅读与学习</h2><p class="panel-desc">月光有深浅，学习也有自己的步调。</p>'+
      '<div class="setting-row"><label for="themeSelect">主题</label><select id="themeSelect">'+[['dark','月黑'],['light','月白'],['system','跟随系统']].map(pair=>'<option value="'+pair[0]+'"'+((prefs.theme||'system')===pair[0]?' selected':'')+'>'+pair[1]+'</option>').join('')+'</select></div>'+
      '<div class="setting-row"><label for="fontSize">阅读字号</label><select id="fontSize">'+[['small','小'],['medium','标准'],['large','大']].map(pair=>'<option value="'+pair[0]+'"'+(prefs.fontSize===pair[0]?' selected':'')+'>'+pair[1]+'</option>').join('')+'</select></div>'+
      '<div class="setting-row"><label for="englishFont">英文字体</label><select id="englishFont"><option value="serif"'+(prefs.englishFont==='serif'?' selected':'')+'>古典衬线</option><option value="sans"'+(prefs.englishFont==='sans'?' selected':'')+'>简洁无衬线</option></select></div>'+
      '<div class="setting-row"><label for="dailyGoal">每日目标 / 词</label><input class="text-input" id="dailyGoal" type="number" inputmode="numeric" min="1" step="1" value="'+prefs.dailyGoal+'"></div>'+
      '<fieldset class="word-section"><legend>混合自测题型</legend>'+[['choice','英 → 义 · 四选一'],['spelling','义 → 英 · 拼写'],['cloze','例句挖空'],['listen','听音辨义 · 四选一']].map(pair=>'<label class="check-row"><input type="checkbox" data-quiz-type="'+pair[0]+'"'+(prefs.quizTypes.includes(pair[0])?' checked':'')+'>'+pair[1]+'</label>').join('')+'<p class="setting-note">至少保留一种；例句不含原词时，会自动换成可用题型。</p></fieldset></section>'+
      syncSettingsHTML()+
      '<section class="panel"><h2 class="panel-title">完整备份</h2><p class="panel-desc">包含生词、掌握进度、近形/近义辨析收藏、复习安排与学习日志。兼容旧版 JSON；导入先预览、再合并，不清空已有数据。</p><div class="panel-row"><button class="btn" data-action="export-copy">复制备份</button><button class="btn" data-action="export-backup">下载完整 JSON</button></div><label class="sr-only" for="importText">粘贴学习备份 JSON</label><textarea class="import-area" id="importText" placeholder="在这里粘贴备份 JSON…"></textarea><label class="file-btn">也可选择备份文件 <input id="importFile" type="file" accept=".json,application/json"></label><div class="panel-row"><button class="btn" data-action="import-preview">预览合并</button><button class="btn btn-primary" id="importApply" data-action="import-apply" disabled>确认导入</button></div><p class="sync-status" id="importStatus">原同步码不会写入下载备份，请自行妥善保存。</p></section>'+
      '<section class="panel"><h2 class="panel-title">关于拾词</h2><ul class="about-list"><li>'+manifest.groups.length+' 组 · '+manifest.totalWords+' 个词，原词条与辨析内容完整保留。</li><li>可添加到主屏幕，已访问的词组可离线重读；未下载的组需要先联网。</li><li>月神意象来自 Selene；字体采用 Cinzel / Cormorant Garamond / Noto Serif，按 SIL OFL 许可自托管。</li><li>iPhone 若无法发音，请检查静音开关及系统英语语音设置。</li></ul></section></div>';
    paintSyncStatus();
  }
  function download(name,content,type) {
    const url=URL.createObjectURL(new Blob([content],{type:type||'application/json'})),anchor=document.createElement('a');
    anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function copy(text) {
    const fallback=()=>{const node=document.createElement('textarea');node.value=text;node.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(node);node.select();let ok=false;try{ok=document.execCommand('copy');}catch(e){}node.remove();toast(ok?'已复制':'复制失败，请选择下载备份');};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>toast('已复制'),fallback);else fallback();
  }
  function jumpTo(gid,word) {
    pendingWord=word;
    if(location.hash==='#/group/'+gid){groupState.mode='cards';groupState.idx=Math.max(0,loaded.get(gid).words.findIndex(w=>w.word===word));session=null;pendingWord=null;renderGroup(loaded.get(gid));}
    else location.hash='#/group/'+gid;
  }
  function resetImport(){importCandidate=null;const button=$('#importApply');if(button)button.disabled=true;}
  async function handleAction(event) {
    const element=event.target.closest('[data-action]');if(!element)return;
    const action=element.dataset.action;
    if(element.tagName==='A')event.preventDefault();
    if(action==='speak'){
      const pdKey=(element.dataset.accent||'us')+':'+(element.dataset.text||'');
      if(element._pdSpeak&&element._pdSpeak.key===pdKey&&Date.now()-element._pdSpeak.t<600)return; // pointerdown 已发音，click 只是回声
      speak(element.dataset.text||'',element.dataset.accent,element);return;
    }
    if(action==='retry'){renderRoute();return;}
    if(action==='clear-book-filters'){bookState.group='all';bookState.since='all';bookState.pages={words:1,confusable:1,synonym:1};bookState.selected.clear();await renderRoute(false);return;}
    if(action==='retry-definitions'){
      const gid=element.dataset.gid,currentRoute=routeVersion;
      element.disabled=true;
      try{
        definitions.set(gid,await D.loadDefinitions(gid));definitionErrors.delete(gid);
        if(currentRoute!==routeVersion)return;
        const wrap=$('#cardWrap');
        if(wrap&&groupState.gid===gid){rememberSections();wrap.innerHTML=wordCardHTML(getItem(gid,loaded.get(gid).words[groupState.idx].word));restoreSections();}
        else if(location.hash==='#/review')await renderRoute(false);
      }catch(error){toast('释义仍未加载，请联网后重试');}finally{if(element.isConnected)element.disabled=false;}return;
    }
    if(action==='home-more'){const previous=homeLimit;homeLimit=Math.min(manifest.groups.length,homeLimit+12);renderHome();const added=$$('.group-grid .group-card')[previous];if(added)added.focus({preventScroll:true});return;}
    if(action==='home-filter'){if(!['all','new','active','due','done'].includes(element.dataset.filter))return;homeFilter=element.dataset.filter;homeLimit=12;renderHome();const selected=$('[data-action="home-filter"][data-filter="'+homeFilter+'"]');if(selected)selected.focus({preventScroll:true});return;}
    if(action==='jump'){jumpTo(element.dataset.gid,element.dataset.word);return;}
    if(action==='favorite'){
      const item=getItem(element.dataset.gid,element.dataset.source);if(!item)return;
      const list=array(element.dataset.kind==='confusable'?item.w.confusables:item.w.synonyms),relation=list.find(r=>r.word===element.dataset.related);if(!relation)return;
      const record={gid:item.gid,sourceWord:item.w.word,kind:element.dataset.kind,word:relation.word,note:relation.note||''},key=S.comparisonKey(record),old=learning.comparisons[key];
      learning.comparisons[key]=Object.assign(record,{active:!(old&&old.active),updatedAt:timestamp(old&&old.updatedAt),meanings:comparisonMeanings(item.gid,item.w.word,relation.word).filter(row=>row.source!=='missing').map(row=>({word:row.word,definition:row.definition}))});persist();paintFavorites();
      toast(learning.comparisons[key].active?'已收进'+(record.kind==='confusable'?'近形辨析':'近义辨析'):'已取消这条辨析的收藏');return;
    }
    if(action==='mark'){
      const key=keyOf(element.dataset.gid,element.dataset.word),old=progress[key];
      if(old&&old.s===element.dataset.status){delete progress[key];learning.clearedProgress[key]=timestamp(Math.max(old.t,learning.clearedProgress[key]||0));}
      else{progress[key]={s:element.dataset.status,t:timestamp(Math.max(old&&old.t||0,learning.clearedProgress[key]||0))};recordActivity(key,'study',null);}
      persist();const current=getItem(element.dataset.gid,element.dataset.word);if(current)paintWordStatus(current);return;
    }
    if(action==='prev'||action==='next'){changeCard(action==='prev'?-1:1);return;}
    if(action==='goto'){
      speechPlayer.stop();groupState.idx=Number(element.dataset.index)||0;groupState.mode='cards';groupState.concealed=false;session=null;renderGroup(loaded.get(groupState.gid));
      const wrap=$('#cardWrap');if(wrap)window.scrollTo({top:Math.max(0,window.scrollY+wrap.getBoundingClientRect().top-12),behavior:'instant'});
      return;
    }
    if(action==='mode'){
      speechPlayer.stop();
      if(element.dataset.mode==='quiz')startQuiz();
      else{session=null;groupState.mode=element.dataset.mode;renderGroup(loaded.get(groupState.gid));}
      return;
    }
    if(action==='conceal'){groupState.concealed=!groupState.concealed;renderGroupContent();return;}
    if(action==='start-review'){await startReview();return;}
    if(action==='start-learning'){await startReview(true);return;}
    if(action==='reveal'){revealReview();return;}
    if(action==='rate'){if(session&&session.flipped)finishAnswer(element.dataset.grade,element.dataset.grade==='known');return;}
    if(action==='answer-choice'){answerChoice(Number(element.dataset.index));return;}
    if(action==='session-next'){advanceSession();return;}
    if(action==='book-tab'){bookState.tab=element.dataset.bookTab;bookState.selected.clear();await renderRoute(false);return;}
    if(action==='book-page'){element.disabled=true;await changeBookPage(element.dataset.page);return;}
    if(action==='master-book'){
      const key=element.dataset.key;progress[key]={s:'mastered',t:timestamp(progress[key]&&progress[key].t)};bookState.selected.delete(key);recordActivity(key,'study',null);persist();await renderRoute(false);return;
    }
    if(action==='remove-comparison'){
      const key=element.dataset.key,old=learning.comparisons[key];if(old)learning.comparisons[key]=Object.assign({},old,{active:false,updatedAt:timestamp(old.updatedAt)});
      bookState.selected.delete(key);persist();await renderRoute(false);return;
    }
    if(action==='book-bulk'){
      if(!bookState.selected.size)return;
      if(!confirm(bookState.tab==='words'?'将所选生词标记为掌握，并移出生词本？':'取消所选辨析的收藏？'))return;
      bookState.selected.forEach(key=>{
        if(bookState.tab==='words'&&progress[key]){progress[key]={s:'mastered',t:timestamp(progress[key].t)};recordActivity(key,'study',null);}
        else if(learning.comparisons[key])learning.comparisons[key]=Object.assign({},learning.comparisons[key],{active:false,updatedAt:timestamp(learning.comparisons[key].updatedAt)});
      });
      bookState.selected.clear();persist();await renderRoute(false);return;
    }
    if(action==='export-csv'||action==='export-notebook'){element.disabled=true;try{await exportNotebook(action==='export-csv');}finally{element.disabled=false;}return;}
    if(action==='export-copy'){copy(JSON.stringify(fullBackup()));return;}
    if(action==='export-backup'){download('vocab-backup-'+T.dayKey(Date.now())+'.json',JSON.stringify(fullBackup(),null,2));return;}
    if(action==='import-preview'){
      resetImport();
      try{
        importCandidate=S.parseBackup($('#importText').value);
        const old=JSON.stringify([progress,learning,activity]),mergedLearning=S.mergeLearning(learning,importCandidate.learning);
        const merged={progress:S.applyProgressClears(S.mergeProgress(progress,importCandidate.progress),mergedLearning),learning:mergedLearning,activity:S.mergeActivity(activity,importCandidate.activity)};
        if(JSON.stringify([merged.progress,merged.learning,merged.activity])===old){$('#importStatus').textContent='备份里没有更新的数据，无需导入。';importCandidate=null;return;}
        $('#importStatus').textContent='可合并：'+Object.keys(importCandidate.progress).length+' 条词汇状态、'+Object.values(importCandidate.learning.comparisons).filter(r=>r.active).length+' 条辨析收藏及 '+importCandidate.activity.length+' 条学习日志。已有记录按时间取较新的一侧。';
        $('#importApply').disabled=false;
      }catch(e){$('#importStatus').textContent=e.message;}
      return;
    }
    if(action==='import-apply'){
      if(!importCandidate)return;
      learning=S.mergeLearning(learning,importCandidate.learning);progress=S.applyProgressClears(S.mergeProgress(progress,importCandidate.progress),learning);activity=S.mergeActivity(activity,importCandidate.activity);
      importCandidate=null;persist();renderSettings();toast('学习记录与辨析收藏已合并');return;
    }
    if(action==='gen-code'){
      if(!window.crypto||!crypto.getRandomValues){toast('当前浏览器不支持安全生成同步码，可输入已有同步码');return;}
      const bytes=crypto.getRandomValues(new Uint8Array(16)),alphabet='abcdefghijklmnopqrstuvwxyz0123456789';
      pairAttempt++;sync={code:'vocab-'+Array.from(bytes).map(n=>alphabet[n%alphabet.length]).join(''),lastSync:0};syncView={status:'waiting',error:''};write(S.keys.sync,sync);renderSettings();await client.sync(true);return;
    }
    if(action==='copy-code'){if(sync)copy(sync.code);return;}
    if(action==='bind-code'){
      const code=$('#bindInput').value.trim();if(!/^[A-Za-z0-9_-]{6,60}$/.test(code)){toast('同步码须为 6–60 位字母、数字、下划线或连字符');return;}
      const attempt=++pairAttempt,oldText=element.textContent;let paired=false;
      element.disabled=true;element.textContent='正在验证…';$('#syncStatus').textContent='正在检查这个同步码下的云端记录，本机已有数据保留。';
      try{
        const result=await client.verifyCode(code);
        if(attempt!==pairAttempt)return;
        if(!result.ok){const status=$('#syncStatus');if(status){status.className='sync-status error';status.textContent=result.error;}return;}
        sync={code,lastSync:0};syncView={status:'waiting',error:''};paired=true;write(S.keys.sync,sync);if(location.hash==='#/settings')renderSettings();await client.sync(true);
      }finally{if(!paired&&element.isConnected){element.disabled=false;element.textContent=oldText;}}return;
    }
    if(action==='unbind-code'){
      if(!confirm('解绑只停止云同步，本机的学习记录和辨析收藏都会保留。确定解绑？'))return;
      pairAttempt++;sync=null;syncView={status:'unpaired',error:''};try{storage.removeItem(S.keys.sync);}catch(e){}client.cancelScheduled();renderSettings();toast('已解绑，本机记录保留');return;
    }
    if(action==='sync-now'){
      if(!sync)return;element.disabled=true;element.textContent='同步中…';
      try{const result=await client.sync(true);if(result.ok)toast(result.metadataOk?'学习进度与收藏已同步':'进度已同步，增强记录稍后重试');else toast('同步未完成，本机数据已保留');}
      finally{if(element.isConnected){element.disabled=false;element.textContent='立即同步';}}return;
    }
  }
  view.addEventListener('click',event=>{Promise.resolve(handleAction(event)).catch(e=>toast(e.message||'操作暂未完成，请重试'));});
  view.addEventListener('submit',event=>{if(event.target.id==='answerForm'){event.preventDefault();answerInput();}});
  view.addEventListener('input',event=>{
    if(event.target.id==='searchInput'&&!event.isComposing){clearTimeout(searchTimer);searchTimer=setTimeout(()=>search(event.target.value),150);}
    if(event.target.id==='importText')resetImport();
  });
  view.addEventListener('compositionend',event=>{if(event.target.id==='searchInput')search(event.target.value);});
  view.addEventListener('toggle',event=>{
    if(!event.target.matches('.comparison-fold,.word-fold'))return;
    const key=event.target.dataset.key;
    const opened=event.target.matches('.word-fold')?bookState.openWords:bookState.openComparisons;
    if(event.target.open)opened.add(key);else opened.delete(key);
  },true);
  view.addEventListener('change',async event=>{
    const element=event.target;
    if(element.matches('.book-page-select')){await changeBookPage(element.value);return;}
    if(element.id==='bookGroup'||element.id==='bookSince'||element.id==='bookSort'){
      bookState[{bookGroup:'group',bookSince:'since',bookSort:'sort'}[element.id]]=element.value;bookState.selected.clear();bookState.pages={words:1,confusable:1,synonym:1};await renderRoute(false);return;
    }
    if(element.matches('[data-action="book-select"]')){
      if(element.checked)bookState.selected.add(element.dataset.key);else bookState.selected.delete(element.dataset.key);
      const button=$('[data-action="book-bulk"]');if(button){button.disabled=!bookState.selected.size;button.textContent=(bookState.tab==='words'?'批量掌握':'取消所选收藏')+' ('+bookState.selected.size+')';}return;
    }
    if(element.id==='bookSelectAll'){
      $$('[data-action="book-select"]').forEach(input=>{input.checked=element.checked;if(element.checked)bookState.selected.add(input.dataset.key);else bookState.selected.delete(input.dataset.key);});
      const button=$('[data-action="book-bulk"]');button.disabled=!bookState.selected.size;button.textContent=(bookState.tab==='words'?'批量掌握':'取消所选收藏')+' ('+bookState.selected.size+')';return;
    }
    if(element.id==='themeSelect')prefs.theme=element.value==='system'?null:element.value;
    else if(element.id==='fontSize')prefs.fontSize=element.value;
    else if(element.id==='englishFont')prefs.englishFont=element.value;
    else if(element.id==='dailyGoal'){
      const value=Number(element.value);if(!Number.isSafeInteger(value)||value<1){element.value=prefs.dailyGoal;toast('每日目标请填写大于零的整数');return;}prefs.dailyGoal=value;
    }else if(element.dataset.quizType){
      const types=$$('[data-quiz-type]:checked').map(input=>input.dataset.quizType);
      if(!types.length){element.checked=true;toast('至少保留一种自测题型');return;}prefs.quizTypes=types;
    }else if(element.id==='importFile'){
      const file=element.files&&element.files[0];if(!file)return;
      try{$('#importText').value=await file.text();resetImport();toast('备份已读取，请先预览合并');}catch(e){toast('文件读取失败，请重新选择');}return;
    }else return;
    savePrefs();
  });
  $('#btnTheme').addEventListener('click',()=>{prefs.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';savePrefs();});
  $('.skip-link').addEventListener('click',event=>{event.preventDefault();view.focus({preventScroll:true});view.scrollIntoView({block:'start'});});
  /* 发音快路径：手指按下（pointerdown）立刻发音，不等 click 的百余毫秒判定；
     本次按压的 click 回声由 handleAction 里的时间戳去重拦截，不会把刚起音的声音掐断重播 */
  document.addEventListener('pointerdown',event=>{
    const button=event.target&&event.target.closest?event.target.closest('[data-action="speak"]'):null;
    if(!button)return;
    button._pdSpeak={key:(button.dataset.accent||'us')+':'+(button.dataset.text||''),t:Date.now()};
    speak(button.dataset.text||'',button.dataset.accent,button);
  },{passive:true});
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
    const target=event.target,editing=target&&target.matches('input,textarea,select,[contenteditable=true]');
    if(editing)return;
    if(target&&target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight'].includes(event.key)){
      event.preventDefault();const tabs=['words','confusable','synonym'],index=tabs.indexOf(bookState.tab);bookState.tab=tabs[(index+(event.key==='ArrowRight'?1:2))%3];bookState.selected.clear();renderRoute(false).then(()=>$('#bookTab_'+bookState.tab).focus());return;
    }
    if(event.key==='Escape'){if(location.hash&&location.hash!=='#/'){location.hash='#/';event.preventDefault();}return;}
    if(target&&target.closest('button,a,summary')&&[' ','Enter'].includes(event.key))return;
    if(session&&activeSessionItem()){
      if(event.key.toLowerCase()==='s'){event.preventDefault();speak(activeSessionItem().w.word,'us',session.kind==='quiz'&&session.question?.type==='listen'?$('.quiz-listen'):null);return;}
      if(session.kind==='review'){
        if(event.key===' '){event.preventDefault();revealReview();}
        const grade={1:'forgot',2:'fuzzy',3:'known'}[event.key];if(grade&&session.flipped){event.preventDefault();finishAnswer(grade,grade==='known');}
      }else if(session.graded&&(event.key===' '||event.key==='ArrowRight')){event.preventDefault();advanceSession();}
      else if(!session.graded&&session.question&&['choice','listen'].includes(session.question.type)&&/^[1-4]$/.test(event.key)){event.preventDefault();answerChoice(Number(event.key)-1);}
      return;
    }
    if(groupState.gid&&location.hash.startsWith('#/group/')&&groupState.mode==='cards'){
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();changeCard(event.key==='ArrowRight'?1:-1);}
      else if(event.key.toLowerCase()==='s'){event.preventDefault();const group=loaded.get(groupState.gid);speak(group.words[groupState.idx].word);}
      else if(event.key===' '){event.preventDefault();groupState.concealed=!groupState.concealed;renderGroupContent();}
    }
  });
  let touch=null;
  view.addEventListener('touchstart',event=>{
    touch=null;
    if(event.touches.length!==1||event.target.closest('button,a,input,textarea,select,summary,.dot-strip'))return;
    touch={x:event.touches[0].clientX,y:event.touches[0].clientY};
  },{passive:true});
  view.addEventListener('touchend',event=>{
    if(!touch)return;const dx=event.changedTouches[0].clientX-touch.x,dy=event.changedTouches[0].clientY-touch.y;touch=null;
    if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.7&&location.hash.startsWith('#/group/')&&groupState.mode==='cards'&&!session)changeCard(dx<0?1:-1);
  },{passive:true});
  view.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
  function showError(error){view.innerHTML=empty('这一页，暂时还没取到。',esc(error.message||'请检查网络后重试。'),'<button class="btn btn-primary" data-action="retry">重新加载</button>');view.setAttribute('aria-busy','false');}
  function updateNavigation(hash){
    const active=hash==='#/today'?'today':hash==='#/review'?'review':hash==='#/stats'?'stats':hash==='#/settings'?'settings':'home';
    $$('[data-nav]').forEach(node=>{node.classList.toggle('active',node.dataset.nav===active);if(node.dataset.nav===active)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});
  }
  async function renderRoute(focus=true) {
    const version=++routeVersion,hash=location.hash||'#/';
    speechPlayer.stop();
    searchVersion++;clearTimeout(searchTimer);view.setAttribute('aria-busy','true');updateNavigation(hash);
    if(session&&!((session.kind==='review'&&hash==='#/today')||(session.kind==='quiz'&&hash==='#/group/'+groupState.gid)))session=null;
    if(groupState.mode==='quiz'&&!session)groupState.mode='cards';
    try{
      if(!manifest)manifest=await D.loadManifest();
      if(version!==routeVersion)return;
      const match=hash.match(/^#\/group\/([A-Za-z0-9_-]+)\/?$/);
      if(match){
        const gid=match[1];if(!manifest.groups.some(g=>g.id===gid)){view.innerHTML=empty('这一组还不在馆藏里。','请从词集重新选择。');view.setAttribute('aria-busy','false');return;}
        if(!loaded.has(gid))view.innerHTML=loading();
        await hydrate([gid]);if(version!==routeVersion)return;
        const group=loaded.get(gid);
        if(groupState.gid!==gid){groupState.gid=gid;groupState.mode='cards';groupState.concealed=false;groupState.idx=learning.resume&&learning.resume.gid===gid?learning.resume.idx:0;session=null;}
        if(pendingWord){const index=group.words.findIndex(w=>w.word===pendingWord);if(index>=0)groupState.idx=index;pendingWord=null;groupState.mode='cards';}
        renderGroup(group);document.title=group.name+' · 拾词';
      }else if(hash==='#/review'){await renderNotebook(version);document.title='生词与辨析收藏 · 拾词';}
      else if(hash==='#/stats'){renderStats();document.title='学习足迹 · 拾词';}
      else if(hash==='#/settings'){resetImport();renderSettings();document.title='设置 · 拾词';}
      else if(hash==='#/today'){renderToday();document.title='今日复习 · 拾词';}
      else{groupState.gid=null;renderHome();document.title='拾词 · 月下藏书室';}
      if(version!==routeVersion)return;
      view.setAttribute('aria-busy','false');
      if(focus){window.scrollTo(0,0);view.focus({preventScroll:true});}
    }catch(e){if(version===routeVersion)showError(e);}
  }
  window.addEventListener('hashchange',()=>renderRoute());
  function syncOnReturn(){if(document.visibilityState==='visible'&&sync?.code&&Date.now()-lastSyncRequest>5000)client.sync(true);}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){speechPlayer.stop();if(sync?.code)client.sync(false);}else syncOnReturn();});
  window.addEventListener('focus',syncOnReturn);
  window.addEventListener('storage',event=>{
    if(![S.keys.progress,S.keys.learning,S.keys.activity,S.keys.sync].includes(event.key))return;
    const latest=S.readState(storage);
    learning=S.mergeLearning(learning,latest.learning);progress=S.applyProgressClears(S.mergeProgress(progress,latest.progress),learning);activity=S.mergeActivity(activity,latest.activity);
    if(event.key===S.keys.sync){
      const changed=sync?.code!==latest.sync?.code;sync=latest.sync;
      if(changed){pairAttempt++;syncView={status:sync?'waiting':'unpaired',error:''};refreshSyncSettings();if(sync)client.sync(true);else client.cancelScheduled();}
    }
    if(location.hash==='#/review')refreshNotebook();else{paintFavorites();const group=loaded.get(groupState.gid);if(group&&groupState.mode==='cards'&&location.hash.startsWith('#/group/')){const item=getItem(group.id,group.words[groupState.idx].word);if(item)paintWordStatus(item);}}
    paintSyncStatus();
  });
  window.addEventListener('online',()=>{if(sync&&sync.code)client.sync(true);});
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js').then(registration=>{
        if(registration.waiting&&navigator.serviceWorker.controller)$('#updateNotice').hidden=false;
        registration.addEventListener('updatefound',()=>{
          const worker=registration.installing;
          if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)$('#updateNotice').hidden=false;});
        });
      }).catch(()=>{});
    });
  }
  applyTheme();renderRoute().then(()=>{if(sync?.code&&syncView.status==='waiting')client.sync(true);});
})();
