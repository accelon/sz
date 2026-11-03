#!/usr/bin/env bun
/**
 * 照 §13 的交接單，真的建一次索引（整批語料），驗證規格可實作、數字對得上。
 *
 *   bun run src/decomp/build-index.ts
 *
 * 輸出：
 *   out/index/tokens.tsv   token → posting 數
 *   out/index/summary.txt  總量與驗收測資
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { gunzipSync } from 'node:zlib';
import { ROOT } from '../profiles';
import { DICT_DB } from './sources';
import { OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;
const USE_CASE = process.argv.includes('--case');
const NOMINAL = new Set(['n','adj','ptcp','pron','num']);
// komyoji 的日文詞類 → 我們的 8 個枚舉（避免同一詞性出現 #n 與 #名 兩種後綴）
const POS_CANON: Record<string, string> = {
  '名': 'n', '形': 'adj', '代': 'pron', '動': 'v', '数': 'num', '不変': 'ind',
  '過分': 'ptcp', '現分': 'ptcp', '未分': 'ptcp',
  '名形': 'adj', '名現分': 'ptcp', '名過分': 'ptcp', '名未分': 'ptcp',
  '不定': 'other', '‐': 'other', 'other': 'other',
};
const canon = (p: string): string => POS_CANON[p] ?? p;
const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml').sort();

/* 13.2 輸入：詞形→詞件、詞件→詞幹、政策表 */
const parts = new Map<string, string[]>();
{
  const text = readFileSync(join(ROOT, 'out', 'pwa-tree-all.tsv'), 'utf8');
  let at = text.indexOf('\n') + 1;
  while (at > 0 && at < text.length) {
    const end = text.indexOf('\n', at);
    const line = end < 0 ? text.slice(at) : text.slice(at, end);
    at = end < 0 ? text.length : end + 1;
    const t1 = line.indexOf('\t');
    if (t1 < 0) continue;
    const w = line.slice(0, t1);
    const t2 = line.indexOf('\t', t1 + 1);
    const t3 = line.indexOf('\t', t2 + 1);
    if (t2 < 0 || t3 < 0) continue;
    if ((Number(line.slice(t1 + 1, t2)) || 0) === 0) continue;
    const leaves: string[] = [];
    let cur = '';
    for (const c of line.slice(t3 + 1)) {
      if (c === '[') { cur = ''; continue; }
      if (c === '|' || c === ']') { if (cur) leaves.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur) leaves.push(cur);
    if (leaves.length >= 2) parts.set(w, leaves);
  }
}
/* dpd／pm1 的第二三層（MVP 用的那些） */
for (const file of ['dpd-comp-review.tsv', 'pm1-viggaha-review.tsv']) {
  let text = '';
  try { text = readFileSync(join(OUT_DIR, file), 'utf8'); } catch { continue; }
  for (const line of text.split('\n').slice(1)) {
    const f = line.split('\t');
    if (f[4] !== '用' || !f[3]) continue;
    if (parts.has(f[0])) continue;
    const ps = f[3].split('+');
    if (ps.length >= 2) parts.set(f[0], ps);
  }
}
const stemOf = new Map<string, string>();
for (const line of readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8').split('\n').slice(1)) {
  const [a, , s] = line.split('\t');
  if (a && s) stemOf.set(a, s);
}
const stop = new Set<string>();
for (const line of readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, , action] = line.split('\t');
  if (t && action === 'stop') stop.add(t);
}
// 雜訊：儉約巴利殘留（V、??）、空白、連字號／撇號的 pwa 分析寫法（共 18 個、37 post）
const JUNK = /^\?\?|V|\s|-|'/;

/* 詞性：token 寫成 `詞幹#詞性`。來源優先序：
   1. komyoji 的逐詞標記（詞形 → 多數詞性）
   2. dpd 的 grammar（詞幹 → 最早出現的類別）
   3. 都沒有 → 'x' */
