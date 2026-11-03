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
import { gzipSync, gunzipSync } from 'node:zlib';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR, DICT_DB } from './sources';
import { judge, loadDpdComp, loadExclusions, writeReview } from './dpd-comp';
import { judgePm1, loadPm1, loadPm1Exclusions, writePm1Review } from './pm1-comp';

const N = Number((process.argv.find((a) => a.startsWith('--n=')) ?? '--n=52000').slice(4)) || 52000;
/** 2 階詞只收前幾個（2 階在語料裡有九萬個，全收會爆 2 MB 預算） */
const DEEP2 = 21000;
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
/* 專名（proper_noun 670 條）：用語料詞形的前綴比對，把「suppiyo / suppiyassa」這種
   變格形也收進來，並附上專名的中文。 */
const zhExtra = new Map<string, string>();
{
  const db = new Database(DICT_DB, { readonly: true });
  const names = db.query('select pali_key, preferred_chinese, new_chinese from proper_noun').all() as {
    pali_key: string;
    preferred_chinese: string;
    new_chinese: string;
  }[];
  db.close();
  const sorted = [...counts.keys()].sort();
  let added = 0;
  for (const n of names) {
    const lemma = (n.pali_key || '').trim().toLowerCase();
    if (lemma.length < 3) continue;
    // a 結尾的名字，主格是 -o（suppiya → suppiyo），所以用去尾的詞基去比對
    const base = lemma.replace(/[aāiīuū]$/, '');
    if (base.length < 3) continue;
    const cn = (n.preferred_chinese || n.new_chinese || '').trim();
    if (!cn) continue;
    // 二分找「以 lemma 開頭」的區間
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < base) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < sorted.length; i++) {
      const w = sorted[i];
      if (!w.startsWith(base)) break;
      if (w.length > lemma.length + 6) continue;
      if ((counts.get(w) ?? 0) < 8) continue; // 罕見變格不補，省空間
      if (!wanted.has(w)) { wanted.set(w, counts.get(w) ?? 0); added++; }
      zhExtra.set(w, cn);
    }
  }
  console.log(`專名：${names.length} 條，補進 ${added} 個變格形`);
}
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

/* ── dpd 的第二層：pwa 說「原子」的詞，若 dpd 有詞級複合分析就接上去 ──
   只處理 pwa 單件（原子）的詞；數詞、詞綴、單字母等一律排除（見 dpd-comp.ts），
   作者另外用 data/cs-decomp/dpd-exclude.tsv 逐條排除。 */
const dpdComp = process.env.NO_DPD ? new Map<string, string[]>() : loadDpdComp();
const pm1Vig = process.env.NO_PM1 ? new Map<string, string[]>() : loadPm1();
const pm1Exclusions = loadPm1Exclusions();
const knownWords = new Set<string>();
const isKnown = (w: string): boolean => knownWords.has(w);
const exclusions = loadExclusions();
const stems = new Map<string, string>();
{
  const db = new Database(DICT_DB, { readonly: true });
  for (const r of db.query('select dict_key, dict_content from pwa').all() as {
    dict_key: string;
    dict_content: string;
  }[]) {
    knownWords.add(r.dict_key);
    if (!wanted.has(r.dict_key)) continue;
    const m = /\(([^()]*)\)\s*$/.exec(r.dict_content);
    const first = m ? m[1].split(',')[0].trim() : '';
    if (first) stems.set(r.dict_key, first);
  }
  for (const r of db.query('select dict_key from dpd').all() as { dict_key: string }[]) knownWords.add(r.dict_key);
  db.close();
}

/* 詞件的中文（OpenTipitaka 的 AI 中文詞典，80% 的詞件有）：初學者看詞件就知道意思。 */
const zhGloss = new Map<string, string>();
{
  const db = new Database(DICT_DB, { readonly: true });
  for (const r of db.query('select dict_key, dict_content from opentipitaka_dict_zh').all() as {
    dict_key: string;
    dict_content: string;
  }[]) {
    if (zhGloss.has(r.dict_key)) continue;
    const first = (r.dict_content.split('\n')[0] || '').trim();
    if (first) zhGloss.set(r.dict_key, first.replace(/^\d+[.、)]\s*/, '').slice(0, 24));
  }
  db.close();
}

