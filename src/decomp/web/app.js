/* 詞組關係 MVP：純傳統 script，沒有 module、沒有外部資源。
   資料由建置腳本 inline 成 window.__DATA__。 */
(function () {
  'use strict';

  /* 資料由建置腳本 gzip＋base64 內嵌；load() 解壓後呼叫 start()。 */
  function start(DATA) {
  // 這裡以下的程式都用到 DATA／DOM；DOM 已經在 script 之前解析完成。
  var WORDS = decodeWords(DATA);
  var ATOMS = DATA.atoms;
  var IDX = DATA.idx;

  /* 詞形用「共用前綴」存：[共用幾個字, 剩下的字, 次數, 階數, 樹]，而且依詞名排序，
     這樣 gzip 可以再省一成。這裡還原成 {w,n,d,t}，其餘程式不必知道格式。 */
  function decodeWords(D) {
    if (D.format !== 'prefix') return D.words;
    var out = [];
    var prev = '';
    for (var i = 0; i < D.words.length; i++) {
      var r = D.words[i];
      var name = prev.slice(0, r[0]) + r[1];
      out.push({ w: name, n: r[2], d: r[3], t: r[4] });
      prev = name;
    }
    return out;
  }

  var wordByName = new Map();
  WORDS.forEach(function (w, i) { wordByName.set(w.w, i); });
  var atomByName = new Map();
  ATOMS.forEach(function (a, i) { atomByName.set(a.a, i); });

  /* ── 樹 ─────────────────────────────────────────────── */
  /* 建置時就把樹壓成「詞件 id ＋ 巢狀陣列」：
       葉子 = 一個數字；有子節點 = [id, 子節點[]]
     例：`sabbaññuta[sabbaññu[sabba|ññu]|tā]|dantā` →
         [[12,[[13,[[14],[15]]],[16]]],[17]]                        */
  function treeOf(idx) {
    return WORDS[idx].t || [];
  }

  /** 詞的所有葉子（詞件 id，去重、保留順序）。 */
  var atomCache = new Map();
  function atomsOf(idx) {
    if (atomCache.has(idx)) return atomCache.get(idx);
    var out = [];
    var seen = new Set();
    (function walk(nodes) {
      nodes.forEach(function (n) {
        if (Array.isArray(n)) walk(n[1]);
        else if (!seen.has(n)) { seen.add(n); out.push(n); }
      });
    })(treeOf(idx));
    atomCache.set(idx, out);
    return out;
  }

  /* ── 狀態 ───────────────────────────────────────────── */
  var state = { mode: 'word', name: null, tab: 'shared' };
  var listEl = document.getElementById('list');
  var detailEl = document.getElementById('detail');
  var relEl = document.getElementById('rel');
  var qEl = document.getElementById('q');

  function setHash() {
    var h = state.mode === 'atom' ? '#a=' + encodeURIComponent(state.name) : state.name ? '#w=' + encodeURIComponent(state.name) : '';
    if (h && location.hash !== h) history.replaceState(null, '', h);
  }
  function readHash() {
    var m = /^#([wa])=(.+)$/.exec(location.hash || '');
    if (!m) return false;
    var name = decodeURIComponent(m[2]);
    if (m[1] === 'w' && wordByName.has(name)) { state.mode = 'word'; state.name = name; return true; }
    if (m[1] === 'a' && atomByName.has(name)) { state.mode = 'atom'; state.name = name; return true; }
    return false;
  }

  /* ── 小工具 ─────────────────────────────────────────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(n) { return n.toLocaleString('en-US'); }
  function hl(text, q) {
    if (!q) return document.createTextNode(text);
    var at = text.toLowerCase().indexOf(q.toLowerCase());
    if (at < 0) return document.createTextNode(text);
    var f = document.createDocumentFragment();
    f.appendChild(document.createTextNode(text.slice(0, at)));
    f.appendChild(el('mark', 'mark', text.slice(at, at + q.length)));
    f.appendChild(document.createTextNode(text.slice(at + q.length)));
    return f;
  }

  /* ── 左欄：詞表 ─────────────────────────────────────── */
  var filter = '';
  var filterMode = 'all'; // all | split | deep
  var visible = [];
  /** 一次最多掛幾列；其餘用「顯示更多」分批（避免一萬多列同時進 DOM） */
  var renderLimit = 600;
  function matchesMode(w) {
    if (filterMode === 'split') return w.d >= 1;
    if (filterMode === 'deep') return w.d >= 2;
    return true;
  }
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      filterMode = b.dataset.filter;
      renderLimit = 600;
      document.querySelectorAll('[data-filter]').forEach(function (x) {
        x.setAttribute('aria-selected', String(x === b));
      });
      renderList();
    });
  });

  /** 詞頻順序（資料改成「依詞名排序＋共用前綴」存，畫面預設還是要照詞頻） */
  var orderFreq = null;
  function byFreq() {
    if (!orderFreq) {
      orderFreq = [];
      for (var i = 0; i < WORDS.length; i++) orderFreq.push(i);
      orderFreq.sort(function (a, b) { return WORDS[b].n - WORDS[a].n; });
    }
    return orderFreq;
  }

  function renderList() {
    listEl.textContent = '';
    visible = [];
    var q = filter.toLowerCase();
    var ids = [];
    var order = byFreq();
    for (var k = 0; k < order.length; k++) {
      var i = order[k];
      var w = WORDS[i];
      if (!matchesMode(w)) continue;
      if (q && w.w.toLowerCase().indexOf(q) < 0) continue;
      ids.push(i);
    }
    // 多階／有拆分的篩選下，深的排前面（4 階 → 3 階 → 2 階），同年輕的按次數
    if (filterMode !== 'all') {
      ids.sort(function (a, b) { return WORDS[b].d - WORDS[a].d || WORDS[b].n - WORDS[a].n; });
    }
    var frag = document.createDocumentFragment();
    ids.slice(0, renderLimit).forEach(function (i) {
      var w = WORDS[i];
      visible.push(i);
      var row = el('div', 'row');
      row.setAttribute('role', 'option');
      row.dataset.idx = String(i);
      row.setAttribute('aria-selected', String(state.mode === 'word' && state.name === w.w));
      var name = el('span', 'w');
      name.appendChild(hl(w.w, q));
      row.appendChild(name);
      if (w.d > 1) row.appendChild(el('span', 'badge multi', w.d + '階'));
      row.appendChild(el('span', 'n', fmt(w.n)));
      row.addEventListener('click', function () { selectWord(Number(this.dataset.idx)); });
      frag.appendChild(row);
    });
    if (!ids.length && !q) frag.appendChild(el('div', 'empty', '沒有符合的詞。'));
    listEl.appendChild(frag);
    if (ids.length > renderLimit) {
      var more = el('button', 'iconbtn more', '顯示更多（還有 ' + fmt(ids.length - renderLimit) + ' 個）');
      more.style.width = '100%';
      more.style.marginTop = '8px';
      more.addEventListener('click', function () { renderLimit += 600; renderList(); });
      listEl.appendChild(more);
    }

    // 搜尋時順便找詞件（例：打 "dhamma" 可以跳到詞件）
    if (q.length >= 2) {
      var hits = [];
      for (var j = 0; j < ATOMS.length && hits.length < 30; j++) {
        if (ATOMS[j].a.toLowerCase().indexOf(q) >= 0) hits.push(j);
      }
      if (hits.length) {
        listEl.appendChild(el('h2', null, '詞件'));
        var box = document.createDocumentFragment();
        hits.forEach(function (ai) {
          var a = ATOMS[ai];
          var row = el('div', 'row');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', String(state.mode === 'atom' && state.name === a.a));
          var nm = el('span', 'w');
          nm.appendChild(hl(a.a, q));
          row.appendChild(nm);
          row.appendChild(el('span', 'badge', '詞件'));
          row.appendChild(el('span', 'n', fmt(a.n)));
          row.addEventListener('click', function () { selectAtom(a.a); });
          box.appendChild(row);
        });
        listEl.appendChild(box);
      }
    }
  }

  /* ── 中欄：詞的細節 ─────────────────────────────────── */
  /** 同一個詞件永遠同一個顏色（跨詞對照用）。 */
  function hueOf(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return 'var(--tag-' + (h % 8) + ')';
  }
  function atomName(id) {
    var a = ATOMS[id];
    return a ? a.a : String(id);
  }
  function chip(id, hasKids) {
    var a = ATOMS[id];
    var name = atomName(id);
    var c = el('span', 'chip' + (hasKids ? '' : ' leaf'));
    var sw = el('span', 'swatch');
    sw.style.background = hueOf(name);
    c.appendChild(sw);
    c.appendChild(document.createTextNode(name));
    if (a && a.n) {
      var sub = el('span', 'sub', fmt(a.n));
      sub.title = '出現在 ' + fmt(a.n) + ' 個 pwa 詞形裡';
      c.appendChild(sub);
    }
    c.addEventListener('click', function (ev) {
      ev.stopPropagation();
      selectAtom(name);
    });
    return c;
  }
  function renderNode(nodes, depth) {
    var wrap = el('div', 'tree');
    nodes.forEach(function (n) {
      var id = Array.isArray(n) ? n[0] : n;
      var kids = Array.isArray(n) ? n[1] : null;
      var row = el('div', 'node');
      row.appendChild(chip(id, !!(kids && kids.length)));
      if (kids && kids.length) {
        var box = el('div', 'kids');
        var inner = renderNode(kids, depth + 1);
        while (inner.firstChild) box.appendChild(inner.firstChild);
        row.appendChild(box);
      }
      wrap.appendChild(row);
    });
    return wrap;
  }

  var REL_TABS = [
    ['parts', '詞件'],
    ['shared', '共用詞件'],
    ['family', '同族'],
  ];

  function renderDetail() {
    detailEl.textContent = '';
    if (!state.name) { detailEl.appendChild(el('div', 'empty', '從左邊挑一個詞。')); return; }
    if (state.mode === 'atom') { renderAtomDetail(); return; }

    var idx = wordByName.get(state.name);
    var w = WORDS[idx];
    var h = el('h1', 'word-title');
    h.appendChild(document.createTextNode(w.w));
    h.appendChild(el('span', 'count', fmt(w.n) + ' 次'));
    detailEl.appendChild(h);

    var parts = atomsOf(idx);
    detailEl.appendChild(el('div', 'meta',
      (w.d > 1 ? w.d + ' 階拆分' : w.d === 1 ? '一階拆分' : '原子（pwa 不再拆）') +
      ' · ' + parts.length + ' 個詞件'));

    detailEl.appendChild(renderNode(treeOf(idx), 0));

    // flat parts list
    var list = el('div', 'rel');
    list.appendChild(el('h3', null, '詞件（點一下看它出現在哪些詞）'));
    var items = el('div', 'items');
    parts.forEach(function (p) {
      var b = el('button', 'linkish');
      b.appendChild(el('span', 'w', atomName(p)));
      b.appendChild(el('span', 'n', ATOMS[p] && ATOMS[p].n ? fmt(ATOMS[p].n) + ' 次' : '—'));
      b.addEventListener('click', function () { selectAtom(atomName(p)); });
      items.appendChild(b);
    });
    if (!parts.length) items.appendChild(el('div', 'empty', '沒有詞件。'));
    list.appendChild(items);
    detailEl.appendChild(list);
    detailEl.appendChild(el('div', 'hint',
      '點詞件看它還出現在哪些詞；↑↓ 換詞；按 / 搜尋；網址可分享（#w= 詞、#a= 詞件）。'));
  }

  function renderAtomDetail() {
    var ai = atomByName.get(state.name);
    var a = ATOMS[ai];
    var h = el('h1', 'word-title');
    h.appendChild(document.createTextNode(a.a));
    if (a.n) h.appendChild(el('span', 'count', fmt(a.n) + ' 次'));
    detailEl.appendChild(h);
    var wi = wordByName.get(a.a);
    detailEl.appendChild(el('div', 'meta',
      '原子 · 詞幹 ' + (a.s || a.a) + (wi != null ? ' · 本身也是高頻詞（' + fmt(WORDS[wi].n) + ' 次）' : '')));
    if (wi != null) {
      var b = el('button', 'linkish');
      b.appendChild(el('span', 'w', '看「' + a.a + '」自己的拆分'));
      b.addEventListener('click', function () { selectWord(wi); });
      detailEl.appendChild(b);
      detailEl.appendChild(renderNode(treeOf(wi), 0));
    } else {
      detailEl.appendChild(el('div', 'hint', '這個詞件沒有自己的拆分（pwa 到這裡就停了）。'));
    }
  }

  /* ── 右欄：關係 ─────────────────────────────────────── */
  /* 索引用差分編碼：IDX.n[i]＝第 i 個詞件有幾個詞，IDX.d 是那些詞的索引差值。
     第一次要用時才展開成陣列，並按詞頻排序（關係面板要「先列高頻」）。 */
  var idxLists = null;
  function idxOf(ai) {
    if (!idxLists) {
      idxLists = new Array(ATOMS.length);
      var pos = 0;
      for (var i = 0; i < ATOMS.length; i++) {
        var c = IDX.n[i] || 0;
        var list = new Array(c);
        var acc = 0;
        for (var k = 0; k < c; k++) { acc += IDX.d[pos++]; list[k] = acc; }
        list.sort(function (a, b) { return WORDS[b].n - WORDS[a].n; });
        idxLists[i] = list;
      }
    }
    return idxLists[ai];
  }

  function wordsWith(atomName, exclude, limit) {
    var ai = atomByName.get(atomName);
    if (ai == null) return [];
    var ids = idxOf(ai);
    var out = [];
    for (var i = 0; i < ids.length && out.length < (limit || 50); i++) {
      if (ids[i] !== exclude) out.push(ids[i]);
    }
    return out;
  }

  function renderRel() {
    relEl.textContent = '';
    if (!state.name) return;

    // 分頁
    var tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    REL_TABS.forEach(function (t) {
      var b = el('button', null, t[1]);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(state.tab === t[0]));
      b.addEventListener('click', function () { state.tab = t[0]; renderRel(); });
      tabs.appendChild(b);
    });
    relEl.appendChild(tabs);

    var idx = state.mode === 'word' ? wordByName.get(state.name) : -1;
    var selfName = state.name;
    var atoms = idx >= 0 ? atomsOf(idx) : [state.name];

    if (state.tab === 'parts') {
      if (state.mode === 'atom') {
        relEl.appendChild(section('哪些高頻詞用到它', wordsWith(selfName, -1, 60).map(wordButton)));
      } else {
        var box = el('div', 'rel');
        box.appendChild(el('h3', null, '這個詞的詞件'));
        atoms.forEach(function (p) {
          var line = el('div', 'items');
          var b = el('button', 'linkish');
          b.appendChild(el('span', 'w', atomName(p)));
          b.appendChild(el('span', 'n', ATOMS[p] && ATOMS[p].n ? fmt(ATOMS[p].n) : '—'));
          b.addEventListener('click', function () { selectAtom(atomName(p)); });
          line.appendChild(b);
          box.appendChild(line);
        });
        relEl.appendChild(box);
      }
    }

    if (state.tab === 'shared') {
      if (state.mode === 'atom') {
        relEl.appendChild(el('div', 'empty', '原子只有「哪些詞用到它」；選一個詞才看得到共用詞件。'));
      } else {
        atoms.forEach(function (p) {
          var others = wordsWith(atomName(p), idx, 8);
          if (!others.length) return;
          relEl.appendChild(section('詞件 ' + atomName(p), others.map(function (i) { return wordButton(i); })));
        });
        if (!atoms.length) relEl.appendChild(el('div', 'empty', '沒有詞件。'));
      }
    }

    if (state.tab === 'family') {
      if (state.mode === 'atom') {
        relEl.appendChild(el('div', 'empty', '選一個詞，才看得出同族。'));
      } else {
        var mine = new Set(atoms);
        var first = atoms[0];
        var byFirst = wordsWith(atomName(first), idx, 40).filter(function (i) {
          return atomsOf(i)[0] === first;
        });
        relEl.appendChild(section('同一個開頭「' + atomName(first) + '」', byFirst.slice(0, 12).map(wordButton)));

        // 共用 ≥2 個詞件
        var score = new Map();
        atoms.forEach(function (p) {
          wordsWith(atomName(p), idx, 400).forEach(function (i) {
            score.set(i, (score.get(i) || 0) + 1);
          });
        });
        var best = [];
        score.forEach(function (v, i) { if (v >= 2) best.push([i, v]); });
        best.sort(function (a, b) { return b[1] - a[1] || WORDS[b[0]].n - WORDS[a[0]].n; });
        relEl.appendChild(section('共享 ≥2 個詞件', best.slice(0, 15).map(function (x) {
          return wordButton(x[0], '共用 ' + x[1]);
        })));
      }
    }
  }

  function section(title, nodes) {
    var box = el('div', 'rel');
    box.appendChild(el('h3', null, title));
    var items = el('div', 'items');
    if (!nodes.length) items.appendChild(el('div', 'empty', '沒有。'));
    nodes.forEach(function (n) { items.appendChild(n); });
    box.appendChild(items);
    return box;
  }

  function wordButton(i, note) {
    var w = WORDS[i];
    var b = el('button', 'linkish');
    b.appendChild(el('span', 'w', w.w));
    if (note) b.appendChild(el('span', 'parts', note));
    b.appendChild(el('span', 'n', fmt(w.n)));
    b.addEventListener('click', function () { selectWord(i); });
    return b;
  }

  /* ── 選擇 ───────────────────────────────────────────── */
  function selectWord(i) {
    state.mode = 'word';
    state.name = WORDS[i].w;
    setHash();
    renderList(); renderDetail(); renderRel();
    var row = listEl.querySelector('.row[aria-selected="true"]');
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
  function selectAtom(name) {
    if (!atomByName.has(name)) return;
    state.mode = 'atom';
    state.name = name;
    setHash();
    renderList(); renderDetail(); renderRel();
  }

  /* ── 主題、字級 ─────────────────────────────────────── */
  var THEMES = ['dark', 'light', 'eye'];
  function applyTheme(t) {
    if (t === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t));
    });
  }
  function setTheme(t) {
    try { localStorage.setItem('wordgroups.theme', t); } catch (e) { /* 私密模式 */ }
    applyTheme(t);
  }
  document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
    b.addEventListener('click', function () { setTheme(b.dataset.themeBtn); });
  });

  var fs = 15;
  function setFs(v) {
    fs = Math.max(12, Math.min(32, v));
    document.documentElement.style.setProperty('--fs', fs + 'px');
    try { localStorage.setItem('wordgroups.fs', String(fs)); } catch (e) { /* ignore */ }
  }
  document.getElementById('fsminus').addEventListener('click', function () { setFs(fs - 1); });
  document.getElementById('fsplus').addEventListener('click', function () { setFs(fs + 1); });

  /* ── 搜尋與鍵盤 ─────────────────────────────────────── */
  var cursor = -1;
  qEl.addEventListener('input', function () {
    filter = qEl.value.trim();
    cursor = -1;
    renderLimit = 600;
    renderList();
  });
  qEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var rows = listEl.querySelectorAll('.row');
      if (!rows.length) return;
      cursor = Math.min(rows.length - 1, cursor + 1);
      rows[cursor].click();
      rows[cursor].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') {
      qEl.value = ''; filter = ''; renderList(); qEl.blur();
    }
  });
  document.addEventListener('keydown', function (e) {
    var inInput = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (e.key === '/' && !inInput) { e.preventDefault(); qEl.focus(); }
    if (e.key === 'Escape' && !inInput) {
      filter = ''; qEl.value = ''; renderList();
    }
    if (e.key === 'Escape' && inInput) {
      filter = ''; qEl.value = ''; renderList(); qEl.blur();
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !inInput && visible.length) {
      e.preventDefault();
      var cur = state.mode === 'word' ? visible.indexOf(wordByName.get(state.name)) : -1;
      var next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
      if (cur < 0) next = 0;
      next = Math.max(0, Math.min(visible.length - 1, next));
      selectWord(visible[next]);
    }
  });

  /* ── 啟動 ───────────────────────────────────────────── */
  (function boot() {
    var t = 'dark';
    var size = 15;
    try {
      var saved = localStorage.getItem('wordgroups.theme');
      if (saved === 'light' || saved === 'eye') t = saved;
      var s2 = Number(localStorage.getItem('wordgroups.fs'));
      if (s2 >= 12 && s2 <= 32) size = s2;
    } catch (e) { /* ignore */ }
    applyTheme(t);
    setFs(size);

    if (!readHash() && WORDS.length) {
      // 預設挑第一個「多階且夠長」的詞，讓使用者一進來就看到結構
      var pick = 0;
      var order = byFreq();
      for (var i = 0; i < order.length; i++) {
        var cand = WORDS[order[i]];
        if (cand.d > 1 && cand.w.length >= 10) { pick = order[i]; break; }
      }
      state.mode = 'word';
      state.name = WORDS[pick].w;
    }
    renderList(); renderDetail(); renderRel();
    var sel = listEl.querySelector('.row[aria-selected="true"]');
    if (sel) sel.scrollIntoView({ block: 'center' });

    var meta = DATA.meta || {};
    document.getElementById('meta').textContent =
      fmt(WORDS.length) + ' 個詞 · ' + fmt(ATOMS.length) + ' 個詞件' +
      (meta.tokens ? ' · 語料 ' + fmt(meta.tokens) + ' 詞' : '');
  })();
  }

  (function load() {
    var b64 = window.__DATA_GZ__ || '';
    if (!b64) {
      document.body.innerHTML = '<p style="padding:24px">沒有資料。</p>';
      return;
    }
    var fail = function (msg) {
      document.body.innerHTML = '<p style="padding:24px;color:#c00">' + msg + '</p>';
    };
    try {
      var bin = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      var stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
      new Response(stream).text().then(function (text) {
        start(JSON.parse(text));
      }).catch(function (e) { fail('資料解壓失敗：' + e); });
    } catch (e) {
      fail('這個瀏覽器不支援 DecompressionStream：' + e);
    }
  })();
})();
