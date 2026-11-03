#!/usr/bin/env bun
/**
 * 十個譯本 adb 的 token 現況（可重跑）。
 *
 *   bun run src/tokenizer-report.ts
 *
 * 逐庫讀 `tokens`，輸出 out/tokenizer-report.txt；這是「所有庫都有索引」與
 * tokenizer 是否退回逐字的最小驗收，不取代語言學抽樣。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
import { ROOT } from './profiles';

const DBS = ['cs', 'cs-mm', 'sc', 'yh', 'ccc', 'xsq', 'pku', 'hz', 'kmj', 'cllk'];
const lines: string[] = ['db\tlines\ttokens\tburmese\tthai\tjapanese\tfirst tokens'];
for (const db of DBS) {
  const r = await AdbReader.open(new SyncIO(join(ROOT, 'accelon26', `${db}.adb`)));
  const ts = await r.tokens();
  const names = ts.map((t: { name: string }) => t.name);
  const burmese = names.filter((n) => /[\u1000-\u109f]/.test(n)).length;
  const thai = names.filter((n) => /[\u0e00-\u0e7f]/.test(n)).length;
  const japanese = names.filter((n) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(n)).length;
  lines.push(`${db}\t${r.header.lineCount}\t${ts.length}\t${burmese}\t${thai}\t${japanese}\t${names.slice(0, 8).join(' ')}`);
}
mkdirSync(join(ROOT, 'out'), { recursive: true });
writeFileSync(join(ROOT, 'out', 'tokenizer-report.txt'), lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
