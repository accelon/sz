#!/usr/bin/env bun
/**
 * 重新驗證對位：以「塊.段」為單位，把我們的詞序列與 komyoji 的詞序列做 LCS。
 *
 *   bun run src/decomp/align-seg.ts [樣本段數]
 *
 * 之前用 align.tsv 的 cs_line 逐句比對只有 22–27%，但那是行級對位不準
 * （我們把標題與經文併在不同行）。作者指出兩邊底本同為 VRI，所以改成
 * 「同一個 塊.段 內」比對詞序列，應該高很多。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const LIMIT = Number(process.argv[2] ?? '400');
const WORD_G = /[\p{L}\p{M}]+/gu;

/* align.tsv：sent_id → block/seg（不看 cs_line） */
const sent2seg = new Map<string, string>(); // sent_id → "book/block/seg"
for (const l of readFileSync('D:/2026/komyoji/out/align.tsv', 'utf8').split('\n').slice(1)) {
  const [sent, book, block, seg, , matched] = l.split('\t');
  if (!sent || matched !== '1' || !book || !block || !seg) continue;
  sent2seg.set(sent, `${book}/${block}/${seg}`);
}

/* komyoji tokens 按 sent_id */
const toksBySent = new Map<string, string[]>();
const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/tokens.tsv.gz')).toString('utf8').split('\n');
const h = raw[0].split('\t');
const iS = h.indexOf('sent_id');
const iF = h.indexOf('form_clean');
for (let k = 1; k < raw.length; k++) {
  const f = raw[k].split('\t');
  if (f.length <= Math.max(iS, iF)) continue;
  const arr = toksBySent.get(f[iS]) ?? [];
  arr.push(f[iF].toLowerCase());
  toksBySent.set(f[iS], arr);
}

/* 我們的詞：book/block/seg → 詞序列（把所有該段的行接起來） */
const segWords = new Map<string, string[]>();
for (const [sent, key] of sent2seg) {
  if (segWords.has(key)) continue;
  const [book, block, seg] = key.split('/');
  const path = join(ROOT, 'data', 'cs', `${book}.xml`);
  let lines: string[];
  try { lines = readFileSync(path, 'utf8').split('\n'); } catch { continue; }
  const words: string[] = [];
  let inBlock = false;
  let inSeg = false;
  for (const line of lines) {
    const b = /<塊 id="([^"]+)"/.exec(line);
    if (b) { inBlock = b[1] === block; inSeg = false; }
    const n = /<段 n="([^"]*)"\/>/.exec(line);
    if (n) inSeg = inBlock && n[1] === seg;
    if (inBlock && inSeg) {
      for (const w of line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []) words.push(w.toLowerCase());
    }
  }
  if (words.length) segWords.set(key, words);
}

const lcs = (a: string[], b: string[]): number => {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 0;
  // 只保留長度差 ≤3 倍的情況，避免大矩陣
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m];
};

let done = 0;
let ours = 0;
let hit = 0;
const samples: string[] = [];
for (const [key, ws] of segWords) {
  const kt: string[] = [];
  for (const [sent, k2] of sent2seg) {
    if (k2 !== key) continue;
    kt.push(...(toksBySent.get(sent) ?? []));
  }
  if (!kt.length) continue;
  const m = lcs(kt, ws);
  ours += ws.length;
  hit += m;
  if (samples.length < 5) samples.push(`${key}: 我們 ${ws.length} 詞 / komyoji ${kt.length} 詞 / 對上 ${m}`);
  if (++done >= LIMIT) break;
}
console.log(`樣本 ${done} 段；我們的詞 ${ours.toLocaleString()}，LCS 對上 ${hit.toLocaleString()}（${((hit / ours) * 100).toFixed(1)}%）`);
console.log(samples.join('\n'));
