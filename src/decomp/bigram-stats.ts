#!/usr/bin/env bun
/**
 * bigram 值不值得？——針對「極高頻詞元」把 posting list 拆成 bigram。
 *
 *   bun run src/decomp/bigram-stats.ts
 *
 * 做法：把 5 本書切成詞件（同 index-prototype 的 B 索引），建
 *   unigram：詞件 → 出現的行
 *   bigram ：相鄰詞件對 → 出現的行
 * 再比較 posting 長度、token 數與「高頻詞元改用 bigram」之後的總量。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ROOT } from '../profiles';

const BOOKS = ['dn1', 'dn2', 'dn3', 'mn1', 'sn1'];
const WORD_G = /[\p{L}\p{M}]+/gu;

/* 詞形 → 詞件 */
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

/* 切成詞件序列（以行為單位） */
const lines: string[][] = [];
for (const book of BOOKS) {
  for (const line of readFileSync(join(ROOT, 'data', 'cs', `${book}.xml`), 'utf8').split('\n')) {
    const toks: string[] = [];
    for (const w of line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []) {
      const ps = parts.get(w);
      if (ps) toks.push(...ps);
      else toks.push(w);
    }
    if (toks.length) lines.push(toks);
  }
}
console.log(`${BOOKS.join('+')}：${lines.length} 行、${lines.reduce((n, l) => n + l.length, 0).toLocaleString()} 個詞元`);

const uni = new Map<string, Set<number>>();
const bi = new Map<string, Set<number>>();
lines.forEach((toks, li) => {
  for (let k = 0; k < toks.length; k++) {
    let s = uni.get(toks[k]);
    if (!s) { s = new Set(); uni.set(toks[k], s); }
    s.add(li);
    if (k + 1 < toks.length) {
      const key = toks[k] + ' ' + toks[k + 1];
      let b = bi.get(key);
      if (!b) { b = new Set(); bi.set(key, b); }
      b.add(li);
    }
  }
});

const stat = (m: Map<string, Set<number>>): { tokens: number; posts: number; max: number; hapax: number; bytes: number } => {
  let posts = 0;
  let max = 0;
  let hapax = 0;
  for (const s of m.values()) { posts += s.size; if (s.size > max) max = s.size; if (s.size === 1) hapax++; }
  const json = JSON.stringify([...m].map(([k, v]) => [k, [...v]]));
  return { tokens: m.size, posts, max, hapax, bytes: gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).length };
};
const u = stat(uni);
const b = stat(bi);
console.log(`\nunigram：${u.tokens.toLocaleString()} token、${u.posts.toLocaleString()} post、最長 ${u.max.toLocaleString()}、hapax ${u.hapax.toLocaleString()}、gzip ${(u.bytes / 1024).toFixed(0)} KB`);
console.log(`bigram ：${b.tokens.toLocaleString()} token、${b.posts.toLocaleString()} post、最長 ${b.max.toLocaleString()}、hapax ${b.hapax.toLocaleString()}、gzip ${(b.bytes / 1024).toFixed(0)} KB`);

/* 高頻詞元改用 bigram：posting 會變多短？ */
const top = [...uni.entries()].sort((x, y) => y[1].size - x[1].size).slice(0, 12);
console.log('\n最高頻的 12 個詞元，各自的 posting 與「拆成 bigram 之後」：');
for (const [w, set] of top) {
  let n = 0;
  let max = 0;
  for (const [key, s] of bi) {
    if (!key.startsWith(w + ' ')) continue;
    n++;
    if (s.size > max) max = s.size;
  }
  console.log(`  ${w.padEnd(10)} post ${String(set.size).padStart(7)} → bigram ${String(n).padStart(6)} 個、最長 ${String(max).padStart(6)}`);
}

/* 政策模擬：前 K 個高頻詞元改用 bigram（不再存 unigram） */
const topAll = [...uni.entries()].sort((x, y) => y[1].size - x[1].size);
for (const K of [5, 10, 20, 50]) {
  const big = new Set(topAll.slice(0, K).map(([w]) => w));
  let tokens = 0;
  let posts = 0;
  let max = 0;
  const kept: [string, Set<number>][] = [];
  for (const [w, s2] of uni) {
    if (big.has(w)) continue;
    kept.push([w, s2]);
    tokens++;
    posts += s2.size;
    if (s2.size > max) max = s2.size;
  }
  for (const [key, s2] of bi) {
    const left = key.slice(0, key.indexOf(' '));
    if (!big.has(left)) continue;
    kept.push([key, s2]);
    tokens++;
    posts += s2.size;
    if (s2.size > max) max = s2.size;
  }
  const bytes = gzipSync(Buffer.from(JSON.stringify(kept.map(([k, v]) => [k, [...v]])), 'utf8'), { level: 9 }).length;
  console.log(`  前 ${String(K).padStart(2)} 個改用 bigram：token ${tokens.toLocaleString()}、post ${posts.toLocaleString()}、最長 ${max.toLocaleString()}、gzip ${(bytes / 1024).toFixed(0)} KB（原 ${(u.bytes / 1024).toFixed(0)} KB）`);
}

/* 政策模擬：posting > 50,000 的詞元改用 bigram（不再存 unigram） */
const T = 50000;
let keptUni = 0;
let keptPosts = 0;
let dropped = 0;
for (const [, s] of uni) {
  if (s.size > T) { dropped++; continue; }
  keptUni++;
  keptPosts += s.size;
}
let extraBi = 0;
let extraPosts = 0;
for (const [key, s] of bi) {
  const left = key.slice(0, key.indexOf(' '));
  if ((uni.get(left)?.size ?? 0) <= T) continue;
  extraBi++;
  extraPosts += s.size;
}
console.log(`\n政策：posting > ${T.toLocaleString()} 的詞元（${dropped} 個）改用 bigram`);
console.log(`  token：${u.tokens.toLocaleString()} → ${(keptUni + extraBi).toLocaleString()}；post：${u.posts.toLocaleString()} → ${(keptPosts + extraPosts).toLocaleString()}；最長 posting：${u.max.toLocaleString()} → ${Math.max(...[...uni.values()].filter((s) => s.size <= T).map((s) => s.size), ...[...bi.values()].map((s) => s.size)).toLocaleString()}`);
