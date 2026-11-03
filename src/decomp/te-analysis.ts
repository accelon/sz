#!/usr/bin/env bun
/**
 * `te` 為什麼是大魔王：它的格位取決於上下文，不是字尾。
 *
 *   bun run src/decomp/te-analysis.ts [詞]
 *
 * 對指定詞的每一次出現，看同一句裡「下一個詞」的詞性與它的格位關係。
 * 如果同一個下一個詞性對應到多種格位，就證明「光看形」無法判定。
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const TARGET = process.argv[2] ?? 'te';
const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/tokens.tsv.gz')).toString('utf8').split('\n');
const h = raw[0].split('\t');
const iS = h.indexOf('sent_id');
const iF = h.indexOf('form_clean');
const iP = h.indexOf('pos');
const iC = h.indexOf('case');

type Tok = { form: string; pos: string; gc: string };
const bySent = new Map<string, Tok[]>();
for (let k = 1; k < raw.length; k++) {
  const f = raw[k].split('\t');
  if (f.length <= Math.max(iS, iF, iP, iC)) continue;
  const arr = bySent.get(f[iS]) ?? [];
  arr.push({ form: f[iF].toLowerCase(), pos: f[iP], gc: f[iC] });
  bySent.set(f[iS], arr);
}

/* 下一個詞性 → 格位分佈 */
const table = new Map<string, Map<string, number>>();
const self = new Map<string, number>();
let total = 0;
for (const toks of bySent.values()) {
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].form !== TARGET) continue;
    if (!toks[i].gc || toks[i].gc === '‐') continue;
    total++;
    self.set(toks[i].gc, (self.get(toks[i].gc) ?? 0) + 1);
    const next = toks[i + 1];
    const key = next ? next.pos : '（句末）';
    const m = table.get(key) ?? new Map<string, number>();
    m.set(toks[i].gc, (m.get(toks[i].gc) ?? 0) + 1);
    table.set(key, m);
  }
}
console.log(`「${TARGET}」有格位標註的出現 ${total.toLocaleString()} 次`);
console.log('整體：' + [...self].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}${n}`).join(' '));

console.log('\n下一個詞的詞性 → 格位分佈（只看 ≥50 次的）：');
const rows = [...table]
  .map(([pos, m]) => [pos, m, [...m.values()].reduce((a, b) => a + b, 0)] as [string, Map<string, number>, number])
  .filter(([, , n]) => n >= 50)
  .sort((a, b) => b[2] - a[2]);
for (const [pos, m, n] of rows) {
  const list = [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, x]) => `${c}${((x / n) * 100).toFixed(0)}%`).join(' ');
  console.log(`  ${pos.padEnd(8)} ${String(n).padStart(5)} 次：${list}`);
}