const posByForm = new Map<string, string>();
{
  const acc = new Map<string, Map<string, number>>();
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/pos-distribution.tsv.gz')).toString('utf8');
  for (const line of raw.split('\n').slice(1)) {
    const [w, p, c] = line.split('\t');
    if (!w || !p) continue;
    const m = acc.get(w) ?? new Map<string, number>();
    m.set(p, (m.get(p) ?? 0) + (Number(c) || 0));
    acc.set(w, m);
  }
  for (const [w, m] of acc) {
    const top = [...m].sort((a, b) => b[1] - a[1])[0];
    if (top) posByForm.set(w, top[0]);
  }
}
const dpdPos = new Map<string, string>();
{
  const db = new Database(DICT_DB, { readonly: true });
  const gram = new Map<string, string>();
  for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
    if (!gram.has(r.dict_key)) gram.set(r.dict_key, (r.dict_content.split('\n')[0] || '').trim());
  }
  db.close();
  const RULES: [RegExp, string][] = [
    [/\b(masc|fem|nt)\b/, 'n'],
    [/\badj\b/, 'adj'],
    [/\b(pr|aor|imper|opt|cond|imperf|perf|fut)\b/, 'v'],
    [/\b(pp|prp|ppa|ptp|ger|abs|inf)\b/, 'ptcp'],
    [/\b(ind|adv|conj|prep|prefix|sandhi)\b/, 'ind'],
    [/\bpron\b/, 'pron'],
    [/\b(card|ordin|number)\b/, 'num'],
  ];
  for (const [k, g] of gram) {
    let best = Infinity;
    let bestPos = '';
    for (const [re, pos] of RULES) {
      const m = re.exec(g);
      if (m && m.index < best) { best = m.index; bestPos = pos; }
    }
    if (bestPos) dpdPos.set(k, bestPos);
  }
}
const posOf = (word: string): string =>
  posByForm.get(word.toLowerCase()) ?? 'undefined';

const toToken = (stem: string, wordPos: string): string => {
  const pos = wordPos !== 'undefined' ? wordPos : (dpdPos.get(stem) ?? 'x');
  return `${stem}#${pos}`;
};

/* 逐次投影（可選）：file → line → k → {pos, gc} */
const proj = new Map<string, Map<number, Map<number, { pos: string; gc: string }>>>();
if (USE_CASE) {
  for (const l of readFileSync(join(ROOT, 'out', 'projection.tsv'), 'utf8').split('\n').slice(1)) {
    const [file, line, k, , pos, gc] = l.split('\t');
    if (!file) continue;
    const perLine = proj.get(file) ?? new Map<number, Map<number, { pos: string; gc: string }>>();
    const at = Number(line);
    const pk = Number(k);
    const m = perLine.get(at) ?? new Map<number, { pos: string; gc: string }>();
    m.set(pk, { pos: pos ?? 'x', gc: gc ?? '' });
    perLine.set(at, m);
    proj.set(file, perLine);
  }
  console.log(`載入投影 ${proj.size} 檔（--case）`);
}

/* 詞 → 格 的預測（沒有逐次投影時的後備，~79% 準確） */
const wordCase = new Map<string, string>();
if (USE_CASE) {
  try {
    for (const l of readFileSync(join(OUT_DIR, 'case-by-word-model.tsv'), 'utf8').split('\n').slice(1)) {
      const [w, , gc] = l.split('\t');
      if (w && gc) wordCase.set(w, gc);
    }
    console.log(`載入詞→格預測 ${wordCase.size.toLocaleString()} 筆`);
  } catch { console.log('（沒有 case-by-word-model.tsv，只用逐次投影）'); }
}

