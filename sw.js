/* Versioned app shell. Other GitHub Pages projects and cloud APIs are outside this cache. */
var CACHE='vocab-nest-selene-20261105-4';
var PREFIX='vocab-nest-';
var ASSETS=['./','./index.html','./css/style.css','./css/fonts.css','./js/storage.js','./js/data-loader.js','./js/learning.js','./js/stats.js','./js/sync.js','./js/app.js','./data/manifest.json','./manifest.webmanifest','./icons/moon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',function(event){
  event.waitUntil(caches.open(CACHE).then(function(cache){return cache.addAll(ASSETS.map(function(path){return new Request(new URL(path,self.location.href),{cache:'reload'});}));}).then(function(){return self.skipWaiting();}).catch(function(error){return caches.delete(CACHE).then(function(){throw error;});}));
});
self.addEventListener('activate',function(event){
  event.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.indexOf(PREFIX)===0&&key!==CACHE;}).map(function(key){return caches.delete(key);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(event){
  var request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||/\/sw\.js$/.test(url.pathname))return;
  event.respondWith((async function(){
    var cache=await caches.open(CACHE),navigation=request.mode==='navigate';
    var shell=await cache.match('./index.html');
    if(!shell)shell=await cache.match('./');
    if(navigation&&shell)return shell;
    if(!navigation&&shell){var cached=await cache.match(request);if(cached)return cached;}
    try{
      var response=await fetch(request,shell?undefined:{cache:'reload'});
      if(shell&&!navigation&&response&&response.ok){try{await cache.put(request,response.clone());}catch(e){}}
      return response;
    }catch(error){
      return new Response('当前内容尚未离线保存，请联网后重试。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
