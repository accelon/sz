#!/usr/bin/env bun
/**
 * komyoji 逐詞分析 → 我們的經文（多對一對應）。
 *
 *   bun run src/decomp/align-project.ts --all          # 所有 komyoji 書前綴
 *   bun run src/decomp/align-project.ts an01 dn01      # 指定前綴
 *
 * 重點：komyoji 的「書」與我們的檔案不是一對一（`dn01` 是一個經，`dn1.xml` 是整冊），
 * 所以每個前綴先用**詞彙重疊**挑最像的檔，再對該檔做詞序列對位；
 * 同一檔可以接收多個前綴的投影。
 *
 * 輸出 out/projection.tsv：file / line / k / our_form / pos / case / number / komyoji_sent
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const WORD_G = /[\p{L}\p{M}]+/gu;
const norm = (s: string): string => s.normalize('NFC').toLowerCase();

type Tok = { form: string; pos: string; gc: string; num: string };

/* ── komyoji ─────────────────────────────────────────── */
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
const order: string[] = [];
{
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/sentences.tsv.gz')).toString('utf8').split('\n');
  const h = raw[0].split('\t');
  const iS = h.indexOf('sent_id');
  for (let k = 1; k < raw.length; k++) {
    const id = raw[k].split('\t')[iS];
    if (id) order.push(id);
  }
}

/* ── 我們的檔案 ──────────────────────────────────────── */
const DATA = join(ROOT, 'data', 'cs');
const FILES = readdirSync(DATA).filter((f) => f.endsWith('.xml') && f !== '00.xml');
type W = { w: string; line: number; k: number };
const cache = new Map<string, { words: W[]; vocab: Map<string, number> }>();
const load = (file: string): { words: W[]; vocab: Map<string, number> } => {
  const hit = cache.get(file);
  if (hit) return hit;
  const words: W[] = [];
  const vocab = new Map<string, number>();
  const lines = readFileSync(join(DATA, file), 'utf8').split('\n');
  lines.forEach((line, li) => {
    (line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).forEach((raw, k) => {
      const w = norm(raw);
      words.push({ w, line: li + 1, k });
      vocab.set(w, (vocab.get(w) ?? 0) + 1);
    });
  });
  const v = { words, vocab };
  cache.set(file, v);
  return v;
};

/* ── 詞序列對位（三元錨點 + LIS + 小區間 LCS）────────── */
function align(ours: string[], kmj: string[]): [number, number][] {
  const pairs: [number, number][] = [];
  const index = (seq: string[]): Map<string, number[]> => {
    const m = new Map<string, number[]>();
    for (let i = 0; i + 2 < seq.length; i++) {
      const key = `${seq[i]} ${seq[i + 1]} ${seq[i + 2]}`;
      const arr = m.get(key) ?? [];
      if (arr.length < 2) arr.push(i);
      m.set(key, arr);
    }
    return m;
  };
  const a = index(ours);
  const b = index(kmj);
  const anchors: [number, number][] = [];
  for (const [key, pa] of a) {
    const pb = b.get(key);
    if (!pb || pa.length !== 1 || pb.length !== 1) continue;
    anchors.push([pa[0], pb[0]]);
  }
  anchors.sort((x, y) => x[0] - y[0]);
  const tails: number[] = [];
  const prev = new Array<number>(anchors.length).fill(-1);
  const idxOf: number[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const v = anchors[i][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[tails[mid]][1] < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
    idxOf[lo] = i;
  }
  const chain: [number, number][] = [];
  let cur = tails.length ? idxOf[tails.length - 1] : -1;
  while (cur >= 0) { chain.push(anchors[cur]); cur = prev[cur]; }
  chain.reverse();

  const bounds: [number, number][] = [[-1, -1], ...chain, [ours.length, kmj.length]];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [a0, b0] = bounds[i];
    const [a1, b1] = bounds[i + 1];
    const lenA = a1 - a0 - 1;
    const lenB = b1 - b0 - 1;
    if (lenA === lenB) {
      for (let t = 1; t <= lenA; t++) pairs.push([a0 + t, b0 + t]);
    } else if (lenA > 0 && lenB > 0 && lenA <= 300 && lenB <= 300) {
      const n = lenA;
      const m = lenB;
      const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
      for (let x = 1; x <= n; x++) {
        for (let y = 1; y <= m; y++) {
          dp[x][y] = ours[a0 + x] === kmj[b0 + y] ? dp[x - 1][y - 1] + 1 : Math.max(dp[x - 1][y], dp[x][y - 1]);
        }
      }
      let x = n;
      let y = m;
      const rev: [number, number][] = [];
      while (x > 0 && y > 0) {
        if (ours[a0 + x] === kmj[b0 + y]) { rev.push([a0 + x, b0 + y]); x--; y--; }
        else if (dp[x - 1][y] >= dp[x][y - 1]) x--;
        else y--;
      }
      for (const p of rev.reverse()) pairs.push(p);
    }
  }
  for (const [ai, bi] of chain) pairs.push([ai + 1, bi + 1]);
  pairs.sort((x, y) => x[0] - y[0]);
  return pairs;
}