/* 13.3 建索引 */
const freq = new Map<string, number>();
const postings = new Map<string, number[]>();
const watch = new Set(['dhamma', 'ca', 'tathāgata', 'gata', 'rājan', '??2kVtO']);
let lineId = 0;
let words = 0;
let dropped = 0;
for (const f of files) {
  const lines = readFileSync(join(dir, f), 'utf8').split('\n');
  const fileKey = f.replace(/\.xml$/, '');
  for (let fileLine = 0; fileLine < lines.length; fileLine++) {
    const line = lines[fileLine];
    lineId++;
    const text = line.replace(/<[^>]*>/g, ' ');
    (text.match(WORD_G) ?? []).forEach((w, wordIdx) => {
      words++;
      const ps = parts.get(w);
      // pwa 有些詞件是多詞（"manasi karoti"），拆成單詞再進索引
      const wordPos = posOf(w);
      const pr = USE_CASE ? proj.get(fileKey)?.get(fileLine + 1)?.get(wordIdx) : undefined;
      const stems = (ps ? ps.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w])
        .flatMap((t) => t.split(/\s+/))
        .filter(Boolean);
      for (const raw of stems) {
        // 專名有大小寫（Sakka / sakka），索引一律小寫；查詢端也小寫化
        const stem = raw.toLowerCase();
        // 雜訊要看原形（儉約巴利記號是大寫 V，轉小寫就抓不到了）
        if (JUNK.test(raw) || stop.has(stem)) { dropped++; continue; }
        const posFor = pr?.pos && pr.pos !== '‐' ? canon(pr.pos) : wordPos;
        // 逐次投影優先；沒有就用「詞 → 格」預測（同一份 komyoji 標註訓練出來的）
        const gc = pr?.gc && pr.gc !== '‐' ? pr.gc : USE_CASE ? wordCase.get(w) : undefined;
        const t = USE_CASE && gc && NOMINAL.has(posFor)
          ? `${stem}#${posFor}#${gc}`
          : toToken(stem, wordPos);
        freq.set(t, (freq.get(t) ?? 0) + 1);
        if (watch.has(t)) {
          let arr = postings.get(t);
          if (!arr) { arr = []; postings.set(t, arr); }
          arr.push(lineId);
        }
      }
    });
  }
}
const total = [...freq.values()].reduce((a, b) => a + b, 0);
console.log(`檔案 ${files.length}、詞次 ${words.toLocaleString()}、行 ${lineId.toLocaleString()}`);
console.log(`token ${freq.size.toLocaleString()}、posting ${total.toLocaleString()}、丟棄 ${dropped.toLocaleString()}`);

/* 驗收 */
const checks = ['dhamma', 'ca', 'tathāgata', 'gata', '??2kVtO'];
// token 現在帶詞性後綴，驗收按詞幹加總
const stemSum = (stem: string): number => {
  let n = 0;
  for (const [t, v] of freq) if (t.split('#')[0] === stem) n += v;
  return n;
};
console.log('\n驗收（按詞幹加總）：');
for (const t of checks) {
  console.log(`  ${t.padEnd(12)} ${stemSum(t).toLocaleString()} post`);
}
const ranked = [...freq].sort((a, b) => b[1] - a[1]);
console.log('\n最長 posting：');
for (const [t, n] of ranked.slice(0, 8)) console.log(`  ${t.padEnd(12)} ${n.toLocaleString()}`);

/* 輸出 */
const outDir = join(ROOT, 'out', 'index');
mkdirSync(outDir, { recursive: true });
const rows = ['token\tposting'];
for (const [t, n] of ranked) rows.push(`${t}\t${n}`);
writeFileSync(join(outDir, 'tokens.tsv'), rows.join('\n') + '\n', 'utf8');
// 版本控管的那一份（索引端的輸入）
writeFileSync(join(OUT_DIR, 'tokens.tsv'), 'token\tposting\n' + rows.slice(1).join('\n') + '\n', 'utf8');
writeFileSync(
  join(outDir, 'summary.txt'),
  [
    `files ${files.length}`,
    `words ${words}`,
    `lines ${lineId}`,
    `tokens ${freq.size}`,
    `postings ${total}`,
    `dropped ${dropped}`,
    ...checks.map((t) => `check ${t} ${stemSum(t)}`),
  ].join('\n') + '\n',
  'utf8',
);
console.log(`\nout/index/tokens.tsv（${rows.length - 1} 列）、out/index/summary.txt`);
