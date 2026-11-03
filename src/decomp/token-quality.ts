#!/usr/bin/env bun
/**
 * token list 的品質：拆出來的詞件，有多少不是「真的詞」？
 *
 *   bun run src/decomp/token-quality.ts
 *
 * 兩種 token 化：
 *   B  照 pwa 的詞件拆（現在的作法）
 *   B2 只收「pwa 詞件表裡真的出現過」的詞件；一個都沒有就退回整詞
 * 比較 token 數、hapax、覆蓋率與 posting。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;
const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const corpus = new Map<string, number>();
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) corpus.set(w, (corpus.get(w) ?? 0) + 1);
}

/** pwa 詞件表：真的當過「詞件」的名字（有次數）＋詞幹 */
const atom = new Set<string>();
const stemOf = new Map<string, string>();
for (const line of readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8').split('\n').slice(1)) {
  const [a, n, s2] = line.split('\t');
  if (a && Number(n) > 0) atom.add(a);
  if (a && s2) stemOf.set(a, s2);
}
console.log(`語料 ${corpus.size.toLocaleString()} 詞形；pwa 詞件表 ${atom.size.toLocaleString()} 個`);

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
    if (!corpus.has(w)) continue;
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

const build = (filter: boolean): Map<string, number> => {
  const out = new Map<string, number>();
  for (const [w, n] of corpus) {
    const ps = parts.get(w);
    const use = ps ? (filter ? ps.filter((p) => atom.has(p)) : ps) : [];
    if (use.length) for (const p of use) out.set(p, (out.get(p) ?? 0) + n);
    else out.set(w, (out.get(w) ?? 0) + n);
  }
  return out;
};

const b = build(false);
const b2 = build(true);

/* B3：詞件再收成詞幹（dhammā / dhammaṃ / dhammassa → dhamma） */
const b3 = new Map<string, number>();
for (const [t, n] of b) {
  const st = stemOf.get(t) ?? t;
  b3.set(st, (b3.get(st) ?? 0) + n);
}
const hapax = (m: Map<string, number>): number => [...m.values()].filter((n) => n === 1).length;
const topShare = (m: Map<string, number>, k: number): number => {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const top = [...m.values()].sort((x, y) => y - x).slice(0, k).reduce((a, b) => a + b, 0);
  return (top / total) * 100;
};
const posts = (m: Map<string, number>): number => {
  // 近似：B 的 posting 數 = Σ(詞次 × 詞件數)；這裡用 token 頻次和當下限
  return [...m.values()].reduce((a, b) => a + b, 0);
};

console.log(`\nB  詞件全收：${b.size.toLocaleString()} token、hapax ${hapax(b).toLocaleString()}、前 1000 覆蓋 ${topShare(b, 1000).toFixed(1)}%`);
console.log(`B2 只收真詞：${b2.size.toLocaleString()} token、hapax ${hapax(b2).toLocaleString()}、前 1000 覆蓋 ${topShare(b2, 1000).toFixed(1)}%`);
console.log(`token 差 ${(b2.size - b.size).toLocaleString()}（${(((b2.size - b.size) / b.size) * 100).toFixed(1)}%）`);
console.log(`B3 收成詞幹：${b3.size.toLocaleString()} token、hapax ${hapax(b3).toLocaleString()}、前 1000 覆蓋 ${topShare(b3, 1000).toFixed(1)}%（比 B 少 ${(((b.size - b3.size) / b.size) * 100).toFixed(1)}%）`);

console.log('\n查詢（詞次）：');
for (const q of ['dhamma', 'buddha', 'saṅgha', 'gata', 'kāya']) {
  console.log(`  ${q.padEnd(8)} B ${String(b.get(q) ?? 0).padStart(7)}   B3 ${String(b3.get(q) ?? 0).padStart(7)}`);
}

// 被濾掉的詞件（不是真詞）長什麼樣
const junk = [...b.keys()].filter((t) => !atom.has(t) && parts.size > 0);
console.log(`\nB 裡「不是 pwa 詞件」的 token：${junk.length.toLocaleString()} 個`);
const junkTop = junk.map((t) => [t, b.get(t) ?? 0] as [string, number]).sort((x, y) => y[1] - x[1]).slice(0, 15);
console.log('  ' + junkTop.map(([t, n]) => `${t}(${n})`).join(' '));
