#!/usr/bin/env bun
/**
 * CST `deva master` 的勘誤表（`data/cs-index/errata.tsv`）。
 *
 * 勘誤資料現在是 repo 裡的 `src/errata.ts`（作者用 SuttaCentral 對勘，多半是 CST 的輸入錯誤）；
 * 官方 deva master 已經改掉的條目放在 `data/cs-index/errata-retired.tsv`，不再套用。
 * 這支腳本只負責：讀 `src/errata.ts`、對**現在的** deva master 數還剩幾處、寫出表格。
 *
 *   bun run src/cs-errata.ts            # 寫 data/cs-index/errata.tsv
 *   bun run src/cs-errata.ts --print    # 只印摘要
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';
import { newTextOf } from './deva-text';
import { cst4rename } from './cst-rename';
import { DEVA as DEVA_TABLE, TYPO as TYPO_TABLE, type Patch } from './errata';

const DEVA = join(ROOT, 'raw', 'cst-deva', 'deva master');
const OUT = join(ROOT, 'data', 'cs-index', 'errata.tsv');

export interface Erratum {
  /** deva 檔名（`s0201m.mul.xml`） */
  file: string;
  /** cs 書 id（`mn1`）；沒有對照就空字串 */
  book: string;
  kind: 'typo' | 'errata';
  wrong: string;
  right: string;
  /** 0＝全部取代；n＝最多 n 次（舊管線 patchBuf 的語意） */
  count: number;
  re: RegExp | null;
  /** 現在的 deva master 還剩幾處（0 ＝官方已改，可以移到 retired） */
  hits: number;
  status: 'open' | 'fixed';
  /** errata.ts 那條的註解（通常是 SC／bilara 的出處） */
  note: string;
}

const files = readdirSync(DEVA).filter((f) => f.endsWith('.xml') && !f.endsWith('.toc.xml'));

const rawCache = new Map<string, string>();
const rawOf = (f: string): string => {
  let t = rawCache.get(f);
  if (t === undefined) {
    t = readFileSync(join(DEVA, f), 'utf16le');
    rawCache.set(f, t);
  }
  return t;
};

/** typo 表是羅馬轉寫；deva 檔要先轉成 IAST 再找（不分大小寫，Devanagari 沒有大小寫）。 */
const iastCache = new Map<string, string>();
const iastOf = (f: string): string => {
  let t = iastCache.get(f);
  if (t === undefined) {
    t = newTextOf(rawOf(f)).toLowerCase();
    iastCache.set(f, t);
  }
  return t;
};

const countIn = (text: string, needle: string): number => {
  if (!needle) return 0;
  let n = 0;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) n++;
  return n;
};

/** 從 `src/errata.ts` 的註解抓每條的出處（`[...], // note`）。 */
function loadNotes(): Map<string, string> {
  const out = new Map<string, string>();
  let file = '';
  for (const line of readFileSync(join(import.meta.dir, 'errata.ts'), 'utf8').split('\n')) {
    const key = /^\s*["']([^"']+\.xml)["']\s*:/.exec(line);
    if (key) { file = key[1]!; continue; }
    const at = line.indexOf('//');
    if (at < 0 || !file) continue;
    const note = line.slice(at + 2).trim();
    if (!note) continue;
    const ent = /\[(?:\/.*?\/[a-z]*|["']([^"']*)["'])\s*,\s*["']([^"']*)["']/.exec(line.slice(0, at));
    if (!ent) continue;
    out.set(`${file}\u0000${ent[1] ?? ent[0]}\u0000${ent[2]}`, note);
  }
  return out;
}

/** 收集勘誤，並標出「還有效／官方已改」。 */
export function collectErrata(): Erratum[] {
  const rows: Erratum[] = [];
  const notes = loadNotes();
  const add = (file: string, ent: Patch, kind: 'typo' | 'errata'): void => {
    const [wrong, right, count = 0] = ent;
    const re = wrong instanceof RegExp ? wrong : null;
    const display = re ? String(re) : String(wrong);
    let hits = 0;
    if (re) {
      const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
      hits = (rawOf(file).match(new RegExp(re.source, flags)) ?? []).length;
    } else if (kind === 'typo') {
      hits = countIn(iastOf(file), String(wrong).toLowerCase());
    } else {
      hits = countIn(rawOf(file), String(wrong));
    }
    rows.push({
      file,
      book: cst4rename(file),
      kind,
      wrong: display,
      right: String(right),
      count: Number(count) || 0,
      re,
      hits,
      status: hits > 0 ? 'open' : 'fixed',
      note: notes.get(`${file}\u0000${display}\u0000${String(right)}`) ?? '',
    });
  };
  for (const [file, list] of Object.entries(DEVA_TABLE)) for (const e of list) add(file, e, 'errata');
  for (const [file, list] of Object.entries(TYPO_TABLE)) for (const e of list) add(file, e, 'typo');
  rows.sort((a, b) => a.file.localeCompare(b.file) || a.wrong.localeCompare(b.wrong));
  return rows;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 套用一條勘誤；回傳新文字與實際取代次數（受 `count` 上限）。 */
export function applyOne(text: string, e: Erratum, caseInsensitive: boolean): { text: string; n: number } {
  const limit = e.count > 0 ? e.count : Number.POSITIVE_INFINITY;
  const re = e.re
    ? new RegExp(e.re.source, e.re.flags.includes('g') ? e.re.flags : e.re.flags + 'g')
    : new RegExp(escapeRe(e.wrong), caseInsensitive ? 'gi' : 'g');
  let n = 0;
  const out = text.replace(re, (m: string) => {
    if (n >= limit) return m;
    n++;
    if (!caseInsensitive) return e.right;
    // 我們的 IAST 是小寫開頭；原文小寫就用小寫的替換字
    return m === m.toLowerCase() ? e.right.charAt(0).toLowerCase() + e.right.slice(1) : e.right;
  });
  return { text: out, n };
}

const esc = (s: string): string => s.replace(/\t/g, '\\t').replace(/\r?\n/g, '\\n');

function main(): void {
  const rows = collectErrata();
  const open = rows.filter((r) => r.status === 'open');
  const fixed = rows.filter((r) => r.status === 'fixed');
  if (!process.argv.includes('--print')) {
    mkdirSync(join(ROOT, 'data', 'cs-index'), { recursive: true });
    const head = ['檔案', '書', '種類', '錯誤', '正確', '次數', '現存', '狀態', '依據'];
    const body = rows.map((r) => [
      r.file, r.book, r.kind, esc(r.wrong), esc(r.right), String(r.count), String(r.hits), r.status, esc(r.note),
    ].join('\t'));
    writeFileSync(OUT, [head.join('\t'), ...body].join('\n') + '\n', 'utf8');
    console.log(`寫入 ${OUT}`);
  }
  console.log(`勘誤 ${rows.length} 條：還有效 ${open.length}、官方已改 ${fixed.length}`);
  if (fixed.length) {
    console.log(`  ⚠ 官方已改的 ${fixed.length} 條還在 src/errata.ts：` +
      fixed.slice(0, 6).map((r) => `${r.file}:${r.wrong}`).join('、') +
      '；可以移到 data/cs-index/errata-retired.tsv');
  }
  if (process.argv.includes('--print')) {
    for (const r of open) console.log(`  [open] ${r.file} ${r.book} ${r.wrong} → ${r.right} ×${r.hits}`);
  }
}

if (import.meta.main) main();
