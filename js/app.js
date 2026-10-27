/* ============================================================
 * 拾词 · 主逻辑（原生 JS，零依赖）
 * 路由：#/ 首页 | #/group/:id 组学习页 | #/review 生词本 | #/settings 设置
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 基础工具 ---------- */
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var clamp = function (n, min, max) { return Math.max(min, Math.min(max, n)); };

  /* ---------- 持久化 ---------- */
  var PROGRESS_KEY = 'vocab-progress-v1';
  var PREFS_KEY = 'vocab-prefs-v1';
  var SYNC_KEY = 'vocab-sync-v1';    // { code: 同步码, lastSync: 上次成功同步时间 }

  function loadJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      if (!storageWarned) { storageWarned = true; toast('本地存储不可用，学习进度将无法保存'); }
    }
  }
  var storageWarned = false;

  function loadProgress() {
    var raw = loadJSON(PROGRESS_KEY, {});
    var clean = {};
    Object.keys(raw).forEach(function (k) {
      var rec = raw[k];
      if (rec && (rec.s === 'hard' || rec.s === 'mastered')) {
        clean[k] = { s: rec.s, t: typeof rec.t === 'number' ? rec.t : 0 };
      }
    });
    return clean;
  }
  var progress = loadProgress();   // { "gid:word": { s: 'hard'|'mastered', t: 时间戳 } }
  var prefs = loadJSON(PREFS_KEY, { theme: null }); // theme: null=跟随系统 | 'light' | 'dark'

  /* ---------- 数据索引 ---------- */
  var allWords = [];
  GROUPS.forEach(function (g) {
    (g.words || []).forEach(function (w) {
      if (w && w.word) allWords.push({ gid: g.id, gname: g.name, w: w });
    });
  });

  function keyOf(gid, word) { return gid + ':' + word; }
  function statusOf(gid, word) {
    var rec = progress[keyOf(gid, word)];
    return rec ? rec.s : 'new'; // 'new' | 'hard' | 'mastered'
  }
  function toggleMark(gid, word, s) {
    var k = keyOf(gid, word);
    var cur = statusOf(gid, word);
    if (cur === s) { delete progress[k]; }           // 再点一次取消标记
    else { progress[k] = { s: s, t: Date.now() }; }
    saveJSON(PROGRESS_KEY, progress);
    schedulePush(); // 有同步码时防抖 5 秒推送云端（见「跨设备进度同步」节）
  }
  function groupStats(g) {
    var hard = 0, mastered = 0;
    g.words.forEach(function (w) {
      var s = statusOf(g.id, w.word);
      if (s === 'hard') hard++;
      else if (s === 'mastered') mastered++;
    });
    return { hard: hard, mastered: mastered, total: g.words.length };
  }

  /* ---------- 主题 ---------- */
  var mqlDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    var t = prefs.theme || (mqlDark && mqlDark.matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#12141d' : '#4f6ef7'); // 修复：浏览器框架色跟主题
    var btn = $('#btnTheme');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  if (mqlDark && mqlDark.addEventListener) {
    mqlDark.addEventListener('change', function () { if (!prefs.theme) applyTheme(); });
  }

  /* ---------- 发音 ---------- */
  var voicesCache = [];
  function refreshVoices() {
    try { voicesCache = window.speechSynthesis.getVoices() || []; } catch (e) { voicesCache = []; }
  }
  if ('speechSynthesis' in window) {
    refreshVoices();
    speechSynthesis.onvoiceschanged = refreshVoices;
  }
  var currentUtterance = null; // 播放期间保持强引用，防 WebKit 把 utterance 回收导致声音中断
  function speak(text, accent) {
    if (!('speechSynthesis' in window)) { toast('当前浏览器不支持语音朗读'); return; }
    try {
      // iOS Safari 要求 speechSynthesis.speak() 在用户手势的同步调用栈内执行，
      // 塞进 setTimeout 会脱离手势上下文被静默拒播；cancel 也不能无条件先行
      // （会把 iOS 引擎卡进 paused 态吞掉后续发音），只在确有语音在播/排队时才清。
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      if (speechSynthesis.paused) speechSynthesis.resume(); // 解除 iOS cancel 后残留的 paused 态
      var u = new SpeechSynthesisUtterance(text);
      var lang = accent === 'uk' ? 'en-GB' : 'en-US';
      u.lang = lang;
      var pick = voicesCache.filter(function (v) {
        return v.lang && v.lang.replace('_', '-').indexOf(lang) === 0;
      });
      if (!pick.length) {
        pick = voicesCache.filter(function (v) {
          return v.lang && v.lang.replace('_', '-').indexOf(lang.slice(0, 2)) === 0;
        });
      }
      if (pick.length) u.voice = pick[0];
      u.rate = 0.85;
      currentUtterance = u;
      speechSynthesis.speak(u);
    } catch (e) { toast('语音播放失败'); }
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* ---------- 跨设备进度同步（textdb.online，云端只存进度不存词库） ---------- */
  var SYNC_API = 'https://textdb.online';
  var CAN_SYNC = !!(window.fetch && window.AbortController);
  var sync = loadJSON(SYNC_KEY, null); // { code: 'vocab-xxxx…', lastSync: 时间戳 }
  var syncBusy = false;                // 手动/自动同步互斥，防并发写
  var pushTimer = null;                // toggleMark 后 5 秒防抖推送的定时器

  function genSyncCode() {
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789'; // 服务端 key 仅允许字母数字-_，6-60 位
    var out = '';
    try {
      var buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      for (var i = 0; i < buf.length; i++) out += abc[buf[i] % abc.length];
    } catch (e) { // 极老环境兜底
      for (var j = 0; j < 16; j++) out += abc[Math.floor(Math.random() * abc.length)];
    }
    return 'vocab-' + out;
  }

  function fetchTimeout(url, opts) { // 8 秒超时，网络差时不拖住页面
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);
    opts.signal = ctrl.signal;
    return fetch(url, opts)['finally'](function () { clearTimeout(timer); });
  }

  function cloudRead(code) {
    return fetchTimeout(SYNC_API + '/' + encodeURIComponent(code), { cache: 'no-store' })
      .then(function (r) { return r.text(); });
  }

  function cloudWrite(code, data) {
    // 注意必须用无尾斜杠的 /update：带斜杠会 301，浏览器把 POST 降级为 GET 导致写入丢失
    return fetchTimeout(SYNC_API + '/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'key=' + encodeURIComponent(code) + '&value=' + encodeURIComponent(JSON.stringify(data))
    }).then(function (r) { return r.text(); }).then(function (txt) {
      var j = null;
      try { j = JSON.parse(txt); } catch (e) {}
      if (!j || j.status !== 1) throw new Error('textdb 写入未确认');
    });
  }

  /* 词粒度 last-write-wins 合并：逐词条比 t 取较新；hard/mastered 是状态值，词条永不删除 */
  function mergeWords(remote) {
    var changed = 0;
    Object.keys(remote || {}).forEach(function (k) {
      var r = remote[k];
      if (!r || (r.s !== 'hard' && r.s !== 'mastered')) return;
      var t = typeof r.t === 'number' ? r.t : 0;
      var local = progress[k];
      if (!local || t > local.t) { progress[k] = { s: r.s, t: t }; changed++; }
    });
    if (changed) saveJSON(PROGRESS_KEY, progress);
    return changed;
  }

  /* 合并生效后刷新当前视图（正在输入时不打扰；组页保留列表/自测模式与位置） */
  function rerenderAfterMerge() {
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
    var mode = groupState.mode;
    render();
    if (mode !== 'cards' && groupState.gid != null) switchMode(mode);
  }

  function pushProgress(silent) {
    if (!CAN_SYNC || !sync || !sync.code) return Promise.resolve(false);
    if (syncBusy) return Promise.resolve(false);
    syncBusy = true;
    return cloudWrite(sync.code, { v: 1, words: progress, updatedAt: Date.now() })
      .then(function () {
        sync.lastSync = Date.now();
        saveJSON(SYNC_KEY, sync);
        return true;
      })
      .catch(function (e) {
        console.warn('进度推送失败：', e && e.message);
        if (!silent) toast('同步失败，请稍后再试');
        return false;
      })
      .then(function (ok) { syncBusy = false; return ok; });
  }

  /* 拉取 → 合并 → 回推；任何网络失败静默降级，本地进度永远是源、绝不丢失 */
  function doSync(silent) {
    if (!CAN_SYNC || !sync || !sync.code) return Promise.resolve({ ok: false, changed: 0 });
    if (syncBusy) return Promise.resolve({ ok: false, changed: 0, busy: true });
    syncBusy = true;
    return cloudRead(sync.code).then(function (txt) {
      var remote = {};
      try {
        var data = JSON.parse(txt);
        if (data && data.v === 1 && data.words && typeof data.words === 'object') remote = data.words;
      } catch (e) { /* 云端为空/损坏按空处理，稍后用本地覆盖 */ }
      var changed = mergeWords(remote);
      if (changed) { toast('已同步 ' + changed + ' 处更新'); rerenderAfterMerge(); }
      return cloudWrite(sync.code, { v: 1, words: progress, updatedAt: Date.now() }).then(function () {
        sync.lastSync = Date.now();
        saveJSON(SYNC_KEY, sync);
        return { ok: true, changed: changed };
      });
    }).catch(function (e) {
      console.warn('进度同步失败：', e && e.message);
      if (!silent) toast('同步失败，请稍后再试');
      return { ok: false, changed: 0 };
    }).then(function (r) { syncBusy = false; return r; });
  }

  function schedulePush() { // toggleMark 保存后防抖 5 秒自动推送
    if (!CAN_SYNC || !sync || !sync.code) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushProgress(true); }, 5000);
  }

  /* ---------- 组页内部状态 ---------- */
  var groupState = { gid: null, idx: 0, mode: 'cards', quizRevealed: false };
  var pendingWord = null; // 从搜索结果跳转时定位到具体词

  /* ---------- 片段渲染 ---------- */
  function block(title, inner) {
    return inner ? '<section class="block"><h3 class="block-title">' + title + '</h3>' + inner + '</section>' : '';
  }

  function wordCardHTML(gid, w, opts) {
    opts = opts || {};
    var st = statusOf(gid, w.word);
    var quiz = opts.quiz && !groupState.quizRevealed;

    var head =
      '<div class="wcard-head">' +
        '<div class="wcard-word-row">' +
          '<h2 class="wcard-word">' + esc(w.word) + '</h2>' +
          '<span class="wcard-status s-' + st + '" data-status-badge>' +
            (st === 'hard' ? '生词' : st === 'mastered' ? '已掌握' : '') +
          '</span>' +
        '</div>' +
        '<div class="wcard-phonetics">' +
          '<button type="button" class="phonetic-btn" data-action="speak" data-accent="us" data-text="' + esc(w.word) + '" aria-label="朗读美音">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>' +
            'US&nbsp;[' + esc(w.phoneticUs) + ']' +
          '</button>' +
          '<button type="button" class="phonetic-btn" data-action="speak" data-accent="uk" data-text="' + esc(w.word) + '" aria-label="朗读英音">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>' +
            'UK&nbsp;[' + esc(w.phoneticUk) + ']' +
          '</button>' +
        '</div>' +
      '</div>';

    if (quiz) {
      return '<article class="wcard quiz" data-gid="' + esc(gid) + '" data-word="' + esc(w.word) + '">' +
        head +
        '<div class="quiz-cover">' +
          '<p class="quiz-tip">先在心里回忆释义，再点开答案对照</p>' +
          '<button type="button" class="btn btn-primary" data-action="reveal">显示答案</button>' +
        '</div>' +
      '</article>';
    }

    var definition = w.definition ? block('释义', '<p class="definition">' + esc(w.definition) + '</p>') : '';

    var exList = (w.examples || []).filter(Boolean).map(function (ex) {
      return '<div class="example">' +
        '<p class="example-en" data-action="speak" data-accent="us" data-text="' + esc(ex.en) + '" role="button" tabindex="0" title="点击朗读例句">' + esc(ex.en) + '</p>' +
        '<p class="example-zh">' + esc(ex.zh) + '</p>' +
      '</div>';
    }).join('');
    var examples = exList ? block('例句', '<div class="examples">' + exList + '</div>') : '';

    var usage = w.usage ? block('用法', '<p class="usage">' + esc(w.usage) + '</p>') : '';

    var confList = (w.confusables || []).filter(Boolean).map(function (c) {
      return '<li><b>' + esc(c.word) + '</b><span>' + esc(c.note) + '</span></li>';
    }).join('');
    var confusables = confList ? block('近形词辨析', '<ul class="pair-list">' + confList + '</ul>') : '';

    var synList = (w.synonyms || []).filter(Boolean).map(function (s) {
      return '<li><b>' + esc(s.word) + '</b><span>' + esc(s.note) + '</span></li>';
    }).join('');
    var synonyms = synList ? block('近义词辨析', '<ul class="pair-list">' + synList + '</ul>') : '';

    var collList = (w.collocations || []).filter(Boolean).map(function (c) {
      return '<li>' + esc(c) + '</li>';
    }).join('');
    var collocations = collList ? block('词组搭配', '<ul class="colloc-list">' + collList + '</ul>') : '';

    var mnemonic = w.mnemonic ? block('记忆口诀', '<p class="mnemonic">' + esc(w.mnemonic) + '</p>') : '';

    var actions =
      '<div class="wcard-actions">' +
        '<button type="button" class="btn btn-hard' + (st === 'hard' ? ' active' : '') + '" data-action="mark" data-status="hard">' +
          (st === 'hard' ? '★ 已加入生词本' : '☆ 标记生词') +
        '</button>' +
        '<button type="button" class="btn btn-mastered' + (st === 'mastered' ? ' active' : '') + '" data-action="mark" data-status="mastered">' +
          (st === 'mastered' ? '✓ 已掌握' : '✓ 标记掌握') +
        '</button>' +
      '</div>';

    return '<article class="wcard" data-gid="' + esc(gid) + '" data-word="' + esc(w.word) + '">' +
      head + definition + examples + usage + confusables + synonyms + collocations + mnemonic + actions +
    '</article>';
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    groupState.gid = null;
    var total = 0, hard = 0, mastered = 0;
    GROUPS.forEach(function (g) {
      var s = groupStats(g);
      total += s.total; hard += s.hard; mastered += s.mastered;
    });

    var groupCards = GROUPS.map(function (g) {
      var st = groupStats(g);
      var pct = st.total ? Math.round(st.mastered / st.total * 100) : 0;
      return '<a class="group-card" href="#/group/' + esc(g.id) + '">' +
        '<div class="group-card-top">' +
          '<span class="group-name">' + esc(g.name) + '</span>' +
          '<span class="group-count">' + st.total + ' 词</span>' +
        '</div>' +
        (g.note ? '<p class="group-note">' + esc(g.note) + '</p>' : '') +
        '<div class="group-progress">' +
          '<div class="progress-bar"><i style="width:' + pct + '%"></i></div>' +
          '<span class="progress-text">掌握 <b>' + st.mastered + '</b> · 生词 <b>' + st.hard + '</b></span>' +
        '</div>' +
      '</a>';
    }).join('');

    view.innerHTML =
      '<section class="stats">' +
        '<div class="stat"><b>' + total + '</b><span>总词数</span></div>' +
        '<div class="stat stat-mastered"><b>' + mastered + '</b><span>已掌握</span></div>' +
        '<div class="stat stat-hard"><b>' + hard + '</b><span>生词</span></div>' +
      '</section>' +
      '<a class="review-entry" href="#/review">' +
        '<span class="re-label">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-9.7-9A5.6 5.6 0 0 1 12 5.7 5.6 5.6 0 0 1 21.7 12c-2.2 4.4-9.7 9-9.7 9z"/></svg>' +
          '生词本' +
        '</span>' +
        '<span class="re-count"><b>' + hard + '</b> 个待复习 · 进入 ›</span>' +
      '</a>' +
      '<section class="search-box">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<input id="searchInput" type="search" placeholder="搜索单词 / 释义…" autocomplete="off">' +
      '</section>' +
      '<div id="searchResults" class="search-results"></div>' +
      '<section class="groups"><h2 class="section-title">记忆单元 · 每组一个学习闭环</h2>' + groupCards + '</section>';
  }

  function runSearch(q) {
    var box = $('#searchResults');
    if (!box) return;
    q = q.trim().toLowerCase();
    if (!q) { box.innerHTML = ''; return; }
    var hits = allWords.filter(function (it) {
      return it.w.word.toLowerCase().indexOf(q) !== -1 ||
        String(it.w.definition || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 30);
    box.innerHTML = hits.length ? hits.map(function (it, i) {
      return '<button type="button" class="search-hit" data-action="jump" data-gid="' + esc(it.gid) + '" data-word="' + esc(it.w.word) + '">' +
        '<b>' + esc(it.w.word) + '</b>' +
        '<span class="search-hit-def">' + esc(it.w.definition) + '</span>' +
        '<span class="search-hit-group">' + esc(it.gname) + '</span>' +
      '</button>';
    }).join('') : '<p class="search-empty">没有找到匹配的单词</p>';
  }

  /* ---------- 组页 ---------- */
  function renderGroup(g) {
    if (groupState.gid !== g.id) groupState.idx = 0; // 修复：换组从第一个词开始；同组重渲染保留位置
    groupState.gid = g.id;
    groupState.mode = 'cards';
    groupState.quizRevealed = false;

    if (pendingWord) {
      var pi = g.words.findIndex(function (w) { return w.word === pendingWord; });
      if (pi !== -1) groupState.idx = pi;
      pendingWord = null;
    }
    groupState.idx = clamp(groupState.idx, 0, Math.max(0, g.words.length - 1));

    view.innerHTML =
      '<div class="group-header">' +
        '<a class="back-link" href="#/" aria-label="返回首页">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>词组' +
        '</a>' +
        '<h1 class="group-title">' + esc(g.name) + '</h1>' +
        '<div class="mode-pills" role="tablist">' +
          '<button type="button" class="pill active" data-action="mode" data-mode="cards" role="tab" aria-selected="true">卡片</button>' +
          '<button type="button" class="pill" data-action="mode" data-mode="quiz" role="tab" aria-selected="false">自测</button>' +
          '<button type="button" class="pill" data-action="mode" data-mode="list" role="tab" aria-selected="false">列表</button>' +
        '</div>' +
      '</div>' +
      '<div id="cardArea"></div>';

    if (!g.words.length) {
      $('#cardArea').innerHTML = '<div class="empty-state empty-group">这一组还没有单词，等主人把生词发来就会填进来啦</div>';
      return;
    }
    showCard(groupState.idx);
  }

  function showCard(idx, dir) {
    var g = GROUPS.find(function (x) { return x.id === groupState.gid; });
    if (!g || !g.words.length) return;
    groupState.idx = clamp(idx, 0, g.words.length - 1);
    groupState.quizRevealed = false;

    var w = g.words[groupState.idx];
    var st = statusOf(g.id, w.word);
    var area = $('#cardArea');
    if (!area) return;

    area.innerHTML =
      '<div class="card-meta"><span>第 ' + (groupState.idx + 1) + ' / ' + g.words.length + ' 词</span>' +
      '<span class="dot-strip">' + g.words.map(function (x, i) {
        var s = statusOf(g.id, x.word);
        return '<span class="dot d-' + s + (i === groupState.idx ? ' current' : '') + '"></span>';
      }).join('') + '</span></div>' +
      '<div id="cardWrap">' + wordCardHTML(g.id, w, { quiz: groupState.mode === 'quiz' }) + '</div>' +
      '<div class="nav-row">' +
        '<button type="button" class="btn nav-btn" data-action="prev"' + (groupState.idx === 0 ? ' disabled' : '') + '>‹ 上一个</button>' +
        '<button type="button" class="btn nav-btn" data-action="next"' + (groupState.idx === g.words.length - 1 ? ' disabled' : '') + '>下一个 ›</button>' +
      '</div>';

    var wrap = $('#cardWrap');
    if (wrap && dir && !REDUCED_MOTION) {
      wrap.classList.remove('anim-left', 'anim-right');
      void wrap.offsetWidth; // 强制 reflow 以重触发动画
      wrap.classList.add(dir > 0 ? 'anim-right' : 'anim-left');
    }
  }

  function renderListMode() {
    var g = GROUPS.find(function (x) { return x.id === groupState.gid; });
    if (!g) return;
    var rows = g.words.map(function (w, i) {
      var st = statusOf(g.id, w.word);
      return '<li><button type="button" class="list-row" data-action="goto" data-idx="' + i + '">' +
        '<span class="dot d-' + st + '"></span>' +
        '<span class="list-word">' + esc(w.word) + '</span>' +
        '<span class="list-def">' + esc(w.definition) + '</span>' +
        '<span class="list-phon">[' + esc(w.phoneticUs) + ']</span>' +
      '</button></li>';
    }).join('');
    $('#cardArea').innerHTML = '<ul class="word-list">' + rows + '</ul>';
  }

  function switchMode(mode) {
    groupState.mode = mode;
    groupState.quizRevealed = false;
    var pills = document.querySelectorAll('.mode-pills .pill');
    pills.forEach(function (p) {
      p.classList.toggle('active', p.dataset.mode === mode);
      p.setAttribute('aria-selected', p.dataset.mode === mode ? 'true' : 'false'); // 展示属性，随激活态同步
    });
    if (mode === 'list') renderListMode();
    else showCard(groupState.idx, 0);
  }

  /* ---------- 生词本 ---------- */
  function renderReview() {
    groupState.gid = null;
    var items = [];
    Object.keys(progress).forEach(function (k) {
      if (progress[k].s !== 'hard') return;
      var idx = k.indexOf(':');
      var gid = k.slice(0, idx), word = k.slice(idx + 1);
      var found = allWords.find(function (it) { return it.gid === gid && it.w.word === word; });
      if (found) items.push(found);
    });
    items.sort(function (a, b) { return progress[keyOf(b.gid, b.w.word)].t - progress[keyOf(a.gid, a.w.word)].t; });

    view.innerHTML =
      '<div class="group-header">' +
        '<a class="back-link" href="#/" aria-label="返回首页">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>词组' +
        '</a>' +
        '<h1 class="group-title">生词本 · ' + items.length + ' 个</h1>' +
      '</div>' +
      '<div id="cardArea" class="review-stack">' +
      (items.length
        ? items.map(function (it) { return wordCardHTML(it.gid, it.w); }).join('')
        : '<div class="empty-state empty-review">生词本空空的～学习时点「标记生词」，难记的词就会收进来</div>') +
      '</div>';
  }

  /* ---------- 设置页 ---------- */
  var importCandidate = null; // 导入预览暂存的待合并词条

  function fmtTime(ts) {
    if (!ts) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var d = new Date(ts);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function legacyCopy(text, done) { // 剪贴板 API 不可用/失败时兜底
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (ok) done(); else toast('复制失败，请手动长按复制');
  }
  function copyText(text, tip) {
    var done = function () { toast(tip || '已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done); });
    } else legacyCopy(text, done);
  }

  function downloadJSON(name, obj) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600);
  }

  /* 兼容两种备份：同步格式 {v:1,words:{…}} 与裸进度 {"gid:word":{s,t}} */
  function parseBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, msg: 'JSON 解析失败，请检查内容' }; }
    var words = null;
    if (data && data.v === 1 && data.words && typeof data.words === 'object') words = data.words;
    else if (data && !Array.isArray(data) && typeof data === 'object') {
      var ks = Object.keys(data);
      if (ks.length && ks.some(function (k) { var v = data[k]; return v && typeof v === 'object' && (v.s === 'hard' || v.s === 'mastered'); })) words = data;
    }
    if (!words) return { ok: false, msg: '不是可识别的进度备份格式' };
    var clean = {};
    Object.keys(words).forEach(function (k) {
      var r = words[k];
      if (r && (r.s === 'hard' || r.s === 'mastered')) clean[k] = { s: r.s, t: typeof r.t === 'number' ? r.t : 0 };
    });
    if (!Object.keys(clean).length) return { ok: false, msg: '备份里没有有效的学习记录' };
    return { ok: true, words: clean };
  }

  function renderSettings() {
    groupState.gid = null;
    var has = !!(sync && sync.code);
    view.innerHTML =
      '<div class="group-header">' +
        '<a class="back-link" href="#/" aria-label="返回首页">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>词组' +
        '</a>' +
        '<h1 class="group-title">设置</h1>' +
      '</div>' +
      '<div class="settings">' +
        '<section class="panel panel-sync">' +
          '<h2 class="panel-title">跨设备同步</h2>' +
          '<p class="panel-desc">用同一个同步码，在电脑和手机之间自动合并学习进度。云端只存进度不存词库；按词条时间取较新一侧，不会丢记录。</p>' +
          (has
            ? '<div class="code-box">' +
                '<span class="code-text">' + esc(sync.code) + '</span>' +
                '<button type="button" class="btn" data-action="copy-code">复制同步码</button>' +
              '</div>' +
              '<div class="panel-row">' +
                '<button type="button" class="btn btn-primary" data-action="sync-now">立即同步</button>' +
                '<button type="button" class="btn" data-action="show-bind">更换同步码</button>' +
                '<button type="button" class="btn" data-action="unbind-code">解绑</button>' +
              '</div>' +
              '<div class="panel-row" id="bindRow" style="display:none">' +
                '<input id="bindInput" class="text-input" placeholder="vocab-xxxxxxxxxxxxxxxx" autocomplete="off" autocapitalize="off" spellcheck="false">' +
                '<button type="button" class="btn" data-action="bind-code">绑定</button>' +
              '</div>' +
              '<p class="sync-status" id="syncStatus">上次同步：' + (sync.lastSync ? esc(fmtTime(sync.lastSync)) : '从未') + '</p>'
            : '<div class="panel-row">' +
                '<button type="button" class="btn btn-primary" data-action="gen-code">生成同步码</button>' +
              '</div>' +
              '<p class="panel-desc">在另一台设备（手机/电脑）的设置页输入同一同步码，即可配对同步。</p>' +
              '<div class="panel-row">' +
                '<input id="bindInput" class="text-input" placeholder="输入已有同步码，如 vocab-xxxxxxxxxxxxxxxx" autocomplete="off" autocapitalize="off" spellcheck="false">' +
                '<button type="button" class="btn" data-action="bind-code">配对</button>' +
              '</div>'
          ) +
        '</section>' +
        '<section class="panel panel-backup">' +
          '<h2 class="panel-title">数据备份</h2>' +
          '<p class="panel-desc">当前共 ' + Object.keys(progress).length + ' 条学习记录。可导出 JSON 留存，或粘贴/选择备份与现有进度合并。</p>' +
          '<div class="panel-row">' +
            '<button type="button" class="btn" data-action="export-copy">复制进度 JSON</button>' +
            '<button type="button" class="btn" data-action="export-download">下载 vocab-progress.json</button>' +
          '</div>' +
          '<textarea id="importText" class="import-area" placeholder="粘贴进度备份 JSON…"></textarea>' +
          '<div class="panel-row">' +
            '<button type="button" class="btn" data-action="import-preview">预览合并</button>' +
            '<label class="btn file-btn">选择 .json 文件<input id="importFile" type="file" accept=".json,application/json" hidden></label>' +
            '<button type="button" class="btn btn-primary" id="importApply" data-action="import-apply" disabled>确认导入</button>' +
          '</div>' +
          '<p class="sync-status" id="importStatus">导入前先「预览合并」：只保留每条更新的一侧，不会覆盖丢失。</p>' +
        '</section>' +
        '<section class="panel panel-about">' +
          '<h2 class="panel-title">关于</h2>' +
          '<ul class="about-list">' +
            '<li>拾词 · Vocab Nest —— 我的专属生词记忆馆</li>' +
            '<li>本地词库 <b>' + GROUPS.length + '</b> 组 · <b>' + allWords.length + '</b> 词，纯静态零依赖</li>' +
            '<li>支持添加到主屏离线使用（PWA），进度保存在本机浏览器</li>' +
          '</ul>' +
        '</section>' +
      '</div>';
  }

  /* ---------- 局部刷新（不整页重渲染） ---------- */
  function refreshCardUI(gid, word) {
    var sel = '.wcard[data-gid="' + CSS.escape(gid) + '"][data-word="' + CSS.escape(word) + '"]';
    var cards = document.querySelectorAll(sel);
    cards.forEach(function (card) {
    var st = statusOf(gid, word);
    var badge = card.querySelector('[data-status-badge]');
    if (badge) {
      badge.className = 'wcard-status s-' + st;
      badge.textContent = st === 'hard' ? '生词' : st === 'mastered' ? '已掌握' : '';
    }
    var hardBtn = card.querySelector('.btn-hard');
    if (hardBtn) {
      hardBtn.classList.toggle('active', st === 'hard');
      hardBtn.textContent = st === 'hard' ? '★ 已加入生词本' : '☆ 标记生词';
    }
    var mBtn = card.querySelector('.btn-mastered');
    if (mBtn) {
      mBtn.classList.toggle('active', st === 'mastered');
      mBtn.textContent = st === 'mastered' ? '✓ 已掌握' : '✓ 标记掌握';
    }
    });
    var g = GROUPS.find(function (x) { return x.id === gid; });
    if (g) {
      var i = g.words.findIndex(function (w) { return w.word === word; });
      if (i !== -1) {
        var dots = document.querySelectorAll('.dot-strip .dot');
        var st = statusOf(gid, word);
        if (dots[i]) dots[i].className = 'dot d-' + st + (i === groupState.idx ? ' current' : '');
      }
    }
  }

  /* ---------- 事件处理 ---------- */
  var view = $('#view');
  var REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var searchTimer = null;
  view.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'searchInput') {
      if (e.isComposing) return; // 中文输入法组词过程不触发搜索
      clearTimeout(searchTimer);
      var q = e.target.value;
      searchTimer = setTimeout(function () { runSearch(q); }, 160);
    }
  });

  /* 设置页：选择 .json 备份文件读入文本框 */
  view.addEventListener('change', function (e) {
    if (!e.target || e.target.id !== 'importFile') return;
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var ta = $('#importText');
      if (ta) ta.value = String(reader.result || '');
      toast('文件已载入，点「预览合并」查看');
    };
    reader.onerror = function () { toast('文件读取失败'); };
    reader.readAsText(f, 'utf-8');
  });

  view.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var act = el.dataset.action;

    if (act === 'speak') {
      speak(el.dataset.text, el.dataset.accent);
      return;
    }

    if (act === 'mark') {
      var card = el.closest('.wcard');
      if (!card) return;
      toggleMark(card.dataset.gid, card.dataset.word, el.dataset.status);
      if ((location.hash || '#/') === '#/review') {
        renderReview(); // 生词本里增删后立即重排列表
      } else {
        refreshCardUI(card.dataset.gid, card.dataset.word);
      }
      toast(el.dataset.status === 'hard' ? '已标记为生词' : '已标记为掌握');
      return;
    }

    if (act === 'prev') { showCard(groupState.idx - 1, -1); return; }
    if (act === 'next') { showCard(groupState.idx + 1, 1); return; }
    if (act === 'goto') {
      if (groupState.mode !== 'cards') switchMode('cards');
      showCard(parseInt(el.dataset.idx, 10) || 0, 0);
      return;
    }
    if (act === 'mode') { switchMode(el.dataset.mode); return; }
    if (act === 'reveal') {
      groupState.quizRevealed = true;
      var g = GROUPS.find(function (x) { return x.id === groupState.gid; });
      if (g) {
        var wrapEl = $('#cardWrap');
        if (wrapEl) wrapEl.innerHTML = wordCardHTML(g.id, g.words[groupState.idx], { quiz: false });
      }
      return;
    }
    if (act === 'jump') {
      pendingWord = el.dataset.word;
      location.hash = '#/group/' + el.dataset.gid;
      return;
    }

    /* --- 设置页动作 --- */
    if (act === 'gen-code') {
      sync = { code: genSyncCode(), lastSync: 0 };
      saveJSON(SYNC_KEY, sync);
      renderSettings();
      toast('已生成同步码，去另一台设备输入即可同步');
      pushProgress(true); // 立即把本机进度初始化到云端
      return;
    }
    if (act === 'copy-code') {
      if (sync && sync.code) copyText(sync.code, '同步码已复制');
      return;
    }
    if (act === 'show-bind') {
      var bindRow = $('#bindRow');
      if (bindRow) bindRow.style.display = bindRow.style.display === 'none' ? 'flex' : 'none';
      return;
    }
    if (act === 'bind-code') {
      var iv = $('#bindInput');
      var code = ((iv && iv.value) || '').trim();
      if (!/^[0-9A-Za-z_-]{6,60}$/.test(code)) { toast('同步码格式不对（6-60 位字母数字）'); return; }
      sync = { code: code, lastSync: 0 };
      saveJSON(SYNC_KEY, sync);
      renderSettings();
      toast('已配对，正在拉取云端进度');
      doSync(true);
      return;
    }
    if (act === 'unbind-code') {
      if (!window.confirm('确定解绑同步码吗？\n本机学习进度保留，仅停止与云端同步。')) return;
      sync = null;
      try { localStorage.removeItem(SYNC_KEY); } catch (e) {}
      clearTimeout(pushTimer);
      renderSettings();
      toast('已解绑，本机进度保留');
      return;
    }
    if (act === 'sync-now') {
      if (!sync || !sync.code) return;
      var stEl = $('#syncStatus');
      var oldTxt = el.textContent;
      el.disabled = true;
      el.textContent = '同步中…';
      if (stEl) { stEl.className = 'sync-status'; stEl.textContent = '正在同步…'; }
      doSync(false).then(function (r) {
        el.disabled = false;
        el.textContent = oldTxt;
        if (!stEl) return;
        if (r.ok) {
          stEl.className = 'sync-status ok';
          stEl.textContent = (r.changed ? '已同步 ' + r.changed + ' 处更新 · ' : '云端与本机一致，无变化 · ') +
            '上次同步：' + (sync && sync.lastSync ? fmtTime(sync.lastSync) : '从未');
        } else if (r.busy) {
          stEl.className = 'sync-status';
          stEl.textContent = '正在同步，请稍候…';
        } else {
          stEl.className = 'sync-status err';
          stEl.textContent = '同步失败（网络或服务暂不可用）';
        }
      });
      return;
    }
    if (act === 'export-copy') { copyText(JSON.stringify(progress), '进度 JSON 已复制'); return; }
    if (act === 'export-download') { downloadJSON('vocab-progress.json', progress); toast('开始下载 vocab-progress.json'); return; }
    if (act === 'import-preview') {
      var stImp = $('#importStatus'), applyBtn = $('#importApply'), taImp = $('#importText');
      importCandidate = null;
      if (applyBtn) applyBtn.disabled = true;
      var parsed = parseBackup((taImp && taImp.value) || '');
      if (!parsed.ok) { if (stImp) { stImp.className = 'sync-status err'; stImp.textContent = parsed.msg; } return; }
      var nImp = 0;
      Object.keys(parsed.words).forEach(function (k) {
        var r = parsed.words[k], loc = progress[k];
        if (!loc || r.t > loc.t) nImp++;
      });
      if (nImp) {
        importCandidate = parsed.words;
        if (stImp) { stImp.className = 'sync-status ok'; stImp.textContent = '预览：将合并 ' + nImp + ' 条（其余不比本机新，跳过）。点「确认导入」生效。'; }
        if (applyBtn) applyBtn.disabled = false;
      } else if (stImp) {
        stImp.className = 'sync-status';
        stImp.textContent = '备份里没有比本机更新的词条，无需导入。';
      }
      return;
    }
    if (act === 'import-apply') {
      if (!importCandidate) return;
      var merged = mergeWords(importCandidate);
      importCandidate = null;
      toast(merged ? '已合并 ' + merged + ' 条学习记录' : '没有需要合并的记录');
      renderSettings(); // 刷新设置页上的记录条数
      return;
    }
  });

  /* 键盘：← → 切词，空格朗读，例句行 Enter 朗读 */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target && e.target.classList && e.target.classList.contains('example-en')) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        speak(e.target.dataset.text, e.target.dataset.accent || 'us');
      }
      return;
    }
    /* 修复：空格/Enter 焦点在按钮/链接上时交给元素自身，避免全局快捷键劫持 */
    if ((e.key === ' ' || e.key === 'Enter') &&
        (tag === 'BUTTON' || tag === 'A' || (e.target && e.target.isContentEditable))) return;
    if (groupState.gid == null || groupState.mode === 'list') return;
    var g = GROUPS.find(function (x) { return x.id === groupState.gid; });
    if (!g || !g.words.length) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); showCard(groupState.idx + 1, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); showCard(groupState.idx - 1, -1); }
    else if (e.key === ' ') {
      e.preventDefault();
      speak(g.words[groupState.idx].word, 'us');
    }
  });

  /* 触摸滑动切词（在可横向滚动的点条上滑动时不翻卡） */
  var touchStartX = null, touchStartY = null, touchTarget = null;
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchTarget = e.target;
    }
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (touchStartX == null) return;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    var inScrollStrip = touchTarget && touchTarget.closest && touchTarget.closest('.dot-strip, .search-results');
    touchStartX = null; touchStartY = null; touchTarget = null;
    if (inScrollStrip) return;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // 横向位移明显大于纵向才算翻卡
    if (!document.querySelector('#cardWrap') || groupState.mode === 'list') return;
    if (groupState.gid == null) return;
    showCard(groupState.idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }, { passive: true });

  /* 顶栏按钮 */
  $('#btnTheme').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    prefs.theme = cur === 'dark' ? 'light' : 'dark';
    saveJSON(PREFS_KEY, prefs);
    applyTheme();
  });

  /* ---------- 路由 ---------- */
  function updateTabbar(hash) {
    var nav = hash === '#/review' ? 'review' : hash === '#/settings' ? 'settings' : 'home';
    document.querySelectorAll('.tabbar-item').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === nav);
    });
  }

  function render() {
    var hash = location.hash || '#/';
    var m = hash.match(/^#\/group\/([\w-]+)\/?$/);
    if (m) {
      var g = GROUPS.find(function (x) { return x.id === m[1]; });
      if (g) renderGroup(g); else { location.hash = '#/'; return; }
    } else if (hash === '#/review') {
      renderReview();
    } else if (hash === '#/settings') {
      renderSettings();
    } else {
      renderHome();
    }
    updateTabbar(m ? 'home' : hash);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  applyTheme();
  render();

  /* 同步时机：载入 2 秒后静默拉取合并；切到后台时立即推送（见「跨设备进度同步」节） */
  if (CAN_SYNC) {
    setTimeout(function () { if (sync && sync.code) doSync(true); }, 2000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && sync && sync.code) {
        clearTimeout(pushTimer);
        pushProgress(true);
      }
    });
  }
})();
