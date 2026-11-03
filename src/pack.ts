#!/usr/bin/env bun
/**
 * 把 `data/<db>/` 的文字打包成 **不建全文索引** 的 adb，放進 `accelon26/`。
 *
 *   bun run src/pack.ts            # 全部譯本（預設建全文索引；作者 2026-11-02 定案）
 *   bun run src/pack.ts cs-mm      # 只打一個
 *   bun run src/pack.ts sc --no-index # 特殊情況才不建索引
 *
 * 十個 adb 的 token 必須獨立：每個庫用自己的語言／翻譯風格建 tokenizer 與 stoplist。
 * `authorAdb` 仍會產生 `source`／`tags`／`tables`／`attributes`／`caches`；建索引時多 `tokens`。
 * `--no-index` 只保留給「tokenizer 還沒定」的實驗庫，不用於 sz 的十個譯本。
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
import { PARALLEL_GROUP, PROFILES } from './profiles';

const ROOT = join(import.meta.dir, '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'accelon26');
/** 巴利庫的句讀與 ASCII 標點：只佔 VA，不進 token 索引。 */
const PALI_PUNCT = '।॥‘’“”!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

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

const args = process.argv.slice(2);
// 十個譯本都要全文索引（作者 2026-11-02 定案）；--no-index 只留給實驗。
const withIndex = !args.includes('--no-index');
// --from <dir>：從別的目錄打包（例如先驗收 data/cs-deva-iast，不覆蓋 data/cs）
const fromAt = args.indexOf('--from');
const fromDir = fromAt >= 0 ? args[fromAt + 1] ?? '' : '';
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--from');
const only = positional[0] ?? '';
const names = Object.keys(PROFILES).filter((n) => !only || n === only);
if (!names.length) {
  console.error(`沒有這個譯本：${only}`);
  process.exit(2);
}
if (fromDir && names.length !== 1) {
  console.error('--from 只能配合單一譯本使用');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

/**
 * 把平行群寫進宣告行：`<集>` → `<集 p="cs">`（2026-11-02）。
 *
 * 閱讀器不再寫死「哪些庫可以互相對讀」，改看 `<集 p="上游 dbname">`；
 * 這一群巴利譯本的上游是 `cs`（見 src/profiles.ts 的 PARALLEL_GROUP）。
 * 已經有 `p=` 就不動（允許手動指定）。
 */
const withParallelGroup = (lines: string[], group: string | undefined): string[] => {
  if (!group) return lines;
  const i = lines.findIndex((l) => l.startsWith('<檔'));
  if (i < 0) return lines;
  if (/<集\s[^>]*\bp=/.test(lines[i])) return lines;
  lines[i] = lines[i].replace('<集>', `<集 p="${group}">`);
  return lines;
};

const t0 = Date.now();
for (const name of names) {
  const dir = fromDir ? join(ROOT, fromDir) : join(DATA, name);
  if (!existsSync(dir)) {
    console.error(`${name}: 沒有 ${dir}（先跑 bun run src/off2accelon.ts ${name}）`);
    continue;
  }
  const { lines: rawLines, books, notes } = bookLines(dir);
  const lines = withParallelGroup(rawLines, PARALLEL_GROUP[name]);
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
    fullTextIndex: withIndex,
    // cs／sc 的目錄編號／頁碼（1.1.1、0206…）不當詞索引；VA 照樣前進。
    dropNumeric: name === 'cs' || name === 'sc',
    // cs／sc 的句讀、引號與 ASCII 標點不當詞索引。
    dropPunct: name === 'cs' || name === 'sc' ? PALI_PUNCT
      : name === 'cs-mm' ? '၏၊။'
      : name === 'cllk' ? 'ๆฯ'
      : name === 'kmj' ? '、。・「」『』（）'
      : undefined,
    // 日文（kmj）：漢字／假名用 ICU 日文詞典切詞；中文庫不開。
    japanese: name === 'kmj',
    log: (m) => console.log(`  ${m}`),
  });

  const buf = Buffer.from(res.file);
  buf.writeUInt32LE(0, 100); // andtagid：新庫沒有 docdef，歸零
  const dest = join(OUT, `${name}.adb`);
  writeFileSync(dest + '.new', buf);
  renameSync(dest + '.new', dest);

  // 驗證：開回來看行數與容器（--index 時必須有 tokens；否則不該有）
  const r = await AdbReader.open(new SyncIO(dest));
  const containers = [...r.containers.keys()].join(',');
  const hasTokens = r.containers.has('tokens');
  const ok = r.header.lineCount === lines.length && hasTokens === withIndex;
  console.log(
    `${name.padEnd(6)} ${books} 本${notes ? `＋${notes} 註文` : ''}  ${lines.length} 行  ` +
      `${(buf.length / 1048576).toFixed(2)} MiB  容器 ${containers}  ${ok ? '✓' : '✗ 行數／tokens 不符'}`,
  );
  if (!ok) process.exitCode = 1;
}
console.log(`完成，用時 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
