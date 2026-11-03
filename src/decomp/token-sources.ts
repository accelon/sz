#!/usr/bin/env bun
/**
 * 大 token 是怎麼來的？——把 posting 拆回「貢獻它的詞形」。
 *
 *   bun run src/decomp/token-sources.ts [token...]
 *
 * 預設看 iti / ti / atthi / dhamma：哪些詞形貢獻了這些 token。
 * 用來判斷「這個 token 的長 posting 是真的，還是拆詞拆出來的」。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const WATCH = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['iti', 'ti', 'atthi', 'dhamma', 'eva']);
const WORD_G = /[\p{L}\p{M}]+/gu;

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
const corpus = new Map<string, number>();
const dir = join(ROOT, 'data', 'cs');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml') && x !== '00.xml')) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) corpus.set(w, (corpus.get(w) ?? 0) + 1);
}

/* 每個 watch token：來源詞形 → 次數 */
const source = new Map<string, Map<string, number>>();
for (const t of WATCH) source.set(t, new Map());
for (const [w, n] of corpus) {
  const ps = parts.get(w);
  const toks = (ps ? ps.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w]).flatMap((x) => x.split(/\s+/));
  for (const t of toks) {
    const m = source.get(t);
    if (!m) continue;
    m.set(w, (m.get(w) ?? 0) + n);
  }
}

for (const [t, m] of source) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const self = m.get(t) ?? 0;
  console.log(`\n${t}：${total.toLocaleString()} 次（自己單獨出現 ${self.toLocaleString()}，${((self / Math.max(1, total)) * 100).toFixed(1)}%）`);
  for (const [w, n] of top) console.log(`   ${w.padEnd(26)} ${String(n).padStart(7)}`);
}
