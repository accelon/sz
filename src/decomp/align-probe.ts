#!/usr/bin/env bun
/**
 * 對位檢查：komyoji 的逐詞分析能不能逐詞對上我們的經文。
 *
 *   bun run src/decomp/align-probe.ts
 *
 * 用 D:\2026\komyoji\out\align.tsv（sent_id → book/block/seg/cs_line）
 * 把 komyoji tokens 的 (form, pos, case) 對到 data/cs/<book>.xml 的那一行，
 * 按詞序比對；比對得上才可能做「一形一義」的逐次特徵。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const WORD_G = /[\p{L}\p{M}]+/gu;
const ALIGN = 'D:/2026/komyoji/out/align.tsv';
const TOKENS = 'D:/2026/komyoji/out/grammar/tokens.tsv.gz';

/* sent_id → 我們的行（book + 行號 1 起算） */
const sent2line = new Map<string, { book: string; line: number }>();
for (const l of readFileSync(ALIGN, 'utf8').split('\n').slice(1)) {
  const [sent, book, , , csLine, matched] = l.split('\t');
  if (!sent || matched !== '1' || !book || !csLine) continue;
  sent2line.set(sent, { book, line: Number(csLine) });
}
console.log(`對上的句子 ${sent2line.size.toLocaleString()}`);

/* 快取我們的行 → 詞 */
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

/* komyoji tokens 按 sent_id 分組 */
const bySent = new Map<string, { form: string; pos: string; gcase: string }[]>();
const raw = gunzipSync(readFileSync(TOKENS)).toString('utf8').split('\n');
const h = raw[0].split('\t');
const iS = h.indexOf('sent_id');
const iF = h.indexOf('form_clean');
const iP = h.indexOf('pos');
const iC = h.indexOf('case');
for (let k = 1; k < raw.length; k++) {
  const f = raw[k].split('\t');
  if (f.length <= Math.max(iS, iF, iP, iC)) continue;
  const arr = bySent.get(f[iS]) ?? [];
  arr.push({ form: f[iF].toLowerCase(), pos: f[iP], gcase: f[iC] });
  bySent.set(f[iS], arr);
}

let sent = 0;
let sentOk = 0;
let tok = 0;
let tokMatch = 0;
const lenDiff = new Map<number, number>();
for (const [id, toks] of bySent) {
  const at = sent2line.get(id);
  if (!at) continue;
  sent++;
  const ws = wordsOf(at.book, at.line);
  const d = toks.length - ws.length;
  lenDiff.set(d, (lenDiff.get(d) ?? 0) + 1);
  if (toks.length === ws.length) sentOk++;
  for (let k = 0; k < Math.min(toks.length, ws.length); k++) {
    tok++;
    if (toks[k].form === ws[k]) tokMatch++;
  }
}
console.log(`可對位的句子 ${sent.toLocaleString()}；詞數完全相同的 ${sentOk.toLocaleString()}（${((sentOk / sent) * 100).toFixed(1)}%）`);
console.log(`逐詞比對：${tok.toLocaleString()} 詞，形相同 ${tokMatch.toLocaleString()}（${((tokMatch / tok) * 100).toFixed(1)}%）`);
console.log('詞數差的分布（komyoji − 我們）：' + [...lenDiff].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, n]) => `${d}:${n}`).join('  '));
