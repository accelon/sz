#!/usr/bin/env bun
/**
 * komyoji 的品質隨時間變化？用「同一個形在格位上的一致性」當指標。
 *
 *   bun run src/decomp/komyoji-quality.ts
 *
 * 越早做的部分，同一個形的標註應該越不一致（作者：越做越好，dn mn sn an…）。
 * 指標：每個形（出現 ≥5 次）的「最常見格位佔比」，取平均（越高越一致）。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const TOK = 'D:/2026/komyoji/out/grammar/tokens.tsv.gz';
const ALIGN = 'D:/2026/komyoji/out/align.tsv';

/* sent_id → 書（align.tsv 的 book 欄） */
const bookOf = new Map<string, string>();
for (const l of readFileSync(ALIGN, 'utf8').split('\n').slice(1)) {
  const [sent, book, , , , matched] = l.split('\t');
  if (!sent || matched !== '1' || !book) continue;
  bookOf.set(sent, book);
}

/* pe5 的唯一分析（外部對照）*/
const pe5 = new Map<string, string>();
for (const l of readFileSync('D:/2026/sz/data/cs-decomp/pe5-single.tsv', 'utf8').split('\n').slice(1)) {
  const [f, , , c] = l.split('\t');
  if (f && c) pe5.set(f, c);
}
const normCase = (c: string): string => c.replace(/^副/, '').replace(/[（(].*/, '');

type Count = { total: number; byCase: Map<string, number> };
const perBook = new Map<string, Map<string, Count>>();

const raw = gunzipSync(readFileSync(TOK)).toString('utf8').split('\n');
const h = raw[0].split('\t');
const iS = h.indexOf('sent_id');
const iF = h.indexOf('form_clean');
const iC = h.indexOf('case');
for (let k = 1; k < raw.length; k++) {
  const f = raw[k].split('\t');
  if (f.length <= Math.max(iS, iF, iC)) continue;
  const book = bookOf.get(f[iS]);
  if (!book) continue;
  const gc = f[iC];
  if (!gc || gc === '‐') continue;
  const m = perBook.get(book) ?? new Map<string, Count>();
  const c = m.get(f[iF]) ?? { total: 0, byCase: new Map<string, number>() };
  c.total++;
  c.byCase.set(gc, (c.byCase.get(gc) ?? 0) + 1);
  m.set(f[iF], c);
  perBook.set(book, m);
}

const rows: [string, number, number, number][] = [];
for (const [book, forms] of perBook) {
  let tokens = 0;
  let considered = 0;
  let shareSum = 0;
  for (const c of forms.values()) {
    tokens += c.total;
    if (c.total < 5) continue;
    const top = Math.max(...c.byCase.values());
    shareSum += top / c.total;
    considered++;
  }
  if (!considered) continue;
  rows.push([book, tokens, considered, shareSum / considered]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
console.log('書\t標註詞\t形(≥5)\t一致性');
for (const [book, tokens, forms, cons] of rows) {
  console.log(`${book}\t${tokens}\t${forms}\t${(cons * 100).toFixed(1)}%`);
}
/* 與 pe5 的外部對照 */
const pe5Stat = new Map<string, [number, number]>();
{
  const raw2 = gunzipSync(readFileSync(TOK)).toString('utf8').split('\n');
  const h2 = raw2[0].split('\t');
  const jS = h2.indexOf('sent_id'), jF = h2.indexOf('form_clean'), jC = h2.indexOf('case');
  for (let k = 1; k < raw2.length; k++) {
    const f = raw2[k].split('\t');
    if (f.length <= Math.max(jS, jF, jC)) continue;
    const book = bookOf.get(f[jS]);
    if (!book) continue;
    const p = pe5.get(f[jF]);
    const gc = f[jC];
    if (!p || !gc || gc === '‐') continue;
    const [ok, tot] = pe5Stat.get(book) ?? [0, 0];
    const same = normCase(gc) === p;
    pe5Stat.set(book, [ok + (same ? 1 : 0), tot + 1]);
  }
}
console.log('\n書\t與 pe5 一致率');
for (const [book, [ok, tot]] of [...pe5Stat].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (tot < 50) continue;
  console.log(`${book}\t${((ok / tot) * 100).toFixed(1)}%（${ok}/${tot}）`);
}

/* 依部類彙總 */
const byNik = new Map<string, [number, number]>();
for (const [book, tokens, , cons] of rows) {
  const nik = book.replace(/\d.*$/, '');
  const [t, s] = byNik.get(nik) ?? [0, 0];
  byNik.set(nik, [t + tokens, s + cons * tokens]);
}
console.log('\n部類\t標註詞\t加權一致性');
for (const [nik, [t, s]] of [...byNik].sort((a, b) => b[1][0] - a[1][0])) {
  console.log(`${nik}\t${t.toLocaleString()}\t${((s / t) * 100).toFixed(1)}%`);
}
