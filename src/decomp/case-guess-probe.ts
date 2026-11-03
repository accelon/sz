#!/usr/bin/env bun
/**
 * 量：把「模型推估的單一格位」用一字元編碼放進 MVP，payload 會增加多少？
 *
 *   bun run src/decomp/case-guess-probe.ts
 *
 * 金標分佈（case-by-word.tsv）已有 6,269 個詞形；這裡量的是剩下那些詞
 * 用模型預測一個格位（約 79% 準），以一字元一字串存放的成本。
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const html = readFileSync(join(ROOT, 'out', 'word-groups.html'), 'utf8');
const data = JSON.parse(
  require('node:zlib').gunzipSync(
    Buffer.from(/window\.__DATA_GZ__ = "([^"]*)"/.exec(html)![1], 'base64'),
  ).toString('utf8'),
) as { words: [number, string, number, number][] };

const names: string[] = [];
let prev = '';
for (const r of data.words) {
  const n = prev.slice(0, r[0]) + r[1];
  names.push(n);
  prev = n;
}

/* 模型預測：詞 → 格 */
const guess = new Map<string, string>();
for (const l of readFileSync(join(OUT_DIR, 'case-by-word-model.tsv'), 'utf8').split('\n').slice(1)) {
  const [w, , gc] = l.split('\t');
  if (w && gc) guess.set(w, gc);
}
/* 金標分佈（有的就不需要推估） */
const gold = new Set<string>();
for (const l of readFileSync(join(OUT_DIR, 'case-by-word.tsv'), 'utf8').split('\n').slice(1)) {
  const [w] = l.split('\t');
  if (w) gold.add(w);
}

const CASES = '主対具与奪属処呼';
let str = '';
let hit = 0;
for (const w of names) {
  if (gold.has(w)) { str += '-'; continue; }
  const g = guess.get(w);
  if (!g) { str += '-'; continue; }
  const i = CASES.indexOf(g);
  str += i >= 0 ? CASES[i] : '-';
  if (i >= 0) hit++;
}
const gz = gzipSync(Buffer.from(str, 'utf8'), { level: 9 }).length;
console.log(`詞 ${names.length.toLocaleString()}；有推估 ${hit.toLocaleString()}；字串 ${str.length.toLocaleString()} 字元；gzip ${(gz / 1024).toFixed(1)} KB`);
