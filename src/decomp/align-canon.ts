#!/usr/bin/env bun
/**
 * 全 canon 對位：用「字元 12-gram 錨點」把 komyoji 的每個句子釘到我們的檔案上，
 * 再把該句的 token 投影到我們的詞。
 *
 *   bun run src/decomp/align-canon.ts an        # 只做 an 系列（先驗證）
 *   bun run src/decomp/align-canon.ts           # 全部有檔案的資料夾
 *
 * 輸出：out/align-projection.tsv
 *   komyoji_sent  komyoji_tok  我們的檔  我們的行  我們的詞  我們的形式  komyoji_pos  格  數
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { ROOT } from '../profiles';

const WORD_G = /[\p{L}\p{M}]+/gu;
const KEEP = /[\p{L}\p{M}]/u;
const norm = (s: string): string => s.normalize('NFC').toLowerCase();

const wantFolders = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/* ── komyoji：句 → tokens ─────────────────────────────── */
type Tok = { form: string; pos: string; gc: string; num: string };
const bySent = new Map<string, Tok[]>();
{
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/tokens.tsv.gz')).toString('utf8').split('\n');
  const h = raw[0].split('\t');
  const iS = h.indexOf('sent_id'), iF = h.indexOf('form_clean'), iP = h.indexOf('pos');
  const iC = h.indexOf('case'), iN = h.indexOf('number');
  for (let k = 1; k < raw.length; k++) {
    const f = raw[k].split('\t');
    if (f.length <= Math.max(iS, iF, iP, iC, iN)) continue;
    const arr = bySent.get(f[iS]) ?? [];
    arr.push({ form: norm(f[iF]), pos: f[iP], gc: f[iC], num: f[iN] });
    bySent.set(f[iS], arr);
  }
}
const order: string[] = [];
{
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/sentences.tsv.gz')).toString('utf8').split('\n');
  const h = raw[0].split('\t');
  const iS = h.indexOf('sent_id');
  for (let k = 1; k < raw.length; k++) {
    const id = raw[k].split('\t')[iS];
    if (id) order.push(id);
  }
}

