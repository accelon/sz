#!/usr/bin/env bun
/**
 * 為「沒有 `off/`」的書，從 TEI 產生**段落級**的 off → `out/cs-src/`。
 *
 *   bun run src/books2off.ts              # 全部（books/ 優先，其次 ro/）
 *   bun run src/books2off.ts kp           # 只做一本
 *
 * 為什麼是段落級：這些書沒有 SuttaCentral 的分句指引（brk），也沒有 `ptk` 的 `gen`，
 * 所以一個 `<p>` 一行（＝一句＝一段）。句層級定址照樣可用（`:1`），只是沒有第二句。
 *
 * 兩種來源格式都吃：
 *   books/<書>.xml（整理過）：`<p rend="chapter">`、`pn="…"` 屬性、`<pb t="m1.1;…"/>`
 *   ro/<檔>.xml（原始）    ：`<head rend="chapter">`、`<p rend="paranum">`＋`<p rend="dot">`、`<pb ed="V" n="…"/>`
 *
 * 對照 `cs/src/xmlhandlers.js`：book→^bk、chapter→^ck、subhead→^h、centre→^end、gatha*→^sz、
 * nikaya／dot→略過；`<note>` 丟掉（異文另記）、`<pb>` 丟掉（頁碼外部化）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profiles";
// @ts-expect-error 沒有型別宣告（純 JS）
import { cst4rename } from './cst-rename';

const BOOKS = "D:/2023/cs/books";
const RO = "D:/2023/cs/ro";
const OFF = "D:/2023/cs/off";
const SRC = join(ROOT, "out", "cs-src");

const only = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";

const hasOff = new Set(readdirSync(OFF).filter((f) => f.endsWith(".cs.off")).map((f) => f.replace(".cs.off", "")));
const inBooks = new Set(readdirSync(BOOKS).filter((f) => f.endsWith(".xml")).map((f) => f.replace(".xml", "")));

/** 書 id → 來源檔（books/ 優先，其次 ro/） */
const sources = new Map<string, string>();
for (const f of readdirSync(BOOKS).filter((x) => x.endsWith(".xml"))) {
  const book = f.replace(".xml", "");
  if (!hasOff.has(book)) sources.set(book, join(BOOKS, f));
}
for (const f of readdirSync(RO).filter((x) => x.endsWith(".xml"))) {
  // 沒有書 id 的（0603n.nrf.xml 這類文法／史書）就用檔名當書 id，書名由 TEI 的 <p rend="book"> 提供
  const book = (cst4rename(f) as string | undefined) ?? f.replace(/\\.xml$/, '').replace(/[^a-z0-9_-]/g, '_');
  if (!book || hasOff.has(book) || inBooks.has(book)) continue;
  sources.set(book, join(RO, f));
}

const unescape = (s: string): string => s.replace(/&lt;/g, '＜').replace(/&gt;/g, '＞').replace(/&amp;/g, '&');

/**
 * 按標點切句：`।`（單句號）與 `॥`（偈／段末）之後切開。
 * 沒有 SuttaCentral 的分句指引，這是我們自己定的句界；一個 adb 行就是一句。
 */
function splitSentences(s: string): string[] {
  const parts = s.split(/(?<=[।॥])/u).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [s];
}

/** 把一段 <pb .../> 的屬性組成頁碼四元組（books/ 是 `t="m1.1;v1.1;…"`，ro/ 是 `ed="M" n="0.0001"`） */
function pageTuple(attrs: string, cur: Record<string, string>): Record<string, string> {
  const t = /\bt="([^"]*)"/.exec(attrs)?.[1];
  if (t) {
    for (const part of t.split(';')) {
      const m = /^([a-z])(.+)$/.exec(part);
      if (m) cur[m[1]] = m[2];
    }
    return { ...cur };
  }
  const ed = /\bed="([^"]*)"/.exec(attrs)?.[1];
  const n = /\bn="([^"]*)"/.exec(attrs)?.[1];
  if (ed && n) cur[ed.toLowerCase()] = n;
  return { ...cur };
}

