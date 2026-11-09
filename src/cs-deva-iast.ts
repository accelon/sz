#!/usr/bin/env bun
/**
 * `data/cs-deva-iast`：把 CST `deva master`（Devanagari）換成 IAST，**保留** `data/cs`
 * 的行骨架（行數、`<段>` 位置、所有標籤）。
 *
 *   bun run src/cs-deva-iast.ts            # 產生 data/cs-deva-iast/
 *   bun run src/cs-deva-iast.ts --check    # 只驗收既有輸出，不寫檔
 *   bun run src/cs-deva-iast.ts cs dn1     # 只做某幾本（除錯）
 *
 * 做法（作者 2026-11-03 指示）：
 *   ① 來源用 `raw/cst-deva` 的 Devanagari XML（clone 記錄見 out/cst-deva.json），
 *      **不**用 provident-pali 反推。
 *   ② 只做 Devanagari→IAST 的字元轉寫，不重跑 cs2accelon 的分句。
 *   ③ 逐詞把舊行骨架的正文換成新字：舊詞序 ↔ 新詞序用 4-gram 錨點＋區塊 LCS 對齊；
 *      對不到的新詞插在原位，對不到的舊詞保留（不丟字）。
 *   ④ 標籤內的文字（`<小節>`／`<終>`／`<聯>`／`<書>`…）是標題與連結，不是正文，不動。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';
import { newTextOf } from './deva-text';
import { applyOne, collectErrata, type Erratum } from './cs-errata';

const CS = join(ROOT, 'data', 'cs');
const OUT = join(ROOT, 'data', 'cs-deva-iast');
const DEVA = join(ROOT, 'raw', 'cst-deva', 'deva master');
const WORD_G = /[\p{L}\p{M}]+/gu;
// `塊`／`小塊` 不算標籤：有些庫的塊是**包住整段正文**的容器（vsnk），只跳過真正的標題／連結類。
const LABEL_TAGS = new Set(['小節', '終', '聯', '尾', '書', '區', '檔', '集', '英文名', '樹', '隱', '目']);

/* ------------------------------------------------------------ 舊檔（骨架） */

interface Tok { line: number; tag: boolean; raw: string; body: boolean }

function parseOld(xml: string): { lines: string[]; toks: Tok[] } {
  const lines = xml.replace(/\r\n?/g, '\n').trimEnd().split('\n');
  const toks: Tok[] = [];
  const stack: string[] = [];
  lines.forEach((line, li) => {
    for (const part of line.split(/(<[^>]*>)/)) {
      if (!part) continue;
      if (part.startsWith('<')) {
        const m = /^<\s*\/?\s*([^\s/>]+)/.exec(part);
        const tag = m?.[1] ?? '';
        if (part.startsWith('</')) {
          const at = stack.lastIndexOf(tag);
          if (at >= 0) stack.splice(at, 1);
        } else if (!part.endsWith('/>') && tag && tag !== '段' && tag !== '偈' && tag !== 'b') {
          stack.push(tag);
        }
        toks.push({ line: li, tag: true, raw: part, body: false });
        continue;
      }
      toks.push({ line: li, tag: false, raw: part, body: !stack.some((t) => LABEL_TAGS.has(t)) });
    }
  });
  return { lines, toks };
}

/* ------------------------------------------------------------ 詞序對齊 */

