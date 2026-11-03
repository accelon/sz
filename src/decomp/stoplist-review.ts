#!/usr/bin/env bun
/**
 * stoplist 的逐項檢視：每個停用 token 的「我們這邊的次數」與「komyoji 的詞性證據」。
 *
 *   bun run src/decomp/stoplist-review.ts
 *
 * 輸出 data/cs-decomp/stoplist-review.tsv：
 *   token / postings（我們的全語料次數）/ komyoji_func / komyoji_content /
 *   share（虛詞佔比）/ evidence（komyoji 次數 ÷ 我們的次數）/ 判定
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from './sources';

const policy = new Map<string, number>();
const stopSet = new Set<string>();
for (const line of readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, p, action] = line.split('\t');
  if (!t) continue;
  policy.set(t, Number(p) || 0);
  if (action === 'stop') stopSet.add(t);
}
const dist = new Map<string, { func: number; content: number }>();
try {
  for (const line of readFileSync(join(OUT_DIR, 'pos-distribution.tsv'), 'utf8').split('\n').slice(1)) {
    const [w, pos, c] = line.split('\t');
    if (!w) continue;
    const d = dist.get(w) ?? { func: 0, content: 0 };
    if (pos === 'func') d.func += Number(c) || 0;
    else d.content += Number(c) || 0;
    dist.set(w, d);
  }
} catch {
  console.log('沒有 pos-distribution.tsv（先跑 src/decomp/komyoji-pos.ts）');
  process.exit(0);
}

const stops = [...stopSet].sort();
const rows = ['token\tpostings\tkomyoji_func\tkomyoji_content\tshare\tevidence\tverdict'];
const summary = { stop: 0, keep: 0, thin: 0 };
for (const t of stops) {
  const total = policy.get(t) ?? 0;
  const d = dist.get(t) ?? { func: 0, content: 0 };
  const k = d.func + d.content;
  const share = k ? d.func / k : 0;
  const coverage = total ? k / total : 0;
  let verdict: string;
  if (!k) { verdict = '無證據（保留停用）'; summary.thin++; }
  else if (share >= 0.9 && coverage >= 0.05) { verdict = '停用（證據足夠）'; summary.stop++; }
  else if (share >= 0.9) { verdict = '停用（證據偏薄）'; summary.thin++; }
  else if (share < 0.5) { verdict = '改回保留'; summary.keep++; }
  else { verdict = '待定'; summary.thin++; }
  rows.push(
    `${t}\t${total}\t${d.func}\t${d.content}\t${(share * 100).toFixed(1)}%\t${(coverage * 100).toFixed(1)}%\t${verdict}`,
  );
}
writeFileSync(join(OUT_DIR, 'stoplist-review.tsv'), rows.join('\n') + '\n', 'utf8');

const show = rows.slice(1).filter((r) => !r.endsWith('停用（證據足夠）'));
console.log(`停用 token ${stops.length}：證據足夠 ${summary.stop}、改回保留 ${summary.keep}、待定／無證據 ${summary.thin}`);
console.log('\n需要人工看的：');
for (const r of show.slice(0, 30)) {
  const [t, p, f, c, share, cov, v] = r.split('\t');
  console.log(`  ${t.padEnd(10)} 我們 ${p.padStart(7)}  komyoji ${String(Number(f) + Number(c)).padStart(6)}  虛詞 ${share.padStart(6)}  覆蓋 ${cov.padStart(6)}  ${v}`);
}
console.log(`\n${join(OUT_DIR, 'stoplist-review.tsv')}（${rows.length - 1} 列）`);
