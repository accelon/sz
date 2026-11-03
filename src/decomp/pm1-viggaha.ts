#!/usr/bin/env bun
/**
 * pm1（緬甸 Tipiṭaka 辭典）的 `viggaha` → IAST 詞解析。
 *
 * `docker` 裡的 pm1 有 154,229 條 viggaha（複合詞解析），但詞件是緬文；
 * 用 `mm2iast.ts`（自己寫的緬文巴利→IAST）轉寫後，就能跟 pwa／dpd 對照。
 *
 *   bun run src/decomp/pm1-viggaha.ts
 *
 * 產物：data/cs-decomp/pm1-viggaha.tsv
 *   只收「詞件全部是字典詞」且「詞頭是 pwa 認為原子」的，量小、可直接併進 MVP。
 */
import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';
import { mm2iast } from './mm2iast';

const db = new Database(DICT_DB, { readonly: true });

const known = new Set<string>();
const pwa = new Map<string, { parts: string[]; stems: string[] }>();
for (const r of db.query('select dict_key, dict_content from pwa').all() as { dict_key: string; dict_content: string }[]) {
  known.add(r.dict_key);
  const c = r.dict_content;
  const parts = c.split('(')[0].trim().split('-').map((s) => s.trim()).filter(Boolean);
  const m = /\(([^()]*)\)\s*$/.exec(c);
  pwa.set(r.dict_key, { parts, stems: m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [] });
}
for (const r of db.query('select dict_key from dpd').all() as { dict_key: string }[]) known.add(r.dict_key);

/* pm1 的 viggaha：取「။」之前的解析（後面是文法說明） */
const VIG = /<div class="viggaha">([\s\S]*?)<\/div>/;
const rows: { word: string; parts: string[] }[] = [];
let total = 0;
for (const r of db.query('select dict_key, dict_content from pm1').all() as { dict_key: string; dict_content: string }[]) {
  const m = VIG.exec(r.dict_content);
  if (!m) continue;
  const inner = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!inner) continue;
  const head = inner.split('။')[0].replace(/\[|\]/g, ' ').trim();
  if (!head.includes('+')) continue;
  const parts = head.split('+').map((x) => mm2iast(x.trim())).filter(Boolean);
  if (parts.length < 2 || parts.length > 6) continue;
  if (!parts.every((p) => /^[A-Za-zāīūṅñṭḍṇḷṃ]+$/.test(p) && known.has(p))) continue;
  total++;
  rows.push({ word: r.dict_key, parts });
}
console.log(`pm1 viggaha：可解析且詞件全部認得 ${total} 條`);

/* MVP 的詞（前綴壓縮還原），只用來算「pwa 說原子、pm1 卻拆得開」的量 */
const html = readFileSync(join(ROOT, 'out', 'word-groups.html'), 'utf8');
const b64 = /window\.__DATA_GZ__ = "([^"]*)"/.exec(html)?.[1];
const entries: { w: string; n: number }[] = [];
if (b64) {
  const data = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')) as {
    words: [number, string, number, number, unknown][];
  };
  let prev = '';
  for (const r of data.words) {
    const name = prev.slice(0, r[0]) + r[1];
    entries.push({ w: name, n: r[2] });
    prev = name;
  }
}
const byWord = new Map(rows.map((r) => [r.word, r.parts]));
let atoms = 0;
let hit = 0;
const samples: string[] = [];
for (const e of entries) {
  const p = pwa.get(e.w);
  if (!p || p.parts.length >= 2) continue;
  atoms++;
  const parts = byWord.get(e.w) ?? (p.stems[0] ? byWord.get(p.stems[0]) : undefined);
  if (!parts) continue;
  hit++;
  if (samples.length < 12 && e.n > 20) samples.push(`${e.w}（${e.n}）→ ${parts.join(' + ')}`);
}
console.log(`MVP 的原子詞 ${atoms}；pm1 拆得開 ${hit}（${((hit / atoms) * 100).toFixed(1)}%）`);
console.log(samples.join('\n'));

mkdirSync(OUT_DIR, { recursive: true });
const out = ['word\tparts\tn'];
const mvpSet = new Set(entries.map((e) => e.w));
for (const r of rows) {
  if (!mvpSet.has(r.word)) continue;
  out.push(`${r.word}\t${r.parts.join('+')}\t${entries.find((e) => e.w === r.word)?.n ?? 0}`);
}
writeFileSync(join(OUT_DIR, 'pm1-viggaha.tsv'), out.join('\n') + '\n', 'utf8');
console.log(`\n${join(OUT_DIR, 'pm1-viggaha.tsv')}（${out.length - 1} 列，只收 MVP 有的詞）`);
db.close();