/* ── 主流程 ──────────────────────────────────────────── */
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const prefixes = args.filter((a) => !a.startsWith('--'));
const allPrefixes = [...new Set(order.map((id) => id.split('/')[1]).filter(Boolean))];
const targets = ALL ? allPrefixes : prefixes;

const rows: string[] = ['file\tline\tk\tour_form\tpos\tcase\tnumber\tsent'];
const proj = new Map<string, Map<number, Tok>>(); // file → 詞序 → 特徵
let totalPairs = 0;
let totalSame = 0;

for (const prefix of targets) {
  const kmj: Tok[] = [];
  const sents: string[] = [];
  for (const id of order) {
    const seg = id.split('/');
    if (seg.length > 1 && seg[1].startsWith(prefix)) {
      const t = bySent.get(id);
      if (t) { kmj.push(...t); for (let i = 0; i < t.length; i++) sents.push(id); }
    }
  }
  if (!kmj.length) continue;
  // 詞彙重疊挑最像的檔
  const kmjVocab = new Set(kmj.map((t) => t.form));
  let best = '';
  let bestScore = -1;
  for (const f of FILES) {
    const { vocab } = load(f);
    let hit = 0;
    for (const w of kmjVocab) if (vocab.has(w)) hit++;
    const score = hit / Math.max(1, kmjVocab.size) - 1e-7 * vocab.size;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  if (!best) continue;

  const ours = load(best).words;
  const pairs = align(ours.map((x) => x.w), kmj.map((t) => t.form));
  const m = proj.get(best) ?? new Map<number, Tok>();
  let same = 0;
  for (const [ai, bi] of pairs) {
    if (ours[ai].w === kmj[bi].form) same++;
    if (!m.has(ai)) {
      m.set(ai, kmj[bi]);
      rows.push([best, ours[ai].line, ours[ai].k, ours[ai].w, kmj[bi].pos, kmj[bi].gc, kmj[bi].num, sents[bi]].join('\t'));
    }
  }
  proj.set(best, m);
  totalPairs += pairs.length;
  totalSame += same;
  console.log(`${prefix.padEnd(6)} → ${best.padEnd(12)} 對上 ${String(pairs.length).padStart(6)}（形相同 ${((same / Math.max(1, pairs.length)) * 100).toFixed(1)}%）`);
}

console.log('');
let covered = 0;
let words = 0;
for (const f of FILES) {
  const m = proj.get(f);
  if (!m) continue;
  const total = load(f).words.length;
  covered += m.size;
  words += total;
  console.log(`  ${f.padEnd(12)} 覆蓋 ${String(m.size).padStart(7)} / ${String(total).padStart(7)}（${((m.size / total) * 100).toFixed(1)}%）`);
}
console.log(`\n合計：投影 ${covered.toLocaleString()} 詞 / 我們有 ${words.toLocaleString()} 詞（${((covered / Math.max(1, words)) * 100).toFixed(1)}%）；配對 ${totalPairs.toLocaleString()}、形相同 ${((totalSame / Math.max(1, totalPairs)) * 100).toFixed(1)}%`);
writeFileSync(join(ROOT, 'out', 'projection.tsv'), rows.join('\n') + '\n', 'utf8');
console.log('out/projection.tsv');
