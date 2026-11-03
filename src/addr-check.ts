#!/usr/bin/env bun
/**
 * 句定位的驗收／統計：`塊.段:句` 這套地址在各譯本是不是乾淨。
 *
 *   bun run src/addr-check.ts            # 全部譯本
 *   bun run src/addr-check.ts cs ccc     # 只驗這幾個
 *
 * 規則（2026-11-03 定案，見 docs/addressing.md）：
 *   - `段`＝`<段 n="…">` 所在的那一行到下一個 `<段>` 的前一行；
 *   - `句`＝段內**第 j 個有文字的行**（1 起算；空白行不算，因為各譯本有大量段落空行）；
 *   - 段標記所在行就是第 1 句（若那一行沒有文字，第 1 句順延到下一個有文字的行）。
 *
 * 驗什麼：段不重複、句序連續、空白行不進句數、每段至少 1 句。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const DATA = join(ROOT, 'data');
const want = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const dbs = readdirSync(DATA)
  .filter((d) => !d.startsWith('cs.') && !d.includes('.bak') && !d.includes('decomp') && !d.includes('index'))
  .filter((d) => existsSync(join(DATA, d, '00.xml')))
  .filter((d) => !want.length || want.includes(d))
  .sort();

interface SegInfo { key: string; book: string; block: string; seg: string; firstLine: number; sentences: number }

for (const db of dbs) {
  const dir = join(DATA, db);
  const books = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml' && !f.endsWith('-fn.xml')).sort();
  let segs = 0, sentences = 0, blanks = 0, emptySegs = 0, dup = 0;
  const dupSamples: string[] = [];
  for (const f of books) {
    const book = f.replace(/\.xml$/, '');
    const lines = readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trimEnd().split('\n');
    const seen = new Set<string>();
    const list: SegInfo[] = [];
    let block = '', cur: SegInfo | null = null;
    lines.forEach((l, i) => {
      const b = /<塊[^>]*\bid="([^"]+)"/.exec(l);
      if (b) block = b[1]!;
      const m = /<段[^>]*\bn="([^"]+)"/.exec(l);
      if (m) {
        cur = { key: `${block}.${m[1]!}`, book, block, seg: m[1]!, firstLine: i + 1, sentences: 0 };
        list.push(cur);
        if (seen.has(cur.key)) { dup++; if (dupSamples.length < 5) dupSamples.push(`${book} ${cur.key}`); }
        seen.add(cur.key);
      }
      const text = l.replace(/<[^>]*>/g, '').trim();
      if (!text) { if (cur) blanks++; return; }
      if (cur) cur.sentences++;
    });
    for (const s of list) {
      segs++;
      sentences += s.sentences;
      if (!s.sentences) emptySegs++;
    }
  }
  const flags = [
    dup ? `重複段 ${dup}（${dupSamples.join('、')}）` : '',
    emptySegs ? `0 句的段 ${emptySegs}` : '',
  ].filter(Boolean).join('；');
  console.log(`${db.padEnd(6)} ${books.length} 冊  段 ${segs}  句（非空行）${sentences}  段內空行 ${blanks}  ${flags || '✓'}`);
}