interface Entry {
  w: string;
  n: number;
  d: number;
  t: Node[];
  dpd?: boolean;
  pm1?: boolean;
}
/* 先依詞名排序、再解析樹：詞件的 id 會照字母序發，彼此相似的名字排在一起，
   gzip 可以多省一成（之前照詞頻發 id，同一個資料大 120 KB）。 */
const entries: Entry[] = [...wanted.entries()]
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  .flatMap(([w, n]) => {
    const t = trees.get(w);
    return t ? [{ w, n, d: t.d, t: parseTree(t.t, idOf) }] : [];
  });

/* 第二趟：dpd 的第二層（pwa 說原子、dpd 有詞級複合分析的）。新詞件接在 id 尾端。 */
const review: { word: string; count: number; lemma: string; parts: string[]; verdict: ReturnType<typeof judge> }[] = [];
for (const entry of entries) {
  if (entry.d !== 0) continue;
  const lemma = stems.get(entry.w) ?? '';
  const parts = lemma ? dpdComp.get(lemma) : undefined;
  if (!parts) continue;
  const verdict = judge(entry.w, lemma, parts, exclusions, isKnown);
  review.push({ word: entry.w, count: entry.n, lemma, parts, verdict });
  if (!verdict.ok) continue;
  entry.t = parts.map((x) => idOf(x));
  entry.d = 1;
  entry.dpd = true;
}
const reviewFile = writeReview(review);
const usedDpd = review.filter((r) => r.verdict.ok).length;
console.log(`dpd 第二層：候選 ${review.length}，採用 ${usedDpd}，排除 ${review.length - usedDpd}（${reviewFile}）`);

/* 第三層：pm1 的 viggaha（緬文詞解析，mm2iast 轉寫）。dpd 已經接過的就不動。 */
const pm1Review: { word: string; count: number; lemma: string; parts: string[]; verdict: ReturnType<typeof judgePm1> }[] = [];
for (const entry of entries) {
  if (entry.d !== 0) continue;
  const lemma = stems.get(entry.w) ?? '';
  const parts = pm1Vig.get(entry.w) ?? (lemma ? pm1Vig.get(lemma) : undefined);
  if (!parts) continue;
  const verdict = judgePm1(entry.w, lemma, parts, pm1Exclusions, isKnown, (x) => atomInfo.get(x)?.n ?? 0);
  pm1Review.push({ word: entry.w, count: entry.n, lemma, parts, verdict });
  if (!verdict.ok) continue;
  entry.t = parts.map((x) => idOf(x));
  entry.d = 1;
  entry.pm1 = true;
}
const pm1File = writePm1Review(pm1Review);
const usedPm1 = pm1Review.filter((r) => r.verdict.ok).length;
console.log(`pm1 第三層：候選 ${pm1Review.length}，採用 ${usedPm1}，排除 ${pm1Review.length - usedPm1}（${pm1File}）`);

/* 詞性：從 dpd 的 grammar 第一行抓（masc/fem/nt、adj、pr、pp、ind、pron、card…），
   折成 8 類，逐詞一個字元（"0"＝沒有），gzip 後很小。 */
const POS_CODE: [RegExp, string][] = [
  [/^(masc|fem|nt)\b/, '1'],
  [/^adj\b/, '2'],
  [/^(pr|aor|imper|opt|cond|imperf|perf|fut)\b/, '3'],
  [/^(pp|prp|ppa|ptp|ger|abs|inf)\b/, '4'],
  [/^(ind|adv|conj|prep|prefix|sandhi)\b/, '5'],
  [/^pron\b/, '6'],
  [/^(card|ordin|number)\b/, '7'],
];
const dpdGrammar = new Map<string, string>();
{
  const db = new Database(DICT_DB, { readonly: true });
  for (const r of db.query('select dict_key, dict_content from dpd').all() as {
    dict_key: string;
    dict_content: string;
  }[]) {
    if (!dpdGrammar.has(r.dict_key)) dpdGrammar.set(r.dict_key, (r.dict_content.split('\n')[0] || '').trim());
  }
  db.close();
}
const posOf = (word: string): string => {
  const lemma = stems.get(word) ?? word;
  const g = dpdGrammar.get(lemma) ?? dpdGrammar.get(word) ?? '';
  if (!g) return '0';
  for (const [re, code] of POS_CODE) if (re.test(g)) return code;
  return '0';
};

