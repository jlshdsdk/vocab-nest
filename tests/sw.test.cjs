const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function worker(options={}){
  const handlers={},deleted=[],assets=[],requests=[],entries=new Map(),pending=[];
  const cacheKey=request=>new URL(typeof request==='string'?request:request.url,'https://example.test/vocab-nest/sw.js').href;
  const cache={addAll:async urls=>{requests.push(...urls);assets.push(...urls.map(url=>typeof url==='string'?url:url.url));if(options.installFailure)throw Error('offline');},match:async request=>{const response=entries.get(cacheKey(request));return response&&response.clone();},put:async(request,response)=>{entries.set(cacheKey(request),response);}};
  const caches={open:async()=>cache,keys:async()=>['vocab-nest-old','another-project-cache'],delete:async key=>{deleted.push(key);return true;},match:async()=>new Response('<html>old fallback</html>',{headers:{'Content-Type':'text/html'}})};
  const self={location:{origin:'https://example.test',href:'https://example.test/vocab-nest/sw.js'},addEventListener:(name,fn)=>{handlers[name]=fn;},skipWaiting:async()=>{},clients:{claim:async()=>{}}};
  const fetch=async request=>{if(options.offline)throw Error('offline');return new Response(typeof options.networkBody==='function'?options.networkBody(request.url):options.networkBody||'ok');};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),{self,caches,fetch,URL,Request,Response,Promise,console});
  async function fire(name,request){let response;handlers[name]({request,waitUntil:value=>pending.push(value),respondWith:value=>{response=value;}});await Promise.all(pending.splice(0));return response?await response:undefined;}
  return {fire,deleted,assets,requests,entries};
}
test('activation cleans only this application cache namespace',async()=>{const w=worker();await w.fire('activate');assert.ok(w.deleted.includes('vocab-nest-old'));assert.equal(w.deleted.includes('another-project-cache'),false);});
test('initial shell caching does not download the complete dictionary',async()=>{const w=worker();await w.fire('install');assert.equal(w.assets.some(url=>url.includes('js/data.js')),false);assert.ok(w.assets.some(url=>url.includes('js/storage.js')));});
test('cross-origin progress requests are never intercepted',async()=>{const w=worker();assert.equal(await w.fire('fetch',{method:'GET',url:'https://textdb.online/disposable',mode:'cors'}),undefined);});
test('a missing offline JSON chunk never receives an HTML navigation fallback',async()=>{const w=worker({offline:true});const r=await w.fire('fetch',{method:'GET',url:'https://example.test/vocab-nest/data/groups/g01.json?v=new',mode:'cors'});assert.ok(r);assert.equal(r.status,503);assert.notEqual(r.headers.get('content-type'),'text/html');assert.equal((await r.text()).includes('<html>'),false);});
test('failed new precache does not delete the previous app cache',async()=>{const w=worker({installFailure:true});await assert.rejects(w.fire('install'));assert.equal(w.deleted.includes('vocab-nest-old'),false);});
test('new shell installation bypasses a still-fresh old browser HTTP cache',async()=>{const w=worker();await w.fire('install');assert.ok(w.requests.every(request=>request.cache==='reload'));});
test('an active worker keeps its coherent HTML and script when the next deployment is not installed',async()=>{
  const w=worker({networkBody:'future HTML expecting a future script'});
  w.entries.set('https://example.test/vocab-nest/index.html',new Response('current HTML expecting current script'));
  w.entries.set('https://example.test/vocab-nest/js/app.js',new Response('current script'));
  const page=await w.fire('fetch',{method:'GET',url:'https://example.test/vocab-nest/',mode:'navigate'});
  const script=await w.fire('fetch',{method:'GET',url:'https://example.test/vocab-nest/js/app.js',mode:'cors'});
  assert.equal(await page.text(),'current HTML expecting current script');
  assert.equal(await script.text(),'current script');
  assert.equal(await w.entries.get('https://example.test/vocab-nest/index.html').text(),'current HTML expecting current script');
});
test('a missing shell bypasses leftover old script entries instead of pairing them with network HTML',async()=>{
  const w=worker({networkBody:url=>url.endsWith('app.js')?'fresh script':'fresh HTML'});
  w.entries.set('https://example.test/vocab-nest/js/app.js',new Response('leftover old script'));
  const page=await w.fire('fetch',{method:'GET',url:'https://example.test/vocab-nest/',mode:'navigate'});
  const script=await w.fire('fetch',{method:'GET',url:'https://example.test/vocab-nest/js/app.js',mode:'cors'});
  assert.equal(await page.text(),'fresh HTML');
  assert.equal(await script.text(),'fresh script');
});