/** 一段內容 → 純文字（`<note>` 收進異文表、bold 轉 ^b），並記下 `<pb>` 落在第幾句 */
function cleanInner(html: string): {
  text: string;
  notes: string[];
  pb: { sentence: number; m: string; v: string; p: string; t: string }[];
} {
  const notes: string[] = [];
  const pb: { sentence: number; m: string; v: string; p: string; t: string }[] = [];
  let acc = '';
  const cur: Record<string, string> = { m: '', v: '', p: '', t: '' };
  const clean = (s: string): string =>
    s
      .replace(/<note>([\s\S]*?)<\/note>/g, (_m, n: string) => { notes.push(unescape(n).replace(/\s+/g, ' ').trim()); return ''; })
      .replace(/<hi rend="bold">([\s\S]*?)<\/hi>/g, (_m, b: string) => `^b(${b})`)
      .replace(/<[^<>]*>/g, '');
  const re = /<pb ([^>]*)\/>/g;
  let pos = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    acc += clean(html.slice(pos, m.index));
    pos = m.index + m[0].length;
    const tuple = pageTuple(m[1], cur);
    const sentence = (acc.match(/[।॥]/g) ?? []).length + 1;
    const last = pb[pb.length - 1];
    // 同一位置連續出現的 <pb ed="M"/>、<pb ed="V"/>… 併成一列
    if (last && last.sentence === sentence) Object.assign(last, tuple);
    else pb.push({ sentence, ...tuple } as (typeof pb)[number]);
  }
  acc += clean(html.slice(pos));
  return { text: unescape(acc).replace(/\s+/g, ' ').trim(), notes, pb };
}

const AREA: Record<string, string> = {
  'vinayapiṭake': 'vin', 'dīghanikāye': 'dn', 'majjhimanikāye': 'mn',
  'saṃyuttanikāye': 'sn', 'aṅguttaranikāye': 'an', 'khuddakanikāye': 'kn', 'abhidhammapiṭake': 'abh',
};

/**
 * 書名對照：`data/cs-index/tables.tsv` 的 `title_pali`（來自 OpenTipitaka）。
 * 有些 TEI 沒有 `<head rend="book">`，目錄上就只剩 id；用這張表補名字。
 */
const TITLES = new Map<string, string>();
{
  const f = join(ROOT, 'data', 'cs-index', 'tables.tsv');
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').trimEnd().split('\n').slice(1)) {
      const [table, book, , pali] = line.split('\t');
      if (!pali) continue;
      if (book) TITLES.set(book, pali);
      if (table) TITLES.set(`#${table}`, pali);
    }
  }
}
const titleOf = (book: string, file: string): string => {
  const table = file.split(/[\\/]/).pop()!.replace(/\.xml$/, '').replace(/\./g, '_');
  return TITLES.get(book) ?? TITLES.get(`#${table}`) ?? '';
};
const rows: string[] = ['book\tchunks\tlines\tnotes\tscript\tfile\tarea'];
const allNotes: string[] = ['book\tline\tnote'];
const allPages: string[] = ['book\tchunk\tseg\tsentence\tm\tv\tp\tt'];
let done = 0, lines = 0;

