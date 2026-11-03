#!/usr/bin/env bun
/**
 * 每本書「與全體共識」的一致率：比較偏離的書，可能是較早／未修的。
 *
 *   bun run src/decomp/book-consensus.ts
 *
 * 對每個（書, 形）取該書的主導格位，與「全部書合起來」的主導格位比。
 * 偏離率越低，表示該書越貼近全體慣例（作者可能回頭修過）。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const TOK = 'D:/2026/komyoji/out/grammar/tokens.tsv.gz';
const ALIGN = 'D:/2026/komyoji/out/align.tsv';

const bookOf = new Map<string, string>();
for (const l of readFileSync(ALIGN, 'utf8').split('\n').slice(1)) {
  const [sent, book, , , , matched] = l.split('\t');
  if (!sent || matched !== '1' || !book) continue;
  bookOf.set(sent, book);
}

type Dist = Map<string, number>;
const global = new Map<string, Dist>();
const perBook = new Map<string, Map<string, Dist>>();

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
  const form = f[iF];
  const g = global.get(form) ?? new Map<string, number>();
  g.set(gc, (g.get(gc) ?? 0) + 1);
  global.set(form, g);
  const bm = perBook.get(book) ?? new Map<string, Dist>();
  const d = bm.get(form) ?? new Map<string, number>();
  d.set(gc, (d.get(gc) ?? 0) + 1);
  bm.set(form, d);
  perBook.set(book, bm);
}
const top = (d: Dist): string => [...d].sort((a, b) => b[1] - a[1])[0][0];

const rows: [string, number, number][] = [];
for (const [book, forms] of perBook) {
  let ok = 0;
  let tot = 0;
  for (const [form, d] of forms) {
    const n = [...d.values()].reduce((a, b) => a + b, 0);
    if (n < 5) continue;
    const g = global.get(form)?.[Symbol.iterator] ? global.get(form)! : null;
    if (!g) continue;
    tot++;
    if (top(d) === top(g)) ok++;
  }
  if (tot >= 20) rows.push([book, ok, tot]);
}
rows.sort((a, b) => a[1] / a[2] - b[1] / b[2]);
console.log('書\t形(≥5)\t與全體共識一致');
for (const [book, ok, tot] of rows) console.log(`${book}\t${tot}\t${((ok / tot) * 100).toFixed(1)}%`);
