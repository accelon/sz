#!/usr/bin/env bun
/**
 * 用 komyoji 的逐次標註訓練一個「格位猜測器」，再套到全語料。
 *
 *   bun run src/decomp/case-model.ts            # 訓練＋留出驗證
 *   bun run src/decomp/case-model.ts --predict  # 套到全語料，寫 out/case-fill.tsv
 *
 * 作者的話：komyoji 做十幾年才有那些，我們的工作是**基於他的成果**把全語料標起來，
 * 有點錯沒關係——目標是降低學習門檻，不是追求完美。
 *
 * 模型（純查表，可解釋）：
 *   1. 詞性 + 形的最後 3 字
 *   2. 詞性 + 形的最後 2 字
 *   3. 詞性
 *   4. 全體最常見的格位
 * 每一層都要求樣本數 ≥ 20，否則退回下一層。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { gunzipSync } from 'node:zlib';
import { join as joinPath } from 'node:path';
import { ROOT } from '../profiles';
import { DICT_DB } from './sources';
import { OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;
const norm = (s: string): string => s.normalize('NFC').toLowerCase();
const PREDICT = process.argv.includes('--predict');

/* 我們的語料：每一行有哪些詞 */
type Occur = { file: string; line: number; k: number; w: string };
const corpus: Occur[][] = []; // 依 file 分組：corpus[fi][line-1] = 該行的詞
const fileNames: string[] = [];
{
  const dir = join(ROOT, 'data', 'cs');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml') && x !== '00.xml')) {
    fileNames.push(f);
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    const per: Occur[][] = [];
    lines.forEach((line, li) => {
      const ws = (line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).map(norm);
      per.push(ws.map((w, k) => ({ file: f, line: li + 1, k, w })));
    });
    corpus.push(per);
  }
}
const fileIndex = new Map(fileNames.map((f, i) => [f, i]));

/* 投影（komyoji 的答案） */
type Label = { fi: number; line: number; k: number; pos: string; gc: string };
const labels: Label[] = [];
const labelKey = new Map<string, { pos: string; gc: string }>();
for (const l of readFileSync(join(ROOT, 'out', 'projection.tsv'), 'utf8').split('\n').slice(1)) {
  const [file, line, k, , pos, gc] = l.split('\t');
  if (!file || !gc || gc === '‐') continue;
  const fi = fileIndex.get(file + '.xml');
  if (fi == null) continue;
  labels.push({ fi, line: Number(line), k: Number(k), pos, gc });
  labelKey.set(`${file}\t${line}\t${k}`, { pos, gc });
}
console.log(`標註樣本 ${labels.length.toLocaleString()} 筆`);

/* komyoji 的日文詞類 → 8 個枚舉（投影檔存的是原始標籤，分佈檔存的是枚舉） */
const POS_CANON: Record<string, string> = {
  '名': 'n', '形': 'adj', '代': 'pron', '動': 'v', '数': 'num', '不変': 'ind',
  '過分': 'ptcp', '現分': 'ptcp', '未分': 'ptcp', '名形': 'adj',
  '名現分': 'ptcp', '名過分': 'ptcp', '名未分': 'ptcp', '不定': 'other', '‐': 'other',
};
const canonPos = (p: string): string => POS_CANON[p] ?? p;

