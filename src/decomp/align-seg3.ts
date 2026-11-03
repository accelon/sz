#!/usr/bin/env bun
/**
 * 段內字元對位：處理「連音切法不同」（我們 `ekarūpampi`、komyoji `ekarūpaṃ pi`）。
 *
 *   bun run src/decomp/align-seg3.ts [book…]
 *
 * 與 align-seg2 的差別：seg2 只配「形式完全相同」的詞（精度 100%、覆蓋 42.5%）；
 * 這一版在段內做字元層對位，詞界不同也能對上，代價是配對要再驗證。
 *
 * 輸出 out/projection.tsv（與 seg2 同格式）
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const WORD_G = /[\p{L}\p{M}]+/gu;
const KEEP = /[\p{L}\p{M}]/u;
const norm = (s: string): string => s.normalize('NFC').toLowerCase();

type Tok = { form: string; pos: string; gc: string; num: string };

/* komyoji tokens */
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
/* align：sent → 段 */
const sent2seg = new Map<string, string>();
for (const l of readFileSync('D:/2026/komyoji/out/align.tsv', 'utf8').split('\n').slice(1)) {
  const [sent, book, block, seg, , matched] = l.split('\t');
  if (!sent || matched !== '1' || !book || !block || !seg) continue;
  sent2seg.set(sent, `${book}\t${block}\t${seg}`);
}
/* 段 → tokens（依句子順序） */
const segToks = new Map<string, Tok[]>();
for (const [sent, key] of sent2seg) {
  const t = bySent.get(sent);
  if (!t?.length) continue;
  const arr = segToks.get(key) ?? [];
  arr.push(...t);
  segToks.set(key, arr);
}

/* 我們的段 */
type W = { w: string; line: number; k: number };
const segWords = new Map<string, W[]>();
const loadBook = (book: string): void => {
  const lines = readFileSync(join(ROOT, 'data', 'cs', `${book}.xml`), 'utf8').split('\n');
  let block = '';
  let seg = '';
  lines.forEach((line, li) => {
    const b = /<塊 id="([^"]+)"/.exec(line);
    if (b) { block = b[1]; seg = ''; }
    const n = /<段 n="([^"]*)"\/>/.exec(line);
    if (n) seg = n[1];
    if (!block || !seg) return;
    const key = `${book}\t${block}\t${seg}`;
    const arr = segWords.get(key) ?? [];
    (line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).forEach((raw, k) => {
      arr.push({ w: norm(raw), line: li + 1, k });
    });
    segWords.set(key, arr);
  });
};

/** 字元流（記錄每字元屬於哪個詞／token） */
function stream<T>(items: T[], text: (x: T) => string): { chars: string; owner: number[] } {
  let chars = '';
  const owner: number[] = [];
  items.forEach((it, i) => {
    for (const c of text(it)) if (KEEP.test(c)) { chars += c; owner.push(i); }
  });
  return { chars, owner };
}

/** 貪婪字元對位（段內很短，視窗 24 就夠） */
function runs(a: string, b: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  let i = 0;
  let j = 0;
  const WIN = 24;
  const LOOK = 24;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      const s0 = i;
      const t0 = j;
      let len = 0;
      while (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; len++; }
      out.push([s0, t0, len]);
      continue;
    }
    let best: [number, number] | null = null;
    let bestCost = Infinity;
    for (let dx = 1; dx <= LOOK; dx++) {
      if (i + dx + WIN > a.length) break;
      const key = a.slice(i + dx, i + dx + WIN);
      for (let dy = 0; dy <= LOOK; dy++) {
        if (j + dy + WIN > b.length) break;
        if (key === b.slice(j + dy, j + dy + WIN)) {
          if (dx + dy < bestCost) { bestCost = dx + dy; best = [dx, dy]; }
          break;
        }
      }
      if (best && bestCost <= dx) break;
    }
    if (!best) break;
    i += best[0];
    j += best[1];
  }
  return out;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const books = args.length ? args : [...new Set([...segToks.keys()].map((k) => k.split('\t')[0]))];
for (const b of books) { try { loadBook(b); } catch { /* 沒有檔 */ } }

const rows: string[] = ['file\tline\tk\tour_form\tpos\tcase\tnumber\tsent'];
let ourWords = 0;
let projected = 0;
let exact = 0;
let partial = 0;
let segs = 0;

for (const [key, toks] of segToks) {
  const [book, block, seg] = key.split('\t');
  const ours = segWords.get(key);
  if (!ours?.length) continue;
  segs++;
  ourWords += ours.length;
  const A = stream(ours, (x) => x.w);
  const B = stream(toks, (t) => t.form);
  const rs = runs(A.chars, B.chars);
  // 建立：我們的字元 → komyoji token
  const map = new Map<number, number>();
  for (const [ai, bi, len] of rs) for (let t = 0; t < len; t++) map.set(ai + t, B.owner[bi + t]);
  // 逐詞：整段字元都落在同一個 token
  let c = 0;
  for (let w = 0; w < ours.length; w++) {
    const n = [...ours[w].w].filter((x) => KEEP.test(x)).length;
    if (!n) continue;
    const start = c;
    c += n;
    // 多數決：這個詞的字元有多少落在哪個 token 上；≥60% 就採用
    const cover = new Map<number, number>();
    let mapped = 0;
    for (let t = start; t < start + n; t++) {
      const k = map.get(t);
      if (k == null) continue;
      mapped++;
      cover.set(k, (cover.get(k) ?? 0) + 1);
    }
    if (!cover.size || mapped / n < 0.6) continue;
    let target = -1;
    let best = 0;
    for (const [k, c] of cover) if (c > best) { best = c; target = k; }
    if (target < 0) continue;
    projected++;
    if (ours[w].w === toks[target].form) exact++;
    else partial++;
    rows.push([book, ours[w].line, ours[w].k, ours[w].w, toks[target].pos, toks[target].gc, toks[target].num, `${book}/${block}/${seg}`].join('\t'));
  }
}

writeFileSync(join(ROOT, 'out', 'projection.tsv'), rows.join('\n') + '\n', 'utf8');
console.log(`段 ${segs.toLocaleString()}；我們的詞 ${ourWords.toLocaleString()}；投影 ${projected.toLocaleString()}（${((projected / Math.max(1, ourWords)) * 100).toFixed(1)}%）；形完全相同 ${((exact / Math.max(1, projected)) * 100).toFixed(1)}%、部分 ${partial.toLocaleString()}`);
console.log('out/projection.tsv');
