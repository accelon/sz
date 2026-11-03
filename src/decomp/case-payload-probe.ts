#!/usr/bin/env bun
/**
 * 先量：把「詞幹 → 格位分佈」放進 MVP，payload 會增加多少？
 *
 *   bun run src/decomp/case-payload-probe.ts [前幾名]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const TOP = Number(process.argv[2] ?? '8000');
const WORD_G = /[\p{L}\p{M}]+/gu;
const norm = (s: string): string => s.normalize('NFC').toLowerCase();

/* 詞形 → 詞幹（pwa 詞件表只給詞件；這裡用 tree 取葉、再查 stem） */
const stemOf = new Map<string, string>();
for (const l of readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8').split('\n').slice(1)) {
  const [a, , s] = l.split('\t');
  if (a && s) stemOf.set(a, s);
}
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

/* 詞 → 格（komyoji 投影 + 模型預測） */
const wordCase = new Map<string, string>();
for (const l of readFileSync(join(OUT_DIR, 'case-by-word-model.tsv'), 'utf8').split('\n').slice(1)) {
  const [w, , gc] = l.split('\t');
  if (w && gc) wordCase.set(w, gc);
}
for (const l of readFileSync(join(ROOT, 'out', 'projection.tsv'), 'utf8').split('\n').slice(1)) {
  const f = l.split('\t');
  if (f[0] && f[3] && f[5] && f[5] !== '‐') wordCase.set(f[3], f[5]);
}

/* 語料：詞幹 → 格位計數 */
const byStem = new Map<string, Map<string, number>>();
const dir = join(ROOT, 'data', 'cs');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml') && x !== '00.xml')) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const raw of text.match(WORD_G) ?? []) {
    const w = norm(raw);
    const gc = wordCase.get(w);
    if (!gc) continue;
    const stems = (parts.get(w) ? parts.get(w)!.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w])
      .flatMap((x) => x.split(/\s+/));
    for (const s of stems) {
      const m = byStem.get(s) ?? new Map<string, number>();
      m.set(gc, (m.get(gc) ?? 0) + 1);
      byStem.set(s, m);
    }
  }
}

// 寫出完整分佈（給 MVP 用）：stem / total / 主pct,対pct,...（前 3 名）
{
  const out = ['stem\ttotal\tmaxshare\tcases'];
  for (const [s, m] of byStem) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    if (total < 20) continue;
    const sorted = [...m].sort((a, b) => b[1] - a[1]);
    const maxShare = sorted[0][1] / total;
    const pcts = sorted.map(([c, n]) => [c, Math.round((n / total) * 100)] as [string, number]).filter(([, x]) => x >= 1);
    out.push(`${s}\t${total}\t${maxShare.toFixed(2)}\t${pcts.map(([c, x]) => `${c}${x}`).join(',')}`);
  }
  require('node:fs').writeFileSync(join(OUT_DIR, 'case-by-stem.tsv'), out.join('\n') + '\n', 'utf8');
  console.log(`data/cs-decomp/case-by-stem.tsv（${out.length - 1} 列）`);
}

const rows = [...byStem]
  .map(([s, m]) => [s, [...m.values()].reduce((a, b) => a + b, 0), m] as [string, number, Map<string, number>])
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP);
// 精簡：只存前兩個格位的百分比（例 "主96具3"），大幅縮小
const payload = rows.map(([s, total, m]) => {
  const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 2);
  return [s, total, top.map(([c, n]) => `${c}${Math.round((n / total) * 100)}`).join('')];
});
const json = JSON.stringify(payload);
const gz = gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).length;
console.log(`前 ${TOP.toLocaleString()} 個詞幹；JSON ${(json.length / 1024).toFixed(0)} KB、gzip ${(gz / 1024).toFixed(0)} KB`);
console.log('樣本：' + JSON.stringify(payload.slice(0, 3)));
