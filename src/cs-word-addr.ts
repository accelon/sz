#!/usr/bin/env bun
/**
 * 詞層級定址：`塊.段:句#詞`（`d1.7:3#2`）。
 *
 *   bun run src/cs-word-addr.ts d1.7:3#2             # 解一個地址
 *   bun run src/cs-word-addr.ts --test 200 dn1 mn1   # 抽 200 個句自檢（只掃指定書，省記憶體）
 *
 * 規則：
 *   塊 = `<塊 id>`；段 = `<段 n>`；句 = 段內第幾行（1 起算，段標記那一行是第 1 句）；
 *   詞 = 該句**空白切詞**後的第 k 個（1 起算，標點不算）。
 *   詞序不寫進 adb，所以從 `data/cs/*.xml` 現算（一個 adb 行就是一句）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profiles";

const DATA = join(ROOT, "data", "cs");

/** 補充詞譜（decomp 的 splits.tsv）：查一個詞的拆法，順便驗「詞層級 × 拆詞表」 */
const SPLIT = new Map<string, string>();
try {
  for (const line of readFileSync(join(ROOT, "data", "cs-decomp", "splits.tsv"), "utf8").trimEnd().split("\n").slice(1)) {
    const [w, , , parts] = line.split("\t");
    if (w && parts) SPLIT.set(w.normalize("NFC"), parts);
  }
} catch {
  /* 沒有拆詞表就略過 */
}
const BOOKS = readdirSync(DATA).filter((f) => f.endsWith(".xml") && f !== '00.xml').map((f) => f.replace('.xml', ''));

/** 一行 → 詞（去標籤、去標點，空白切） */
const wordsOf = (line: string): string[] =>
  line
    .replace(/<[^>]*>/g, ' ')
    .replace(/[।॥“”‘’"'.,;:!?()[\]–—-]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{M}]/u.test(w));

const parseAddr = (a: string) => {
  const m = /^([a-z][a-z0-9_-]*)\.([^:]+)(?::(\d+))?(?:#(\d+))?$/.exec(a);
  return m ? { chunk: m[1], seg: m[2], sentence: m[3] ? Number(m[3]) : 1, word: m[4] ? Number(m[4]) : 0 } : null;
};

/** 掃一本書 → 句清單（chunk, seg, 句序, 詞） */
function sentencesOf(book: string): { chunk: string; seg: string; j: number; words: string[] }[] {
  const out: { chunk: string; seg: string; j: number; words: string[] }[] = [];
  const lines = readFileSync(join(DATA, `${book}.xml`), 'utf8').trimEnd().split('\n');
  let chunk = '', seg = '', j = 0;
  for (const line of lines) {
    const c = /<塊 id="([^"]+)"/.exec(line);
    if (c) { chunk = c[1]; seg = ''; j = 0; }
    const n = /<段 n="([^"]*)"/.exec(line);
    if (n) { seg = n[1]; j = 1; } else if (seg) j++;
    if (chunk && seg) out.push({ chunk, seg, j, words: wordsOf(line) });
  }
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args[0] === '--test') {
    const n = Number(args[1] ?? '100');
    const want = args.slice(2).filter((x) => !x.startsWith('--'));
    const books = want.length ? want : ['dn1', 'mn1', 'sn1', 'an1', 'dhp', 'kp', 'thag', 'mil', 'ja1', 'vs'];
    let ok = 0, bad: string[] = [], total = 0, words = 0;
    for (const b of books) {
      const ss = sentencesOf(b);
      total += ss.length;
      words += ss.reduce((a, s) => a + s.words.length, 0);
      for (let i = 0; i < Math.ceil(n / books.length); i++) {
        const s = ss[Math.floor(Math.random() * ss.length)];
        if (!s || !s.words.length) continue;
        const k = 1 + Math.floor(Math.random() * s.words.length);
        const addr = `${s.chunk}.${s.seg}:${s.j}#${k}`;
        // 用 public 解析路徑回頭驗一次
        const p = parseAddr(addr)!;
        const back = ss.find((x) => x.chunk === p.chunk && x.seg === p.seg && x.j === p.sentence);
        if (back && back.words[p.word - 1] === s.words[k - 1]) ok++;
        else bad.push(addr);
      }
    }
    console.log(`自檢 ${ok + bad.length} 個：通過 ${ok}、問題 ${bad.length}`, bad.slice(0, 3));
    console.log(`掃 ${books.length} 冊：句 ${total}、詞 ${words}`);
    process.exit(0);
  }

  const addr = args[0];
  const p = addr ? parseAddr(addr) : null;
  if (!p) {
    console.error('用法：bun run src/cs-word-addr.ts d1.7:3#2 ｜ --test 200 [書…]');
    process.exit(2);
  }
  for (const b of BOOKS) {
    const hit = sentencesOf(b).find((s) => s.chunk === p.chunk && s.seg === p.seg && s.j === p.sentence);
    if (!hit) continue;
    console.log(`地址 ${addr}`);
    console.log(`  書 ${b}　塊 ${hit.chunk}　段 ${hit.seg}　句 ${hit.j}（共 ${hit.words.length} 詞）`);
    console.log(`  句：${hit.words.join(' ').slice(0, 100)}`);
    if (p.word) {
    const w = hit.words[p.word - 1];
    console.log(`  第 ${p.word} 詞：${w ?? '(超出句長)'}`);
    const parts = w ? SPLIT.get(w.normalize('NFC')) : undefined;
    if (parts) console.log(`  詞譜：${parts.split('+').join(' + ')}`);
  }
    process.exit(0);
  }
  console.error(`找不到 ${addr}`);
  process.exit(1);
}
