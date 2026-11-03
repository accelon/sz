#!/usr/bin/env bun
/**
 * 一個詞有幾個義項？——中文詞典的編號義項，決定「詞頁要不要列多義」。
 *
 *   bun run src/decomp/sense-probe.ts [詞…]
 */
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const db = new Database('C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db', { readonly: true });
const rows = db.query('select dict_key, dict_content from opentipitaka_dict_zh').all() as {
  dict_key: string;
  dict_content: string;
}[];
const senses = new Map<string, string[]>();
for (const r of rows) {
  if (senses.has(r.dict_key)) continue;
  const parts = r.dict_content.split(/\n(?=\d+\.\s)/).map((x) => x.trim()).filter(Boolean);
  senses.set(r.dict_key, parts);
}
db.close();

const dist = new Map<number, number>();
for (const [, s] of senses) dist.set(s.length, (dist.get(s.length) ?? 0) + 1);
console.log('義項數分佈：' + [...dist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}義:${v}`).join('  '));

const args = process.argv.slice(2);
if (args.length) {
  for (const w of args) {
    const s = senses.get(w);
    console.log(`\n=== ${w}：${s?.length ?? 0} 義 ===`);
    for (const x of (s ?? []).slice(0, 5)) console.log('  ' + x.replace(/\n/g, ' ').slice(0, 90));
  }
}

/* MVP 詞裡有多少是多義 */
const html = readFileSync('D:/2026/sz/out/word-groups.html', 'utf8');
const d = JSON.parse(gunzipSync(Buffer.from(/window\.__DATA_GZ__ = "([^"]*)"/.exec(html)![1], 'base64')).toString('utf8'));
const names: string[] = [];
let prev = '';
for (const r of d.words as [number, string, number, number][]) {
  const n = prev.slice(0, r[0]) + r[1];
  names.push(n);
  prev = n;
}
let multi = 0;
let chars = 0;
for (const w of names) {
  const s = senses.get(w);
  if (s && s.length >= 2 && s.length <= 5) {
    multi++;
    chars += s.reduce((a, x) => a + x.split('\n')[0].length, 0);
  }
}
console.log(`\nMVP ${names.length.toLocaleString()} 詞；2–5 義的 ${multi.toLocaleString()}；義項首行合計 ${chars.toLocaleString()} 字`);
