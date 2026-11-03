#!/usr/bin/env bun
/**
 * 整詞次要索引：拆詞之後，怎麼還查得到「某個特定詞形」？
 *
 *   bun run src/decomp/index-secondary.ts
 *
 * 主索引：詞件→詞幹（B3），posting 帶行號（搜尋用）。
 * 次索引：整詞 → 行號，只存「有這個詞形」，不存位置；成本應該很低。
 *
 * 比較：主索引 / 主＋次 / 混合（都存位置）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const BOOKS = ['dn1', 'dn2', 'dn3', 'mn1', 'sn1'];
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

/* stoplist：沿用 index-policy 的判定（簡化版：posting ≥10000 且在政策表裡 stop） */
const stop = new Set<string>();
for (const line of readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, , action] = line.split('\t');
  if (t && action === 'stop') stop.add(t);
}
console.log(`stoplist ${stop.size} 個`);

/* 建三種索引 */
const primary = new Map<string, Set<number>>(); // 詞件→詞幹 → 行
const secondary = new Map<string, Set<number>>(); // 整詞 → 行
const hybrid = new Map<string, Set<number>>(); // 兩者都存
const add = (m: Map<string, Set<number>>, k: string, li: number): void => {
  let s = m.get(k);
  if (!s) { s = new Set(); m.set(k, s); }
  s.add(li);
};

let words = 0;
for (const book of BOOKS) {
  const lines = readFileSync(join(ROOT, 'data', 'cs', `${book}.xml`), 'utf8').split('\n');
  lines.forEach((line, li) => {
    for (const w of line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []) {
      words++;
      const ps = parts.get(w);
      const toks = ps ? ps.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w];
      for (const t of toks) if (!stop.has(t)) add(primary, t, li);
      add(secondary, w, li);
      add(hybrid, w, li);
      for (const t of toks) if (!stop.has(t)) add(hybrid, t, li);
    }
  });
}

const stat = (m: Map<string, Set<number>>): { tokens: number; posts: number; bytes: number } => {
  let posts = 0;
  for (const s of m.values()) posts += s.size;
  const json = JSON.stringify([...m].map(([k, v]) => [k, [...v]]));
  return { tokens: m.size, posts, bytes: gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).length };
};
const p = stat(primary);
const s2 = stat(secondary);
const h = stat(hybrid);
console.log(`${BOOKS.join('+')}：${words.toLocaleString()} 詞`);
console.log(`主（詞件→詞幹）：${p.tokens.toLocaleString()} token、${p.posts.toLocaleString()} post、gzip ${(p.bytes / 1024).toFixed(0)} KB`);
console.log(`次（整詞）    ：${s2.tokens.toLocaleString()} token、${s2.posts.toLocaleString()} post、gzip ${(s2.bytes / 1024).toFixed(0)} KB`);
console.log(`主＋次        ：${(p.tokens + s2.tokens).toLocaleString()} token、${(p.posts + s2.posts).toLocaleString()} post、gzip 約 ${((p.bytes + s2.bytes) / 1024).toFixed(0)} KB（+${(((p.bytes + s2.bytes) / p.bytes - 1) * 100).toFixed(0)}%）`);
console.log(`混合（都存位置）：${h.tokens.toLocaleString()} token、${h.posts.toLocaleString()} post、gzip ${(h.bytes / 1024).toFixed(0)} KB（+${((h.bytes / p.bytes - 1) * 100).toFixed(0)}%）`);

console.log('\n查詢：');
for (const q of ['dhamma', 'tathāgatassa', 'bhagavato', 'gacchati']) {
  const a = primary.get(q)?.size ?? 0;
  const b = secondary.get(q)?.size ?? 0;
  console.log(`  ${q.padEnd(14)} 主索引 ${String(a).padStart(3)} 行   次索引 ${String(b).padStart(3)} 行`);
}