/* 詞形已經排好序，這裡直接做「共用前綴」壓縮：[共用幾個字, 剩下的字, 次數, 階數, 樹]。 */
const sortedEntries = entries;
type WordTuple = [number, string, number, number] | [number, string, number, number, Node[]];
const words: WordTuple[] = [];
const dpdWords: number[] = [];
const pm1Words: number[] = [];
let prevName = '';
sortedEntries.forEach((e, i) => {
  const lim = Math.min(e.w.length, prevName.length);
  let k = 0;
  while (k < lim && prevName[k] === e.w[k]) k++;
  // 原子詞（d=0）的樹只有它自己，不必存；客戶端用 atomByName 還原
  if (e.d === 0) words.push([k, e.w.slice(k), e.n, e.d]);
  else words.push([k, e.w.slice(k), e.n, e.d, e.t]);
  if (e.dpd) dpdWords.push(i);
  if (e.pm1) pm1Words.push(i);
  prevName = e.w;
});
const posStr = sortedEntries.map((e) => posOf(e.w)).join('');
console.log('詞性：' + posStr.split('').filter((c) => c !== '0').length + ' / ' + posStr.length);

/* 原子詞的詞幹：沒有詞件可看的時候，至少知道它的字典形（pwa 的 stem）。 */
const stemPairs: [number, string][] = [];
words.forEach((row, i) => {
  if (row[3] !== 0) return;
  const name = prevNameOf(i);
  const stem = stems.get(name);
  if (stem && stem !== name) stemPairs.push([i, stem]);
});
function prevNameOf(i: number): string {
  // words 是前綴壓縮的，這裡直接用已還原的 entries（同序）
  return entries[i].w;
}
/* 整詞中文：初學者最想先看到的一句。按詞頻挑，控制在字數預算內。 */
const ZHT_BUDGET = 400000; // 空間不是問題：幾乎全部有中文的詞都放
const zhtPairs: [number, string][] = [];
{
  let chars = 0;
  const cand = entries
    .map((e, i) => ({
      i,
      w: e.w,
      n: e.n,
      pn: zhExtra.has(e.w),
      g: zhExtra.get(e.w) ?? zhGloss.get(e.w) ?? zhGloss.get(stems.get(e.w) ?? ''),
    }))
    .filter((x) => !!x.g)
    .sort((a, b) => Number(b.pn) - Number(a.pn) || b.n - a.n); // 專名優先 */

  for (const x of cand) {
    if (chars + x.g!.length > ZHT_BUDGET) continue;
    chars += x.g!.length;
    zhtPairs.push([x.i, x.g!]);
  }
  zhtPairs.sort((a, b) => a[0] - b[0]);
  console.log(`整詞中文：${zhtPairs.length} 個（${chars} 字）`);
}

/* PTS 英文釋義（sc-data 精修版）：詞形優先，沒有就用詞幹；用句池去重 */
const ptsPool: string[] = [];
const ptsIdx = new Map<string, number>();
const ptsPairs: [number, number][] = [];
{
  const pts = new Map<string, string>();
  try {
    const gz = gunzipSync(readFileSync(join(ROOT, 'data', 'sc-dict', 'pts.tsv.gz')));
    for (const line of gz.toString('utf8').split('\n').slice(1)) {
      if (!line) continue;
      const i = line.indexOf('\t');
      if (i < 0) continue;
      pts.set(line.slice(0, i), line.slice(i + 1));
    }
  } catch { /* 沒有就略過 */ }
  entries.forEach((e, i) => {
    const raw = pts.get(e.w) ?? pts.get(stems.get(e.w) ?? '');
    if (!raw) return;
    // 只留前面一小段；若這條還有「第二個同形詞」（PTS 寫 Dīpa 2…），多留一點
    const cut = / [23] /.test(raw) ? 900 : 300;
    const text = raw.length <= cut ? raw : raw.slice(0, cut).replace(/[ ,;]+\S*$/, '') + '…';
    let k = ptsIdx.get(text);
    if (k == null) { k = ptsPool.length; ptsPool.push(text); ptsIdx.set(text, k); }
    ptsPairs.push([i, k]);
  });
  console.log(`PTS 釋義：${ptsPairs.length.toLocaleString()} 個詞、句池 ${ptsPool.length.toLocaleString()} 條`);
}

