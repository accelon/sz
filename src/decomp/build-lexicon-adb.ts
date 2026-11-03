#!/usr/bin/env bun
/**
 * 把 MVP 的詞資料做成 adb（`lex.adb`）——一詞一塊，四層資訊。
 *
 *   bun run src/decomp/build-lexicon-adb.ts
 *
 * 資料來源：`out/word-groups.html` 的 payload（已含詞義、詞件、格位、PTS、義項、例句）。
 * 結構：區＝首字母、書＝前兩字母、塊＝一個詞。
 * 輸出：`accelon26/lex.adb`（不建全文索引，先做閱讀）。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { authorAdb } from '../../../adb-converter/ts/src/adbauthor';
import { AdbReader, SyncIO } from '../../../adb-converter/ts/src/accelon26/adb';
import { ROOT } from '../profiles';

/* ── 讀 payload ──────────────────────────────────────── */
const html = readFileSync(join(ROOT, 'out', 'word-groups.html'), 'utf8');
const d = JSON.parse(
  gunzipSync(Buffer.from(/window\.__DATA_GZ__ = "([^"]*)"/.exec(html)![1], 'base64')).toString('utf8'),
) as {
  words: [number, string, number, number, (number | unknown[])[]?][];
  atoms: { a: string; n: number; s?: string }[];
  stems: [number, string][];
  zht: [number, string][];
  zh: [number, string][];
  cs: [number, number, string][];
  guess: string;
  guess2: string;
  hints: [number, string][];
  senses: [number, string[]][];
  pts: [string[], [number, number][]];
};

const names: string[] = [];
let prev = '';
for (const r of d.words) {
  const n = prev.slice(0, r[0]) + r[1];
  names.push(n);
  prev = n;
}
const gloss = new Map<number, string>(d.zht);
const stems = new Map<number, string>(d.stems);
const csMap = new Map<number, string>(d.cs.map(([i, , s]) => [i, s]));
const hints = new Map<number, string>(d.hints);
const senses = new Map<number, string[]>(d.senses);
const ptsPool = d.pts?.[0] ?? [];
const ptsIdx = new Map<number, number>(d.pts?.[1] ?? []);

/** 取詞件名稱（樹的葉） */
const leavesOf = (i: number): string[] => {
  const t = d.words[i][4] as unknown;
  if (!Array.isArray(t)) return [];
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'number') { out.push(d.atoms[node]?.a ?? '?'); return; }
    if (Array.isArray(node)) { for (const x of node) walk(x); }
  };
  walk(t);
  return out;
};

/* ── 產生 adb 行 ─────────────────────────────────────── */
const lines: string[] = [];
lines.push('<檔 n="lex"><集>巴利詞解</集><英文名>Pali Lexicon</英文名></檔>');
lines.push('<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>');

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let blockNo = 0;
let lastArea = '';
let lastBook = '';
for (let i = 0; i < names.length; i++) {
  const w = names[i];
  const area = (w[0] ?? '#').toLowerCase();
  const book = w.slice(0, 2);
  if (area !== lastArea) {
    lines.push(`<區 id="${esc(area)}" t="書.">(${esc(area)})</區>`);
    lastArea = area;
    lastBook = '';
  }
  if (book !== lastBook) {
    lines.push(`<書 id="${esc(book)}" t="塊.">(${esc(book)})</書>`);
    lastBook = book;
  }
  blockNo++;
  const id = 'w' + String(blockNo).padStart(6, '0');
  lines.push(`<塊 id="${id}" w="${esc(w)}">(${esc(w)})</塊>`);
  const n = d.words[i][2];
  lines.push(`${n.toLocaleString('en-US')} 次`);
  const g = gloss.get(i);
  if (g) lines.push(esc(g));
  const parts = leavesOf(i);
  if (parts.length > 1) lines.push('詞件：' + parts.map(esc).join(' + '));
  const c = csMap.get(i);
  if (c) lines.push('格位：' + c.split(',').join(' · '));
  const h = hints.get(i);
  if (h) lines.push('上下文：' + esc(h));
  const p = ptsIdx.get(i);
  if (p != null) lines.push('PTS：' + esc(ptsPool[p]));
  const ss = senses.get(i);
  if (ss) for (const s of ss) lines.push('義項：' + esc(s));
  const st = stems.get(i);
  if (st) lines.push('詞幹：' + esc(st));
}

console.log(`詞 ${names.length.toLocaleString()}、行 ${lines.length.toLocaleString()}`);

/* ── 打包 ────────────────────────────────────────────── */
const out = join(ROOT, 'accelon26', 'lex.adb');
mkdirSync(join(ROOT, 'accelon26'), { recursive: true });
const res = await authorAdb({
  dbname: 'lex',
  dbcname: '巴利詞解',
  lines,
  fullTextIndex: false,
  log: (m: string) => console.log('  ' + m),
});
const buf = Buffer.from(res.file);
buf.writeUInt32LE(0, 100);
writeFileSync(out + '.new', buf);
renameSync(out + '.new', out);
console.log(`寫出 ${out}（${(buf.length / 1048576).toFixed(2)} MiB）`);

/* ── 驗證 ────────────────────────────────────────────── */
const r = await AdbReader.open(new SyncIO(out));
console.log(`行數 ${r.header.lineCount.toLocaleString()}（預期 ${lines.length.toLocaleString()}）`);
console.log('容器：' + [...r.containers.keys()].join(','));
const docs = await r.documents().catch(() => []);
console.log(`檔 ${docs.length}`);
