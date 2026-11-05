/* The homepage loads metadata, not the complete dictionary. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VocabData = api.createLoader({
    fetch:root.fetch.bind(root),
    legacy:function () { return root.GROUPS || (typeof GROUPS !== 'undefined' ? GROUPS : null); },
    loadLegacy:function () {
      return new Promise(function (resolve,reject) {
        var script = document.createElement('script');
        script.src = 'js/data.js';
        script.onload = resolve;
        script.onerror = function () { script.remove(); reject(new Error('词库暂时无法加载，请联网后重试')); };
        document.head.appendChild(script);
      });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function makeManifest(groups,version) {
    return {version:version,totalWords:groups.reduce(function(n,g){return n+g.words.length;},0),groups:groups.map(function(g){
      var first = g.words[0] || {};
      return {id:g.id,name:g.name,note:g.note || '',count:g.words.length,words:g.words.map(function(w){return w.word;}),
        preview:{word:first.word || '',definition:first.definition || ''},file:'data/groups/'+g.id+'.json'};
    })};
  }
  function flatten(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(flatten).join(' ');
    if (value && typeof value === 'object') return Object.keys(value).map(function(k){return flatten(value[k]);}).join(' ');
    return '';
  }
  function makeSearchIndex(groups) {
    var out = [];
    groups.forEach(function(g){g.words.forEach(function(w){out.push({gid:g.id,gname:g.name,word:w.word,definition:w.definition || '',text:flatten(w)});});});
    return out;
  }
  function createLoader(options) {
    var manifestPromise = null, indexPromise = null, legacyGroups = null;
    var groups = new Map(), pending = new Map();
    async function json(url) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeout = controller ? setTimeout(function(){controller.abort();},15000) : null;
      try {
        var response = await options.fetch(url,{signal:controller ? controller.signal : undefined});
        if (!response.ok) throw new Error('加载失败（HTTP '+response.status+'），请重试');
        return await response.json();
      } finally { if (timeout) clearTimeout(timeout); }
    }
    function legacy() {
      var data = options.legacy && options.legacy();
      return Array.isArray(data) ? data : null;
    }
    function loadManifest() {
      if (!manifestPromise) manifestPromise = json('data/manifest.json').then(function(data){
        if (!data || !Array.isArray(data.groups) || !data.version || data.groups.some(function(g){return !/^[A-Za-z0-9_-]+$/.test(g.id) || !Array.isArray(g.words);})) throw new Error('词库目录格式不正确');
        return data;
      }).catch(async function(error){
        legacyGroups = legacy();
        if (!legacyGroups && options.loadLegacy) { await options.loadLegacy(); legacyGroups = legacy(); }
        if (!legacyGroups) throw error;
        legacyGroups.forEach(function(g){groups.set(g.id,g);});
        return makeManifest(legacyGroups,'legacy');
      }).catch(function(error){manifestPromise = null;throw error;});
      return manifestPromise;
    }
    async function loadGroup(gid) {
      var manifest = await loadManifest();
      var meta = manifest.groups.find(function(g){return g.id === gid;});
      if (!meta) throw new Error('这一组不存在，请返回词组页');
      if (groups.has(gid)) return groups.get(gid);
      if (!pending.has(gid)) pending.set(gid,json('data/groups/'+encodeURIComponent(gid)+'.json?v='+encodeURIComponent(manifest.version)).then(function(g){
        if (!g || g.id !== gid || !Array.isArray(g.words)) throw new Error('这一组的词库格式不正确');
        groups.set(gid,g);pending.delete(gid);return g;
      }).catch(function(e){pending.delete(gid);throw e;}));
      return pending.get(gid);
    }
    async function loadSearchIndex() {
      var manifest = await loadManifest();
      if (!indexPromise) indexPromise = (legacyGroups ? Promise.resolve(makeSearchIndex(legacyGroups)) : json('data/search-index.json?v='+encodeURIComponent(manifest.version))).then(function(index){
        if (!Array.isArray(index)) throw new Error('搜索索引格式不正确');
        return index;
      }).catch(function(e){indexPromise=null;throw e;});
      return indexPromise;
    }
    function useLegacy(data) { legacyGroups=data; data.forEach(function(g){groups.set(g.id,g);});manifestPromise=Promise.resolve(makeManifest(data,'legacy'));indexPromise=null; }
    return {loadManifest:loadManifest,loadGroup:loadGroup,loadSearchIndex:loadSearchIndex,useLegacy:useLegacy};
  }
  return {createLoader:createLoader,makeManifest:makeManifest,makeSearchIndex:makeSearchIndex};
});
