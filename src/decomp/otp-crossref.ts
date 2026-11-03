#!/usr/bin/env bun
/**
 * OpenTipitaka 其他拆分來源的**對照抽樣**：拿 MVP 裡的「原子詞」（pwa 不再拆的詞），
 * 去比對 dpd 的複合分析與 pm12e 的 `[A+B]` 構詞分析。
 *
 *   bun run src/decomp/otp-crossref.ts
 *
 * 產物：data/cs-decomp/otp-crossref.tsv（只收 dpd 有 comp 分析的，量小、品質好）
 * 用途：人工看「這些詞是不是真的還能再拆」，決定要不要接詞綴層。
 */
import { Database } from 'bun:sqlite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const db = new Database(
  'C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db',
  { readonly: true },
);

const pwa = new Map<string, { hyphen: string[]; stems: string[] }>();
for (const r of db.query('select dict_key, dict_content from pwa').all() as { dict_key: string; dict_content: string }[]) {
  const c = r.dict_content;
  const hyphen = c.split('(')[0].trim().split('-').map((s) => s.trim()).filter(Boolean);
  const m = /\(([^()]*)\)\s*$/.exec(c);
  pwa.set(r.dict_key, { hyphen, stems: m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [] });
}

const clean = (s: string): string => {
  let x = s.trim();
  if (x.includes('>')) x = x.split('>').pop()!.trim();
  return x.replace(/[\[\]*√]/g, '').trim();
};

/** dpd：只收 grammar 標 comp 的（詞級複合），詞源的不要 */
const dpdComp = new Map<string, string[]>();
const dpdSandhi = new Map<string, string[]>();
for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
  const lines = r.dict_content.split('\n');
  const grammar = lines[0] ?? '';
  const cons = lines.find((l) => l.includes('+'));
  if (!cons) continue;
  const parts = cons.split('+').map(clean).filter(Boolean);
  if (parts.length < 2) continue;
  if (/(^|,)\s*comp\b/.test(grammar)) dpdComp.set(r.dict_key, parts);
  if (/sandhi/.test(grammar)) dpdSandhi.set(r.dict_key, parts);
}

const pm12e = new Map<string, string[]>();
for (const r of db.query('select dict_key, dict_content from pm12e').all() as { dict_key: string; dict_content: string }[]) {
  const m = /^\s*\[([^\]]+)\]/.exec(r.dict_content);
  if (!m) continue;
  const parts = m[1].split('+').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) pm12e.set(r.dict_key, parts);
}

/** MVP 的詞形（前綴壓縮還原） */
const html = readFileSync(join(ROOT, 'out', 'word-groups.html'), 'utf8');
const b64 = /window\.__DATA_GZ__ = "([^"]*)"/.exec(html)![1];
const data = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')) as {
  words: [number, string, number, number, unknown][];
};
const entries: { w: string; n: number }[] = [];
let prev = '';
for (const r of data.words) {
  const name = prev.slice(0, r[0]) + r[1];
  entries.push({ w: name, n: r[2] });
  prev = name;
}

const rows = ['word\tcount\tlemma\tdpd_comp\tpm12e'];
let atoms = 0;
let comp = 0;
let pm = 0;
for (const e of entries) {
  const p = pwa.get(e.w);
  if (!p || p.hyphen.length >= 2) continue;
  atoms++;
  const lemma = p.stems[0] ?? '';
  if (!lemma) continue;
  const c = dpdComp.get(lemma);
  const q = pm12e.get(lemma);
  if (c) comp++;
  if (q) pm++;
  if (!c) continue; // 只收 dpd 有詞級分析的
  rows.push(`${e.w}\t${e.n}\t${lemma}\t${c.join('+')}\t${(q ?? []).join('+')}`);
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'otp-crossref.tsv'), rows.join('\n') + '\n', 'utf8');
console.log(`MVP 原子詞 ${atoms}`);
console.log(`  dpd comp 有 ${comp}（${((comp / atoms) * 100).toFixed(1)}%）`);
console.log(`  pm12e 有 ${pm}（${((pm / atoms) * 100).toFixed(1)}%）`);
console.log('  dpd sandhi 詞頭總數', dpdSandhi.size);
console.log(`\n${join(OUT_DIR, 'otp-crossref.tsv')}（${rows.length - 1} 列）`);
