(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocabStats=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function dayKey(timestamp){var d=new Date(timestamp);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function shifted(now,offset){var d=new Date(now);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+offset,12).getTime();}
  function recordActivity(events,event){return events.some(function(e){return e.id===event.id;})?events:events.concat([event]);}
  function summarize(events,now,goal){
    var counts={},ids=new Set();
    (Array.isArray(events)?events:[]).forEach(function(e){
      if(!e||!e.id||!e.key||!Number.isFinite(e.at)||e.at>now||ids.has(e.id))return;
      ids.add(e.id);var day=dayKey(e.at);if(!counts[day])counts[day]=new Set();counts[day].add(e.key);
    });
    function count(t){return counts[dayKey(t)]?counts[dayKey(t)].size:0;}
    var todayWords=count(now),streak=0,offset=todayWords?0:-1;
    while(count(shifted(now,offset))){streak++;offset--;}
    var last30=[];for(var i=29;i>=0;i--){var at=shifted(now,-i);last30.push({day:dayKey(at),count:count(at)});}
    var weekday=(new Date(now).getDay()+6)%7,heatmap=[];
    for(var j=0;j<182;j++){var at=shifted(now,-weekday-175+j);heatmap.push({day:dayKey(at),count:count(at),future:dayKey(at)>dayKey(now)});}
    return {todayWords:todayWords,streak:streak,last30:last30,heatmap:heatmap,goalReached:todayWords>=Math.max(1,goal||20)};
  }
  function moonPhase(mastered,total){
    var ratio=total>0?Math.max(0,Math.min(1,mastered/total)):0;
    var radius=Math.abs(Math.cos(Math.PI*ratio)*10).toFixed(4),sweep=ratio<.5?0:1;
    return {ratio:ratio,label:ratio===0?'新月':ratio<.25?'峨眉月':ratio<=.5?'上弦月':ratio<1?'盈凸月':'满月',
      path:'M12 2 A10 10 0 0 1 12 22 A'+radius+' 10 0 0 '+sweep+' 12 2Z'};
  }
  function toCSV(rows){
    return '\uFEFF'+rows.map(function(row){return row.map(function(value){var s=String(value==null?'':value);if(/^[=+\-@\t\r]/.test(s.trimStart()))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
  }
  return {dayKey:dayKey,recordActivity:recordActivity,summarize:summarize,moonPhase:moonPhase,toCSV:toCSV};
});
