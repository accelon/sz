#!/usr/bin/env bun
/**
 * sz 的來源轉換：off（pitaka 的 `.off`）→ Accelon XML（adb 的文字層）。
 *
 *   bun run src/off2accelon.ts            # 全部來源
 *   bun run src/off2accelon.ts cs-mm      # 只轉一個（cs-mm、sc、yh、ccc、xsq、pku、hz、kmj）
 *   bun run src/off2accelon.ts --check    # 驗收（不掉字、<段> 序列、殘留 ^／行長）
 *
 * 轉換器本體在母工作區：`D:\2026\adb-converter\ts\tools\off2accelon.ts`
 * （共用工具，規則與對照表見母區 `docs/adb/off-to-accelon.md`）。
 * 這裡只放「本工作區的來源清單與參數」（`src/profiles.ts`），讓 `data/<db>/` 可以從零重跑。
 *
 * 輸出：
 *   data/<db>/00.xml          宣告（`<檔>`／`<集>`／`<英文名>`）
 *   data/<db>/<書>.xml        正文，一行來源 → 一行 adb 行
 *   data/<db>/<書>-fn.xml     註文（與正文分檔；只有 cs-mm／yh 有）
 *   out/<db>-report.txt       轉換報告（行數、段、註、清除紀錄、警告）
 *   out/<db>-cleanup.tsv      清掉的 HTML／孤立字元（書／行／種類／片段）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  convertOffDir,
  reportText,
  verifyOffDir,
} from '../../adb-converter/ts/tools/off2accelon';
import { PROFILES, ROOT } from './profiles';

const BUILD = join(ROOT, 'out');

if (import.meta.main) {
  const check = process.argv.includes('--check');
  const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
  const names = which === 'all' ? Object.keys(PROFILES) : [which];
  let failed = false;
  for (const name of names) {
    const profile = PROFILES[name];
    if (!profile) {
      console.error(`沒有這個來源：${name}（可用：${Object.keys(PROFILES).join('、')}、all）`);
      process.exit(2);
    }
    const { report, adb, ...options } = profile;
    void adb;
    if (check) {
      const v = verifyOffDir(options);
      console.log(`\n== 驗收 ${name} ==  ${v.books} 本、${v.lines} 行、最長 ${v.maxLen} 字`);
      console.log(
        `  正文掉字 ${v.textDiffs.length} 本、段序列不符 ${v.structDiffs.length} 本、結構問題 ${v.issues.length} 筆`,
      );
      for (const d of [...v.textDiffs, ...v.structDiffs]) console.log('    - ' + d);
      for (const d of v.lineDiffs) console.log('    · 行數 ' + d);
    for (const d of v.orderDiffs) console.log('    ※ ' + d);
      for (const i of v.issues.slice(0, 10)) console.log(`    - ${i.file}:${i.line} ${i.kind}`);
      if (v.textDiffs.length || v.structDiffs.length || v.issues.length) failed = true;
      continue;
    }
    console.log(`\n== ${name} ==  ${options.srcDir} → ${options.outDir}`);
    const result = await convertOffDir({
      ...options,
      cleanupFile: join(BUILD, `${name}-cleanup.tsv`),
      log: (m) => console.log(m),
    });
    mkdirSync(BUILD, { recursive: true });
    const text = reportText(result);
    writeFileSync(join(BUILD, report), text, 'utf8');
    console.log(text.split('\n').slice(0, 3).join('\n'));
    console.log(`報告：${join(BUILD, report)}`);
  }
  if (failed) process.exit(1);
}
