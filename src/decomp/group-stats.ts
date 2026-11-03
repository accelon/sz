#!/usr/bin/env bun
/**
 * 「組度」：拆詞之後，詞件把詞分成多大的家族？
 *
 *   bun run src/decomp/group-stats.ts
 *
 * 用 MVP 的索引（詞件 → 詞）算：每個詞件底下有幾個詞、家族大小的分佈、
 * 以及「幾個詞件就能覆蓋多數詞」。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const html = readFileSync(join(ROOT, 'out', 'word-groups.html'), 'utf8');
const data = JSON.parse(gunzipSync(Buffer.from(/window\.__DATA_GZ__ = "([^"]*)"/.exec(html)![1], 'base64')).toString('utf8')) as {
  words: [number, string, number, number, unknown?][];
  atoms: { a: string; n: number; s: string }[];
  idx: { n: number[]; d: number[] };
};

const n = data.words.length;
const sizes = data.idx.n;
const atoms = data.atoms;

const dist = new Map<string, number>();
const bucket = (k: number): string => (k === 0 ? '0' : k === 1 ? '1' : k <= 3 ? '2-3' : k <= 10 ? '4-10' : k <= 30 ? '11-30' : k <= 100 ? '31-100' : '100+');
for (const s of sizes) dist.set(bucket(s), (dist.get(bucket(s)) ?? 0) + 1);
console.log(`詞件 ${atoms.length} 個；詞 ${n} 個`);
console.log('家族大小分佈（一個詞件底下有幾個詞）：');
for (const k of ['0', '1', '2-3', '4-10', '11-30', '31-100', '100+']) {
  const c = dist.get(k) ?? 0;
  console.log(`  ${k.padEnd(7)} ${String(c).padStart(7)} 個詞件（${((c / atoms.length) * 100).toFixed(1)}%）`);
}

// 覆蓋：前 N 個詞件（按家族大小）能覆蓋多少「詞」
const order = sizes.map((s, i) => [s, i] as [number, number]).sort((a, b) => b[0] - a[0]);
let wordsCovered = 0;
const marks = [10, 50, 100, 500, 1000, 2000];
let mi = 0;
for (let k = 0; k < order.length && mi < marks.length; k++) {
  wordsCovered += order[k][0];
  if (k + 1 === marks[mi]) {
    console.log(`前 ${String(marks[mi]).padStart(4)} 個詞件 → 覆蓋 ${wordsCovered.toLocaleString()} 個詞（${((wordsCovered / n) * 100).toFixed(1)}%）`);
    mi++;
  }
}

// 最大的家族
console.log('\n最大的幾個家族：');
for (const [s, i] of order.slice(0, 12)) {
  console.log(`  ${atoms[i].a.padEnd(14)} ${String(s).padStart(5)} 個詞`);
}
