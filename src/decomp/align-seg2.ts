#!/usr/bin/env bun
/**
 * 用「經號.段號」當比對單元，把 komyoji 的逐詞分析投影到我們的詞上。
 *
 *   bun run src/decomp/align-seg2.ts            # 全部
 *   bun run src/decomp/align-seg2.ts an1 dn1    # 只做這幾本
 *
 * 為什麼對：兩邊的 adb 用同一套 塊.段（CST chunk + pn），所以 `a6.7` 在兩邊指同一段。
 * 段內只有十幾個詞，直接做 LCS 就夠，不需要錨點或字元層 diff。
 *
 * 輸出 out/projection.tsv（file / line / k / our_form / pos / case / number / sent）
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const WORD_G = /[\p{L}\p{M}]+/gu;
const norm = (s: string): string => s.normalize('NFC').toLowerCase();

/* ── komyoji：sent_id → tokens ───────────────────────── */
type Tok = { form: string; pos: string; gc: string; num: string };
const bySent = new Map<string, Tok[]>();
{
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/tokens.tsv.gz')).toString('utf8').split('\n');
  const h = raw[0].split('\t');
  const iS = h.indexOf('sent_id'), iF = h.indexOf('form_clean'), iP = h.indexOf('pos');
  const iC = h.indexOf('case'), iN = h.indexOf('number');
  for (let k = 1; k < raw.length; k++) {
    const f = raw[k].split('\t');
    if (f.length <= Math.max(iS, iF, iP, iC, iN)) continue;
    const arr = bySent.get(f[iS]) ?? [];
    arr.push({ form: norm(f[iF]), pos: f[iP], gc: f[iC], num: f[iN] });
    bySent.set(f[iS], arr);
  }
}

/* ── align.tsv：sent_id → 我們的 (book, block, seg) ──── */
const sentSeg = new Map<string, string>(); // "book\tblock\tseg"
{
  for (const l of readFileSync('D:/2026/komyoji/out/align.tsv', 'utf8').split('\n').slice(1)) {
    const [sent, book, block, seg, , matched] = l.split('\t');
    if (!sent || matched !== '1' || !book || !block || !seg) continue;
    sentSeg.set(sent, `${book}\t${block}\t${seg}`);
  }
}

/* ── 我們的段：book → seg key → 詞 ───────────────────── */
type OurWord = { w: string; line: number; k: number };
const segCache = new Map<string, Map<string, OurWord[]>>();
function ourSegs(book: string): Map<string, OurWord[]> {
  const hit = segCache.get(book);
  if (hit) return hit;
  const out = new Map<string, OurWord[]>();
  const path = join(ROOT, 'data', 'cs', `${book}.xml`);
  const lines = readFileSync(path, 'utf8').split('\n');
  let block = '';
  let seg = '';
  lines.forEach((line, li) => {
    const b = /<塊 id="([^"]+)"/.exec(line);
    if (b) { block = b[1]; seg = ''; }
    const n = /<段 n="([^"]*)"\/>/.exec(line);
    if (n) seg = n[1];
    if (!block || !seg) return;
    const key = `${block}\t${seg}`;
    const arr = out.get(key) ?? [];
    (line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).forEach((raw, k) => {
      arr.push({ w: norm(raw), line: li + 1, k });
    });
    out.set(key, arr);
  });
  segCache.set(book, out);
  return out;
}

/* ── 段內 LCS ────────────────────────────────────────── */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      // 只認完全相同：近似比對會把不同詞配在一起（實測形相同率掉到 79%）
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { out.push([i - 1, j - 1]); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return out.reverse();
}

/* ── 主流程 ──────────────────────────────────────────── */
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const onlyBooks = new Set(want);

/* 把 komyoji 的 token 依 (book, block, seg) 分組 */
const grouped = new Map<string, Tok[]>();
for (const [sent, key] of sentSeg) {
  const toks = bySent.get(sent);
  if (!toks?.length) continue;
  const arr = grouped.get(key) ?? [];
  arr.push(...toks);
  grouped.set(key, arr);
}

let segs = 0;
let segsOk = 0;
let ourWords = 0;
let proj = 0;
let same = 0;
const rows: string[] = ['file\tline\tk\tour_form\tpos\tcase\tnumber\tsent'];
const coveredByFile = new Map<string, Set<number>>();

for (const [key, toks] of grouped) {
  const [book, block, seg] = key.split('\t');
  if (!book || (onlyBooks.size && !onlyBooks.has(book))) continue;
  let segsOfBook: Map<string, OurWord[]>;
  try { segsOfBook = ourSegs(book); } catch { continue; }
  const ours = segsOfBook.get(`${block}\t${seg}`);
  if (!ours?.length) continue;
  segs++;
  ourWords += ours.length;
  const pairs = lcsPairs(ours.map((x) => x.w), toks.map((t) => t.form));
  if (pairs.length) segsOk++;
  const set = coveredByFile.get(book) ?? new Set<number>();
  for (const [ai, bi] of pairs) {
    proj++;
    if (ours[ai].w === toks[bi].form) same++;
    const id = ours[ai].line * 10000 + ours[ai].k;
    if (!set.has(id)) {
      set.add(id);
      rows.push([book, ours[ai].line, ours[ai].k, ours[ai].w, toks[bi].pos, toks[bi].gc, toks[bi].num, `${book}/${block}/${seg}`].join('\t'));
    }
  }
  coveredByFile.set(book, set);
}

writeFileSync(join(ROOT, 'out', 'projection.tsv'), rows.join('\n') + '\n', 'utf8');
console.log(`段：${segs.toLocaleString()} 段（有對上 ${segsOk.toLocaleString()}）`);
console.log(`我們的詞 ${ourWords.toLocaleString()}；投影 ${proj.toLocaleString()}（${((proj / Math.max(1, ourWords)) * 100).toFixed(1)}%）；形相同 ${((same / Math.max(1, proj)) * 100).toFixed(1)}%`);
console.log(`out/projection.tsv（${rows.length - 1} 列）`);
