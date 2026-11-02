#!/usr/bin/env bun
/**
 * 詞組關係 MVP：把「高頻詞 ＋ 多階拆分」打包成**一個 HTML**（雙擊可開，file:// 可用）。
 *
 *   bun run src/decomp/mvp.ts            # 預設 2500 個高頻詞
 *   bun run src/decomp/mvp.ts --n=4000   # 改數量
 *
 * 資料來源（全部唯讀）：
 *   data/cs/*.xml                       詞頻（正文，含既有詞譜的詞）
 *   out/pwa-tree-all.tsv                pwa 多階樹（src/decomp/pwa-tree.ts 產生）
 *   data/cs-decomp/pwa-atoms.tsv        詞件（原子）的次數與詞幹
 *
 * 產物：out/word-groups.html（單檔：CSS／JS／資料全部 inline，沒有外部資源）
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const N = Number((process.argv.find((a) => a.startsWith('--n=')) ?? '--n=60000').slice(4)) || 60000;
/** 2 階詞只收前幾個（2 階在語料裡有九萬個，全收會爆 2 MB 預算） */
const DEEP2 = 24000;
const WORD_G = /[\p{L}\p{M}]+/gu;

/** 樹節點：葉子＝詞件 id；有子節點＝[詞件 id, 子節點[]] */
type Node = number | [number, Node[]];

interface WordRow { w: string; n: number; d: number; t: Node[] }

/* ── 1. 詞頻（data/cs/*.xml）───────────────────────────── */
const countWords = (): { counts: Map<string, number>; tokens: number; books: number } => {
  const dir = join(ROOT, 'data', 'cs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
  const counts = new Map<string, number>();
  let tokens = 0;
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
    for (const m of text.match(WORD_G) ?? []) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
      tokens++;
    }
  }
  return { counts, tokens, books: files.length };
};

/* ── 2. pwa 多階樹 ─────────────────────────────────────
   第一趟只收「詞 → 深度」（選詞用，記憶體小）；第二趟才把選中的樹讀出來。 */
const scanDepths = (keep: Set<string>): Map<string, number> => {
  const file = join(ROOT, 'out', 'pwa-tree-all.tsv');
  const text = readFileSync(file, 'utf8');
  const out = new Map<string, number>();
  let at = text.indexOf('\n') + 1;
  while (at > 0 && at < text.length) {
    const end = text.indexOf('\n', at);
    const line = end < 0 ? text.slice(at) : text.slice(at, end);
    at = end < 0 ? text.length : end + 1;
    const tab1 = line.indexOf('\t');
    if (tab1 < 0) continue;
    const word = line.slice(0, tab1);
    if (!keep.has(word)) continue;
    const tab2 = line.indexOf('\t', tab1 + 1);
    if (tab2 < 0) continue;
    out.set(word, Number(line.slice(tab1 + 1, tab2)) || 0);
  }
  return out;
};

const loadTrees = (wanted: Set<string>): Map<string, { d: number; t: string }> => {
  const file = join(ROOT, 'out', 'pwa-tree-all.tsv');
  const text = readFileSync(file, 'utf8');
  const out = new Map<string, { d: number; t: string }>();
  let at = text.indexOf('\n') + 1; // 跳過表頭
  while (at > 0 && at < text.length) {
    const end = text.indexOf('\n', at);
    const line = end < 0 ? text.slice(at) : text.slice(at, end);
    at = end < 0 ? text.length : end + 1;
    const tab1 = line.indexOf('\t');
    if (tab1 < 0) continue;
    const word = line.slice(0, tab1);
    if (!wanted.has(word)) continue;
    const tab2 = line.indexOf('\t', tab1 + 1);
    const tab3 = line.indexOf('\t', tab2 + 1);
    if (tab2 < 0 || tab3 < 0) continue;
    out.set(word, { d: Number(line.slice(tab1 + 1, tab2)) || 0, t: line.slice(tab3 + 1) });
  }
  return out;
};

/* ── 3. 詞件次數 ──────────────────────────────────────── */
const loadAtoms = (): Map<string, { n: number; s: string }> => {
  const out = new Map<string, { n: number; s: string }>();
  const text = readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8');
  let at = text.indexOf('\n') + 1;
  while (at > 0 && at < text.length) {
    const end = text.indexOf('\n', at);
    const line = end < 0 ? text.slice(at) : text.slice(at, end);
    at = end < 0 ? text.length : end + 1;
    const [a, n, s] = line.split('\t');
    if (a) out.set(a, { n: Number(n) || 0, s: s || a });
  }
  return out;
};

