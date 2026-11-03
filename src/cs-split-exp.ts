#!/usr/bin/env bun
/**
 * 實驗：把 dn1–dn3 的複合詞在**正文裡先拆好**（用空白），放進 `data/cs-split/`。
 *
 *   bun run src/cs-split-exp.ts
 *
 * 目的（作者 2026-11-03）：讓 adb 的源文直接存拆好的形態，reader 不必揹整套拆分詞庫，
 * 只要一點屈折規則就能查詞。VA 數會變（空白增加 token），實驗性質、不動 `data/cs`。
 *
 * 拆法來源：OpenTipitaka 的 `pwa` 表，`dict_content` 的 `addhāna-magga-paṭipanno(...)`
 * 取第一個括號前的連字號形態，換成空白。
 */
import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const DB = 'C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db';
const BOOKS = ['dn1', 'dn2', 'dn3'];
const OUT = join(ROOT, 'data', 'cs-split');

const db = new Database(DB, { readonly: true });
const splits = new Map<string, string[]>();
for (const r of db.query('SELECT dict_key, dict_content FROM pwa').all() as { dict_key: string; dict_content: string }[]) {
  const head = String(r.dict_content).split('(')[0]!.trim();
  if (!head.includes('-')) continue;
  const parts = head.split('-').filter(Boolean).map((x) => x.trim());
  if (parts.length > 1) splits.set(r.dict_key.toLowerCase(), parts);
}
console.log(`pwa 拆解表：${splits.size} 個詞形`);

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, '00.xml'),
  '<檔 n="cs-split"><集>巴利三藏（VRI／CST4，拆詞實驗）</集><英文名>Pali Tipitaka (VRI, word-split experiment)</英文名></檔>\n' +
    '<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>\n',
  'utf8',
);

let words = 0, split = 0, lines = 0;
for (const book of BOOKS) {
  const src = join(ROOT, 'data', 'cs', `${book}.xml`);
  if (!existsSync(src)) {
    console.error(`缺少 ${src}`);
    process.exit(2);
  }
  const text = readFileSync(src, 'utf8').replace(/\r\n?/g, '\n').trimEnd();
  const out = text.replace(/<詞[^>]*>([^<]*)<\/詞>/g, (_m, w: string) => {
    words++;
    const parts = splits.get(w.toLowerCase());
    if (!parts) return w;
    split++;
    return parts.join(' ');
  });
  lines += out.split('\n').length;
  writeFileSync(join(OUT, `${book}.xml`), out + '\n', 'utf8');
}
console.log(`dn1–dn3：<詞> ${words}，拆開 ${split}（${((split / words) * 100).toFixed(1)}%）；輸出 ${lines} 行 → data/cs-split/`);
