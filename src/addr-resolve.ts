#!/usr/bin/env bun
/**
 * 把 `塊.段:句[#詞]` 解析成一行文字（給協作／除錯用；閱讀器之外的另一條路）。
 *
 *   bun run src/addr-resolve.ts a6.7:3        # cs 的 a6 第 7 段第 3 句
 *   bun run src/addr-resolve.ts d1.1:1 ccc    # 指定譯本
 *   bun run src/addr-resolve.ts a6.7:3#4      # 順便印第 4 個詞
 *
 * 規則與 docs/addressing.md 相同：`句`＝段內第 j 個**有文字的行**（空白行不算）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const DATA = join(ROOT, 'data');
const usage = '用法：bun run src/addr-resolve.ts <塊.段[:句][#詞]> [譯本，預設 cs]';

const addr = process.argv[2] ?? '';
const db = process.argv[3] ?? 'cs';
const m = /^([a-z][a-z0-9-]*)\.([^:#\s]+)(?::(\d+))?(?:#(\d+))?$/.exec(addr.trim());
if (!m) {
  console.error(usage);
  process.exit(2);
}
const [, block, seg, sentence, word] = m;
const dir = join(DATA, db);
if (!existsSync(dir)) {
  console.error(`沒有 data/${db}`);
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml' && !f.endsWith('-fn.xml')).sort();
for (const f of files) {
  const lines = readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trimEnd().split('\n');
  let curBlock = '';
  let target: { line: number; sentence: number } | null = null;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const b = /<塊[^>]*\bid="([^"]+)"/.exec(l);
    if (b) {
      if (curBlock === block && !target) {
        console.error(`找不到 ${addr}：${db} 的 ${block} 沒有第 ${seg} 段`);
        process.exit(1);
      }
      curBlock = b[1]!;
    }
    if (curBlock !== block) continue;
    const sm = /<段[^>]*\bn="([^"]+)"/.exec(l);
    if (sm) { count = 0; if (sm[1] === seg) target = { line: i + 1, sentence: 0 }; }
    if (!target) continue;
    const text = l.replace(/<[^>]*>/g, '').trim();
    if (!text) continue;
    count++;
    if (count === Number(sentence ?? 1)) {
      target.sentence = count;
      const words = text.split(/\s+/).filter(Boolean);
      const w = word ? words[Number(word) - 1] : '';
      console.log(`${db} ${block}.${seg}:${count}${word ? `#${word}` : ''}  → ${f.replace(/\.xml$/, '')} 第 ${i + 1} 行`);
      console.log(`  ${text.slice(0, 240)}${text.length > 240 ? '…' : ''}`);
      if (word) console.log(`  第 ${word} 詞：${w || '（超出句長）'}`);
      process.exit(0);
    }
  }
}
console.error(`找不到 ${addr}（${db}）：段不存在，或該段沒有第 ${sentence ?? 1} 句`);
process.exit(1);
