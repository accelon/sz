#!/usr/bin/env bun
/**
 * 同形詞（一形多義）在 token 層的樣貌。
 *
 *   bun run src/decomp/homograph.ts [token...]
 *
 * 對指定 token，列出「哪些詞形貢獻了它」以及 komyoji 給那些詞形的詞性分佈。
 * 目的：說明 token 是「詞幹字串的桶子」，同一個字串可能是不同詞類，
 * 不能從詞形武斷判定功能。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const WATCH = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['ti', 'a', 'na', 'sa', 'dhamma']);
const WORD_G = /[\p{L}\p{M}]+/gu;

/* 詞形 → 詞件、詞件 → 詞幹 */
const parts = new Map<string, string[]>();
{
  const text = readFileSync(join(ROOT, 'out', 'pwa-tree-all.tsv'), 'utf8');
  let at = text.indexOf('\n') + 1;
  while (at > 0 && at < text.length) {
    const end = text.indexOf('\n', at);
    const line = end < 0 ? text.slice(at) : text.slice(at, end);
    at = end < 0 ? text.length : end + 1;
    const t1 = line.indexOf('\t');
    if (t1 < 0) continue;
    const w = line.slice(0, t1);
    const t2 = line.indexOf('\t', t1 + 1);
    const t3 = line.indexOf('\t', t2 + 1);
    if (t2 < 0 || t3 < 0) continue;
    if ((Number(line.slice(t1 + 1, t2)) || 0) === 0) continue;
    const leaves: string[] = [];
    let cur = '';
    for (const c of line.slice(t3 + 1)) {
      if (c === '[') { cur = ''; continue; }
      if (c === '|' || c === ']') { if (cur) leaves.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) leaves.push(cur);
    if (leaves.length >= 2) parts.set(w, leaves);
  }
}
const stemOf = new Map<string, string>();
for (const line of readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8').split('\n').slice(1)) {
  const [a, , s] = line.split('\t');
  if (a && s) stemOf.set(a, s);
}
const tokenize = (w: string): string[] => {
  const ps = parts.get(w);
  if (ps) return ps.map((p) => stemOf.get(p) ?? p);
  return [stemOf.get(w) ?? w];
};

/* komyoji：詞形 → 詞性分佈 */
const posOf = new Map<string, Map<string, number>>();
{
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/pos-distribution.tsv.gz')).toString('utf8');
  for (const line of raw.split('\n').slice(1)) {
    const [w, p, c] = line.split('\t');
    if (!w) continue;
    const m = posOf.get(w) ?? new Map<string, number>();
    m.set(p, (m.get(p) ?? 0) + (Number(c) || 0));
    posOf.set(w, m);
  }
}

/* 語料：token → 詞形 → 次數 */
const corpus = new Map<string, number>();
const dir = join(ROOT, 'data', 'cs');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml') && x !== '00.xml')) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) corpus.set(w, (corpus.get(w) ?? 0) + 1);
}
const src = new Map<string, Map<string, number>>();
for (const t of WATCH) src.set(t, new Map());
for (const [w, n] of corpus) {
  for (const t of tokenize(w)) {
    const m = src.get(t);
    if (m) m.set(w, (m.get(w) ?? 0) + n);
  }
}

for (const [t, m] of src) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`\n=== token ${t}：${total.toLocaleString()} 次、${m.size} 個詞形 ===`);
  const rows = [...m].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [w, n] of rows) {
    const pm = posOf.get(w);
    const pos = pm ? [...pm].map(([p, c]) => `${p}${c}`).join(',') : '（komyoji 無）';
    console.log(`  ${w.padEnd(22)} ${String(n).padStart(7)}   ${pos}`);
  }
}
