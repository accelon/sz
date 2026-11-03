#!/usr/bin/env bun
/**
 * 用 dpd 的「詞基 + 語尾」把詞幹收斂成 canonical token。
 *
 *   bun run src/decomp/stem-canonical.ts
 *
 * dpd 詞條的第三欄是「詞基 + 語尾」（例如 rājā → rāja + ā、mahā → mahanta + ā）。
 * 拿它把 pwa 每個詞形的詞幹對到詞基，同一個詞就不會散成 rāja / rājan 兩個 token。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';

const db = new Database(DICT_DB, { readonly: true });

/* pwa：詞形 → 詞幹 */
const stemOf = new Map<string, string>();
for (const r of db.query('select dict_key, dict_content from pwa').all() as { dict_key: string; dict_content: string }[]) {
  const m = /\(([^()]*)\)\s*$/.exec(r.dict_content);
  const s = m ? m[1].split(',')[0].trim() : '';
  if (s) stemOf.set(r.dict_key, s);
}

/* dpd：詞條 → 詞基（第三欄「X + 語尾」） */
let canon = 0;
const baseOf = new Map<string, string>();
for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
  if (baseOf.has(r.dict_key)) continue;
  // 詞基寫在內容的某一行（不是第一行），逐行找「X + 語尾」
  const fields = r.dict_content.split('\n').flatMap((l) => l.split('|')).map((x) => x.trim());
  for (const f of fields) {
    const m = /^([\p{L}\p{M}]+)\s*\+\s*[\p{L}\p{M}]+$/u.exec(f);
    if (!m) continue;
    baseOf.set(r.dict_key, m[1]);
    canon++;
    break;
  }
}
db.close();
console.log(`dpd 詞基 ${canon.toLocaleString()} 條`);

/* 詞幹 → 詞基：用「lemma 自己的詞幹」對應 */
const stemToBase = new Map<string, string>();
for (const [lemma, base] of baseOf) {
  const s = stemOf.get(lemma);
  if (!s) continue;
  if (!stemToBase.has(s)) stemToBase.set(s, base);
}
console.log(`詞幹→詞基 ${stemToBase.size.toLocaleString()} 組`);

/* 套到 token list */
const rows = readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1);
const tokenPost = new Map<string, number>();
for (const line of rows) {
  const [t, p, a] = line.split('\t');
  if (!t || a !== 'keep') continue;
  const c = stemToBase.get(t) ?? t;
  tokenPost.set(c, (tokenPost.get(c) ?? 0) + (Number(p) || 0));
}
const totalTok = [...tokenPost.keys()].length;
const totalPost = [...tokenPost.values()].reduce((a, b) => a + b, 0);
console.log(`收斂後 token ${totalTok.toLocaleString()}（原 155,334）、posting ${totalPost.toLocaleString()}`);

/* 322 組有沒有收斂 */
let pairs = 0;
let merged = 0;
const ex: string[] = [];
const orig = new Map<string, number>();
for (const line of rows) {
  const [t, p, a] = line.split('\t');
  if (t && a === 'keep') orig.set(t, Number(p) || 0);
}
for (const [t, n] of orig) {
  if (!t.endsWith('n')) continue;
  const base = t.slice(0, -1);
  if (!orig.has(base)) continue;
  pairs++;
  const a = stemToBase.get(t) ?? t;
  const b = stemToBase.get(base) ?? base;
  if (a === b) { merged++; if (ex.length < 8) ex.push(`${base}+${t} → ${a}`); }
}
console.log(`詞幹成對 ${pairs} 組，收斂到同一個 ${merged} 組（${((merged / Math.max(1, pairs)) * 100).toFixed(0)}%）`);
console.log(ex.join('\n'));