for (const [book, file] of [...sources].sort(([a], [b]) => (a < b ? -1 : 1))) {
  if (only && book !== only) continue;
  const raw = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const out: string[] = [];
  let chunkNo = 0, noteCount = 0, pendingPn = '', nikaya = '', seqNo = 0, bkTitle = false;
  const usedPn = new Set<string>();
  const noteRows: string[][] = [];
  const re = /<(p|head|trailer)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const attrs = m[2];
    const rend = /rend="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const { text, notes, pb } = cleanInner(m[3]);
    if (rend === 'nikaya') { nikaya = text; continue; }
    if (rend === 'dot') continue;
    noteCount += notes.length;
    for (const n of notes) noteRows.push([book, String(out.length), n]);
    if (rend === 'paranum') { pendingPn = text; continue; }
    // 純編號段落（`1.`／`12.`，多為 hangnum）：只當段號，不佔一行（實測 33,839 行）
    if (/^\d+\s*\.?$/.test(text)) { pendingPn = text.replace(/\s|\./g, ''); continue; }
    if (!text) continue;
    let line = '';
    let split = true; // 標題／偈不切句
    if (rend === 'book') { line = `^bk#${book}(${text})`; bkTitle = true; split = false; }
    else if (rend === 'chapter' && !bkTitle && chunkNo === 0 && !/^\d/.test(text)) {
      // 有些書（vin02t3／t4）把書名寫成第一個 chapter，而且沒有 rend="book"
      line = `^bk#${book}(${text})`;
      bkTitle = true;
      split = false;
    }
    else if (rend === 'chapter') { chunkNo++; line = `^ck#${book}-${chunkNo}(${text})`; split = false; }
    else if (rend === 'subhead') { line = `^h(${text})`; split = false; }
    else if (rend === 'centre') {
      if (text.startsWith('॥ ')) continue;
      line = `^end ${text}`;
      split = false;
    } else if (/^gatha/.test(rend)) line = `^sz ${text}`;
    else line = text;
    // 沒有 SC 分句可用，就按標點自己切：`।`（句）、`॥`（偈／段末）
    const parts = split ? splitSentences(line) : [line];
    // 沒有段號的書（kp／dhp…）給流水號；標題行（書／品／小節）不給。
    // 段號在同一本書裡必須唯一（定位第一個 `<段 n>`），重複的來源段號退回流水號。
    let pn = '';
    if (split) {
      pn = pendingPn || (/\bpn="([^"]*)"/.exec(attrs)?.[1] ?? '');
      if (pn && usedPn.has(pn)) pn = '';
      if (!pn) do { pn = String(++seqNo); } while (usedPn.has(pn));
      usedPn.add(pn);
      if (/^\d+$/.test(pn)) seqNo = Math.max(seqNo, Number(pn));
    }
    if (pn) {
      // 第一個 `^ck` 之前就有段落（例 aas0t）：先給它一個塊，否則那些 `<段>` 不屬於任何塊
      if (chunkNo === 0 && !out.some((l) => l.startsWith('^ck#'))) out.push(`^ck#${book}-0`);
      parts[0] = `^n${pn} ${parts[0]}`;
      for (const h of pb) allPages.push([book, `${book}-${chunkNo}`, pn, String(h.sentence), h.m, h.v, h.p, h.t].join('\t'));
      pendingPn = '';
    }
    out.push(...parts);
  }
  const title = titleOf(book, file);
  const head = out.length && out[0].startsWith('^bk') ? [] : [title ? `^bk#${book}(${title})` : `^bk#${book}`];
  mkdirSync(SRC, { recursive: true });
  writeFileSync(join(SRC, `${book}.cs.off`), [...head, ...out].join('\n') + '\n', 'utf8');
  for (const r of noteRows) allNotes.push([r[0], String(Number(r[1]) + head.length), r[2]].join('\t'));
  const diacritics = (raw.match(/[āīūṃṅñṭḍṇḷĀĪŪṂṄÑṬḌṆḶ]/g) ?? []).length;
  rows.push([book, chunkNo, out.length + head.length, noteCount, diacritics ? 'iast' : 'provident', file.split(/[\\/]/).pop() ?? ''].join('\t'));
  done++;
  lines += out.length + head.length;
}

writeFileSync(join(ROOT, 'out', 'books2off.tsv'), rows.join('\n') + '\n', 'utf8');
writeFileSync(join(ROOT, 'out', 'cs-pages.tsv'), allPages.join('\n') + '\n', 'utf8');
writeFileSync(join(ROOT, 'out', 'cs-notes.tsv'), allNotes.join('\n') + '\n', 'utf8');
console.log(`產生 ${done} 冊、${lines} 行 → ${SRC}`);
for (const r of rows.slice(1, 6)) console.log('  ' + r.replace(/\t/g, '  '));
