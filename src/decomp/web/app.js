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

  /* 哪些詞的第二層是從 dpd 接上來的（要標示，別跟 pwa 的拆法混在一起） */
  var DPD = new Set(DATA.dpd || []);
  /* 原子詞的詞幹（字典形）：沒有詞件可看時，至少知道它原來是什麼 */
  var STEM = new Map(DATA.stems || []);
  /* 第三層：pm1 的 viggaha */
  var PM1 = new Set(DATA.pm1 || []);
  /* 常用詞件的中文（詞件 id → 釋義） */
  var ZH = new Map(DATA.zh || []);
  /* 整詞中文（詞序 → 釋義） */
  var ZHT = new Map(DATA.zht || []);
  /* 格位分佈（詞序 → "主80,対20"） */
  var CS = new Map((DATA.cs || []).map(function (r) { return [r[0], r]; }));
  var HINTS = new Map(DATA.hints || []);
  var GUESS = DATA.guess || '';
  var GUESS2 = DATA.guess2 || '';
  /* 例句：共用句池 + 每個詞的索引 */
  var SENSES = new Map(DATA.senses || []);
  var PTSPOOL = (DATA.pts && DATA.pts[0]) || [];
  var PTSIDX = new Map((DATA.pts && DATA.pts[1]) || []);
  var EXPOOL = (DATA.ex && DATA.ex[0]) || [];
  var EXIDX = new Map((DATA.ex && DATA.ex[1]) || []);
  function caseText(i) {
    var r = CS.get(i);
    if (!r) return '';
    return r[2].split(',').map(function (x) {
      var m = /^(\D+)(\d+)$/.exec(x);
      return m ? m[1] + ' ' + m[2] + '%' : x;
    }).join(' · ') + '（樣本 ' + r[1].toLocaleString() + ' 次）';
  }

  /* 詞性：與 words 同序的一串字元（0＝沒有） */
  var POS_STR = DATA.pos || '';
  var POS_LABEL = ['', '名詞', '形容詞', '動詞', '分詞', '不變詞', '代名詞', '數詞'];
  function posOf(i) {
    var ch = POS_STR.charAt(i);
    return POS_LABEL[Number(ch)] || '';
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
    if (WORDS[idx].t) return WORDS[idx].t;
    // 原子詞沒有存樹：它就是自己
    var id = atomByName.get(WORDS[idx].w);
    return id == null ? [] : [id];
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

  /** 詞族：一個詞件底下有幾個詞（排除只有 1 個詞的與虛詞） */
  function renderFamilyList(q) {
    var rows = [];
    for (var i = 0; i < ATOMS.length; i++) {
      var size = (IDX.n && IDX.n[i]) || 0;
      if (size < 2) continue;
      var a = ATOMS[i];
      var label = POS_OF_ATOM(i);
      if (label === '虛') continue;
      if (q && a.a.toLowerCase().indexOf(q) < 0) continue;
      rows.push([size, i]);
    }
    rows.sort(function (x, y) { return y[0] - x[0]; });
    var frag = document.createDocumentFragment();
    rows.slice(0, renderLimit).forEach(function (r) {
      var size = r[0];
      var i = r[1];
      var a = ATOMS[i];
      var row = el('div', 'row');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(state.mode === 'atom' && state.name === a.a));
      row.appendChild(el('span', 'w', a.a));
      if (ZH.has(i)) row.appendChild(el('span', 'parts', ZH.get(i)));
      row.appendChild(el('span', 'n', size + ' 詞'));
      row.addEventListener('click', function () { selectAtom(a.a); });
      frag.appendChild(row);
    });
    if (!rows.length) frag.appendChild(el('div', 'empty', '沒有符合的詞族。'));
    listEl.appendChild(frag);
    if (rows.length > renderLimit) {
      var more = el('button', 'iconbtn more', '顯示更多（還有 ' + fmt(rows.length - renderLimit) + ' 個）');
      more.style.width = '100%';
      more.style.marginTop = '8px';
      more.addEventListener('click', function () { renderLimit += 600; renderList(); });
      listEl.appendChild(more);
    }
  }

  /** 用詞性字串判斷虛詞（5=不變詞、6=代名詞）；查不到回空 */
  function POS_OF_ATOM(atomId) {
    var name = atomName(atomId);
    var wi = wordByName.get(name);
    if (wi == null) return '';
    var c = POS_STR.charAt(wi);
    return c === '5' || c === '6' ? '虛' : '';
  }

  function renderList() {
    listEl.textContent = '';
    visible = [];
    var q = filter.toLowerCase();
    if (filterMode === 'family') { renderFamilyList(q); return; }
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

  /** 詞件裡有沒有「不是詞典詞」的碎片；有就代表這個拆法可能只是機械切分 */
  function suspectSplit(parts) {
    for (var k = 0; k < parts.length; k++) {
      var a = ATOMS[parts[k]];
      if (!a || !a.n) return true;
    }
    return false;
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
    if (ZH.has(id)) c.title = ZH.get(id);
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
      (posOf(idx) ? posOf(idx) + ' · ' : '') +
      (w.d > 1 ? w.d + ' 階拆分' : w.d === 1 ? '一階拆分' : '原子（pwa 不再拆）') +
      ' · ' + parts.length + ' 個詞件' +
      (DPD.has(idx) ? ' · 第二層來自 dpd（詞級複合）' : '') +
      (PM1.has(idx) ? ' · 第三層來自 pm1（緬甸辭典 viggaha）' : '') +
      (STEM.has(idx) ? ' · 詞幹 ' + STEM.get(idx) : '')));

    if (ZHT.has(idx)) {
      detailEl.appendChild(el('div', 'gloss', ZHT.get(idx)));
    }
    if (PTSIDX.has(idx)) {
      var pb = el('div', 'pts');
      pb.appendChild(el('h3', null, 'PTS'));
      pb.appendChild(el('div', 'pts-text', PTSPOOL[PTSIDX.get(idx)]));
      detailEl.appendChild(pb);
    }
    if (SENSES.has(idx)) {
      var box = el('div', 'senses');
      box.appendChild(el('h3', null, '義項'));
      SENSES.get(idx).forEach(function (line) {
        box.appendChild(el('div', 'sense-line', line));
      });
      detailEl.appendChild(box);
    }
    if (caseText(idx)) {
      detailEl.appendChild(el('div', 'meta', '格位分佈：' + caseText(idx) + '（komyoji 逐詞標註）'));
    } else if (GUESS.charAt(idx) && GUESS.charAt(idx) !== '-') {
      var g2 = GUESS2.charAt(idx);
      var txt = GUESS.charAt(idx) + (g2 && g2 !== '-' ? ' 或 ' + g2 : '');
      detailEl.appendChild(el('div', 'meta', '格位推估：' + txt + '（模型推估，約八成準）'));
    }
    if (HINTS.has(idx)) {
      detailEl.appendChild(el('div', 'meta', '上下文：' + HINTS.get(idx)));
    }
    if (EXIDX.has(idx)) {
      var exBox = el('div', 'ex');
      exBox.appendChild(el('h3', null, '例句'));
      var word = WORDS[idx].w;
      EXIDX.get(idx).forEach(function (k) {
        var line = EXPOOL[k];
        var box = el('div', 'ex-line');
        // 把例句裡的目標詞標出來
        var lower = line.toLowerCase();
        var at = lower.indexOf(word);
        if (at < 0) { box.textContent = line; }
        else {
          var pos = 0;
          while (at >= 0) {
            box.appendChild(document.createTextNode(line.slice(pos, at)));
            box.appendChild(el('b', null, line.slice(at, at + word.length)));
            pos = at + word.length;
            at = lower.indexOf(word, pos);
          }
          box.appendChild(document.createTextNode(line.slice(pos)));
        }
        exBox.appendChild(box);
      });
      detailEl.appendChild(exBox);
    }

    if (w.d > 0) detailEl.appendChild(renderNode(treeOf(idx), 0));
    if (w.d > 0 && suspectSplit(parts)) {
      detailEl.appendChild(el('div', 'hint warn', '⚠ 有詞件不是詞典裡的詞：這個拆法可能只是機械切分，請以詞義為準。'));
    }

    // flat parts list
    if (parts.length > 1 || w.d > 0) {
    var list = el('div', 'rel');
    list.appendChild(el('h3', null, '詞件（點一下看它出現在哪些詞）'));
    var items = el('div', 'items');
    parts.forEach(function (p) {
      var b = el('button', 'linkish');
      b.appendChild(el('span', 'w', atomName(p)));
      if (ZH.has(p)) b.appendChild(el('span', 'parts', ZH.get(p)));
      b.appendChild(el('span', 'n', ATOMS[p] && ATOMS[p].n ? fmt(ATOMS[p].n) + ' 次' : '—'));
      b.addEventListener('click', function () { selectAtom(atomName(p)); });
      items.appendChild(b);
    });
    if (!parts.length) items.appendChild(el('div', 'empty', '沒有詞件。'));
    list.appendChild(items);
    detailEl.appendChild(list);
    }
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
      (ZH.has(ai) ? ZH.get(ai) + ' · ' : '') +
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
    state.tab = 'parts'; // 詞件頁預設看「哪些詞用到它」
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

  /* ── 讀經文：貼一段巴利文，逐詞拆給你看 ───────────────── */
  var panes = document.getElementById('panes');
  var reader = document.getElementById('reader');
  var paliEl = document.getElementById('pali');
  var outEl = document.getElementById('readout');
  var statsEl = document.getElementById('readstats');
  var showZh = document.getElementById('showzh');
  var DEMO = 'Evaṃ me sutaṃ – ekaṃ samayaṃ bhagavā antarā ca rājagahaṃ antarā ca nāḷandaṃ addhānamaggappaṭipanno hoti mahatā bhikkhusaṅghena saddhiṃ pañcamattehi bhikkhusatehi.';

  function setMode(mode) {
    var text = mode === 'text';
    panes.hidden = text;
    reader.hidden = !text;
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    try { localStorage.setItem('wordgroups.mode', mode); } catch (e) { /* ignore */ }
    if (text) parseText();
  }

  /** 詞形去掉頭尾的標點；回傳 [詞, 前綴, 後綴] */
  function trimPunct(tok) {
    var m = /^([^\p{L}\p{M}]*)([\p{L}\p{M}]+)([^\p{L}\p{M}]*)$/u.exec(tok);
    return m ? [m[2], m[1], m[3]] : [tok, '', ''];
  }

  function glossOf(i) {
    if (ZHT.has(i)) return ZHT.get(i);
    var parts = atomsOf(i);
    var out = [];
    for (var k = 0; k < parts.length && out.length < 3; k++) {
      var g = ZH.get(parts[k]);
      if (g) out.push(atomName(parts[k]) + ' ' + g);
    }
    return out.join('；');
  }

  function parseText() {
    var text = paliEl.value;
    outEl.textContent = '';
    if (!text.trim()) { statsEl.textContent = ''; return; }
    var frag = document.createDocumentFragment();
    var total = 0;
    var hit = 0;
    misses = new Map();
    // 以空白切；標點留在原位
    var chunks = text.split(/(\s+)/);
    chunks.forEach(function (chunk) {
      if (!chunk) return;
      if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(chunk)); return; }
      var t = trimPunct(chunk);
      var w = t[0];
      if (!/[\p{L}\p{M}]/u.test(w)) { frag.appendChild(document.createTextNode(chunk)); return; } // 純標點不計
      var i = wordByName.get(w);
      total++;
      if (i == null) {
        var miss = el('span', 'tok miss');
        miss.appendChild(document.createTextNode(t[1] + w + t[2]));
        frag.appendChild(miss);
        misses.set(w, (misses.get(w) || 0) + 1);
        return;
      }
      hit++;
      var span = el('span', 'tok hit');
      span.appendChild(document.createTextNode(t[1]));
      var wEl = el('span', 'tok-w', w);
      span.appendChild(wEl);
      span.appendChild(document.createTextNode(t[2]));
      var g = glossOf(i);
      if (g) {
        span.title = g;
        if (showZh && showZh.checked) span.appendChild(el('span', 'tok-g', g));
      }
      span.addEventListener('click', function () { showPop(i, span); });
      frag.appendChild(span);
    });
    outEl.appendChild(frag);
    statsEl.textContent = total
      ? hit + ' / ' + total + ' 詞認得（' + ((hit / total) * 100).toFixed(0) + '%）'
      : '';
    renderMisses();
  }

  /* 點詞就地彈出：詞義、拆解、詞件中文，不用切回詞表 */
  var popEl = document.getElementById('pop');
  var misses = new Map();

  function closePop() { if (popEl) { popEl.hidden = true; popEl.textContent = ''; } }

  function showPop(i, anchorEl) {
    if (!popEl) return;
    popEl.textContent = '';
    var w = WORDS[i];
    var head = el('div', 'pop-head');
    head.appendChild(el('b', null, w.w));
    head.appendChild(el('span', 'pop-n', fmt(w.n) + ' 次'));
    if (posOf(i)) head.appendChild(el('span', 'pos-tag', posOf(i)));
    var x = el('button', 'pop-x', '×');
    x.setAttribute('aria-label', '關閉');
    x.addEventListener('click', closePop);
    head.appendChild(x);
    popEl.appendChild(head);

    var g = glossOf(i);
    if (g) popEl.appendChild(el('div', 'pop-gloss', g));
    if (caseText(i)) popEl.appendChild(el('div', 'meta', '格位：' + caseText(i)));
    else if (GUESS.charAt(i) && GUESS.charAt(i) !== '-') {
      var g3 = GUESS2.charAt(i);
      popEl.appendChild(el('div', 'meta', '格位推估：' + GUESS.charAt(i) + (g3 && g3 !== '-' ? ' 或 ' + g3 : '') + '（約八成準）'));
    }
    if (HINTS.has(i)) popEl.appendChild(el('div', 'meta', '上下文：' + HINTS.get(i)));

    var parts = w.d === 0 ? [] : atomsOf(i);
    if (parts.length) {
      popEl.appendChild(renderNode(treeOf(i), 0));
      if (suspectSplit(parts)) popEl.appendChild(el('div', 'hint warn', '⚠ 拆法可能不可靠'));
      var list = el('div', 'pop-parts');
      parts.forEach(function (p) {
        var line = el('div', 'pop-part');
        line.appendChild(el('span', 'w', atomName(p)));
        if (ZH.has(p)) line.appendChild(el('span', 'g', ZH.get(p)));
        list.appendChild(line);
      });
      popEl.appendChild(list);
    } else if (STEM.has(i)) {
      popEl.appendChild(el('div', 'pop-gloss', '詞幹：' + STEM.get(i)));
    }

    var more = el('button', 'linkish', '在詞表打開 →');
    more.addEventListener('click', function () {
      closePop();
      state.mode = 'word';
      state.name = w.w;
      setMode('list');
      selectWord(i);
    });
    popEl.appendChild(more);
    popEl.hidden = false;
  }

  /* 不認得的詞：列出來、可以複製，當下一批要補的詞 */
  function renderMisses() {
    var box = document.getElementById('missbox');
    if (!box) return;
    box.textContent = '';
    if (!misses.size) { box.hidden = true; return; }
    box.hidden = false;
    var list = Array.from(misses.entries()).sort(function (a, b) { return b[1] - a[1]; });
    var head = el('div', 'miss-head');
    head.appendChild(el('span', null, '不認得 ' + list.length + ' 個：'));
    var copy = el('button', 'iconbtn', '複製');
    copy.addEventListener('click', function () {
      var text = list.map(function (x) { return x[0] + '\t' + x[1]; }).join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { copy.textContent = '已複製'; }, function () { copy.textContent = '複製失敗'; });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); copy.textContent = '已複製'; } catch (e) { copy.textContent = '無法複製'; }
        document.body.removeChild(ta);
      }
    });
    head.appendChild(copy);
    var dl = el('button', 'iconbtn', '下載 TSV');
    dl.title = '把不認得的詞存成檔案，當下一批要補的詞';
    dl.addEventListener('click', function () {
      var text = 'word\tcount\n' + list.map(function (x) { return x[0] + '\t' + x[1]; }).join('\n') + '\n';
      var blob = new Blob([text], { type: 'text/tab-separated-values;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'unrecognized-words.tsv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    head.appendChild(dl);
    box.appendChild(head);
    var chips = el('div', 'miss-chips');
    list.forEach(function (x) { chips.appendChild(el('span', 'miss-chip', x[0] + ' ×' + x[1])); });
    box.appendChild(chips);
  }

  document.addEventListener('click', function (e) {
    if (popEl && !popEl.hidden && !popEl.contains(e.target) && !e.target.closest('.tok')) closePop();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closePop(); closeGuide(); }
  });

  /* 使用說明 */
  var guideEl = document.getElementById('guide');
  function openGuide() { if (guideEl) { guideEl.hidden = false; var b = document.getElementById('guide-close'); if (b) b.focus(); } }
  function closeGuide() { if (guideEl) { guideEl.hidden = true; try { localStorage.setItem('wordgroups.seen', '1'); } catch (e) {} } }
  var helpBtn = document.getElementById('help');
  if (helpBtn) helpBtn.addEventListener('click', openGuide);
  var guideClose = document.getElementById('guide-close');
  if (guideClose) guideClose.addEventListener('click', closeGuide);
  if (guideEl) guideEl.addEventListener('click', function (e) { if (e.target === guideEl) closeGuide(); });

  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });
  document.getElementById('demo').addEventListener('click', function () {
    paliEl.value = DEMO;
    parseText();
  });
  if (showZh) showZh.addEventListener('change', parseText);
  if (paliEl) paliEl.addEventListener('input', function () { parseText(); });

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
    try {
      if (localStorage.getItem('wordgroups.mode') === 'text') setMode('text');
      if (!localStorage.getItem('wordgroups.seen')) openGuide();
    } catch (e) { /* 私密模式 */ }
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
