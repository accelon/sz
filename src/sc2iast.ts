#!/usr/bin/env bun
/**
 * `data/sc` 的正文目前還是儉約巴利（`bVrh…`），搜尋／閱讀都不會得到 IAST。
 * 這一支只做「文字節點」轉寫：保留所有 XML 標籤與屬性，把標籤之間的文字
 * 用 `providentText(..., true)` 轉成 IAST；不插入 `<辭>`（sc 沒有逐詞語法）。
 *
 *   bun run src/sc2iast.ts
 *
 * 轉完再 `bun run src/pack.ts sc`（預設建索引）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { providentText } from './provident-text';
import { ROOT } from './profiles';

const DIR = join(ROOT, 'data', 'sc');
const LABEL_TAGS = new Set(['檔', '集', '區', '書', '樹', '隱', '英文名']);
let files = 0;
for (const name of readdirSync(DIR).filter((f) => f.endsWith('.xml'))) {
  const src = readFileSync(join(DIR, name), 'utf8');
  // 以標籤為界，只轉正文文字段；標籤／屬性與「標題文字」原樣保留。
  const stack: string[] = [];
  const out = src.split(/(<[^>]*>)/).map((part) => {
    if (part.startsWith('<')) {
      const m = /^<\/?\s*([^\s/>]+)/.exec(part);
      const tag = m?.[1] ?? '';
      if (part.startsWith('</')) {
        const at = stack.lastIndexOf(tag);
        if (at >= 0) stack.splice(at, 1);
      } else if (!part.endsWith('/>') && tag) {
        stack.push(tag);
      }
      return part;
    }
    if (stack.some((t) => LABEL_TAGS.has(t))) return part;
    return providentText(part, true);
  }).join('');
  writeFileSync(join(DIR, name), out, 'utf8');
  files++;
}
console.log(`sc → IAST：${files} 檔`);