/** 回傳 old → new 的索引（-1 = 沒有對應）。 */
function align(a: string[], b: string[]): Int32Array {
  const map = new Int32Array(a.length).fill(-1);
  const K = 4;
  const bPos = new Map<string, number>();
  for (let j = 0; j + K <= b.length; j++) {
    const key = b.slice(j, j + K).join(' ');
    if (bPos.has(key)) bPos.set(key, -1);
    else bPos.set(key, j);
  }
  const cand: [number, number][] = [];
  for (let i = 0; i + K <= a.length; i++) {
    const j = bPos.get(a.slice(i, i + K).join(' '));
    if (j !== undefined && j >= 0) cand.push([i, j]);
  }
  // j 的最長遞增子序列（i 本來就遞增）；貪心會抓到後面重複的片段
  const tails: number[] = [];
  const prev = new Int32Array(cand.length).fill(-1);
  const tailIdx: number[] = [];
  for (let t = 0; t < cand.length; t++) {
    const j = cand[t]![1];
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid]! < j) lo = mid + 1; else hi = mid; }
    if (lo > 0) prev[t] = tailIdx[lo - 1]!;
    tails[lo] = j;
    tailIdx[lo] = t;
  }
  const anchors: [number, number][] = [];
  for (let t = tailIdx[tails.length - 1] ?? -1; t >= 0; t = prev[t]!) anchors.push(cand[t]!);
  anchors.reverse();

  const gapAlign = (a0: number, a1: number, b0: number, b1: number): void => {
    const n = a1 - a0, m = b1 - b0;
    if (n <= 0 || m <= 0) return;
    if (n * m <= 250_000) {
      const w = m + 1;
      const dp = new Uint16Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          dp[i * w + j] = a[a0 + i] === b[b0 + j]
            ? dp[(i + 1) * w + j + 1] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
        }
      }
      const pairs: [number, number][] = [];
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (a[a0 + i] === b[b0 + j]) { pairs.push([i, j]); i++; j++; }
        else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
        else j++;
      }
      // 錨點之間對不上的字，按位置一對一換（版本異讀就是這樣換掉的）；
      // 多出來的舊詞保留、多出來的新詞不用——不插入，免得破壞 `<辭>` 的詞邊界。
      let pa = -1, pb = -1;
      for (const [mi, mj] of [...pairs, [n, m] as [number, number]]) {
        const k = Math.min(mi - pa - 1, mj - pb - 1);
        for (let t = 0; t < k; t++) map[a0 + pa + 1 + t] = b0 + pb + 1 + t;
        if (mi < n) map[a0 + mi] = b0 + mj;
        pa = mi; pb = mj;
      }
      return;
    }
    const k = Math.min(n, m);
    for (let t = 0; t < k; t++) map[a0 + t] = b0 + t;
  };
  let pi = 0, pj = 0;
  for (const [i, j] of anchors) {
    gapAlign(pi, i, pj, j);
    map[i] = j;
    pi = i + 1; pj = j + 1;
  }
  gapAlign(pi, a.length, pj, b.length);
  return map;
}

/* ------------------------------------------------------------ 書 → deva 檔 */

interface BookSource { book: string; files: string[]; from?: string; to?: string }

const { cst4rename } = (await import('./cst-rename')) as { cst4rename: (f: string) => string };

/** CST 檔名 → 書 id；一個檔可能拆成多本書（`vin02t` 四本、`abh07t` 兩本）。 */
function bookSources(): Map<string, BookSource> {
  const files = readdirSync(DEVA).filter((f) => f.endsWith('.xml') && !f.endsWith('.toc.xml'));
  const out = new Map<string, BookSource>();
  const add = (book: string, file: string, span?: { from?: string; to?: string }) => {
    const cur = out.get(book);
    if (!cur) out.set(book, { book, files: [file], ...span });
    else if (!cur.files.includes(file)) cur.files.push(file);
  };
  for (const f of files.sort()) {
    const id = cst4rename(f);
    if (id) { add(id, f); continue; }
    const m = /^(e\d+n)\.nrf\.xml$/.exec(f);
    if (m) add(`${m[1]}_nrf_xml`, f);
  }
  // 一個檔案裡有多本書：用 `<p rend="book">`／章標題切開（舊管線也是這樣拆）
  const vin = 'vin02t.tik.xml';
  out.delete('pvr0t');
  add('pc0t', vin, { to: 'महावग्ग-टीका' });
  add('mv0t', vin, { from: 'महावग्ग-टीका', to: 'चूळवग्ग-टीका' });
  add('cv0t', vin, { from: 'चूळवग्ग-टीका', to: 'परिवार-टीका' });
  add('pvr0t', vin, { from: 'परिवार-टीका' });
  add('aas0a', 'abh07t.nrf.xml', { from: 'अभिधम्मत्थविभाविनीटीका' });
  const aasSrc = out.get('aas');
  if (aasSrc) aasSrc.to = 'अभिधम्मत्थविभाविनीटीका';
  return out;
}

