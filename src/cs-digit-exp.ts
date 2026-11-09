#!/usr/bin/env bun
/**
 * 實驗（2026-11-03 作者指示）：dn1–dn3 的正文用「詞內數字」標連音分段，數字代表規則編號。
 *
 *   bun run src/cs-digit-exp.ts
 *
 * 格式：`addhāna0magga3paṭipanno`（數字＝分段點）。
 *   1. `<辭 b="…">`：分段位置用 pwa 的連字號形態，規則編號用舊 `D:\2023\cs\cs.ptk` 同一公式的數字。
 *   2. 其餘正文（含書名、標題）：也用 pwa 分段，規則編號暫記 0。
 * 產物：`data/cs-split-digit/`（只實驗，不動 `data/cs`）。
 */
import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const BOOKS = ['dn1', 'dn2', 'dn3'];
const OUT = join(ROOT, 'data', 'cs-split-digit');
const DICT = 'C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db';

const db = new Database(DICT, { readonly: true });
const splits = new Map<string, string[]>();
for (const r of db.query('SELECT dict_key, dict_content FROM pwa').all() as { dict_key: string; dict_content: string }[]) {
  const head = String(r.dict_content).split('(')[0]!.trim();
  if (!head.includes('-')) continue;
  const parts = head.split('-').filter(Boolean);
  if (parts.length > 1) splits.set(r.dict_key.toLowerCase(), parts);
}

// 詞典沒收的複合詞：用 pwa 的詞彙表做 DP 切分（每段 ≥3 字），再遞迴拆長段
const letters = /^[a-zāīūṅṃṇñṭḍḷ]+$/u;
const vocab = new Set(
  (db.query('SELECT dict_key FROM pwa').all() as { dict_key: string }[])
    .map((r) => String(r.dict_key).toLowerCase())
    .filter((k) => k.length >= 3 && letters.test(k)),
);
const MANUAL: Record<string, string[]> = {
  sīlakkhandhavaggapāḷi: ['sīla', 'khandha', 'vagga', 'pāḷi'],
  vedanākkhandha: ['vedanā', 'khandha'],
};
function dpSeg(w: string): string[] | null {
  const n = w.length, INF = 1e9;
  const dp = new Array(n + 1).fill(INF), prev = new Array(n + 1).fill(-1);
  dp[0] = 0;
  for (let i = 0; i < n; i++) {
    if (dp[i] === INF) continue;
    for (let len = Math.min(14, n - i); len >= 3; len--) {
      if (i === 0 && len === n) continue;
      if (!vocab.has(w.slice(i, i + len))) continue;
      if (dp[i] + 1 < dp[i + len]) { dp[i + len] = dp[i] + 1; prev[i + len] = i; }
    }
  }
  if (dp[n] === INF) return null;
  const parts: string[] = [];
  for (let k = n; k > 0; k = prev[k]) parts.unshift(w.slice(prev[k], k));
  return parts.length > 1 ? parts : null;
}
const splitOf = (w: string): string[] | null => {
  const key = w.toLowerCase();
  if (MANUAL[key]) return MANUAL[key]!;
  const pwaParts = splits.get(key);
  if (pwaParts) return pwaParts;
  const dp = dpSeg(key);
  if (!dp) return null;
  // 長段再拆一層（sīlakkhandha → sīla + khandha）
  return dp.flatMap((part) => (part.length >= 8 && dpSeg(part) ? dpSeg(part)! : [part]));
};

const ptk = readFileSync('D:/2023/cs/cs.ptk', 'utf8');
const ruleDigits = new Map<string, string>();
for (const m of ptk.matchAll(/[A-Za-z][A-Za-z0-9]{2,}/g)) {
  const w = m[0];
  if (!/\d/.test(w)) continue;
  const key = w.replace(/\d/g, '');
  if (!ruleDigits.has(key)) ruleDigits.set(key, (w.match(/\d/g) ?? []).join(''));
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, '00.xml'),
  '<檔 n="cs-split-digit"><集>巴利三藏（VRI／CST4，詞內數字分段實驗）</集><英文名>Pali Tipitaka (digit-segmented experiment)</英文名></檔>\n' +
    '<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>\n',
  'utf8',
);

const joinParts = (parts: string[], ds: string): string => {
  let s = parts[0]!;
  for (let i = 1; i < parts.length; i++) s += (ds[i - 1] ?? '0') + parts[i]!;
  return s;
};

let words = 0, marked = 0, withRule = 0;
for (const book of BOOKS) {
  const text = readFileSync(join(ROOT, 'data', 'cs', `${book}.xml`), 'utf8').replace(/\r\n?/g, '\n').trimEnd();
  // 1) <辭> 內（cs 詞譜；舊備份是 <詞>，兩種都吃）：用舊 ptk 的規則編號
  let step = text.replace(/<[詞辭]([^>]*)>([^<]*)<\/[詞辭]>/g, (_m, attrs: string, w: string) => {
    words++;
    const parts = splitOf(w);
    if (!parts) return w;
    const b = /\bb="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const key = b.replace(/\|/g, '');
    let ds = ruleDigits.get(key) ?? '';
    if (ds.length !== parts.length - 1) ds = '0'.repeat(parts.length - 1);
    else if (ruleDigits.has(key)) withRule++;
    marked++;
    return joinParts(parts, ds);
  });
  // 2) 其餘正文（書名、標題、未標 <辭> 的詞）：也用 pwa 分段
  step = step
    .split(/(<[^>]*>)/)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(/[\p{L}\p{M}]+/gu, (w) => {
      const parts = splitOf(w);
      if (!parts) return w;
      marked++;
      return joinParts(parts, '0'.repeat(parts.length - 1));
    })))
    .join('');
  writeFileSync(join(OUT, `${book}.xml`), step + '\n', 'utf8');
}
console.log(`dn1–dn3：<辭> ${words}；用數字標記 ${marked}（規則編號有對到 ${withRule}）→ data/cs-split-digit/`);



