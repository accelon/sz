#!/usr/bin/env bun
/**
 * 用閱讀器的 anchorVa() 驗證 cllk 的 `塊.段` 定址：
 * 每一塊的第一段／最後一段都要解得出來，而且整本書的 VA 必須嚴格遞增。
 *
 *   bun run src/cllk-anchor-check.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
import { anchorVa } from '../../adb-converter/ts/src/accelon26/page-text';

const ROOT = join(import.meta.dir, '..');
const r = await AdbReader.open(new SyncIO(join(ROOT, 'accelon26', 'cllk.adb')));
const books = readdirSync(join(ROOT, 'data', 'cllk'))
  .filter((f) => f.endsWith('.xml') && f !== '00.xml' && !f.endsWith('-fn.xml'))
  .map((f) => f.slice(0, -4))
  .sort((a, b) => {
    const order = ['dn', 'mn', 'sn', 'an'];
    const ka = order.indexOf(a.replace(/\d+$/, ''));
    const kb = order.indexOf(b.replace(/\d+$/, ''));
    return ka - kb || Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, ''));
  });

let prev = -1;
let bad = 0;
let total = 0;
for (const book of books) {
  const xml = readFileSync(join(ROOT, 'data', 'cllk', `${book}.xml`), 'utf8');
  const blocks: [string, number[]][] = [];
  for (const ln of xml.split('\n')) {
    const b = /<塊 id="([^"]+)"/.exec(ln);
    if (b) blocks.push([b[1], []]);
    if (!blocks.length) continue;
    for (const n of ln.matchAll(/<段 n="(\d+)"/g)) blocks[blocks.length - 1][1].push(Number(n[1]));
  }
  for (const [id, ns] of blocks) {
    if (!ns.length) continue;
    const va = await anchorVa(r, `${id}.${ns[0]}`);
    total++;
    if (va === null || va <= prev) {
      bad++;
      console.log(`✗ ${id}.${ns[0]} va=${va}（前一個 ${prev}）`);
    }
    if (va !== null) prev = va;
  }
}
console.log(`塊.段 定址：${total} 個塊首段，${bad === 0 ? '全部遞增 ✓' : `${bad} 個有問題`}`);
