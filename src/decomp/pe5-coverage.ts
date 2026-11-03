#!/usr/bin/env bun
/**
 * pe5（字典庫的語法表）能補多少格位？只取「唯一分析」的形。
 *
 *   bun run src/decomp/pe5-coverage.ts
 *
 * pe5 的格式：詞形 → `m.s.abl.` 或多重分析 `m.s.dat.#nt.s.dat.#m.s.gen.`
 * 只採「單一分析、單一性數格」的形（不猜），量它能覆蓋我們語料的多少詞次。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;
const CASE_ZH: Record<string, string> = {
  nom: '主', acc: '対', ins: '具', dat: '与', abl: '奪', gen: '属', loc: '処', voc: '呼',
};

const db = new Database(DICT_DB, { readonly: true });
const single = new Map<string, { g: string; n: string; c: string }>();
const multi = new Set<string>();
for (const r of db.query('select dict_key, dict_content from pe5').all() as { dict_key: string; dict_content: string }[]) {
  const code = (r.dict_content.split('#')[0] ?? '').trim();
  const m = /^(m|f|nt)\.(s|pl)\.(nom|acc|ins|dat|abl|gen|loc|voc)\.$/.exec(code);
  if (!m) continue;
  const all = r.dict_content.split('#').length;
  if (all === 1) single.set(r.dict_key, { g: m[1], n: m[2], c: CASE_ZH[m[3]] });
  else multi.add(r.dict_key);
}
db.close();
console.log(`pe5：唯一分析的形 ${single.size.toLocaleString()}、多分析的形 ${multi.size.toLocaleString()}`);

/* 我們語料的覆蓋 */
let words = 0;
let hit = 0;
const dir = join(ROOT, 'data', 'cs');
const perFile: [string, number, number][] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml') && x !== '00.xml')) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  let w = 0;
  let h = 0;
  for (const raw of text.match(WORD_G) ?? []) {
    w++;
    if (single.has(raw.toLowerCase())) h++;
  }
  words += w;
  hit += h;
  if (h) perFile.push([f, w, h]);
}
console.log(`語料 ${words.toLocaleString()} 詞次；pe5 可唯一判定 ${hit.toLocaleString()}（${((hit / words) * 100).toFixed(1)}%）`);
perFile.sort((a, b) => b[2] - a[2]);
console.log('覆蓋最高的檔案：' + perFile.slice(0, 6).map(([f, w, h]) => `${f.replace('.xml', '')} ${((h / w) * 100).toFixed(0)}%`).join('  '));

/* 寫一份可直接用的表（形 → 性數格） */
const rows = ['form\tgender\tnumber\tcase'];
for (const [f, v] of [...single].sort()) rows.push(`${f}\t${v.g}\t${v.n}\t${v.c}`);
const out = join(OUT_DIR, 'pe5-single.tsv');
require('node:fs').writeFileSync(out, rows.join('\n') + '\n', 'utf8');
console.log(`${out}（${rows.length - 1} 列）`);
