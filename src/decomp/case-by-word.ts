#!/usr/bin/env bun
/**
 * 逐次格位的分佈：哪些詞真的有「一形多義」的證據？
 *
 *   bun run src/decomp/case-by-word.ts [前幾名]
 *
 * 讀 out/projection.tsv，統計每個詞形的格位分佈，輸出：
 *   data/cs-decomp/case-by-word.tsv   word / total / 主 / 対 / 具 / 与 / 奪 / 属 / 処 / 呼
 * 並印出「格位最分散」的前幾名（真正的一形多義）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const TOP = Number(process.argv[2] ?? '10');
const CASES = ['主', '対', '具', '与', '奪', '属', '処', '呼'];

const byWord = new Map<string, Map<string, number>>();
for (const l of readFileSync(join(ROOT, 'out', 'projection.tsv'), 'utf8').split('\n').slice(1)) {
  const f = l.split('\t');
  if (!f[0]) continue;
  const word = f[3];
  const gc = f[5];
  if (!gc || gc === '‐') continue;
  // 只取單一格位（副対／主（属）這種複合標籤跳過，避免混淆）
  if (!CASES.includes(gc)) continue;
  const m = byWord.get(word) ?? new Map<string, number>();
  m.set(gc, (m.get(gc) ?? 0) + 1);
  byWord.set(word, m);
}

const rows = ['word\ttotal\t' + CASES.join('\t')];
const scored: { w: string; total: number; m: Map<string, number>; entropy: number }[] = [];
for (const [w, m] of byWord) {
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (total < 5) continue;
  const vals = CASES.map((c) => m.get(c) ?? 0);
  rows.push([w, total, ...vals].join('\t'));
  // 分散度：1 - 最大占比（0 = 單一，接近 1 = 平均分散）
  const maxShare = Math.max(...vals) / total;
  scored.push({ w, total, m, entropy: 1 - maxShare });
}
writeFileSync(join(OUT_DIR, 'case-by-word.tsv'), rows.join('\n') + '\n', 'utf8');

const dominant = scored.filter((s) => s.entropy <= 0.1).length;
const mixed = scored.filter((s) => s.entropy > 0.1 && s.entropy <= 0.5).length;
const ambiguous = scored.filter((s) => s.entropy > 0.5).length;
console.log(`\n詞形（≥5 次）${scored.length.toLocaleString()}：主導 ≥90% ${dominant.toLocaleString()}（${((dominant / scored.length) * 100).toFixed(1)}%）、有混合 ${mixed.toLocaleString()}、高度歧義 ${ambiguous.toLocaleString()}`);
scored.sort((a, b) => b.entropy - a.entropy);
console.log(`有格位的詞形 ${byWord.size.toLocaleString()}；寫出 ${rows.length - 1} 列`);
console.log(`\n格位最分散的 ${TOP} 個（真正的一形多義）：`);
for (const s of scored.slice(0, TOP)) {
  const list = CASES.filter((c) => s.m.get(c)).map((c) => `${c}${s.m.get(c)}`).join(' ');
  console.log(`  ${s.w.padEnd(16)} ${String(s.total).padStart(5)}  ${list}`);
}
console.log(`\n${join(OUT_DIR, 'case-by-word.tsv')}`);
