#!/usr/bin/env bun
/**
 * 把 `data/<db>/` 的文字打包成 **不建全文索引** 的 adb，放進 `accelon26/`。
 *
 *   bun run src/pack.ts            # 全部譯本
 *   bun run src/pack.ts cs-mm      # 只打一個
 *
 * 為什麼不建索引（作者 2026-11-02）：巴利／緬／日這些語種的中文 tokenizer 還沒定，
 * 先只做閱讀（正文、標記、目錄資料都在），搜尋留給有索引的庫。`authorAdb({fullTextIndex:false})`
 * 會照樣產生 `source`／`tags`／`tables`／`attributes`／`caches`，只是沒有 `tokens`。
 * （見 `docs/steps.md` §4.1）
 *
 * 行序：`00.xml`（宣告）→ 每本書 `<書>.xml` → 它的註文 `<書>-fn.xml`。
 * 一書一檔，檔名就是書 id（`dn1.xml`），所以行號在檔案層級仍然對得起來。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authorAdb } from '../../adb-converter/ts/src/adbauthor';
import { MAXLINELEN } from '../../adb-converter/ts/src/index-builder';
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
import { canonOrder } from '../../adb-converter/ts/tools/off2accelon';
import { PROFILES } from './profiles';

const ROOT = join(import.meta.dir, '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'accelon26');

const readLines = (p: string): string[] => {
  const t = readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const ls = t.split('\n');
  if (ls.length && ls[ls.length - 1] === '') ls.pop();
  return ls;
};

/** 一本庫的全部行：宣告 → 各書（canon 順序）→ 該書的註文。 */
const bookLines = (dir: string): { lines: string[]; books: number; notes: number } => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.xml'));
  const notes = new Set(files.filter((f) => f.endsWith('-fn.xml')));
  const books = files
    .filter((f) => f !== '00.xml' && !f.endsWith('-fn.xml'))
    .map((f) => f.slice(0, -4))
    .sort(canonOrder);
  const lines: string[] = [];
  if (files.includes('00.xml')) lines.push(...readLines(join(dir, '00.xml')));
  let noteFiles = 0;
  for (const book of books) {
    lines.push(...readLines(join(dir, `${book}.xml`)));
    const fn = `${book}-fn.xml`;
    if (notes.has(fn)) {
      lines.push(...readLines(join(dir, fn)));
      noteFiles++;
    }
  }
  return { lines, books: books.length, notes: noteFiles };
};

const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const names = Object.keys(PROFILES).filter((n) => !only || n === only);
if (!names.length) {
  console.error(`沒有這個譯本：${only}`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
for (const name of names) {
  const dir = join(DATA, name);
  if (!existsSync(dir)) {
    console.error(`${name}: 沒有 ${dir}（先跑 bun run src/off2accelon.ts ${name}）`);
    continue;
  }
  const { lines, books, notes } = bookLines(dir);
  // 行長上限（8192 bytes = 4096 字）：超過會讓行表與內文錯開
  const over = lines.map((l, i) => [i + 1, l.length] as const).filter(([, n]) => n * 2 > MAXLINELEN);
  if (over.length) {
    throw new Error(
      `${name}: ${over.length} 行超過 ${MAXLINELEN / 2} 字，例如 ${over
        .slice(0, 3)
        .map(([i, n]) => `第 ${i} 行 ${n} 字`)
        .join('、')}`,
    );
  }

  const profile = PROFILES[name];
  const adbName = profile.adb ?? name;
  const res = await authorAdb({
    dbname: adbName,
    dbcname: profile.dbcname ?? name,
    lines,
    fullTextIndex: false,
    log: (m) => console.log(`  ${m}`),
  });

  const buf = Buffer.from(res.file);
  buf.writeUInt32LE(0, 100); // andtagid：新庫沒有 docdef，歸零
  const dest = join(OUT, `${name}.adb`);
  writeFileSync(dest + '.new', buf);
  renameSync(dest + '.new', dest);

  // 驗證：開回來看行數與容器（沒有 tokens 才對）
  const r = await AdbReader.open(new SyncIO(dest));
  const containers = [...r.containers.keys()].join(',');
  const ok = r.header.lineCount === lines.length && !r.containers.has('tokens');
  console.log(
    `${name.padEnd(6)} ${books} 本${notes ? `＋${notes} 註文` : ''}  ${lines.length} 行  ` +
      `${(buf.length / 1048576).toFixed(2)} MiB  容器 ${containers}  ${ok ? '✓' : '✗ 行數不符'}`,
  );
  if (!ok) process.exitCode = 1;
}
console.log(`完成，用時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
