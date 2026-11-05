/* Additive persistence: the original progress / preference / sync keys never change. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VocabStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var keys = {progress:'vocab-progress-v1',prefs:'vocab-prefs-v1',sync:'vocab-sync-v1',learning:'vocab-learning-v1',activity:'vocab-activity-v1'};
  var DAY = 86400000;
  function object(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function number(v, fallback) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback; }
  function validKey(k) { return typeof k === 'string' && /^[A-Za-z0-9_-]+:[^\r\n]+$/.test(k); }
  function text(v) { return typeof v === 'string' ? v : ''; }
  function readJSON(storage, key, fallback) {
    try { var v = JSON.parse(storage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function writeJSON(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function normalizeProgress(raw) {
    var clean = {};
    if (!object(raw)) return clean;
    Object.keys(raw).forEach(function (k) {
      var r = raw[k];
      if (validKey(k) && object(r) && (r.s === 'hard' || r.s === 'mastered')) clean[k] = {s:r.s,t:number(r.t,0)};
    });
    return clean;
  }
  function mergeProgress(local, remote) {
    var out = normalizeProgress(local), incoming = normalizeProgress(remote);
    Object.keys(incoming).forEach(function (k) {
      if (!out[k] || incoming[k].t > out[k].t) out[k] = incoming[k];
    });
    return out;
  }
  function defaultReview(record, now) {
    record = object(record) ? record : {};
    return {
      ease:Math.max(1.3,number(record.ease,2.5)), interval:number(record.interval,0),
      due:number(record.due,record.s === 'mastered' ? number(record.t,now) + DAY : now),
      repetitions:Math.floor(number(record.repetitions,0)),lastReviewed:number(record.lastReviewed,0),updatedAt:number(record.updatedAt,0)
    };
  }
  function comparisonKey(item) { return JSON.stringify([item.gid,item.sourceWord,item.kind,item.word]); }
  function normalizeComparisons(raw) {
    var out = {};
    if (!object(raw)) return out;
    Object.keys(raw).forEach(function (key) {
      var r = raw[key];
      if (!object(r) || !/^[A-Za-z0-9_-]+$/.test(text(r.gid)) || !text(r.sourceWord) || !text(r.word) ||
          (r.kind !== 'confusable' && r.kind !== 'synonym')) return;
      var clean = {gid:r.gid,sourceWord:r.sourceWord,kind:r.kind,word:r.word,note:text(r.note),active:r.active !== false,updatedAt:number(r.updatedAt,0)};
      out[comparisonKey(clean)] = clean;
    });
    return out;
  }
  function normalizeLearning(raw) {
    raw = object(raw) ? raw : {};
    var out = {review:{},wrongQueue:{},comparisons:normalizeComparisons(raw.comparisons),clearedProgress:{},resume:null,celebrations:{}};
    Object.keys(object(raw.clearedProgress) ? raw.clearedProgress : {}).forEach(function(k) {
      var stamp=number(raw.clearedProgress[k],-1);
      if(validKey(k)&&stamp>=0)out.clearedProgress[k]=stamp;
    });
    Object.keys(object(raw.review) ? raw.review : {}).forEach(function (k) {
      if (validKey(k) && object(raw.review[k])) out.review[k] = defaultReview(raw.review[k],0);
    });
    Object.keys(object(raw.wrongQueue) ? raw.wrongQueue : {}).forEach(function (k) {
      var r = raw.wrongQueue[k];
      if (validKey(k) && object(r)) out.wrongQueue[k] = {streak:Math.min(2,Math.floor(number(r.streak,0))),active:r.active !== false,updatedAt:number(r.updatedAt,0)};
    });
    var resume = raw.resume;
    if (object(resume) && /^[A-Za-z0-9_-]+$/.test(text(resume.gid))) out.resume = {gid:resume.gid,idx:Math.floor(number(resume.idx,0)),updatedAt:number(resume.updatedAt,0)};
    Object.keys(object(raw.celebrations) ? raw.celebrations : {}).forEach(function (day) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) out.celebrations[day] = number(raw.celebrations[day],0);
    });
    return out;
  }
  function mergeLearning(local, remote) {
    var out = normalizeLearning(local), incoming = normalizeLearning(remote);
    ['review','wrongQueue','comparisons'].forEach(function (field) {
      Object.keys(incoming[field]).forEach(function (k) {
        if (!out[field][k] || incoming[field][k].updatedAt > out[field][k].updatedAt) out[field][k] = incoming[field][k];
      });
    });
    if (incoming.resume && (!out.resume || incoming.resume.updatedAt > out.resume.updatedAt)) out.resume = incoming.resume;
    Object.keys(incoming.celebrations).forEach(function (k) { out.celebrations[k] = Math.max(out.celebrations[k] || 0,incoming.celebrations[k]); });
    Object.keys(incoming.clearedProgress).forEach(function(k) { out.clearedProgress[k]=Math.max(out.clearedProgress[k]||0,incoming.clearedProgress[k]); });
    return out;
  }
  function applyProgressClears(raw,learning) {
    var progress=normalizeProgress(raw),clears=learning&&learning.clearedProgress||{};
    Object.keys(progress).forEach(function(k) {
      if(Object.prototype.hasOwnProperty.call(clears,k)&&progress[k].t<=clears[k])delete progress[k];
    });
    return progress;
  }
  function mergeActivity(local, remote) {
    var seen = new Set(), out = [];
    (Array.isArray(local) ? local : []).concat(Array.isArray(remote) ? remote : []).forEach(function (r) {
      if (!object(r) || !text(r.id) || !validKey(r.key) || number(r.at,-1) < 0 ||
          ['study','review','quiz'].indexOf(r.kind) < 0 || seen.has(r.id)) return;
      seen.add(r.id);
      out.push({id:r.id,key:r.key,at:r.at,kind:r.kind,correct:typeof r.correct === 'boolean' ? r.correct : null});
    });
    return out.sort(function (a,b) { return a.at - b.at || a.id.localeCompare(b.id); });
  }
  function readState(storage) {
    var prefs = readJSON(storage,keys.prefs,{}), sync = readJSON(storage,keys.sync,null);
    var learning=normalizeLearning(readJSON(storage,keys.learning,{}));
    return {
      progress:applyProgressClears(readJSON(storage,keys.progress,{}),learning),prefs:object(prefs) ? prefs : {},
      sync:object(sync) && /^[A-Za-z0-9_-]{6,60}$/.test(text(sync.code)) ? sync : null,
      learning:learning,activity:mergeActivity(readJSON(storage,keys.activity,[]),[])
    };
  }
  function parseBackup(input) {
    var raw;
    try { raw = JSON.parse(input); } catch (e) { throw new Error('JSON 格式不正确，请检查备份内容'); }
    if (!object(raw)) throw new Error('不是可识别的学习备份');
    if ((raw.v === 1 || raw.v === 2) && object(raw.words)) {
      return {progress:normalizeProgress(raw.words),learning:normalizeLearning(raw.learning),activity:mergeActivity(raw.activity,[])};
    }
    var progress = normalizeProgress(raw);
    if (!Object.keys(progress).length) throw new Error('备份中没有有效的学习记录');
    return {progress:progress,learning:normalizeLearning({}),activity:[]};
  }
  async function metadataKey(code) {
    if (!/^[A-Za-z0-9_-]{6,60}$/.test(code)) throw new Error('同步码格式不正确');
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('当前浏览器不支持增强同步，进度同步仍可使用');
    var digest = await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
    return 'vocab-learning-'+Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,'0');}).join('').slice(0,32);
  }
  return {keys:keys,validKey:validKey,readJSON:readJSON,writeJSON:writeJSON,normalizeProgress:normalizeProgress,
    mergeProgress:mergeProgress,defaultReview:defaultReview,comparisonKey:comparisonKey,normalizeComparisons:normalizeComparisons,
    normalizeLearning:normalizeLearning,mergeLearning:mergeLearning,applyProgressClears:applyProgressClears,mergeActivity:mergeActivity,readState:readState,parseBackup:parseBackup,metadataKey:metadataKey};
});