/* 多義詞：把中文詞典的編號義項列出來（2–5 義） */
const sensePairs: [number, string[]][] = [];
{
  const senses = new Map<string, string[]>();
  try {
    const db = new Database(DICT_DB, { readonly: true });
    for (const r of db.query('select dict_key, dict_content from opentipitaka_dict_zh').all() as {
      dict_key: string;
      dict_content: string;
    }[]) {
      if (senses.has(r.dict_key)) continue;
      const parts = String(r.dict_content).split(/\n(?=\d+\.\s)/).map((x) => x.trim()).filter(Boolean);
      if (parts.length >= 2) senses.set(r.dict_key, parts);
    }
    db.close();
  } catch { /* 沒有詞典就略過 */ }
  entries.forEach((e, i) => {
    const list = senses.get(e.w);
    if (!list || list.length > 5) return;
    sensePairs.push([i, list.map((x) => x.replace(/\s+/g, ' ').slice(0, 60))]);
  });
  console.log(`多義詞：${sensePairs.length.toLocaleString()} 個`);
}

/* 例句：每個詞挑 2 句最短的經文行（去標籤），用共用句池存放 */
const exPool: string[] = [];
const exIndex = new Map<string, number>();
let exPairs: [number, number[]][] = [];
{
  const dir = join(ROOT, 'data', 'cs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
  const want = new Set(entries.map((e) => e.w));
  const got = new Map<string, string[]>();
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    for (const line of lines) {
      const plain = line.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plain.length < 20 || plain.length > 160) continue;
      for (const w of plain.match(WORD_G) ?? []) {
        if (!want.has(w)) continue;
        const arr = got.get(w) ?? [];
        if (arr.length >= 10) continue; // 先收 10 句，之後挑最短的兩句
        if (arr.includes(plain)) continue;
        arr.push(plain);
        got.set(w, arr);
      }
    }
  }
  const idxOf = new Map<string, number>();
  exPairs = entries.map((e, i) => {
    const lines = (got.get(e.w) ?? []).slice().sort((a, b) => a.length - b.length).slice(0, 2);
    const ids: number[] = [];
    for (const ln of lines) {
      let k = idxOf.get(ln);
      if (k == null) { k = exPool.length; exPool.push(ln); idxOf.set(ln, k); }
      ids.push(k);
    }
    return [i, ids];
  }).filter(([, ids]) => ids.length) as [number, number[]][];
  console.log(`例句：${exPairs.length} 個詞、句池 ${exPool.length} 句`);
}

/* 格位分佈（詞幹 → 「主80,対20」）：komyoji 逐次標註＋推估，覆蓋全語料 */
const casePairs: [number, number, string][] = [];
{
  // 用「詞形」的分佈（case-by-word.tsv）：使用者看的是 dhammaṃ 這種形，
  // 不是詞幹——一個形有幾種格位，才是他要的資訊。
  const caseOf = new Map<string, [number, string]>();
  const CASE_COLS = ['主', '対', '具', '与', '奪', '属', '処', '呼'];
  try {
    for (const line of readFileSync(join(OUT_DIR, 'case-by-word.tsv'), 'utf8').split('\n').slice(1)) {
      const f = line.split('\t');
      if (!f[0]) continue;
      const total = Number(f[1]) || 0;
      if (!total) continue;
      const parts: string[] = [];
      CASE_COLS.forEach((c, k) => {
        const n = Number(f[2 + k]) || 0;
        const pct = Math.round((n / total) * 100);
        if (pct >= 1) parts.push(`${c}${pct}`);
      });
      if (parts.length) caseOf.set(f[0], [total, parts.join(',')]);
    }
  } catch { /* 沒有就略過 */ }
  // 只放高頻的（預算有限；低頻詞的格位分佈參考價值也低）
  const cand: [number, number, string, number][] = [];
  entries.forEach((e, i) => {
    const c = caseOf.get(e.w);
    if (c) cand.push([i, c[0], c[1], e.n]);
  });
  cand.sort((a, b) => b[3] - a[3]);
  for (const [i, total, str] of cand) casePairs.push([i, total, str]); // 全部有樣本的詞形
  casePairs.sort((a, b) => a[0] - b[0]);
  console.log(`格位分佈：${casePairs.length} 個詞（候選 ${cand.length}）`);
}

