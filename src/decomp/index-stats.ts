#!/usr/bin/env bun
/**
 * 拆詞對「posting list 與 token list」的影響（2026-11-02）。
 *
 *   bun run src/decomp/index-stats.ts
 *
 * 比較兩種索引方式（在 data/cs 的正文上）：
 *   A. 表面詞：一個詞形一個 token（現在的 adb）
 *   B. 詞件：把詞拆成詞件（pwa 的樹），一個詞件一個 token；拆不開的就用原詞
 *
 * 量的東西：token list 大小、hapax、前 N 名的覆蓋率，以及幾個查詢詞的 posting 數。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;

/* ── 1. 語料詞頻 ──────────────────────────────────────── */
const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const surface = new Map<string, number>();
let tokens = 0;
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const m of text.match(WORD_G) ?? []) {
    surface.set(m, (surface.get(m) ?? 0) + 1);
    tokens++;
  }
}
console.log(`語料：${files.length} 檔、${tokens.toLocaleString()} 詞次、${surface.size.toLocaleString()} 個詞形`);

/* ── 2. 詞形 → 詞件（pwa 的樹；只收有拆的）──────────────── */
const partOf = new Map<string, string[]>();
{
  const text = readFileSync(join(ROOT, 'out', 'pwa-tree-all.tsv'), 'utf8');
  let at = text.indexOf('\n') + 1;
  while (at > 0 && at < text.length) {
    const end = text.indexOf('\n', at);
    const line = end < 0 ? text.slice(at) : text.slice(at, end);
    at = end < 0 ? text.length : end + 1;
    const t1 = line.indexOf('\t');
    if (t1 < 0) continue;
    const word = line.slice(0, t1);
    if (!surface.has(word)) continue;
    const t2 = line.indexOf('\t', t1 + 1);
    const t3 = line.indexOf('\t', t2 + 1);
    if (t2 < 0 || t3 < 0) continue;
    const depth = Number(line.slice(t1 + 1, t2)) || 0;
    if (depth === 0) continue;
    const tree = line.slice(t3 + 1);
    const leaves: string[] = [];
    let cur = '';
    for (const c of tree) {
      if (c === '[') { cur = ''; continue; }
      if (c === '|' || c === ']') { if (cur) leaves.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) leaves.push(cur);
    if (leaves.length >= 2) partOf.set(word, leaves);
  }
}
const splitWords = [...partOf.keys()].length;
const splitTokens = [...partOf.keys()].reduce((n, w) => n + (surface.get(w) ?? 0), 0);
console.log(`有拆法的詞形 ${splitWords.toLocaleString()}，覆蓋 ${splitTokens.toLocaleString()} 詞次（${((splitTokens / tokens) * 100).toFixed(1)}%）`);

/* ── 3. 兩種 token list ───────────────────────────────── */
const partFreq = new Map<string, number>();
for (const [w, n] of surface) {
  const parts = partOf.get(w);
  if (parts) for (const p of parts) partFreq.set(p, (partFreq.get(p) ?? 0) + n);
  else partFreq.set(w, (partFreq.get(w) ?? 0) + n);
}
const hapax = (m: Map<string, number>): number => [...m.values()].filter((n) => n === 1).length;
const topShare = (m: Map<string, number>, k: number): number => {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const top = [...m.values()].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
  return (top / total) * 100;
};
console.log(`\nA 表面詞：${surface.size.toLocaleString()} 個 token；hapax ${hapax(surface).toLocaleString()}`);
console.log(`B 詞件：  ${partFreq.size.toLocaleString()} 個 token；hapax ${hapax(partFreq).toLocaleString()}`);
console.log(`token list 縮小 ${((1 - partFreq.size / surface.size) * 100).toFixed(1)}%`);
for (const k of [100, 1000, 10000]) {
  console.log(`前 ${k} 名覆蓋：A ${topShare(surface, k).toFixed(1)}%  B ${topShare(partFreq, k).toFixed(1)}%`);
}

/* ── 4. posting list：幾個查詢詞 ───────────────────────── */
const queries = ['gata', 'dhamma', 'buddha', 'saṅgha', 'kāya', 'citta'];
console.log('\n查一個詞件，能命中多少「詞次」（A＝只查表面詞，B＝拆詞後）：');
for (const q of queries) {
  const a = surface.get(q) ?? 0;
  const b = partFreq.get(q) ?? 0;
  console.log(`  ${q.padEnd(8)} A ${a.toLocaleString().padStart(8)}  B ${b.toLocaleString().padStart(8)}  ×${(b / Math.max(1, a)).toFixed(1)}`);
}

/* ── 4b. posting 總量：拆詞會讓 posting 變多（一個詞拆成 k 個詞件）── */
let postA = 0;
let postB = 0;
let maxA = 0;
let maxB = 0;
for (const [w, n] of surface) {
  postA += n;
  const k = (partOf.get(w) ?? [w]).length;
  postB += n * k;
}
for (const n of surface.values()) maxA = Math.max(maxA, n);
for (const n of partFreq.values()) maxB = Math.max(maxB, n);
console.log(`\nposting 總量：A ${postA.toLocaleString()}（1 詞 1 post）  B ${postB.toLocaleString()}（1 詞 → k 個詞件）  ×${(postB / postA).toFixed(2)}`);
console.log(`最長的 posting：A ${maxA.toLocaleString()}  B ${maxB.toLocaleString()}`);

/* ── 4c. 最常見的詞件（決定 posting list 的長度與雜訊）── */
const topParts = [...partFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('\n最常見的詞件：' + topParts.map(([w, n]) => w + '(' + n.toLocaleString() + ')').join(' '));
const totalB = [...partFreq.values()].reduce((a, b) => a + b, 0);
const top20 = topParts.reduce((a, [, n]) => a + n, 0);
console.log(`前 20 個詞件佔 ${((top20 / totalB) * 100).toFixed(1)}% 的 posting`);

/* ── 5. 存一份對照（給索引端用）───────────────────────── */
const rows = ['word\tcount\tparts'];
for (const [w, n] of [...surface.entries()].sort((x, y) => y[1] - x[1])) {
  const parts = partOf.get(w);
  rows.push(`${w}\t${n}\t${parts ? parts.join('+') : ''}`);
}
Bun.write(join(ROOT, 'out', 'index-words.tsv'), rows.join('\n') + '\n'); // 35 MB，放 out/ 不進版控
console.log(`\n${join(ROOT, 'out', 'index-words.tsv')}（${rows.length - 1} 列）`);
