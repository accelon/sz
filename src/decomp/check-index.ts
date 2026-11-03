#!/usr/bin/env bun
/**
 * 索引檢查：token list 的不變量。
 *
 *   bun run src/decomp/check-index.ts
 *
 * 通過回 0，不通過回 1（跟 `src/cs2accelon.ts --check` 一樣的用法）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const errors: string[] = [];
const warn = (m: string): void => void console.warn(`  ⚠ ${m}`);
const fail = (m: string): void => void errors.push(m);

/* ── 讀 token list 與政策 ─────────────────────────────── */
const toks = new Map<string, number>();
for (const line of readFileSync(join(OUT_DIR, 'tokens.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, n] = line.split('\t');
  if (!t) continue;
  if (toks.has(t)) fail(`token 重複：${t}`);
  toks.set(t, Number(n) || 0);
}
const stop = new Set<string>();
for (const line of readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, , action] = line.split('\t');
  if (t && action === 'stop') stop.add(t);
}
console.log(`token ${toks.size.toLocaleString()}、stoplist ${stop.size}、總 posting ${[...toks.values()].reduce((a, b) => a + b, 0).toLocaleString()}`);

/* ── 不變量 ──────────────────────────────────────────── */
for (const [t, n] of toks) {
  if (stop.has(t)) fail(`stoplist 的 token 進了索引：${t}`);
  if (/^\?\?/.test(t)) fail(`雜訊 token：${t}`);
  // 大寫沒問題（專名：Sakka、Gotama…）；要擋的是儉約巴利殘留與空白
  if (/V/.test(t)) fail(`含儉約巴利記號的 token：${t}`);
  if (/\s/.test(t)) fail(`含空白的 token：${JSON.stringify(t)}`);
  // token = 詞幹#詞性（n/v/adj/ptcp/pron/ind/num/other/x）
  // token = 詞幹#詞性 或 詞幹#詞性#格
  if (!/^[\p{L}\p{M}]+#[^#]+(#[^#]+)?$/u.test(t)) fail(`格式不符的 token：${JSON.stringify(t)}`);
  if (n <= 0) fail(`posting 為 0 的 token：${t}`);
}

/* ── 驗收數字（§13.5）───────────────────────────────── */
const expect: [string, number | null][] = [
  ['dhamma', 147103],
  ['ca', 0],
  ['??2kVtO', 0],
  ['eva', 0],
];
/* 驗收按「詞幹」加總（token 現在帶詞性後綴） */
const stemSum = (stem: string): number => {
  let n = 0;
  for (const [t, v] of toks) if (t.startsWith(stem + '#')) n += v;
  return n;
};
for (const [t, want] of expect) {
  const got = stemSum(t);
  if (want == null) continue;
  if (got !== want) fail(`驗收不符：${t} 期待 ${want}，實得 ${got}`);
  else console.log(`  ✓ ${t} = ${got}`);
}

/* ── 統計摘要 ────────────────────────────────────────── */
const ranked = [...toks].sort((a, b) => b[1] - a[1]);
console.log(`最長 posting：${ranked[0][0]} ${ranked[0][1].toLocaleString()}`);
const hapax = ranked.filter(([, n]) => n === 1).length;
console.log(`hapax：${hapax.toLocaleString()}（${((hapax / toks.size) * 100).toFixed(1)}%）`);
if (hapax / toks.size > 0.7) warn('hapax 比例偏高（>70%）');

/* ── 結果 ────────────────────────────────────────────── */
if (errors.length) {
  console.error(`\n✗ ${errors.length} 個問題：`);
  for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\n✓ 全部通過');
void ROOT;