/* 詞性估計：komyoji 的形層多數詞性 → dpd（詞幹）→ n */
const posOfForm = new Map<string, string>();
const posOfStem = new Map<string, string>();
/* komyoji 的形 → 多數詞性 */
{
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/pos-distribution.tsv.gz')).toString('utf8').split('\n');
  const acc = new Map<string, Map<string, number>>();
  for (let i = 1; i < raw.length; i++) {
    const [w, pos, c] = raw[i].split('\t');
    if (!w || !pos) continue;
    const m = acc.get(w) ?? new Map<string, number>();
    m.set(pos, (m.get(pos) ?? 0) + (Number(c) || 0));
    acc.set(w, m);
  }
  for (const [w, m] of acc) {
    let bp = '';
    let bn = 0;
    for (const [k, n] of m) if (n > bn) { bn = n; bp = k; }
    if (bp) posOfForm.set(w, bp);
  }
  console.log(`形層詞性 ${posOfForm.size.toLocaleString()} 個`);
}
{
  const db = new Database(DICT_DB, { readonly: true });
  const gram = new Map<string, string>();
  for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
    if (!gram.has(r.dict_key)) gram.set(r.dict_key, (r.dict_content.split('\n')[0] || '').trim());
  }
  db.close();
  const RULES: [RegExp, string][] = [
    [/\b(masc|fem|nt)\b/, 'n'], [/\badj\b/, 'adj'],
    [/\b(pr|aor|imper|opt|cond|imperf|perf|fut)\b/, 'v'],
    [/\b(pp|prp|ppa|ptp|ger|abs|inf)\b/, 'ptcp'],
    [/\b(ind|adv|conj|prep|prefix|sandhi)\b/, 'ind'],
    [/\bpron\b/, 'pron'], [/\b(card|ordin|number)\b/, 'num'],
  ];
  for (const [k, g] of gram) {
    let best = Infinity; let bp = '';
    for (const [re, pos] of RULES) { const m = re.exec(g); if (m && m.index < best) { best = m.index; bp = pos; } }
    if (bp) posOfStem.set(k, bp);
  }
}
const estPos = (o: Occur): string => posOfForm.get(o.w) ?? posOfStem.get(o.w) ?? 'n';

/* 特徵 */
const suffix = (w: string, n: number): string => [...w].slice(-n).join('');
const feat = (o: Occur, pos: string, n: number): string => `${pos}|${suffix(o.w, n)}`;

/* 統計表 */
type Dist = Map<string, number>;
const table = new Map<string, Dist>();
const bump = (key: string, gc: string): void => {
  const d = table.get(key) ?? new Map<string, number>();
  d.set(gc, (d.get(gc) ?? 0) + 1);
  table.set(key, d);
};
const overall: Dist = new Map();

const POS_FALLBACK = 'n'; // 沒有詞性時的預設（名詞最多）
/* 80/20 切分：只用訓練集建表，避免資訊洩漏 */
const isTest = (i: number): boolean => i % 5 === 0;
labels.forEach((L, i) => {
  if (isTest(i)) return;
  const o = corpus[L.fi]?.[L.line - 1]?.[L.k];
  if (!o) return;
  const pos = canonPos(L.pos);
  bump(feat(o, pos, 3), L.gc);
  bump(feat(o, pos, 2), L.gc);
  bump(pos, L.gc);
  overall.set(L.gc, (overall.get(L.gc) ?? 0) + 1);
});
const best = (d: Dist | undefined): { gc: string; n: number } | null => {
  if (!d) return null;
  let bk = '';
  let bn = 0;
  for (const [k, n] of d) if (n > bn) { bn = n; bk = k; }
  return bn ? { gc: bk, n: bn } : null;
};
const overallBest = best(overall)!;
/** 取前兩名（第二名要 ≥25% 才有意義） */
const with2 = (gc: string, d: Dist, level: string): { gc: string; conf: number; level: string; gc2: string } => {
  const total = [...d.values()].reduce((a, c) => a + c, 0);
  const ranked = [...d].sort((a, b) => b[1] - a[1]);
  const second = ranked.find(([c]) => c !== gc);
  const gc2 = second && second[1] / total >= 0.25 ? second[0] : '';
  return { gc, conf: (d.get(gc) ?? 0) / total, level, gc2 };
};
const predict = (o: Occur, pos: string): { gc: string; conf: number; level: string; gc2: string } => {
  for (const n of [3, 2]) {
    const b = best(table.get(feat(o, pos, n)));
    if (b && b.n >= 20) return with2(b.gc, table.get(feat(o, pos, n))!, `suf${n}`);
  }
  const b = best(table.get(pos));
  if (b && b.n >= 20) return with2(b.gc, table.get(pos)!, 'pos');
  return { gc: overallBest.gc, conf: 0, level: 'global', gc2: '' };
};