/** 依 from／to 切出這一本書的 XML 片段（找不到 marker 就整份）。 */
function sliceFor(src: BookSource, xml: string): string {
  let text = xml;
  if (src.from) {
    const at = text.indexOf(src.from);
    if (at > 0) text = text.slice(at);
  }
  if (src.to) {
    const at = text.indexOf(src.to);
    if (at > 0) text = text.slice(0, at);
  }
  return text;
}

/** 儉約巴利的殘碼（舊轉檔掉出來的碎片）：母音後面夾大寫、或整串大寫。`??` 不算。 */
function isProvidentCode(w: string): boolean {
  return /[^\p{Lu}][\p{Lu}]/u.test(w) || /^[\p{Lu}]{2,}/u.test(w);
}

/* ------------------------------------------------------------ 主流程 */

export function run(): void {
const check = process.argv.includes('--check');
// 勘誤：`open` 的才要套用（`fixed` 是官方已經改好的，本地不用再留）
const errata = collectErrata();
const errataByFile = new Map<string, Erratum[]>();
for (const e of errata) {
  const arr = errataByFile.get(e.file) ?? [];
  arr.push(e);
  errataByFile.set(e.file, arr);
}
const applied = new Map<Erratum, number>();
const only = process.argv.slice(2).filter((x) => !x.startsWith('--'));

if (!existsSync(join(DEVA))) {
  console.error(`缺少 ${DEVA}；先 clone（見 out/cst-deva.json）`);
  process.exit(2);
}
const sources = bookSources();
const allBooks = readdirSync(CS).filter((f) => f.endsWith('.xml') && f !== '00.xml').map((f) => f.replace(/\.xml$/, '')).sort();
const missing = allBooks.filter((b) => !sources.has(b));
if (missing.length) console.warn(`⚠ data/cs 有 ${missing.length} 冊沒有 deva 對照：${missing.join(' ')}`);
const books = allBooks.filter((b) => sources.has(b) && (!only.length || only.includes(b)));

if (!check) mkdirSync(OUT, { recursive: true });

interface Row { book: string; lines: [number, number]; segs: [number, number]; words: [number, number]; matched: number; kept: number; unused: number; dropped: number; devaLeft: number; ms: number }
const rows: Row[] = [];

for (const book of books) {
  const src = sources.get(book)!;
  const oldXml = readFileSync(join(CS, `${book}.xml`), 'utf8');
  const { lines, toks } = parseOld(oldXml);
  const newWords: string[] = [];
  for (const f of src.files) {
    let xml = readFileSync(join(DEVA, f), 'utf16le');
    // Devanagari 的勘誤在轉寫前套用（舊管線也是直接改來源字串）
    for (const e of errataByFile.get(f) ?? []) {
      if (e.kind !== 'errata') continue;
      const r = applyOne(xml, e, false);
      xml = r.text;
      if (r.n) applied.set(e, (applied.get(e) ?? 0) + r.n);
    }
    newWords.push(...(newTextOf(sliceFor(src, xml)).match(WORD_G) ?? []));
  }

  // 舊正文詞（記位置）
  const oldWords: string[] = [];
  const refs: { tok: number; start: number; end: number }[] = [];
  toks.forEach((tok, ti) => {
    if (tok.tag || !tok.body) return;
    for (const m of tok.raw.matchAll(WORD_G)) {
      oldWords.push(m[0]);
      refs.push({ tok: ti, start: m.index!, end: m.index! + m[0].length });
    }
  });

  const t0 = performance.now();
  const map = align(oldWords, newWords);
  // 只做 1:1 換字：`<辭 b j>` 的表面字要對得上詞譜，插入新詞會破壞詞邊界（作者要求不硬切詞）。
  // 對不到的新詞不用（多為夾註、重複語句、校勘異文），計數後回報。
  if (process.env.DBG === "kept") {
    const keptAt: number[] = [];
    for (let i = 0; i < map.length && keptAt.length < 6; i++) if (map[i]! < 0) keptAt.push(i);
    for (const i of keptAt) {
      console.log(`  [${book}] 保留 @${i}: …${oldWords.slice(Math.max(0, i - 6), i).join(" ")} [[${oldWords[i]}]] ${oldWords.slice(i + 1, i + 7).join(" ")}…`);
    }
    console.log(`  [${book}] 共保留 ${[...map].filter((m) => m < 0).length}`);
  }
  const usedNew = new Set<number>();
  for (const m of map) if (m >= 0) usedNew.add(m);
  const unusedNew = newWords.length - usedNew.size;

  // 重寫每個 text token
  const editsByTok = new Map<number, { start: number; end: number; text: string }[]>();
  let droppedCodes = 0;
  for (let i = 0; i < oldWords.length; i++) {
    const ref = refs[i]!;
    const list = editsByTok.get(ref.tok) ?? [];
    const m = map[i]!;
    // 對不到就保留舊詞；但舊詞若是儉約巴利的殘碼（`VctYVc`、`tI`…），那是舊轉檔掉的碎片，
    // 不是 IAST，直接丟掉（`??` placeholder 不動，作者交代先留）。
    const kept = oldWords[i]!;
    const rep = m >= 0 ? newWords[m]! : (isProvidentCode(kept) ? (droppedCodes++, '') : kept);
    list.push({ start: ref.start, end: ref.end, text: rep });
    editsByTok.set(ref.tok, list);
  }
  const perLine: number[][] = lines.map(() => []);
  toks.forEach((tok, ti) => perLine[tok.line]!.push(ti));
  const out: string[] = lines.map((line, li) => {
    let s = '';
    for (const ti of perLine[li]!) {
      const tok = toks[ti]!;
      if (tok.tag) { s += tok.raw; continue; }
      const edits = editsByTok.get(ti);
      if (!edits) { s += tok.raw; continue; }
      let from = 0;
      let r = '';
      for (const e of edits.sort((x, y) => x.start - y.start)) {
        r += tok.raw.slice(from, e.start) + e.text;
        from = e.end;
      }
      s += (r + tok.raw.slice(from)).replace(/ {2,}/g, ' ').replace(/ +([,.;:!?।॥])/g, '$1');
    }
    return s;
  });
  // 羅馬轉寫的 typo 在產出的 IAST 上套用（不分大小寫；Devanagari 沒有大小寫）
  let outText = out.join('\n');
  for (const f of src.files) {
    for (const e of errataByFile.get(f) ?? []) {
      if (e.kind !== 'typo') continue;
      const r = applyOne(outText, e, true);
      outText = r.text;
      if (r.n) applied.set(e, (applied.get(e) ?? 0) + r.n);
    }
  }
  out.splice(0, out.length, ...outText.split('\n'));
  const ms = performance.now() - t0;

  let matched = 0;
  for (const m of map) if (m >= 0) matched++;

  const segCount = (ls: string[]) => ls.reduce((n, l) => n + (l.match(/<段 /g) ?? []).length, 0);
  rows.push({
    book,
    lines: [lines.length, out.length],
    segs: [segCount(lines), segCount(out)],
    words: [oldWords.length, newWords.length],
    matched: oldWords.length ? matched / oldWords.length : 1,
    kept: oldWords.length - matched,
    unused: unusedNew,
    dropped: droppedCodes,
    devaLeft: (out.join('\n').match(/[\u0900-\u0963\u0966-\u096F]/g) ?? []).length,
    ms,
  });
  if (!check) writeFileSync(join(OUT, `${book}.xml`), out.join('\n') + '\n', 'utf8');
}

if (!check && existsSync(join(CS, '00.xml'))) {
  writeFileSync(join(OUT, '00.xml'), readFileSync(join(CS, '00.xml'), 'utf8'), 'utf8');
}

// 報告
const pad = (n: number, w = 6) => String(n).padStart(w);
const report: string[] = ['書\t行數\t段\t舊詞\t對到\t保留\t新詞未用\t丟掉殘碼\t耗時'];
console.log('書      行數        段        舊詞    對到%   保留  新詞未用   耗時');
const line = (r: Row): string => [
  r.book.padEnd(14),
  `${pad(r.lines[0])}${r.lines[0] === r.lines[1] ? ' ' : '≠'}`,
  `${pad(r.segs[0])}${r.segs[0] === r.segs[1] ? ' ' : '≠'}`,
  `${pad(r.words[0], 8)}`,
  `${(r.matched * 100).toFixed(2)}%`.padStart(7),
  pad(r.kept, 5),
  pad(r.unused, 7),
  `${r.ms.toFixed(0)} ms`.padStart(8),
  r.lines[0] !== r.lines[1] || r.segs[0] !== r.segs[1] ? '✗ 行／段不符' : '',
].join(' ');
for (const r of rows) {
  console.log(line(r));
  report.push([r.book, r.lines[0], r.segs[0], r.words[0], `${(r.matched * 100).toFixed(2)}%`, r.kept, r.unused, r.dropped, `${r.ms.toFixed(0)}ms`].join('\t'));
}
const sum = (f: (r: Row) => number) => rows.reduce((n, r) => n + f(r), 0);
const matchedAll = sum((r) => r.matched * r.words[0]) / Math.max(1, sum((r) => r.words[0]));
console.log(`\n${rows.length} 冊：${sum((r) => r.lines[0])} 行、${sum((r) => r.segs[0])} 段、` +
  `${sum((r) => r.words[0])} 舊詞；對到 ${(matchedAll * 100).toFixed(2)}%、保留 ${sum((r) => r.kept)}、新詞未用 ${sum((r) => r.unused)}、丟掉殘碼 ${sum((r) => r.dropped)}`);
report.push(`合計\t${sum((r) => r.lines[0])}\t${sum((r) => r.segs[0])}\t${sum((r) => r.words[0])}\t${(matchedAll * 100).toFixed(2)}%\t${sum((r) => r.kept)}\t${sum((r) => r.unused)}`);
if (!check) writeFileSync(join(ROOT, 'out', 'cs-deva-report.txt'), report.join('\n') + '\n', 'utf8');
const processedFiles = new Set<string>();
for (const b of books) for (const f of sources.get(b)!.files) processedFiles.add(f);
const openErr = errata.filter((e) => e.status === 'open' && processedFiles.has(e.file));
const notApplied = openErr.filter((e) => !applied.get(e));
console.log(`勘誤：open ${openErr.length} 條，套用 ${openErr.length - notApplied.length} 條` +
  (notApplied.length ? `；未套用 ${notApplied.length} 條（輸出已無此詞，通常是舊骨架已是正確形）：${notApplied.map((e) => `${e.file}:${e.wrong}`).join('、')}` : ''));
const devaLeft = sum((r) => r.devaLeft);
if (devaLeft) console.error(`✗ 輸出還有 ${devaLeft} 個 Devanagari 字母（應為 0）`);
const bad = rows.filter((r) => r.lines[0] !== r.lines[1] || r.segs[0] !== r.segs[1]);
if (bad.length) { console.error(`✗ ${bad.length} 冊行／段不符`); process.exit(1); }
if (!check) console.log(`寫入 ${OUT}`);
}

if (import.meta.main) run();
