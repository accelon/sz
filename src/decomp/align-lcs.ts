#!/usr/bin/env bun
/**
 * 逐詞對位：位置對不上（22%），改用序列比對（LCS）看能拉到多少。
 *
 *   bun run src/decomp/align-lcs.ts [句數]
 *
 * 只做量測：抽樣 N 個句子，用 LCS 對 komyoji 的詞與我們那一行的詞，
 * 統計「對上的詞數 / 我們的詞數」。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const LIMIT = Number(process.argv[2] ?? '3000');
const WORD_G = /[\p{L}\p{M}]+/gu;

const sent2line = new Map<string, { book: string; line: number }>();
for (const l of readFileSync('D:/2026/komyoji/out/align.tsv', 'utf8').split('\n').slice(1)) {
  const [sent, book, , , csLine, matched] = l.split('\t');
  if (!sent || matched !== '1' || !book || !csLine) continue;
  sent2line.set(sent, { book, line: Number(csLine) });
}

const lineWords = new Map<string, string[]>();
const wordsOf = (book: string, line: number): string[] => {
  const key = `${book}:${line}`;
  const hit = lineWords.get(key);
  if (hit) return hit;
  const path = join(ROOT, 'data', 'cs', `${book}.xml`);
  const text = readFileSync(path, 'utf8').split('\n')[line - 1] ?? '';
  const ws = (text.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).map((w) => w.toLowerCase());
  lineWords.set(key, ws);
  return ws;
};

const bySent = new Map<string, string[]>();
const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/tokens.tsv.gz')).toString('utf8').split('\n');
const h = raw[0].split('\t');
const iS = h.indexOf('sent_id');
const iF = h.indexOf('form_clean');
for (let k = 1; k < raw.length; k++) {
  const f = raw[k].split('\t');
  if (f.length <= Math.max(iS, iF)) continue;
  const arr = bySent.get(f[iS]) ?? [];
  arr.push(f[iF].toLowerCase());
  bySent.set(f[iS], arr);
}

/** LCS 對位，回傳配對數 */
const lcsPairs = (a: string[], b: string[]): number => {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 0;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m];
};

let done = 0;
let ourWords = 0;
let matched = 0;
for (const [id, kt] of bySent) {
  const at = sent2line.get(id);
  if (!at) continue;
  const ws = wordsOf(at.book, at.line);
  if (!ws.length) continue;
  const m = lcsPairs(kt, ws);
  ourWords += ws.length;
  matched += m;
  done++;
  if (done >= LIMIT) break;
}
console.log(`抽 ${done.toLocaleString()} 句；我們的詞 ${ourWords.toLocaleString()}，LCS 對上 ${matched.toLocaleString()}（${((matched / ourWords) * 100).toFixed(1)}%）`);
