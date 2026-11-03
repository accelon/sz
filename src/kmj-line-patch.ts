#!/usr/bin/env bun
/**
 * `kmj`（光明寺日譯）`sn3` 的段號修正：日譯在「第十二〔経〕」之後多了一個 `^n553`
 * （只有一行小標題「熱雲〔など〕の『布施利益経』四十経…」），CST／cs 沒有這一段，
 * 所以平行閱讀時 kmj sn3 會多一段。這裡把那個 `<段 n="553"/>` 拿掉，那一行歸前一段
 * （552-561），段序列就與 cs 一致。
 *
 *   bun run src/kmj-line-patch.ts
 *
 * 這是**轉換後的 patch**（來源 `D:\2023\kmj\off\sn3.kmj.off` 是唯讀，不改它）；
 * 重跑 `bun run src/off2accelon.ts kmj` 之後要再跑一次。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const p = join(ROOT, 'data', 'kmj', 'sn3.xml');
if (!existsSync(p)) {
  console.error(`缺少 ${p}（先跑 bun run src/off2accelon.ts kmj）`);
  process.exit(2);
}
const text = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
const lines = text.trimEnd().split('\n');
const hit = lines.map((l, i) => [l, i] as const).filter(([l]) => l.includes('<段 n="553"/>'));
if (hit.length !== 1) {
  console.error(`預期 1 行有 <段 n="553"/>，實際 ${hit.length} 行`);
  process.exit(1);
}
const [line, i] = hit[0]!;
lines[i] = line.replace('<段 n="553"/>', '');
writeFileSync(p, lines.join('\n') + '\n', 'utf8');

const segs = [...lines.join('\n').matchAll(/<段[^>]*\bn="([^"]+)"/g)].map((m) => m[1]!);
console.log(`kmj sn3：拿掉 <段 n="553"/>，現在 ${segs.length} 段（第 ${i + 1} 行）`);
