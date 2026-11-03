#!/usr/bin/env bun
/**
 * 一形多義可不可以拆開？先量 komyoji 的逐次語法特徵覆蓋率與「多義」程度。
 *
 *   bun run src/decomp/feature-coverage.ts
 *
 * 看四件事：
 *   1. 覆蓋率：我們的語料有多少詞次，能在 komyoji 的逐詞分析裡找到同一個形
 *   2. 一形多義：多少詞形在同一個特徵（詞性／格／數）上出現 >1 種值
 *   3. 若按 (詞性, 格, 數) 拆，token 會變成多少
 *   4. 例子：bhagavato 這種形，實際出現幾種格
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const SRC = 'D:/2026/komyoji/out/grammar/tokens.tsv.gz';
const WORD_G = /[\p{L}\p{M}]+/gu;

/* 逐次特徵：形 → 各特徵的值分佈 */
type Feat = { pos: Map<string, number>; gcase: Map<string, number>; num: Map<string, number> };
const feat = new Map<string, Feat>();
let rows = 0;
const raw = gunzipSync(readFileSync(SRC)).toString('utf8').split('\n');
const h = raw[0].split('\t');
const iP = h.indexOf('pos');
const iC = h.indexOf('case');
const iN = h.indexOf('number');
const iF = h.indexOf('form_clean');
for (let k = 1; k < raw.length; k++) {
  const f = raw[k].split('\t');
  if (f.length <= Math.max(iP, iC, iN, iF)) continue;
  rows++;
  const form = f[iF];
  if (!form) continue;
  const o = feat.get(form) ?? { pos: new Map(), gcase: new Map(), num: new Map() };
  o.pos.set(f[iP], (o.pos.get(f[iP]) ?? 0) + 1);
  if (f[iC] && f[iC] !== '‐') o.gcase.set(f[iC], (o.gcase.get(f[iC]) ?? 0) + 1);
  if (f[iN] && f[iN] !== '‐') o.num.set(f[iN], (o.num.get(f[iN]) ?? 0) + 1);
  feat.set(form, o);
}
console.log(`komyoji 逐詞 ${rows.toLocaleString()} 列、${feat.size.toLocaleString()} 個詞形`);

/* 一形多義的程度 */
const multi = (pick: (o: Feat) => Map<string, number>): number =>
  [...feat.values()].filter((o) => pick(o).size > 1).length;
console.log(`多詞性的形 ${multi((o) => o.pos).toLocaleString()}`);
console.log(`多格位的形 ${multi((o) => o.gcase).toLocaleString()}`);
console.log(`多數的形   ${multi((o) => o.num).toLocaleString()}`);

/* 我們的語料：詞形覆蓋率與 token 增長 */
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

const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
let words = 0;
let covered = 0;
const tokPos = new Set<string>();
const tokPosCase = new Set<string>();
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) {
    words++;
    const o = feat.get(w.toLowerCase());
    if (o) covered++;
    const stems = (parts.get(w) ? parts.get(w)!.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w])
      .flatMap((x) => x.split(/\s+/))
      .filter(Boolean);
    const pos = o ? [...o.pos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'x' : 'x';
    const gcase = o && o.gcase.size ? [...o.gcase].sort((a, b) => b[1] - a[1])[0][0] : '';
    for (const s of stems) {
      tokPos.add(`${s}#${pos}`);
      if (gcase) tokPosCase.add(`${s}#${pos}#${gcase}`);
    }
  }
}
console.log(`\n語料 ${words.toLocaleString()} 詞次；komyoji 有形可對 ${covered.toLocaleString()}（${((covered / words) * 100).toFixed(1)}%）`);
console.log(`token（詞幹#詞性）：${tokPos.size.toLocaleString()}`);
console.log(`token（詞幹#詞性#格，只算有格位的詞次）：${tokPosCase.size.toLocaleString()}`);

/* 例子 */
console.log('\n例子（同一個形，多種格位）：');
let shown = 0;
for (const [form, o] of [...feat].sort((a, b) => b[1].gcase.size - a[1].gcase.size)) {
  if (o.gcase.size < 2) break;
  const total = [...o.gcase.values()].reduce((a, b) => a + b, 0);
  if (total < 50) continue;
  const detail = [...o.gcase].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}${n}`).join(' ');
  console.log(`  ${form.padEnd(16)} ${detail}`);
  if (++shown >= 8) break;
}
