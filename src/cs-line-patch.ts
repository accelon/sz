#!/usr/bin/env bun
/**
 * CST-raw 版 `cv` 有一個長行被舊 provident 版切成兩行；為了保持
 * 譯本對齊，這裡在相同位置補切一行（不是改字）。
 *
 *   bun run src/cs-line-patch.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const p = join(ROOT, 'data', 'cs', 'cv.xml');
const lines = readFileSync(p, 'utf8').trimEnd().split('\n');
const needle = 'pYVcAhpVpWIcVCnVnAy CArtVtM mAntVtM adAsI';
let done = false;
for (let i = 0; i < lines.length; i++) {
  const at = lines[i].indexOf(needle);
  if (at <= 0) continue;
  lines.splice(i, 1, lines[i].slice(0, at), lines[i].slice(at));
  done = true;
  break;
}
if (!done) throw new Error('cv 的補切點找不到');
writeFileSync(p, lines.join('\n') + '\n', 'utf8');
console.log(`cv 補切：${lines.length} 行`);