/* ── 我們的檔案（依資料夾分組）────────────────────────── */
const dataDir = join(ROOT, 'data', 'cs');
const ourFiles = readdirSync(dataDir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const folderOf = (file: string): string => file.replace(/\d.*$/, '').replace(/[a-z]+$/, (m) => m);

/** 一個資料夾的字元流＋每字元屬於哪個（檔, 詞） */
function buildStream(files: string[]): {
  chars: string;
  wordOf: Int32Array;
  words: { file: string; line: number; k: number; text: string }[];
} {
  const words: { file: string; line: number; k: number; text: string }[] = [];
  const charList: string[] = [];
  const wordOfList: number[] = [];
  for (const f of files) {
    const lines = readFileSync(join(dataDir, f), 'utf8').split('\n');
    lines.forEach((line, li) => {
      const ws = (line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).map(norm);
      ws.forEach((w, k) => {
        let any = false;
        for (const c of w) if (KEEP.test(c)) { charList.push(c); wordOfList.push(words.length); any = true; }
        if (any) words.push({ file: f, line: li + 1, k, text: w });
      });
    });
  }
  return { chars: charList.join(''), wordOf: Int32Array.from(wordOfList), words };
}

/** 12-gram 索引：只留「唯一出現」的（位置無歧義才有資格當錨點） */
function gramIndex(chars: string): Map<string, number> {
  const once = new Map<string, number>();
  const dup = new Set<string>();
  for (let i = 0; i + 12 <= chars.length; i++) {
    const key = chars.slice(i, i + 12);
    if (dup.has(key)) continue;
    if (once.has(key)) { once.delete(key); dup.add(key); continue; }
    once.set(key, i);
  }
  return once;
}

const GRAM = 12;
const rows: string[] = ['komyoji_sent\tkomyoji_tok\tfile\tline\tk\tour_form\tpos\tcase\tnumber'];
let located = 0;
let mapped = 0;
let sameForm = 0;
let sentencesSeen = 0;

const folders = new Map<string, string[]>();
for (const f of ourFiles) {
  const m = /^([a-z]+)/.exec(f);
  if (!m) continue;
  const key = m[1];
  const arr = folders.get(key) ?? [];
  arr.push(f);
  folders.set(key, arr);
}

const targets = [...folders.keys()].filter((k) => !wantFolders.length || wantFolders.includes(k));
console.log(`資料夾：${targets.join(' ')}`);

for (const folder of targets) {
  const files = folders.get(folder) ?? [];
  if (!files.length) continue;
  const stream = buildStream(files);
  const idx = gramIndex(stream.chars);
  let fLoc = 0, fMap = 0, fSame = 0, fSeen = 0;

  for (const id of order) {
    const seg = id.split('/');
    if (seg.length < 2 || !seg[1].startsWith(folder)) continue;
    const toks = bySent.get(id);
    if (!toks?.length) continue;
    fSeen++;
    // 句子的字元流（含每字元屬於哪個 token）
    let chars = '';
    const tokOf: number[] = [];
    toks.forEach((t, ti) => {
      for (const c of t.form) if (KEEP.test(c)) { chars += c; tokOf.push(ti); }
    });
    if (chars.length < GRAM) continue;

    // 找錨點：取「唯一 12-gram」，釘位後再用 40 字窗驗證，取驗證率最高的
    let pos = -1;
    let bestRate = 0;
    let tried = 0;
    for (let i = 0; i + GRAM <= chars.length && tried < 30; i += 3) {
      const p = idx.get(chars.slice(i, i + GRAM));
      if (p == null) continue;
      tried++;
      const at = p - i;
      let ok = 0;
      let n = 0;
      for (let t = 0; t < 40 && i + t < chars.length; t++) {
        const q = at + i + t;
        if (q < 0 || q >= stream.chars.length) break;
        n++;
        if (stream.chars[q] === chars[i + t]) ok++;
      }
      const rate = n ? ok / n : 0;
      if (rate > bestRate) { bestRate = rate; pos = at; }
      if (bestRate >= 0.95) break;
    }
    if (pos < 0 || bestRate < 0.8) continue;
    fLoc++;

    // 從錨點起，比對每個 token 的字元區間是否落在同一個我們的詞上
    let c0 = 0;
    for (let ti = 0; ti < toks.length; ti++) {
      const n = [...toks[ti].form].filter((x) => KEEP.test(x)).length;
      if (!n) continue;
      const start = pos + c0;
      c0 += n;
      if (start < 0 || start + n > stream.chars.length) continue;
      // 這 n 個字元是否都在同一個我們的詞上
      const w0 = stream.wordOf[start];
      let ok = true;
      for (let t = 1; t < n; t++) if (stream.wordOf[start + t] !== w0) { ok = false; break; }
      if (!ok) continue;
      const w = stream.words[w0];
      fMap++;
      if (w.text === toks[ti].form) fSame++;
      rows.push(
        [id, ti, w.file, w.line, w.k, w.text, toks[ti].pos, toks[ti].gc, toks[ti].num].join('\t'),
      );
    }
  }
  located += fLoc;
  mapped += fMap;
  sameForm += fSame;
  sentencesSeen += fSeen;
  console.log(`${folder}: 句子 ${fSeen.toLocaleString()}、釘到 ${fLoc.toLocaleString()}、token 投影 ${fMap.toLocaleString()}、形相同 ${((fSame / Math.max(1, fMap)) * 100).toFixed(1)}%`);
}

writeFileSync(join(ROOT, 'out', 'align-projection.tsv'), rows.join('\n') + '\n', 'utf8');
console.log(`\n合計：句子 ${sentencesSeen.toLocaleString()}、釘到 ${located.toLocaleString()}、token 投影 ${mapped.toLocaleString()}、形相同 ${((sameForm / Math.max(1, mapped)) * 100).toFixed(1)}%`);
console.log('out/align-projection.tsv');
