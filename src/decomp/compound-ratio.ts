#!/usr/bin/env bun
/**
 * 「組合詞裡屈折信息丟失」對 token 頻次的影響。
 *
 *   bun run src/decomp/compound-ratio.ts
 *
 * 同一個詞幹 token 的 posting，有多少來自「組合詞的成員」、多少來自「獨立出現的詞」？
 * 組合詞（六離合釋）裡非末位成員的格位會被丟掉，所以詞幹 token 的頻次並不等於
 * 「這個詞以那個文法身分出現」的次數。
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

/* 詞形 → 詞件（pwa 樹）、詞件 → 詞幹 */
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
const stemOf = new Map<string, string>();
for (const line of readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8').split('\n').slice(1)) {
  const [a, , s] = line.split('\t');
  if (a && s) stemOf.set(a, s);
}

/* 每個詞幹 token：組合詞成員 vs 獨立出現 */
const compound = new Map<string, number>();
const standalone = new Map<string, number>();
for (const [w, n] of corpus) {
  const ps = parts.get(w);
  if (ps) {
    for (const p of ps) {
      const s = stemOf.get(p) ?? p;
      compound.set(s, (compound.get(s) ?? 0) + n);
    }
  } else {
    const s = stemOf.get(w) ?? w;
    standalone.set(s, (standalone.get(s) ?? 0) + n);
  }
}
const all = new Set([...compound.keys(), ...standalone.keys()]);
let totC = 0;
let totS = 0;
for (const t of all) {
  totC += compound.get(t) ?? 0;
  totS += standalone.get(t) ?? 0;
}
console.log(`token ${all.size.toLocaleString()}；posting 來自組合詞成員 ${totC.toLocaleString()}（${((totC / (totC + totS)) * 100).toFixed(1)}%）、獨立詞 ${totS.toLocaleString()}`);

const top = [...all]
  .map((t) => [t, compound.get(t) ?? 0, standalone.get(t) ?? 0] as [string, number, number])
  .sort((a, b) => b[1] + b[2] - (a[1] + a[2]))
  .slice(0, 15);
console.log('\n最常見的 token：組合詞成員 / 獨立詞');
for (const [t, c, s] of top) {
  console.log(`  ${t.padEnd(10)} ${String(c).padStart(7)} / ${String(s).padStart(7)}  （組合佔 ${((c / Math.max(1, c + s)) * 100).toFixed(0)}%）`);
}
