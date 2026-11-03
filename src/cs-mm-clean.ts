#!/usr/bin/env bun
/**
 * cs-mm 的來源有一段 `p class="footnote"` 殘留（不是標籤，`p` 直接黏在緬文詞上），
 * 例：`ဒုp class="footnote"ယပုဂ္ဂိုလ်`。turn 之後 tokenizer 會把 `p`／`class`／
 * `footnote` 當成三個 token，污染索引。這裡只做這一個字面清理，不動其他文字。
 *
 *   bun run src/cs-mm-clean.ts
 *   bun run src/pack.ts cs-mm
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const DIR = join(ROOT, 'data', 'cs-mm');
let files = 0, removed = 0;
for (const name of readdirSync(DIR).filter((f) => f.endsWith('.xml'))) {
  const p = join(DIR, name);
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/p\s+class="footnote"/g, () => { removed++; return ''; });
  if (out !== src) writeFileSync(p, out, 'utf8');
  files++;
}
console.log(`cs-mm 清理：${files} 檔，移除 ${removed} 處 p class="footnote"`);