/* 全詞格位推估：沒有金標樣本的詞，用模型給一個（約八成準），在畫面上標「推估」 */
let guessStr = '';
let guessStr2 = '';
{
  const guess = new Map<string, string>();
  const guess2 = new Map<string, string>();
  try {
    for (const line of readFileSync(join(OUT_DIR, 'case-by-word-model.tsv'), 'utf8').split('\n').slice(1)) {
      const [w, , gc, , , gc2] = line.split('\t');
      if (w && gc) guess.set(w, gc);
      if (w && gc2) guess2.set(w, gc2);
    }
  } catch { /* 沒有就略過 */ }
  const gold = new Set<string>();
  for (const [i] of casePairs) gold.add(entries[i].w);
  const CASES = '主対具与奪属処呼';
  const chars: string[] = [];
  for (const e of entries) {
    if (gold.has(e.w)) { chars.push('-'); continue; }
    const g = guess.get(e.w);
    const k = g ? CASES.indexOf(g) : -1;
    chars.push(k >= 0 ? CASES[k] : '-');
  }
  guessStr = chars.join('');
  // 第二可能（同樣一字元一詞）
  const chars2: string[] = [];
  for (const e of entries) {
    if (gold.has(e.w)) { chars2.push('-'); continue; }
    const g2 = guess2.get(e.w);
    const k = g2 ? CASES.indexOf(g2) : -1;
    chars2.push(k >= 0 ? CASES[k] : '-');
  }
  guessStr2 = chars2.join('');
  console.log(`格位推估：${[...guessStr].filter((c) => c !== '-').length} 個詞（其中 ${[...guessStr2].filter((c) => c !== '-').length} 有第二可能）`);
}

/* 大魔王的上下文提示（接什麼詞性時偏向哪個格位） */
const hintPairs: [number, string][] = [];
{
  const hintOf = new Map<string, string>();
  try {
    for (const line of readFileSync(join(OUT_DIR, 'case-hints.tsv'), 'utf8').split('\n').slice(1)) {
      const [w, hint] = line.split('\t');
      if (w && hint) hintOf.set(w, hint);
    }
  } catch { /* 沒有就略過 */ }
  entries.forEach((e, i) => {
    const h2 = hintOf.get(e.w);
    if (h2) hintPairs.push([i, h2]);
  });
  console.log(`上下文提示：${hintPairs.length} 個詞`);
}

/* 詞件 → 中文（只收這份資料裡真的用到的詞件） */
const zhPairs: [number, string][] = [];
atoms.forEach((a, i) => {
  if ((a.n || 0) < 50) return; // 只給常用詞件中文（省空間）
  const g = zhGloss.get(a.s) ?? zhGloss.get(a.a) ?? zhExtra.get(a.a);
  if (g) zhPairs.push([i, g]);
});
console.log(`有中文的詞件：${zhPairs.length}/${atoms.length}`);
console.log(`有樹的 ${words.length} 個；組索引…`);

/* 索引壓成「每個詞件幾個詞 ＋ 差分編碼的詞序」：
     n[i] = 第 i 個詞件有幾個詞；d[] = 那些詞的索引（同一個詞件內遞增，存差值）。
   JSON 物件改成平坦整數，gzip 之後再省一成七。 */
