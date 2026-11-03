#!/usr/bin/env bun
/**
 * 把 komyoji 的「詞形 → 詞性」分佈，換成「我們的 token → 虛詞/內容詞」分佈。
 *
 *   bun run src/decomp/komyoji-pos.ts
 *
 * 輸入（komyoji 交付，詞形層）：
 *   D:\2026\komyoji\out\grammar\pos-distribution.tsv.gz
 *   word <TAB> pos <TAB> count      pos ∈ n/v/adj/ptcp/pron/ind/num/other
 *
 * 輸出（本工作區，token 層，與 build-index 同一條管線）：
 *   data/cs-decomp/pos-distribution.tsv
 *   token <TAB> func|content <TAB> count
 *
 * 為什麼要轉：komyoji 數的是表面形（`dhammā`、`dhammassa`），我們的索引 token 是
 * 詞件→詞幹（`dhamma`）。不轉的話兩邊的 key 對不上，stoplist 會誤判。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const SRC = 'D:/2026/komyoji/out/grammar/pos-distribution.tsv.gz';

/* 詞形 → 詞件、詞件 → 詞幹（與 build-index 同一條管線） */
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

/** komyoji 的 8 個枚舉 → 虛詞／內容詞。只有 ind（不變詞）與 pron（代名詞）算虛詞。 */
const FUNC_POS = new Set(['ind', 'pron']);
const tokenize = (word: string): string[] => {
  const w = word.toLowerCase();
  const ps = parts.get(w);
  if (ps) return ps.map((p) => stemOf.get(p) ?? p);
  const s = stemOf.get(w);
  return [s ?? w];
};

const dist = new Map<string, { func: number; content: number }>();
const posSeen = new Map<string, number>();
let rows = 0;
let total = 0;
const lines = gunzipSync(readFileSync(SRC)).toString('utf8').split('\n');
for (let k = 1; k < lines.length; k++) {
  const [word, pos, count] = lines[k].split('\t');
  if (!word || !pos) continue;
  const n = Number(count) || 0;
  if (!n) continue;
  rows++;
  total += n;
  posSeen.set(pos, (posSeen.get(pos) ?? 0) + n);
  const cls = FUNC_POS.has(pos) ? 'func' : 'content';
  for (const t of tokenize(word)) {
    const d = dist.get(t) ?? { func: 0, content: 0 };
    d[cls] += n;
    dist.set(t, d);
  }
}
console.log(`讀 ${SRC}`);
console.log(`  ${rows.toLocaleString()} 列、count 總和 ${total.toLocaleString()}、POS ${[...posSeen].map(([p, n]) => `${p}:${n}`).join(' ')}`);
console.log(`  轉成 ${dist.size.toLocaleString()} 個 token`);

const out: string[] = ['word\tpos\tcount'];
for (const [t, d] of [...dist].sort((a, b) => b[1].func + b[1].content - (a[1].func + a[1].content))) {
  if (d.func) out.push(`${t}\tfunc\t${d.func}`);
  if (d.content) out.push(`${t}\tcontent\t${d.content}`);
}
writeFileSync(join(OUT_DIR, 'pos-distribution.tsv'), out.join('\n') + '\n', 'utf8');
console.log(`${join(OUT_DIR, 'pos-distribution.tsv')}（${out.length - 1} 列）`);
