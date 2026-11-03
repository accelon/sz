#!/usr/bin/env bun
/**
 * 驗收：`data/cs`（或 `--cur` 指定的目錄）的**定位骨架**是否和 provident 對齊版相同。
 *
 *   bun run src/cs-align-check.ts
 *   bun run src/cs-align-check.ts --ref data/cs.bak-2026-11-02
 *   bun run src/cs-align-check.ts --cur data/cs-deva-iast --ref data/cs.bak-2026-11-02
 *
 * 定位的基準是 `<區>`／`<書>`／`<塊>`／`<段>` 這些標記**落在第幾行**（`段` 也是讀窗的單元），
 * 所以這裡比：行數、每種標記的總數、以及逐行的標記簽章；文字內容不比（允許不同）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const args = process.argv.slice(2);
const refAt = args.indexOf('--ref');
const curAt = args.indexOf('--cur');
const REF = refAt >= 0 ? join(ROOT, args[refAt + 1]) : join(ROOT, 'data', 'cs.bak-2026-11-02');
const CUR = curAt >= 0 ? join(ROOT, args[curAt + 1]) : join(ROOT, 'data', 'cs');
if (!existsSync(REF) || !existsSync(CUR)) throw new Error('缺少 data/cs 或參考目錄');

const files = readdirSync(CUR).filter((f) => f.endsWith('.xml')).sort();
const ANCHOR = /<(區|書|塊|小塊|段)[^>]*>/g;
/** 這一行的定位標記（原樣、依出現順序） */
const structural = (l: string): string => (l.match(ANCHOR) ?? []).join('|');
const OPEN_TAG = /<(?![/!?])([^\s/>]+)/g;
const count = (ls: string[], tag: string): number =>
  ls.reduce((n, l) => n + [...l.matchAll(OPEN_TAG)].filter((m) => m[1] === tag).length, 0);
/** 有 `<段>` 的行號（段落在第幾行＝定位與讀窗的單位） */
const segLines = (ls: string[]): number[] => ls.flatMap((l, i) => (l.includes('<段') ? [i] : []));

const totals: Record<string, number> = { 區: 0, 書: 0, 塊: 0, 小塊: 0, 段: 0 };
let lines = 0, bad = 0, badSegLines = 0;
for (const f of files) {
  const a = readFileSync(join(CUR, f), 'utf8').trimEnd().split('\n');
  const b = readFileSync(join(REF, f), 'utf8').trimEnd().split('\n');
  lines += a.length;
  for (const tag of Object.keys(totals)) totals[tag]! += count(a, tag);
  const segSame = JSON.stringify(segLines(a)) === JSON.stringify(segLines(b));
  if (!segSame) badSegLines++;
  if (a.length !== b.length || !segSame || a.some((l, i) => structural(l) !== structural(b[i]))) {
    bad++;
    console.log(`${f}\tlines ${a.length}/${b.length}\t段 ${count(a, '段')}/${count(b, '段')}`);
  }
}
console.log(`${files.length} 檔、${lines} 行；區 ${totals['區']}、書 ${totals['書']}、塊 ${totals['塊']}、` +
  `小塊 ${totals['小塊']}、段 ${totals['段']}`);
console.log(`逐行定位標記不符：${bad} 檔；<段> 所在行不同：${badSegLines} 檔`);
if (bad || badSegLines) process.exit(1);
