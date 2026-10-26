/* ============================================================
 * 拾词 · 主逻辑（原生 JS，零依赖）
 * 路由：#/ 首页 | #/group/:id 组学习页 | #/review 生词本
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
  function speak(text, accent) {
    if (!('speechSynthesis' in window)) { toast('当前浏览器不支持语音朗读'); return; }
    try {
      speechSynthesis.cancel();
      setTimeout(function () { // iOS 上 cancel 后立即 speak 会吞音，错开 50ms
        try {
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
          speechSynthesis.speak(u);
        } catch (e) { /* 队列异常时静默 */ }
      }, 50);
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
          '<span class="progress-text">掌握 ' + st.mastered + ' · 生词 ' + st.hard + '</span>' +
        '</div>' +
      '</a>';
    }).join('');

    view.innerHTML =
      '<section class="stats">' +
        '<div class="stat"><b>' + total + '</b><span>总词数</span></div>' +
        '<div class="stat"><b>' + mastered + '</b><span>已掌握</span></div>' +
        '<div class="stat stat-hard"><b>' + hard + '</b><span>生词</span></div>' +
      '</section>' +
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
    groupState.gid = g.id;
    groupState.mode = 'cards';
    groupState.quizRevealed = false;

    if (pendingWord) {
      var pi = g.words.findIndex(function (w) { return w.word === pendingWord; });
      if (pi !== -1) groupState.idx = pi;
      pendingWord = null;
    } else {
      groupState.idx = clamp(groupState.idx, 0, Math.max(0, g.words.length - 1));
    }

    groupState.idx = clamp(groupState.idx, 0, Math.max(0, g.words.length - 1));

    view.innerHTML =
      '<div class="group-header">' +
        '<a class="back-link" href="#/" aria-label="返回首页">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>词组' +
        '</a>' +
        '<h1 class="group-title">' + esc(g.name) + '</h1>' +
        '<div class="mode-pills" role="tablist">' +
          '<button type="button" class="pill active" data-action="mode" data-mode="cards" role="tab">卡片</button>' +
          '<button type="button" class="pill" data-action="mode" data-mode="quiz" role="tab">自测</button>' +
          '<button type="button" class="pill" data-action="mode" data-mode="list" role="tab">列表</button>' +
        '</div>' +
      '</div>' +
      '<div id="cardArea"></div>';

    if (!g.words.length) {
      $('#cardArea').innerHTML = '<div class="empty-state">这一组还没有单词，等主人把生词发来就会填进来啦</div>';
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
    pills.forEach(function (p) { p.classList.toggle('active', p.dataset.mode === mode); });
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
        : '<div class="empty-state">生词本空空的～学习时点「标记生词」，难记的词就会收进来</div>') +
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
    var nav = hash === '#/review' ? 'review' : 'home';
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
    } else {
      renderHome();
    }
    updateTabbar(m ? 'home' : hash);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  applyTheme();
  render();
})();