const byAtom: number[][] = atoms.map(() => []);
entries.forEach((e, i) => {
  const leaves: number[] = [];
  collectLeaves(e.t, leaves);
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

const data = { format: 'prefix', words, atoms, idx: { n: idxN, d: idxD }, dpd: dpdWords, pm1: pm1Words, stems: stemPairs, zh: zhPairs, zht: zhtPairs, cs: casePairs, guess: guessStr, guess2: guessStr2, senses: sensePairs, pts: [ptsPool, ptsPairs], hints: hintPairs, ex: [exPool, exPairs], pos: posStr, meta: { tokens, books } };
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
    <div class="seg" role="group" aria-label="模式">
      <button data-mode="list" aria-pressed="true">詞表</button>
      <button data-mode="text" aria-pressed="false">讀經文</button>
    </div>
    <span id="meta" class="badge"></span>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="主題">
        <button data-theme-btn="dark" aria-pressed="true">暗</button>
        <button data-theme-btn="light" aria-pressed="false">亮</button>
        <button data-theme-btn="eye" aria-pressed="false">護</button>
      </div>
      <button class="iconbtn" id="help" aria-label="使用說明" title="使用說明">?</button>
      <button class="iconbtn" id="fsminus" aria-label="字級變小">A-</button>
      <button class="iconbtn" id="fsplus" aria-label="字級變大">A+</button>
    </div>
  </header>
  <main id="panes">
    <section class="pane" aria-label="詞表">
      <h2>詞表</h2>
      <div class="tabs" role="group" aria-label="篩選">
        <button data-filter="all" aria-selected="true">全部</button>
        <button data-filter="split" aria-selected="false">有拆分</button>
        <button data-filter="deep" aria-selected="false">多階</button>
        <button data-filter="family" aria-selected="false">詞族</button>
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
  <section id="reader" hidden aria-label="讀經文">
    <div class="reader-bar">
      <label class="reader-label">貼一段巴利文（或用下面的示範）：</label>
      <button class="iconbtn" id="demo">示範</button>
      <label class="check"><input type="checkbox" id="showzh"> 每詞顯示中文</label>
      <span id="readstats" class="badge"></span>
    </div>
    <textarea id="pali" spellcheck="false" placeholder="例：Evaṃ me sutaṃ – ekaṃ samayaṃ bhagavā …"></textarea>
    <div id="readout" aria-live="polite"></div>
    <div id="missbox" class="missbox" hidden></div>
  </section>
  <aside id="pop" class="pop" hidden aria-live="polite"></aside>
  <div id="guide" class="guide" hidden role="dialog" aria-modal="true" aria-labelledby="guide-title">
    <div class="guide-box">
      <h2 id="guide-title">怎麼用</h2>
      <ol class="guide-steps">
        <li><b>查一個詞</b>：左邊打幾個字母（按 <kbd>/</kbd>），點下去就看到它的拆解、詞幹與詞義。</li>
        <li><b>讀一段經文</b>：右上切到「讀經文」，貼上巴利文；每一詞都可以點，勾「每詞顯示中文」變成行間注。</li>
        <li><b>收集生詞</b>：讀經時下方會列出不認得的詞，可以複製或下載 TSV，當下一批要補的詞。</li>
      </ol>
      <p class="guide-note">拆解分三層：pwa（詞形分析，最多）、dpd（詞級複合）、pm1（緬甸辭典的詞解析）。<br>
        拆解下方若出現「⚠」，表示有詞件不是詞典裡的詞，那個拆法可能只是機械切分，請以詞義為準。</p>
      <button class="iconbtn" id="guide-close">知道了</button>
    </div>
  </div>
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
// 作者指示：空間不是問題，不要為了 2 MB 犧牲內容（early optimization is the root of evil）
const BUDGET = 12 * 1024 * 1024;
const problems: string[] = [];
if (size > BUDGET) problems.push(`超過 8 MB 上限（${(size / 1024 / 1024).toFixed(2)} MB）`);
if (/<script[^>]+src=/i.test(html)) problems.push('有外部 script');
if (/<link[^>]+href=/i.test(html)) problems.push('有外部樣式');
if (/sourceMappingURL/.test(html)) problems.push('有 sourceMappingURL');
if (/https?:\/\//.test(html.replace(/https?:\/\/[^\s"'<>]*w3\.org[^\s"'<>]*/g, ''))) problems.push('有外部 URL');
if (html.includes('</script>') && html.split('</script>').length - 1 < 3) problems.push('script 標籤數異常');

console.log(`\n${outPath}`);
console.log(
  `${(size / 1024).toFixed(0)} KB / 12,288 KB 上限（${((size / BUDGET) * 100).toFixed(0)}%）；` +
    `${problems.length ? '✗ ' + problems.join('、') : '✓ 單檔、無外部資源'}`,
);
console.log(`（${((Date.now() - started) / 1000).toFixed(0)} 秒）`);
