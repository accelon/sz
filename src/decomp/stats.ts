#!/usr/bin/env bun
/**
 * 算「總共有幾個詞」：語料詞形／有詞譜的詞形／MVP 收了多少、覆蓋多少詞次。
 *
 *   bun run src/decomp/stats.ts
 *
 * 只讀：data/cs、out/pwa-tree-all.tsv、out/word-groups.html。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { ROOT } from '../profiles';
import { join } from 'node:path';
const WORD_G = /[\p{L}\p{M}]+/gu;

// 1) 語料詞頻
const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const counts = new Map<string, number>();
let tokens = 0;
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const m of text.match(WORD_G) ?? []) {
    counts.set(m, (counts.get(m) ?? 0) + 1);
    tokens++;
  }
}
console.log(`語料：${files.length} 檔、${tokens.toLocaleString()} 詞次、${counts.size.toLocaleString()} 個不同詞形`);

// 2) 有 pwa 樹的詞形（深度分佈）
const depths = new Map<string, number>();
const text = readFileSync(join(ROOT, 'out', 'pwa-tree-all.tsv'), 'utf8');
let at = text.indexOf('\n') + 1;
while (at > 0 && at < text.length) {
  const end = text.indexOf('\n', at);
  const line = end < 0 ? text.slice(at) : text.slice(at, end);
  at = end < 0 ? text.length : end + 1;
  const t1 = line.indexOf('\t');
  if (t1 < 0) continue;
  const w = line.slice(0, t1);
  if (!counts.has(w)) continue;
  const t2 = line.indexOf('\t', t1 + 1);
  if (t2 < 0) continue;
  depths.set(w, Number(line.slice(t1 + 1, t2)) || 0);
}
const byDepth = new Map<number, number>();
for (const d of depths.values()) byDepth.set(d, (byDepth.get(d) ?? 0) + 1);
const withTree = [...depths.keys()].reduce((n, w) => n + (counts.get(w) ?? 0), 0);
console.log(`\n有 pwa 詞譜的詞形：${depths.size.toLocaleString()}（覆蓋 ${withTree.toLocaleString()} 詞次，${((withTree / tokens) * 100).toFixed(1)}%）`);
console.log(`深度分佈：${[...byDepth].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d} 階 ${n.toLocaleString()}`).join('、')}`);

// 3) MVP 收了多少
const html = readFileSync(join(ROOT, 'out', 'word-groups.html'), 'utf8');
const b64 = /window\.__DATA_GZ__ = "([^"]*)"/.exec(html)![1];
const data = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
const names: string[] = [];
let prev = '';
for (const r of data.words as [number, string, number, number, unknown][]) {
  const name = prev.slice(0, r[0]) + r[1];
  names.push(name);
  prev = name;
}
const mvpTokens = names.reduce((n, w) => n + (counts.get(w) ?? 0), 0);
const mvpDepth = new Map<number, number>();
for (const w of names) mvpDepth.set(depths.get(w) ?? 0, (mvpDepth.get(depths.get(w) ?? 0) ?? 0) + 1);
console.log(`\nMVP 收錄：${names.length.toLocaleString()} 個詞形（${((names.length / Math.max(1, depths.size)) * 100).toFixed(1)}% 的有譜詞形）`);
console.log(`         覆蓋 ${mvpTokens.toLocaleString()} 詞次（${((mvpTokens / tokens) * 100).toFixed(1)}%）`);
console.log(`深度分佈：${[...mvpDepth].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d} 階 ${n.toLocaleString()}`).join('、')}`);
console.log(`\n沒進 MVP 的有譜詞形：${(depths.size - names.length).toLocaleString()} 個（多半是低頻的 1–2 階詞）`);

