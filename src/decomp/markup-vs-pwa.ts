#!/usr/bin/env bun
/**
 * 標記的拆法 vs pwa 的拆法：索引該聽誰的？
 *
 *   bun run src/decomp/markup-vs-pwa.ts
 *
 * data/cs 的 <辭 b="rAj|ghM" j="0">rājagahaṃ</辭>（舊資料是 <詞>）是 adb 自己的分段（儉約巴利編碼），
 * 拿來跟 pwa 的樹比，看兩者多常不一致。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { providentText } from '../provident-text';

const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');

/* pwa 樹（只讀，用於比對） */
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

const TAG = /<[詞辭][^>]*b="([^"]*)"[^>]*>([^<]*)<\/[詞辭]>/g;
let tags = 0;
let decoded = 0;
let same = 0;
let pwaMissing = 0;
let differ = 0;
const examples: string[] = [];

for (const f of files) {
  const s = readFileSync(join(dir, f), 'utf8');
  for (const m of s.matchAll(TAG)) {
    tags++;
    const b = m[1];
    const text = m[2];
    const partsFromTag = b.split('|').map((p) => providentText(p, true));
    if (partsFromTag.some((p) => p.includes('??'))) continue;
    decoded++;
    const pwa = parts.get(text);
    if (!pwa) { pwaMissing++; continue; }
    if (pwa.join('|') === partsFromTag.join('|')) same++;
    else {
      differ++;
      if (examples.length < 10) examples.push(`${text}: 標記 ${partsFromTag.join('+')} ／ pwa ${pwa.join('+')}`);
    }
  }
}
console.log(`詞標籤 ${tags.toLocaleString()}；可解碼 ${decoded.toLocaleString()}；pwa 有樹 ${(decoded - pwaMissing).toLocaleString()}；pwa 沒樹 ${pwaMissing.toLocaleString()}`);
console.log(`兩者相同 ${same.toLocaleString()}（${((same / Math.max(1, decoded - pwaMissing)) * 100).toFixed(1)}%）、不同 ${differ.toLocaleString()}`);
console.log('\n不同的例子：');
console.log(examples.join('\n'));
