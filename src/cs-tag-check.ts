#!/usr/bin/env bun
/**
 * cs 詞譜標籤驗收（2026-11-06 起）：`<詞>` → `<辭>`。
 *
 *   bun run src/cs-tag-check.ts                 # 預設檢查 accelon26/cs.adb、cs-lex.adb
 *   bun run src/cs-tag-check.ts accelon26/cs.adb
 *
 * 檢查：
 *   1. `data/cs/*.xml` 沒有 `<詞>` 標籤，`<辭>` 開／閉數相等。
 *   2. adb 的 source 沒有 `<詞>`；`<辭>` 開／閉數相等；cs.adb 的數量和 `data/cs` 相同。
 *   3. `tags` 容器只有 `辭`／`/辭`（沒有 `詞`），`attributes` 是 `辭.b`／`辭.f`／`辭.j`。
 *   4. 真的拿一行詞譜給閱讀器的 `Accelon3Renderer` 畫：要長 `.word` span，`data-b`／`data-j` 還在。
 *   5. 印出行數、字元數、tokens（跟改名前的 1,028,311／116,146,056／841,154 對照）。
 *
 * 失敗時 exit code 1。只讀檔，不改任何東西。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
import { Accelon3Renderer } from '../../adb-converter/ts/src/accelon26/render_accelon3';
import { ROOT } from './profiles';

const OPEN_CI = /<詞(?=[\s>])/g;
const CLOSE_CI = /<\/詞>/g;
const OPEN_SI = /<辭(?=[\s>])/g;
const CLOSE_SI = /<\/辭>/g;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

let bad = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? `　${detail}` : ''}`);
  if (!cond) bad++;
};

/* ---------------------------------------------------------------- data/cs */
const DIR = join(ROOT, 'data', 'cs');
let dataCi = 0;
let dataSi = 0;
let dataSiClose = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.xml'))) {
  const s = readFileSync(join(DIR, f), 'utf8');
  dataCi += count(s, OPEN_CI);
  dataSi += count(s, OPEN_SI);
  dataSiClose += count(s, CLOSE_SI);
}
console.log(`data/cs：<詞> ${dataCi}　<辭> ${dataSi}／</辭> ${dataSiClose}`);
ok('data/cs 沒有 <詞> 標籤', dataCi === 0);
ok('data/cs 的 <辭> 開／閉數相等', dataSi > 0 && dataSi === dataSiClose);

/* ---------------------------------------------------------------- adb */
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [join(ROOT, 'accelon26', 'cs.adb'), join(ROOT, 'accelon26', 'cs-lex.adb')];

for (const file of files) {
  const r = await AdbReader.open(new SyncIO(file));
  const src = r.containers.get('source')!;
  const parts: string[] = [];
  for (let i = 0; i < src.count; i++) parts.push(await r.sourceText(i));
  const all = parts.join('');
  const ci = count(all, OPEN_CI);
  const si = count(all, OPEN_SI);
  const siClose = count(all, CLOSE_SI);
  const name = file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
  console.log(`\n=== ${name} ===`);
  console.log(
    `行 ${r.header.lineCount}　字元 ${all.length}　tokens ${r.containers.get('tokens')?.count ?? '（無）'}` +
      `　<詞> ${ci}　<辭> ${si}／</辭> ${siClose}`,
  );
  ok(`${name}：沒有 <詞>`, ci === 0);
  ok(`${name}：<辭> 開／閉數相等`, si > 0 && si === siClose);

  const tags = r.containers.get('tags')!;
  const attrs = r.containers.get('attributes')!;
  const tagNames = tags.names.filter((x) => x.includes('詞') || x.includes('辭'));
  const attrNames = attrs.names.filter((x) => x.includes('詞') || x.includes('辭'));
  ok(`${name}：tags 只有 辭`, tagNames.includes('辭') && !tags.names.includes('詞'), tagNames.join('、'));
  ok(`${name}：attributes 是 辭.*`, attrNames.length > 0 && !attrs.names.some((x) => x.startsWith('詞.')), attrNames.join('、'));

  const line = parts.find((t) => t.includes('<辭 '))?.split('\n').find((l) => l.includes('<辭 ')) ?? '';
  const html = line ? new Accelon3Renderer({ depthOf: new Map(), levels: 0 }, { dictEntries: false }).lineInfo(line, 1).html : '';
  const spans = count(html, /class="word"/g);
  const first = /<span class="word"([^>]*)>/.exec(html)?.[1] ?? '';
  ok(`${name}：詞譜仍長 .word span`, spans > 0 && /data-b="[^"]+"/.test(first), `${spans} 個`);
  ok(`${name}：data-b／data-j 保留`, /data-b="[^"]+"/.test(first) && /data-j="[^"]*"/.test(first), first.trim());

  if (file.endsWith('cs.adb')) ok('cs.adb 的 <辭> 數量＝data/cs', si === dataSi, `${si} vs ${dataSi}`);
}

console.log(bad ? `\n${bad} 項失敗` : '\n全部通過');
if (bad) process.exitCode = 1;