/* ── 5. 組資料 ────────────────────────────────────────── */
const started = Date.now();
const { counts, tokens, books } = countWords();
console.log(`詞頻：${books} 檔、${tokens.toLocaleString()} 詞、${counts.size.toLocaleString()} 個詞形`);

const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const wanted = new Map<string, number>();
for (const [w, n] of ranked) {
  if (wanted.size >= N) break;
  if (w.length >= 2 && /^[\p{L}\p{M}]+$/u.test(w)) wanted.set(w, n);
}
console.log(`高頻 ${wanted.size} 個；掃深度…`);

// pwa 的拆法本身很淺：高頻詞幾乎都在 1 階以內。所以除了高頻詞，再補
// 「有正文次數的多階詞」（2 階取前 1,200、3 階以上全收），否則多階篩選是空的。
const depths = scanDepths(new Set(counts.keys()));
const byDepth = (min: number, max: number): [string, number][] =>
  [...depths.entries()]
    .filter(([w, d]) => d >= min && d <= max && counts.has(w) && w.length >= 2)
    .map(([w]) => [w, counts.get(w)!] as [string, number])
    .sort((a, b) => b[1] - a[1]);

const deep2 = byDepth(2, 2).slice(0, DEEP2);
const deep3 = byDepth(3, 99);
for (const [w, n] of [...deep2, ...deep3]) if (!wanted.has(w)) wanted.set(w, n);
console.log(`高頻 ＋ 多階：${wanted.size} 個（2 階 ${deep2.length}、3 階以上 ${deep3.length}）；載入樹…`);

const trees = loadTrees(new Set(wanted.keys()));
const atomInfo = loadAtoms();

/* 樹壓成「詞件 id ＋ 巢狀陣列」：葉子＝數字，有子節點＝[id, 子節點[]]。
   比存字串省一半以上，同樣的 2 MB 可以多放三、四成詞。 */
const parseTree = (s: string, idOf: (name: string) => number): Node[] => {
  let i = 0;
  const list = (): Node[] => {
    const out: Node[] = [];
    let cur = '';
    while (i < s.length) {
      const c = s[i];
      if (c === '|') { if (cur) out.push(idOf(cur)); cur = ''; i++; }
      else if (c === '[') {
        i++;
        const kids = list();
        if (s[i] === ']') i++;
        out.push([idOf(cur), kids]);
        cur = '';
      } else if (c === ']') break;
      else { cur += c; i++; }
    }
    if (cur) out.push(idOf(cur));
    return out;
  };
  return list();
};

const collectLeaves = (nodes: Node[], out: number[]): void => {
  for (const n of nodes) {
    if (typeof n === 'number') out.push(n);
    else collectLeaves(n[1], out);
  }
};

const atoms: { a: string; n: number; s: string }[] = [];
const atomId = new Map<string, number>();
const idOf = (name: string): number => {
  const hit = atomId.get(name);
  if (hit != null) return hit;
  const id = atoms.length;
  atomId.set(name, id);
  atoms.push({ a: name, n: atomInfo.get(name)?.n ?? 0, s: atomInfo.get(name)?.s ?? name });
  return id;
};

/* 詞形排序後做「共用前綴」壓縮：[共用幾個字, 剩下的字, 次數, 階數, 樹]。
   gzip 之後還能再省一成（排序本身讓相似的詞相鄰，前綴壓縮再砍一次）。 */
