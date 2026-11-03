#!/usr/bin/env bun
/**
 * token list 的精度稽核：建進索引的 token，有多少不是詞典裡的詞？
 *
 *   bun run src/decomp/token-audit.ts
 *
 * 「詞典裡的詞」＝ pwa 的詞頭（956k）或 dpd 的詞頭（74k）。
 * 不是詞典詞的 token，多半是拆詞拆壞的碎片（pwa 的 9.7% 壞拆法）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';

const db = new Database(DICT_DB, { readonly: true });
const known = new Set<string>();
for (const r of db.query('select dict_key from pwa').all() as { dict_key: string }[]) known.add(r.dict_key);
for (const r of db.query('select dict_key from dpd').all() as { dict_key: string }[]) known.add(r.dict_key);
db.close();
console.log(`詞典詞頭 ${known.size.toLocaleString()}`);

const rows = readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1);
type Row = { token: string; posting: number; action: string };
const all: Row[] = [];
for (const line of rows) {
  const [token, posting, action] = line.split('\t');
  if (!token) continue;
  all.push({ token, posting: Number(posting) || 0, action });
}
const keep = all.filter((r) => r.action === 'keep');
const unknown = keep.filter((r) => !known.has(r.token));
const totalPost = keep.reduce((n, r) => n + r.posting, 0);
const unknownPost = unknown.reduce((n, r) => n + r.posting, 0);
console.log(`keep token ${keep.length.toLocaleString()}；不是詞典詞 ${unknown.length.toLocaleString()}（${((unknown.length / keep.length) * 100).toFixed(1)}%）`);
console.log(`posting：總 ${totalPost.toLocaleString()}，其中非詞典詞 ${unknownPost.toLocaleString()}（${((unknownPost / totalPost) * 100).toFixed(1)}%）`);

const top = unknown.sort((a, b) => b.posting - a.posting).slice(0, 20);
console.log('\n最常見的非詞典詞 token：');
console.log('  ' + top.map((r) => `${r.token}(${r.posting})`).join(' '));

/* 建議：非詞典詞的 token 怎麼處理 */
const dropPost = unknownPost;
const fallbackPost = unknownPost; // 退回整詞，posting 不變但 token 換成原詞
console.log(`\n若把非詞典詞的 token 丟掉：posting 少 ${dropPost.toLocaleString()}（${((dropPost / totalPost) * 100).toFixed(1)}%），token 少 ${unknown.length.toLocaleString()}`);
