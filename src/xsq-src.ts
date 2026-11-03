#!/usr/bin/env bun
/**
 * `xsq`（蕭式球譯四部）的來源整理：把 `D:\2023\xsq\off\*.xsq.off` 轉成 `out/xsq-src/*.off`。
 *
 *   bun run src/xsq-src.ts
 *
 * 為什麼要這一層：
 *   1. 舊的 `D:\2023\cs-xsq\off` 沒有段號（只有 `^m`），所以 `data/xsq` 沒有 `<段>`，
 *      無法和 cs 逐段對齊。新的 `D:\2023\xsq\off` 有 `^n`（＝段號，6,554 個，與 cs 相同）。
 *   2. `^m` 是 PTS 段號（原譯本用的），不是我們的定位；轉檔時拉掉，免得正文多一堆 `<m>`。
 *   3. `an6` 來源有一個錯字：`^n120-130`，CST 是 `120-139`（下一段是 140）。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const SRC = 'D:/2023/xsq/off';
const OUT = join(ROOT, 'out', 'xsq-src');

const files = readdirSync(SRC).filter((f) => f.endsWith('.xsq.off')).sort();
if (!files.length) {
  console.error(`找不到 ${SRC}/*.xsq.off`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
let m = 0, fixed = 0;
for (const f of files) {
  const book = f.replace(/\.xsq\.off$/, '');
  let t = readFileSync(join(SRC, f), 'utf8').replace(/\r\n?/g, '\n');
  m += (t.match(/\^m[0-9]/g) ?? []).length;
  t = t.replace(/\^m[0-9]+(?:-[0-9]+)?/g, '');
  if (book === 'an6') {
    const before = t;
    t = t.replace('^n120-130', '^n120-139');
    if (t !== before) fixed++;
  }
  writeFileSync(join(OUT, `${book}.off`), t, 'utf8');
}
console.log(`xsq-src：${files.length} 冊；拉掉 ${m} 個 ^m（PTS 段號）；an6 修正 ${fixed} 處`);
