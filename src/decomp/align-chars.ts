#!/usr/bin/env bun
/**
 * 字元層對位：把 komyoji 的逐詞分析投影到我們的詞上。
 *
 *   bun run src/decomp/align-chars.ts an01 [dn01 …] [--sample te]
 *
 * 為什麼用字元層：兩邊底本相同（VRI），差別只在標題、段號、大小寫、空白與連音切法。
 * 去掉這些之後，正文是同一個字元序列（實測 an01 與 an1.xml 完全對得上）。
 *
 * 做法：
 *   1. 兩邊各自把詞串成字元流（小寫、去空白標點數字），並記「字元 → 詞」
 *   2. 兩條字元流做貪婪對位（相同就前進；不同就向後找 ≤80 字的重新同步點）
 *   3. 對上的字元區間逐字投影；我們的詞如果整段都落在對上的區間，就配到
 *      對應的 komyoji token
 *   4. 量：投影率、形相同率、格位分佈
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const WORD_G = /[\p{L}\p{M}]+/gu;
const args = process.argv.slice(2);
const sIdx = args.indexOf('--sample');
const sampleForm = sIdx >= 0 ? args[sIdx + 1] : '';
const targets = args.filter((a, i) => !a.startsWith('--') && i !== sIdx + 1);
const PREFIXES = targets.length ? targets : ['an01'];

const normChar = (s: string): string => s.normalize('NFC').toLowerCase();
const KEEP = /[\p{L}\p{M}]/u;

/* ── komyoji ─────────────────────────────────────────── */
type Tok = { form: string; pos: string; gcase: string; num: string };
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
    arr.push({ form: normChar(f[iF]), pos: f[iP], gcase: f[iC], num: f[iN] });
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

/* ── 字元流 ──────────────────────────────────────────── */
function stream(words: string[]): { chars: string; owner: Int32Array } {
  let chars = '';
  const owner: number[] = [];
  words.forEach((w, i) => {
    for (const c of w) if (KEEP.test(c)) { chars += c; owner.push(i); }
  });
  return { chars, owner: Int32Array.from(owner) };
}

/** 貪婪對位＋重新同步：回傳 [ourStart, kmjStart, len] 區間 */
function diffRuns(a: string, b: string): [number, number, number][] {
  const runs: [number, number, number][] = [];
  const WIN = 24;      // 重新同步時要求的連續相同長度
  const LOOK = 400;    // 最多往後找多少字
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      const s0 = i;
      const t0 = j;
      let len = 0;
      while (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; len++; }
      runs.push([s0, t0, len]);
      continue;
    }
    // 找重新同步點：最小的 dx+dy，使 a[i+dx..+WIN) === b[j+dy..+WIN)
    let best: [number, number] | null = null;
    let bestCost = Infinity;
    for (let dx = 0; dx <= LOOK; dx++) {
      if (i + dx + WIN > a.length) break;
      const keyA = a.slice(i + dx, i + dx + WIN);
      for (let dy = 0; dy <= Math.min(LOOK, bestCost - dx); dy++) {
        if (j + dy + WIN > b.length) break;
        if (keyA === b.slice(j + dy, j + dy + WIN)) {
          if (dx + dy < bestCost) { bestCost = dx + dy; best = [dx, dy]; }
          break;
        }
      }
      if (best && bestCost <= dx + 1) break;
    }
    if (!best) break;
    i += best[0];
    j += best[1];
  }
  return runs;
}

for (const prefix of PREFIXES) {
  const book = prefix.replace(/^([a-z]+)0*(\d+)$/, '$1$2');
  let ourWords: string[] = [];
  try {
    const lines = readFileSync(join(ROOT, 'data', 'cs', `${book}.xml`), 'utf8').split('\n');
    ourWords = lines.flatMap((line) => (line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).map(normChar));
  } catch { console.log(`${prefix} → ${book}.xml 不存在`); continue; }

  const kmj: Tok[] = [];
  for (const id of order) {
    const seg = id.split('/');
    if (seg.length > 1 && seg[1].startsWith(prefix)) kmj.push(...(bySent.get(id) ?? []));
  }
  if (!kmj.length) { console.log(`${prefix}: komyoji 沒有詞`); continue; }

  const A = stream(ourWords);
  const B = stream(kmj.map((t) => t.form));
  const runs = diffRuns(A.chars, B.chars);
  const matchedChars = runs.reduce((n, r) => n + r[2], 0);

  // 字元 → komyoji 詞
  const charToKmj = new Map<number, number>();
  for (const [ai, bi, len] of runs) for (let t = 0; t < len; t++) charToKmj.set(ai + t, bi + t);
  const kmjOwner = new Int32Array(B.chars.length);
  { let c = 0; for (let t = 0; t < kmj.length; t++) for (const ch of kmj[t].form) if (KEEP.test(ch)) { kmjOwner[c] = t; c++; } }

  // 我們的詞 → komyoji token
  const pair = new Map<number, number>();
  let c = 0;
  for (let w = 0; w < ourWords.length; w++) {
    const n = [...ourWords[w]].filter((x) => KEEP.test(x)).length;
    if (!n) continue;
    const start = c;
    c += n;
    let ok = true;
    let target = -1;
    for (let t = start; t < start + n; t++) {
      const m = charToKmj.get(t);
      if (m == null) { ok = false; break; }
      const k = kmjOwner[m];
      if (target < 0) target = k;
      else if (target !== k) { ok = false; break; }
    }
    if (ok && target >= 0) pair.set(w, target);
  }

  let same = 0;
  const cases = new Map<string, Set<string>>();
  const samples: string[] = [];
  for (const [w, k] of pair) {
    if (ourWords[w] === kmj[k].form) same++;
    if (kmj[k].gcase && kmj[k].gcase !== '‐') {
      const s = cases.get(ourWords[w]) ?? new Set<string>();
      s.add(kmj[k].gcase);
      cases.set(ourWords[w], s);
    }
    if (sampleForm && ourWords[w] === sampleForm && samples.length < 10) {
      samples.push(`${ourWords[w]} → ${kmj[k].pos}/${kmj[k].gcase}/${kmj[k].num}`);
    }
  }
  console.log(
    `${prefix} → ${book}: 字元對上 ${((matchedChars / A.chars.length) * 100).toFixed(1)}%；詞 ${ourWords.length}，投影 ${pair.size}（${((pair.size / ourWords.length) * 100).toFixed(1)}%），形相同 ${same}/${pair.size}（${((same / Math.max(1, pair.size)) * 100).toFixed(1)}%），多格位形 ${[...cases.values()].filter((s) => s.size > 1).length}`,
  );
  if (samples.length) console.log('  ' + samples.join(' ｜ '));
}
