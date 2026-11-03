#!/usr/bin/env bun
/**
 * 驗收：`cs` 與其他譯本的 `段` 序列是否逐段對齊（平行閱讀靠這一層）。
 *
 *   bun run src/cs-parallel-check.ts
 *
 * 比的是每個 `<段 n="…">` 的**出現順序與段號**，不是文字：cs 換成 deva 版之後
 * 行數／段位置都沒動，其他譯本當初就是以 cs 的段號對齊，所以這裡應該 0 不符。
 * `塊.段:句` 的「句」是各庫自己的行，不要求跨庫相同。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const DATA = join(ROOT, 'data');

interface Book { book: string; segs: string[] }

/** 一個譯本目錄：書 id → 段號序列（略過 00.xml 與 -fn 註文） */
function loadDir(db: string): Map<string, string[]> {
  const dir = join(DATA, db);
  const out = new Map<string, string[]>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml') && x !== '00.xml' && !x.endsWith('-fn.xml')).sort()) {
    const t = readFileSync(join(dir, f), 'utf8');
    out.set(f.slice(0, -4), [...t.matchAll(/<段[^>]*\bn="([^"]+)"/g)].map((m) => m[1]!));
  }
  return out;
}

const ref = loadDir('cs');
if (!ref.size) {
  console.error('沒有 data/cs');
  process.exit(2);
}

// cllk 已搬到 D:\2026\cllk（2026-11-02），這裡的 data/cllk 是殘留，不納入驗收
const SKIP = new Set(['cllk']);

const others = readdirSync(DATA)
  .filter((d) => d !== 'cs' && !d.startsWith('cs.') && !d.includes('.bak') && !d.includes('decomp') && !d.includes('index'))
  .filter((d) => !SKIP.has(d))
  .filter((d) => existsSync(join(DATA, d)) && readdirSync(join(DATA, d)).some((f) => f.endsWith('.xml')));

let bad = 0;
console.log('譯本    共同書  段數(cs)  段數(譯本)  不符的書');
for (const db of others.sort()) {
  const m = loadDir(db);
  const shared = [...m.keys()].filter((b) => ref.has(b));
  if (!shared.length) {
    console.log(`${db.padEnd(8)}（和 cs 沒有共同的書）`);
    continue;
  }
  let refSegs = 0, dbSegs = 0;
  const badBooks: string[] = [];
  for (const b of shared) {
    const a = ref.get(b)!;
    const c = m.get(b)!;
    refSegs += a.length;
    dbSegs += c.length;
    if (a.length !== c.length || a.some((x, i) => x !== c[i])) {
      badBooks.push(b);
    }
  }
  bad += badBooks.length;
  console.log(
    `${db.padEnd(8)}${String(shared.length).padStart(6)}  ${String(refSegs).padStart(9)}  ${String(dbSegs).padStart(10)}  ` +
    (badBooks.length ? `${badBooks.length}：${badBooks.slice(0, 6).join(' ')}` : '0'),
  );
}
if (SKIP.size) console.log(`（跳過 ${[...SKIP].join('、')}：已搬到其他工作區，data/${[...SKIP][0]} 是殘留）`);
console.log(bad ? `✗ ${bad} 本書的段序列不符` : '✓ 所有共同書的段序列完全相同');
if (bad) process.exit(1);
