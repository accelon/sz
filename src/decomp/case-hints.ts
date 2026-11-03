#!/usr/bin/env bun
/**
 * 為「大魔王」們產生上下文提示：接什麼詞性時偏向哪個格位。
 *
 *   bun run src/decomp/case-hints.ts
 *
 * 輸出 data/cs-decomp/case-hints.tsv：word / hint
 * 做格位最分散、出現最多的前 40 個詞（payload 成本很小，幫助很大）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { OUT_DIR } from './sources';

type Tok = { form: string; pos: string; gc: string };
const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/tokens.tsv.gz')).toString('utf8').split('\n');
const h = raw[0].split('\t');
const iS = h.indexOf('sent_id');
const iF = h.indexOf('form_clean');
const iP = h.indexOf('pos');
const iC = h.indexOf('case');
const bySent = new Map<string, Tok[]>();
for (let k = 1; k < raw.length; k++) {
  const f = raw[k].split('\t');
  if (f.length <= Math.max(iS, iF, iP, iC)) continue;
  const arr = bySent.get(f[iS]) ?? [];
  arr.push({ form: f[iF].toLowerCase(), pos: f[iP], gc: f[iC] });
  bySent.set(f[iS], arr);
}

/* 每個詞的整體分佈（挑大魔王） */
const overall = new Map<string, Map<string, number>>();
for (const toks of bySent.values()) {
  for (const t of toks) {
    if (!t.gc || t.gc === '‐') continue;
    const m = overall.get(t.form) ?? new Map<string, number>();
    m.set(t.gc, (m.get(t.gc) ?? 0) + 1);
    overall.set(t.form, m);
  }
}
const amb = [...overall]
  .map(([w, m]) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const top = Math.max(...m.values());
    return { w, total, share: top / total };
  })
  .filter((x) => x.total >= 300 && x.share < 0.8)
  .sort((a, b) => b.total - a.total)
  .slice(0, 40);

/* 逐詞做「下一個詞性 → 格位」 */
const rows: string[] = ['word\thint'];
for (const { w, total } of amb) {
  const table = new Map<string, Map<string, number>>();
  for (const toks of bySent.values()) {
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].form !== w) continue;
      if (!toks[i].gc || toks[i].gc === '‐') continue;
      const key = toks[i + 1]?.pos ?? '句末';
      const m = table.get(key) ?? new Map<string, number>();
      m.set(toks[i].gc, (m.get(toks[i].gc) ?? 0) + 1);
      table.set(key, m);
    }
  }
  // 取「比整體更集中」的兩三個條件
  const base = overall.get(w)!;
  const baseTop = Math.max(...base.values()) / total;
  const picks: string[] = [];
  for (const [pos, m] of [...table].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0))) {
    const n = [...m.values()].reduce((a, b) => a + b, 0);
    if (n < 80) continue;
    const [gc, c] = [...m].sort((a, b) => b[1] - a[1])[0];
    const share = c / n;
    if (share <= baseTop + 0.08) continue; // 沒有比整體更集中就略過
    picks.push(`接${pos}→${gc}${Math.round(share * 100)}%`);
    if (picks.length >= 3) break;
  }
  if (picks.length) rows.push(`${w}\t${picks.join('；')}`);
}
writeFileSync(join(OUT_DIR, 'case-hints.tsv'), rows.join('\n') + '\n', 'utf8');
console.log(`大魔王候選 ${amb.length} 個；產生提示 ${rows.length - 1} 條`);
for (const r of rows.slice(1, 6)) console.log('  ' + r.replace('\t', ' → '));