/* 留出驗證：80/20（依投影出現序） */
let hit = 0;
let total = 0;
const byLevel = new Map<string, { hit: number; total: number }>();
for (let i = 0; i < labels.length; i++) {
  if (!isTest(i)) continue; // 20% 留出（不參與建表）
  const L = labels[i];
  const o = corpus[L.fi]?.[L.line - 1]?.[L.k];
  if (!o) continue;
  const p = predict(o, estPos(o));
  total++;
  const ok = p.gc === L.gc;
  if (ok) hit++;
  const s = byLevel.get(p.level) ?? { hit: 0, total: 0 };
  s.total++;
  if (ok) s.hit++;
  byLevel.set(p.level, s);
}
console.log(`留出驗證：${hit}/${total} = ${((hit / total) * 100).toFixed(1)}%`);
{
  let shown = 0;
  for (let i = 0; i < labels.length && shown < 3; i += 7) {
    const L = labels[i];
    const o = corpus[L.fi]?.[L.line - 1]?.[L.k];
    if (!o) continue;
    const k3 = feat(o, estPos(o), 3);
    console.log(`  樣本 ${o.w}｜estPos=${estPos(o)}｜train pos=${L.pos}｜key=${k3}｜表中有 ${table.has(k3)}`);
    shown++;
  }
}
for (const [lv, s] of byLevel) console.log(`  ${lv.padEnd(6)} ${s.hit}/${s.total} = ${((s.hit / s.total) * 100).toFixed(1)}%`);

/* 全語料套用：distinct（詞, 格）會變成多少 token（不寫檔） */
{
  const pairs = new Set<string>();
  const words = new Set<string>();
  let covered = 0;
  let totalOcc = 0;
  for (let fi = 0; fi < corpus.length; fi++) {
    for (const line of corpus[fi]) {
      for (const o of line) {
        totalOcc++;
        words.add(o.w);
        const key = `${o.file.replace(/\.xml$/, '')}\t${o.line}\t${o.k}`;
        const known = labelKey.get(key);
        const gc = known ? known.gc : predict(o, estPos(o)).gc;
        pairs.add(`${o.w}#${gc}`);
        if (known) covered++;
      }
    }
  }
  console.log(`\n全語料 ${totalOcc.toLocaleString()} 詞次；詞形 ${words.size.toLocaleString()}；(詞形, 格) ${pairs.size.toLocaleString()}（+${(((pairs.size - words.size) / words.size) * 100).toFixed(1)}%）；金標 ${((covered / totalOcc) * 100).toFixed(1)}%`);
}

/* 預測是「逐詞」的（特徵只有詞性＋字尾），所以輸出詞 → 格的對照表即可 */
{
  const rows: string[] = ['word\tpos\tcase\tconf\tlevel\tcase2'];
  const seen = new Set<string>();
  for (let fi = 0; fi < corpus.length; fi++) {
    for (const line of corpus[fi]) {
      for (const o of line) {
        if (seen.has(o.w)) continue;
        seen.add(o.w);
        const pos = estPos(o);
        const p = predict(o, pos);
        rows.push(`${o.w}\t${pos}\t${p.gc}\t${p.conf.toFixed(2)}\t${p.level}\t${p.gc2}`);
      }
    }
  }
  writeFileSync(join(OUT_DIR, 'case-by-word-model.tsv'), rows.join('\n') + '\n', 'utf8');
  console.log(`詞 → 格 預測表 ${(rows.length - 1).toLocaleString()} 列 → data/cs-decomp/case-by-word-model.tsv`);
}

if (PREDICT) {
  const rows: string[] = ['file\tline\tk\tword\tpos\tcase\tconf\tlevel'];
  let filled = 0;
  for (let fi = 0; fi < corpus.length; fi++) {
    for (const line of corpus[fi]) {
      for (const o of line) {
        const key = `${o.file.replace(/\.xml$/, '')}\t${o.line}\t${o.k}`;
        const known = labelKey.get(key);
        if (known) { rows.push([o.file.replace(/\.xml$/, ''), o.line, o.k, o.w, known.pos, known.gc, '1', 'komyoji'].join('\t')); continue; }
        const p = predict(o, estPos(o));
        rows.push([o.file.replace(/\.xml$/, ''), o.line, o.k, o.w, POS_FALLBACK, p.gc, p.conf.toFixed(2), p.level].join('\t'));
        filled++;
      }
    }
  }
  writeFileSync(join(ROOT, 'out', 'case-fill.tsv'), rows.join('\n') + '\n', 'utf8');
  console.log(`\n已預測 ${filled.toLocaleString()} 筆 → out/case-fill.tsv`);
}
