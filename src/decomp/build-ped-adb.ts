#!/usr/bin/env bun
/**
 * 把 sc-data 的 PTS PED 精修版做成 `ped.adb`。
 *
 *   python -X utf8 src/decomp/ped-extract.py
 *   python -X utf8 src/decomp/ped-link.py
 *   bun run src/decomp/build-ped-adb.ts
 *
 * 來源：data/sc-dict/pli2en_pts.json
 * 中間：out/ped-records.json（結構化 records）、out/ped-refs.tsv（PTS→cs 對照）
 * 成品：D:/2026/sz/accelon26/ped.adb
 *
 * 標籤：詞／同形／語法／義／複合／詞源／出處／參見／來源。
 * `<出處>` 有 cs 位址時包 `<聯 i="cs?塊.段">`，可直接跳到 cs.adb。
 * 原始 `<dd>` HTML 不进主庫（另存 out/ped-raw.json，需 --raw）。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { authorAdb } from '../../../adb-converter/ts/src/adbauthor';
import { AdbReader, SyncIO } from '../../../adb-converter/ts/src/accelon26/adb';

const SRC = 'D:/2026/sz/out/ped-records.json';
const REFS = 'D:/2026/sz/out/ped-refs.tsv';
const OUT = 'D:/2026/sz/accelon26/ped.adb';

type Cite = { raw: string; href: string; before: string };
type Rec = {
  word: string;
  homograph: string;
  grammar: string[];
  senses: string[];
  compounds: string[];
  ety: string[];
  citations: Cite[];
  refs: string[];
  xr: string[];
  terms: string[];
};

type RefRow = {
  raw: string;
  source: string;
  kind: string;
  vol: string;
  value: string;
  cst_book: string;
  cst_block: string;
  cst_seg: string;
  sc_uid: string;
  sc_seg: string;
  confidence: string;
};

const records = JSON.parse(readFileSync(SRC, 'utf8')) as Rec[];
records.sort((a, b) => (a.word || '').localeCompare(b.word || '') || (a.homograph || '').localeCompare(b.homograph || ''));

// 塊 id 對照（給外部 JSON 匯出／引用用；從零重跑時 id 不變）
writeFileSync('D:/2026/sz/out/ped-blocks.tsv',
  records.map((r, i) => `${r.word}\t${r.homograph}\tp${String(i + 1).padStart(6, '0')}`).join('\n') + '\n',
  'utf8');

const refs = new Map<string, RefRow>();
{
  const lines = readFileSync(REFS, 'utf8').replace(/\r\n?/g, '\n').trimEnd().split('\n');
  const head = lines[0]!.split('\t');
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = Object.fromEntries(head.map((h, i) => [h, cols[i] ?? ''])) as unknown as RefRow;
    refs.set(row.raw, row);
  }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string): string => esc(s).replace(/"/g, '&quot;');

const lines: string[] = [];
lines.push('<檔 n="ped"><集>PTS PED</集><英文名>PTS Pali English Dictionary</英文名></檔>');
// 第一棵樹＝詞條（`$詞`）；閱讀器據此把這個庫當詞典型，左欄「名相」可直接查詞頭。
lines.push('<樹 s="$詞">詞</樹>');
lines.push('<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>');

function pushTag(tag: string, text: string): void {
  if (!text) return;
  let buf = '';
  for (const ch of text) {
    if (buf.length + ch.length > 2800) {
      lines.push(`<${tag}>${esc(buf)}</${tag}>`);
      buf = '';
    }
    buf += ch;
  }
  if (buf) lines.push(`<${tag}>${esc(buf)}</${tag}>`);
}

function citeXml(raw: string): string {
  const r = refs.get(raw);
  const text = esc(raw);
  const cs = r?.cst_block && r?.cst_seg ? `${r.cst_block}.${r.cst_seg}` : '';
  // 連結位址由 <聯 i> 攜帶；結構化欄位（source/kind/vol/…）在 out/ped-refs.tsv
  // 與 out/ped-export.json，adb 內不再重複，避免體積膨脹。
  if (cs && (r!.confidence === 'high' || r!.confidence === 'medium')) {
    return `<出處><聯 i="${escAttr('cs?' + cs)}">${text}</聯></出處>`;
  }
  return `<出處>${text}</出處>`;
}

let area = '';
let book = '';
let blockNo = 0;
let linked = 0;
let refTotal = 0;
for (const r of records) {
  const w = r.word || '?';
  const a = (w[0] || '#').toLowerCase();
  const b = w.slice(0, 2).toLowerCase();
  if (a !== area) {
    lines.push(`<區 id="${escAttr(a)}" t="書.">(${esc(a)})</區>`);
    area = a;
    book = '';
  }
  if (b !== book) {
    lines.push(`<書 id="${escAttr(b)}" t="塊.">(${esc(b)})</書>`);
    book = b;
  }
  blockNo++;
  const id = 'p' + String(blockNo).padStart(6, '0');
  const hom = r.homograph ? ' ' + esc(r.homograph) : '';
  lines.push(`<塊 id="${id}" w="${escAttr(w)}">${esc(w)}${hom}</塊>`);
  pushTag('詞', w);
  if (r.homograph) pushTag('同形', r.homograph);
  for (const x of r.grammar) pushTag('語法', x);
  for (const x of r.senses) pushTag('義', x);
  for (const x of r.compounds) pushTag('複合', x);
  for (const x of r.ety) pushTag('詞源', x);
  for (const x of r.refs) {
    refTotal++;
    const row = refs.get(x);
    if (row?.cst_block && row.cst_seg && (row.confidence === 'high' || row.confidence === 'medium')) linked++;
    lines.push(citeXml(x));
  }
  for (const x of r.xr) pushTag('參見', x);
  pushTag('來源', 'PTS PED · sc-data d8545188');
}

console.log(`records ${records.length.toLocaleString()}；lines ${lines.length.toLocaleString()}；refs ${refTotal.toLocaleString()}，linked ${linked.toLocaleString()}（${(100 * linked / Math.max(1, refTotal)).toFixed(1)}%）`);
mkdirSync(dirname(OUT), { recursive: true });
const res = await authorAdb({
  dbname: 'ped',
  dbcname: 'PTS PED',
  dbtype: 2,
  lines,
  fullTextIndex: true,
  validTags: ['檔', '集', '英文名', '隱', '樹', '區', '書', '塊', '詞', '同形', '語法', '義', '複合', '詞源', '出處', '參見', '來源', '聯'],
  log: (m: string) => console.log('  ' + m),
});
const buf = Buffer.from(res.file);
buf.writeUInt32LE(0, 100);
writeFileSync(OUT + '.new', buf);
renameSync(OUT + '.new', OUT);
console.log(`寫出 ${OUT}（${(buf.length / 1048576).toFixed(2)} MiB）`);
console.log(`lines ${res.lines.toLocaleString()}；tokens ${res.tokens.toLocaleString()}；tags ${res.tagNames.join(',')}`);

const r = await AdbReader.open(new SyncIO(OUT));
console.log(`驗證：lineCount ${r.header.lineCount.toLocaleString()}；containers ${[...r.containers.keys()].join(',')}`);
const docs = await r.documents().catch(() => []);
console.log(`documents ${docs.length}`);
