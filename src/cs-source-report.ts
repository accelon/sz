#!/usr/bin/env bun
/**
 * cs 來源的 `??` 殘留報告（唯讀，不改資料）。
 *
 *   bun run src/cs-source-report.ts
 *
 * 掃 `D:\2023\cs\ro` 的 XML，列出含 `??n` 的檔與上下文；用來決定要不要做清理，
 * 不是自動清理器。直接刪 `??n` 後面的編碼片段可能切壞主文（見 docs/cs-token-count.md）。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const SRC = 'D:/2023/cs/ro';
const OUT = join(ROOT, 'out', 'cs-source-report.tsv');
const rows: string[] = ['file\tline\tmarkers\tcontext'];
let total = 0;
for (const name of readdirSync(SRC).filter((f) => f.endsWith('.xml'))) {
  const text = readFileSync(join(SRC, name), 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const n = (line.match(/\?\?\d/g) ?? []).length;
    if (!n) return;
    total += n;
    const at = line.indexOf('??');
    rows.push(`${name}\t${i + 1}\t${n}\t${line.slice(Math.max(0, at - 70), at + 120).replace(/\t/g, ' ')}`);
  });
}
mkdirSync(join(ROOT, 'out'), { recursive: true });
writeFileSync(OUT, rows.join('\n') + '\n', 'utf8');
console.log(`?? 標記 ${total} 個、${rows.length - 1} 行；報告 ${OUT}`);