const sorted = [...wanted.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const words: [number, string, number, number, Node[]][] = [];
let prevName = '';
for (const [w, n] of sorted) {
  const t = trees.get(w);
  if (!t) continue; // pwa 沒有這個詞形（極少數）
  const lim = Math.min(w.length, prevName.length);
  let k = 0;
  while (k < lim && prevName[k] === w[k]) k++;
  words.push([k, w.slice(k), n, t.d, parseTree(t.t, idOf)]);
  prevName = w;
}
console.log(`有樹的 ${words.length} 個；組索引…`);

/* 索引壓成「每個詞件幾個詞 ＋ 差分編碼的詞序」：
     n[i] = 第 i 個詞件有幾個詞；d[] = 那些詞的索引（同一個詞件內遞增，存差值）。
   JSON 物件改成平坦整數，gzip 之後再省一成七。 */
const byAtom: number[][] = atoms.map(() => []);
words.forEach((row, i) => {
  const leaves: number[] = [];
  collectLeaves(row[4], leaves);
  for (const id of new Set(leaves)) byAtom[id].push(i);
});
const idxN: number[] = [];
const idxD: number[] = [];
for (const list of byAtom) {
  list.sort((a, b) => a - b);
  idxN.push(list.length);
  let prev = 0;
  for (const j of list) {
    idxD.push(j - prev);
    prev = j;
  }
}

const data = { format: 'prefix', words, atoms, idx: { n: idxN, d: idxD }, meta: { tokens, books } };
console.log(`詞 ${words.length}、詞件 ${atoms.length}、索引 ${idxD.length} 筆`);

/* ── 6. 組 HTML ───────────────────────────────────────── */
const css = readFileSync(join(ROOT, 'src', 'decomp', 'web', 'app.css'), 'utf8');
const js = readFileSync(join(ROOT, 'src', 'decomp', 'web', 'app.js'), 'utf8');
const raw = JSON.stringify(data);
const gz = gzipSync(Buffer.from(raw, 'utf8'), { level: 9 });
const payload = gz.toString('base64');
console.log(`資料 ${(raw.length / 1024).toFixed(0)} KB → gzip ${(gz.length / 1024).toFixed(0)} KB → base64 ${(payload.length / 1024).toFixed(0)} KB`);

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>詞組 · 巴利高頻詞</title>
<script>
try {
  var t = localStorage.getItem('wordgroups.theme');
  if (t === 'light' || t === 'eye') document.documentElement.setAttribute('data-theme', t);
  var f = Number(localStorage.getItem('wordgroups.fs'));
  if (f >= 12 && f <= 32) document.documentElement.style.setProperty('--fs', f + 'px');
} catch (e) {}
</script>
<style>
${css}
</style>
</head>
<body>
<div class="app">
  <header>
    <div class="brand">詞組<small>巴利高頻詞 · 多階拆分</small></div>
    <label class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>
      <input id="q" type="search" placeholder="找詞…（按 /）" aria-label="搜尋詞" autocomplete="off" spellcheck="false">
    </label>
    <div class="spacer"></div>
    <span id="meta" class="badge"></span>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="主題">
        <button data-theme-btn="dark" aria-pressed="true">暗</button>
        <button data-theme-btn="light" aria-pressed="false">亮</button>
        <button data-theme-btn="eye" aria-pressed="false">護</button>
      </div>
      <button class="iconbtn" id="fsminus" aria-label="字級變小">A-</button>
      <button class="iconbtn" id="fsplus" aria-label="字級變大">A+</button>
    </div>
  </header>
  <main>
    <section class="pane" aria-label="詞表">
      <h2>詞表</h2>
      <div class="tabs" role="group" aria-label="篩選">
        <button data-filter="all" aria-selected="true">全部</button>
        <button data-filter="split" aria-selected="false">有拆分</button>
        <button data-filter="deep" aria-selected="false">多階</button>
      </div>
      <div id="list" role="listbox" aria-label="詞表"></div>
    </section>
    <section class="pane" aria-label="詞的拆分">
      <div id="detail"></div>
    </section>
    <aside class="pane rel-pane" aria-label="詞組關係">
      <div id="rel"></div>
    </aside>
  </main>
</div>
<script>window.__DATA_GZ__ = ${JSON.stringify(payload)};</script>
<script>
${js}
</script>
</body>
</html>
`;

mkdirSync(join(ROOT, 'out'), { recursive: true });
const outPath = join(ROOT, 'out', 'word-groups.html');
writeFileSync(outPath, html, 'utf8');

/* ── 7. 驗收（單檔的規矩）────────────────────────────── */
const size = statSync(outPath).size;
const BUDGET = 2 * 1024 * 1024;
const problems: string[] = [];
if (size > BUDGET) problems.push(`超過 2 MB 預算（${(size / 1024 / 1024).toFixed(2)} MB）`);
if (/<script[^>]+src=/i.test(html)) problems.push('有外部 script');
if (/<link[^>]+href=/i.test(html)) problems.push('有外部樣式');
if (/sourceMappingURL/.test(html)) problems.push('有 sourceMappingURL');
if (/https?:\/\//.test(html.replace(/https?:\/\/[^\s"'<>]*w3\.org[^\s"'<>]*/g, ''))) problems.push('有外部 URL');
if (html.includes('</script>') && html.split('</script>').length - 1 < 3) problems.push('script 標籤數異常');

console.log(`\n${outPath}`);
console.log(
  `${(size / 1024).toFixed(0)} KB / 2,048 KB 預算（${((size / BUDGET) * 100).toFixed(0)}%）；` +
    `${problems.length ? '✗ ' + problems.join('、') : '✓ 單檔、無外部資源'}`,
);
console.log(`（${((Date.now() - started) / 1000).toFixed(0)} 秒）`);
