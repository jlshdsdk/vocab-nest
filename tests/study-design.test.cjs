const test=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./browser-helper.cjs');

test('the study view stays readable and operable in both themes and screen sizes',{timeout:240000},async t=>{
  const b=await browserFixture(t);
  await b.call('set','viewport','390','844');
  await b.call('open',b.url+'#/group/g126');
  await b.wait('!!document.querySelector(".wcard-word")');
  await b.evaluate('document.querySelector("[data-mode=list]").click();document.querySelector(\'[data-action=goto][data-index="15"]\').click()');
  await b.wait('document.querySelector(".wcard-word")?.textContent==="notwithstanding"');

  await t.test('the study surface has the reference-inspired gradient in both themes',async()=>{
    for(const theme of ['dark','light']){
      await b.evaluate('if(document.documentElement.dataset.theme!=='+JSON.stringify(theme)+')document.querySelector("#btnTheme").click()');
      const surface=await b.evaluate('getComputedStyle(document.querySelector(".wcard")).backgroundImage');
      assert.match(surface,/gradient\(/,theme+' study surface needs a visible gradient');
    }
  });

  await t.test('long words, content and controls fit mobile, tablet and desktop',async()=>{
    for(const theme of ['dark','light']){
      await b.evaluate('if(document.documentElement.dataset.theme!=='+JSON.stringify(theme)+')document.querySelector("#btnTheme").click()');
      for(const [width,height] of [[320,700],[360,740],[390,844],[768,900],[1440,900]]){
        await b.call('set','viewport',String(width),String(height));
        const result=await b.evaluate(`(()=>{
          const card=document.querySelector('.wcard'),word=document.querySelector('.wcard-word');
          const controls=document.querySelector('.study-controls'),tab=document.querySelector('.tabbar');
          const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width};};
          const visible=node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===node||node.contains(hit);};
          return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,card:rect(card),word:rect(word),counter:document.querySelector('[data-word-counter]').textContent,
            controls:rect(controls),nav:getComputedStyle(tab).display==='none'?null:rect(tab),
            buttons:Array.from(controls.querySelectorAll('button')).map(node=>({action:node.dataset.action,box:rect(node),visible:visible(node)}))};
        })()`);
        const label=theme+' '+width+'px: '+JSON.stringify(result);
        assert.ok(result.scrollWidth<=result.viewport,label);
        assert.ok(result.word.left>=result.card.left&&result.word.right<=result.card.right,label);
        assert.match(result.counter,/16\s*\/\s*20/);
        assert.equal(result.buttons.length,5,label);
        assert.ok(result.controls.top>=0&&result.controls.bottom<=height,label);
        if(result.nav)assert.ok(result.controls.bottom<=result.nav.top,label);
        for(const button of result.buttons){assert.ok(button.box.height>=44,label);assert.equal(button.visible,true,label);}
      }
    }
  });

  await t.test('bottom reading content can be scrolled above fixed controls',async()=>{
    await b.call('set','viewport','320','700');
    const result=await b.evaluate(`(()=>{
      const target=document.querySelector('.wcard .word-section:last-child summary');target.scrollIntoView({block:'center'});
      const r=target.getBoundingClientRect(),controls=document.querySelector('.study-controls').getBoundingClientRect();
      const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {top:r.top,bottom:r.bottom,controlsTop:controls.top,visible:hit===target||target.contains(hit)};
    })()`);
    assert.ok(result.top>=0&&result.bottom<=result.controlsTop,JSON.stringify(result));
    assert.equal(result.visible,true);
  });

  await t.test('recall, keyboard navigation, modes and reduced motion remain available',async()=>{
    await b.call('set','viewport','1440','900');
    await b.call('set','media','light','reduced-motion');
    const result=await b.evaluate(`(()=>{
      const conceal=document.querySelector('[data-action=conceal]');conceal.click();
      const hidden=document.querySelector('.word-body').hidden;conceal.click();
      const restored=!document.querySelector('.word-body').hidden;
      document.querySelector('#view').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      const next=document.querySelector('.wcard-word').textContent;
      document.querySelector('#view').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
      const previous=document.querySelector('.wcard-word').textContent;
      document.querySelector('[data-mode=list]').click();const list=!!document.querySelector('.word-list');
      document.querySelector('[data-mode=cards]').click();const cards=!!document.querySelector('.wcard');
      document.querySelector('[data-mode=quiz]').click();const quiz=!!document.querySelector('.quiz-shell');
      return {hidden,restored,next,previous,list,cards,quiz,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
        activeAnimations:document.getAnimations().filter(a=>a.playState==='running').length};
    })()`);
    assert.equal(result.hidden,true);assert.equal(result.restored,true);
    assert.notEqual(result.next,'notwithstanding');assert.equal(result.previous,'notwithstanding');
    assert.equal(result.list,true);assert.equal(result.cards,true);assert.equal(result.quiz,true);
    assert.equal(result.reduced,true);assert.equal(result.activeAnimations,0);
  });

  await t.test('secondary material begins folded while every example remains available',async()=>{
    await b.call('open',b.url+'#/group/g01');await b.wait('!!document.querySelector(".wcard-word")');
    const initial=await b.evaluate(`(()=>({
      first:Array.from(document.querySelectorAll('.word-body > .example .example-en')).map(node=>node.textContent),
      sections:Array.from(document.querySelectorAll('.word-body > details')).map(node=>({name:node.dataset.section,open:node.open})),
      additional:Array.from(document.querySelectorAll('[data-section=examples] .example-en')).map(node=>node.textContent)
    }))()`);
    assert.deepEqual(initial.first,['We perceived a subtle change in her attitude.']);
    assert.ok(initial.sections.length>0&&initial.sections.every(section=>!section.open),JSON.stringify(initial));
    assert.ok(initial.additional.some(text=>text.includes('The discovery was perceived')),JSON.stringify(initial));
    const opened=await b.evaluate('document.querySelector("[data-section=examples]").open=true;document.querySelector("[data-section=examples] .example-en").getBoundingClientRect().height');
    assert.ok(opened>0,'additional examples can be opened and read');
  });
  await t.test('light-theme secondary text remains legible across the study gradient',async()=>{
    await b.evaluate('if(document.documentElement.dataset.theme!=="light")document.querySelector("#btnTheme").click()');
    const contrast=await b.evaluate(`(()=>{
      const card=document.querySelector('.wcard'),example=card.querySelector('.example-en');
      example.dataset.speechState='playing';
      const nums=value=>(value.match(/[\\d.]+/g)||[]).map(Number);
      const probes=['.setting-note','.example-zh','.word-section > summary','.example-en'];
      const foregrounds=probes.map(selector=>({selector,color:nums(getComputedStyle(card.querySelector(selector)).color).slice(0,3),worst:Infinity}));
      const colors=Array.from(getComputedStyle(card).backgroundImage.matchAll(/rgba?\\(([^)]+)\\)/g),m=>m[1].split(',').map(Number));
      const overlay=colors[0],stops=colors.slice(1).filter(rgb=>rgb.length===3||rgb[3]===1);
      const luminance=rgb=>rgb.map(value=>{const v=value/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
      for(let i=0;i<stops.length-1;i++)for(let step=0;step<=20;step++)for(let a=0;a<=20;a++){
        const position=step/20,alpha=(overlay[3]||0)*a/20;
        const background=stops[i].slice(0,3).map((value,j)=>(value*(1-position)+stops[i+1][j]*position)*(1-alpha)+overlay[j]*alpha);
        const y=luminance(background);foregrounds.forEach(probe=>{const x=luminance(probe.color);probe.worst=Math.min(probe.worst,(Math.max(x,y)+.05)/(Math.min(x,y)+.05));});
      }
      delete example.dataset.speechState;return {foregrounds,stops:stops.length};
    })()`);
    assert.ok(contrast.stops>=3,JSON.stringify(contrast));
    assert.ok(contrast.foregrounds.every(probe=>probe.worst>=4.5),JSON.stringify(contrast));
  });
});
