#!/usr/bin/env bun
/**
 * 片語查詢原型：拆詞之後，用「連續詞件」找回特定詞形。
 *
 *   bun run src/decomp/phrase-query.ts
 *
 * 建 token → 位置（不是行）的索引；查 `tathā gata` 就等於找「連續兩個詞件」。
 * 量：位置索引比行索引貴多少、能不能取代整詞索引。
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
/* dpd／pm1 的第二三層（MVP 用的就是這些） */
for (const [file, col] of [['dpd-comp-review.tsv', 3], ['pm1-viggaha-review.tsv', 3]] as [string, number][]) {
  let text = '';
  try { text = readFileSync(join(OUT_DIR, file), 'utf8'); } catch { continue; }
  for (const line of text.split('\n').slice(1)) {
    const f = line.split('\t');
    if (f[4] !== '用' || !f[col]) continue;
    const w = f[0];
    if (parts.has(w)) continue;
    const ps = f[col].split('+');
    if (ps.length >= 2) parts.set(w, ps);
  }
}

const stop = new Set<string>();
for (const line of readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, , action] = line.split('\t');
  if (t && action === 'stop') stop.add(t);
}

/* token → 位置（全語料連續編號） */
const pos = new Map<string, number[]>();
const lineOfPos: number[] = []; // 位置 → 行號（用來對照）
const surfaceAt = new Map<number, string[]>(); // 行號 → 該行的表面詞（對照用）
let p = 0;
let lineBase = 0; // 每本書的行號要加上前面書的總行數，不然會互相蓋掉
for (const book of BOOKS) {
  const bookLines = readFileSync(join(ROOT, 'data', 'cs', `${book}.xml`), 'utf8').split('\n');
  bookLines
    .forEach((line, li0) => {
      const li = lineBase + li0;
      const words = line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? [];
      surfaceAt.set(li, words);
      for (const w of words) {
        const ps = parts.get(w);
        const toks = ps ? ps.map((x) => stemOf.get(x) ?? x) : [stemOf.get(w) ?? w];
        for (const t of toks) {
          let arr = pos.get(t);
          if (!arr) { arr = []; pos.set(t, arr); }
          arr.push(p);
          lineOfPos[p] = li;
          p++;
        }
        p++; // 詞界留一個空隙，片語才不會跨詞配對
      }
    });
  lineBase += bookLines.length;
}

const bytes = gzipSync(Buffer.from(JSON.stringify([...pos].map(([k, v]) => [k, v])), 'utf8'), { level: 9 }).length;
let posts = 0;
for (const v of pos.values()) posts += v.length;
console.log(`${BOOKS.join('+')}：${pos.size.toLocaleString()} token、${posts.toLocaleString()} 位置、gzip ${(bytes / 1024).toFixed(0)} KB`);

/** 片語查詢：找連續詞件 */
const phrase = (toks: string[]): number[] => {
  const lists = toks.map((t) => pos.get(t) ?? []);
  if (lists.some((l) => !l.length)) return [];
  const out: number[] = [];
  const later = new Set(lists[lists.length - 1]);
  for (const p0 of lists[0]) {
    let ok = true;
    for (let k = 1; k < toks.length; k++) {
      if (!(pos.get(toks[k]) ?? []).includes(p0 + k)) { ok = false; break; }
    }
    if (ok) out.push(p0);
  }
  void later;
  return out;
};

/* 對照：表面詞以某前綴開頭的「詞次」與「行數」 */
const surfaceCount = (prefix: string): { occ: number; lines: number } => {
  let occ = 0;
  const lines = new Set<number>();
  for (const [li, words] of surfaceAt) {
    for (const w of words) {
      if (!w.startsWith(prefix)) continue;
      occ++;
      lines.add(li);
    }
  }
  return { occ, lines: lines.size };
};

console.log('\n片語查詢 vs 整詞查詢：');
const cases: [string, string[]][] = [
  ['tathāgata', ['tathā', 'gata']],
  ['dhammacakka', ['dhamma', 'cakka']],
  ['bhagavato', ['bhagavant']],
  ['sāvakasaṅgha', ['sāvaka', 'saṅgha']],
];
for (const [word, toks] of cases) {
  const hits = phrase(toks);
  const lines = new Set(hits.map((x) => lineOfPos[x]));
  const surf = surfaceCount(word);
  console.log(`  ${word.padEnd(14)} 片語 ${String(hits.length).padStart(5)} 次／${String(lines.size).padStart(4)} 行   整詞 ${String(surf.occ).padStart(5)} 次／${String(surf.lines).padStart(4)} 行`);
  if (word === 'tathāgata' && hits.length) {
    const sample = hits.slice(0, 6).map((x) => (surfaceAt.get(lineOfPos[x]) ?? []).filter((w) => w.includes('tath') || w.includes('gata')).slice(0, 3).join(','));
    console.log('    樣本：' + sample.join(' | '));
  }
}
