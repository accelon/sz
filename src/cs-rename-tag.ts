#!/usr/bin/env bun
/**
 * 一次性（可重跑）遷移：把 `data/cs/*.xml` 的**詞譜**標籤 `<詞 …>` 改成 `<辭 …>`。
 *
 *   bun run src/cs-rename-tag.ts --check    # 只盤點，不寫檔
 *   bun run src/cs-rename-tag.ts            # 改 data/cs（UTF-8、LF、無 BOM）
 *
 * 2026-11-06 作者指示：cs 的詞譜由 `<詞 b j>` 改成 `<辭 b j>`，和詞典
 * （cyd／hydzd…）的 `<詞>` 詞頭分開；閱讀器兩種都認。
 *
 * 只動**標籤名**（`</?詞` 後面接空白或 `>` 才算），正文裡的「詞」字不動，
 * 屬性 b／j／w／f 一字不改。每改完一個檔都驗一次「去掉標籤後文字完全相同」，
 * 不同就中止，不寫回。
 *
 * 不改 `data/cs-mm`、`data/cs-decomp`（那些不是詞譜），也不碰別的詞典。
 * 從零重跑時不必用這支：`src/cs2accelon.ts` → `src/provident-text.ts` 已直接產 `<辭>`。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const DIR = join(ROOT, 'data', 'cs');
const check = process.argv.includes('--check');
/** 只認標籤：`<詞` 後面必須是空白或 `>`（`<詞典>` 這種不會誤中） */
const OLD = /<\/?詞(?=[\s>])/g;
const NEW = /<\/?辭(?=[\s>])/g;
const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');

let files = 0;
let changed = 0;
let openBefore = 0;
let openAfter = 0;
let closeBefore = 0;
let closeAfter = 0;
const changedFiles: string[] = [];

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.xml')).sort()) {
  files++;
  const p = join(DIR, name);
  const src = readFileSync(p, 'utf8');
  const ob = (src.match(/<詞(?=[\s>])/g) ?? []).length;
  const cb = (src.match(/<\/詞>/g) ?? []).length;
  openBefore += ob;
  closeBefore += cb;
  if (!ob && !cb) continue;

  const dst = src.replace(OLD, (m) => (m.startsWith('</') ? '</辭' : '<辭'));
  const oa = (dst.match(/<辭(?=[\s>])/g) ?? []).length;
  const ca = (dst.match(/<\/辭>/g) ?? []).length;
  if ((dst.match(OLD) ?? []).length) throw new Error(`${name}：還有 <詞 標籤`);
  if (oa !== ob || ca !== cb) throw new Error(`${name}：標籤數不符 ${ob}/${oa}、${cb}/${ca}`);
  if (stripTags(src) !== stripTags(dst)) throw new Error(`${name}：去掉標籤後文字不同`);
  if (dst.length !== src.length) throw new Error(`${name}：長度變了 ${src.length} → ${dst.length}`);
  openAfter += oa;
  closeAfter += ca;
  changed++;
  changedFiles.push(name);
  if (!check) writeFileSync(p, dst, 'utf8');
}

console.log(
  `${check ? '盤點' : '已改'} ${files} 檔（有詞譜 ${changed} 檔）：` +
    `<詞 ${openBefore}／</詞> ${closeBefore} → <辭 ${openAfter}／</辭> ${closeAfter}`,
);
if (changedFiles.length) console.log(`檔案：${changedFiles.slice(0, 8).join('、')}${changedFiles.length > 8 ? `…（共 ${changedFiles.length}）` : ''}`);
// 剩下還沒改的（--check 時等於上面那批）
const left = files - changed;
if (left) console.log(`沒有 <詞> 標籤的檔：${left}`);
if (check && changed) process.exitCode = 1;
