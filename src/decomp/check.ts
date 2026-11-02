#!/usr/bin/env bun
/**
 * 驗收 `data/cs-decomp/splits.tsv`：
 *
 *   bun run src/decomp/check.ts            # 驗證＋覆蓋率＋抽樣
 *   bun run src/decomp/check.ts --sample   # 另外把 200 個抽樣寫到 out/
 *
 * 驗的是「可還原」：每一列 b／j 用 provident-pali 的 orthOf 還原，必須一字不差等於
 * data/cs 裡的詞形；而且詞件至少 2 個、每個至少 2 個字母、都是查得到的詞。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseIAST, joinFormula, verifies, toOrth } from './sandhi';
import { inventory, loadLexemes, openDictionaries, OUT_DIR, ROOT } from './sources';

interface Row {
  word: string;
  b: string;
  j: string;
  parts: string[];
  src: string;
  depth: number;
  tree: string;
}

const load = (): Row[] => {
  const file = join(OUT_DIR, 'splits.tsv');
  if (!existsSync(file)) throw new Error(`沒有 ${file}，先跑 bun run src/decomp/build.ts`);
  const lines = readFileSync(file, 'utf8').trimEnd().split('\n').slice(1);
  return lines.map((line) => {
    const [word, b, j, parts, src, depth, tree] = line.split('\t');
    return { word, b, j, parts: parts.split('+'), src, depth: Number(depth) || 1, tree: tree ?? word };
  });
};

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;

/** 固定種子的抽樣（每次跑都抽到同一批，方便對照）。 */
const sample = <T,>(list: T[], n: number, seed = 20261102): T[] => {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

const main = () => {
  const rows = load();
  const inv = inventory();
  const extra: string[] = [];
  for (const { b } of inv.existing.values()) for (const x of b.split('|')) extra.push(baseIAST(x));
  extra.push(...loadLexemes());
  const dict = openDictionaries(extra);

  // ── 1. 逐列驗證 ────────────────────────────────────────────
  const problems: string[] = [];
  const seen = new Set<string>();
  let multiLevel = 0;
  for (const row of rows) {
    if (seen.has(row.word)) problems.push(`重複：${row.word}`);
    seen.add(row.word);
    const orth = toOrth(row.word);
    if (!orth) {
      problems.push(`IAST 回不去：${row.word}`);
      continue;
    }
    const formula = joinFormula(row.b, row.j);
    if (!formula || !verifies(formula, orth)) {
      problems.push(`還原失敗：${row.word} b=${row.b} j=${row.j}`);
      continue;
    }
    if (row.parts.length < 2) problems.push(`只有一件：${row.word}`);
    if (row.parts.some((p) => p.length < 2)) problems.push(`有 1 字詞件：${row.word} → ${row.parts.join('+')}`);
    if (dict && row.parts.some((p) => !dict.known(p))) {
      problems.push(`詞件查不到：${row.word} → ${row.parts.filter((p) => !dict.known(p)).join('+')}`);
    }
    if (new Set(row.parts).size === 1) problems.push(`詞件全同：${row.word}`);
    if (row.depth > 1) multiLevel++;
  }

  // ── 2. 覆蓋率（前／後）──────────────────────────────────────
  const table = new Map(rows.map((r) => [r.word, r]));
  const byLen = new Map<number, { before: number; after: number; all: number }>();
  const bookStats = new Map<string, { before: number; after: number; all: number }>();
  let tokens = 0;
  let before = 0;
  let after = 0;
  const hapaxAll: string[] = [];
  const hapaxBefore: string[] = [];
  const hapaxAfter: string[] = [];
  for (const [w, s] of inv.words) {
    const plain = s.plain;
    if (!plain) continue;
    const total = plain + s.formula;
    tokens += total;
    const covered = s.formula + (table.has(w) ? plain : 0);
    before += s.formula;
    after += covered;
    const k = Math.min(25, w.length);
    const b = byLen.get(k) ?? { before: 0, after: 0, all: 0 };
    b.before += s.formula;
    b.after += covered;
    b.all += total;
    byLen.set(k, b);
    for (const book of s.books) {
      const bs = bookStats.get(book) ?? { before: 0, after: 0, all: 0 };
      bs.before += s.formula;
      bs.after += covered;
      bs.all += plain;
      bookStats.set(book, bs);
    }
    if (total === 1) {
      hapaxAll.push(w);
      if (s.formula) hapaxBefore.push(w);
      if (covered) hapaxAfter.push(w);
    } else if (s.formula && s.plain) {
      // 同一詞形有拆有不拆：hapax 不算，但 token 已計入
    }
  }

  const distinctAll = inv.words.size;
  const distinctBefore = [...inv.words.values()].filter((s) => s.formula > 0).length;
  const distinctAfter = distinctBefore + rows.filter((r) => inv.words.get(r.word)?.plain).length;

  console.log('== 詞譜補充表驗收 ==');
  console.log(`列數 ${rows.length}；問題 ${problems.length}`);
  const bySrc = new Map<string, number>();
  const byDepth = new Map<number, number>();
  for (const r of rows) {
    bySrc.set(r.src, (bySrc.get(r.src) ?? 0) + 1);
    byDepth.set(r.depth, (byDepth.get(r.depth) ?? 0) + 1);
  }
  console.log(`  來源：${[...bySrc].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join('、')}`);
  console.log(`  多階：${[...byDepth].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d} 階 ${n}`).join('、')}`);
  if (problems.length) {
    for (const p of problems.slice(0, 20)) console.log(`  ✗ ${p}`);
    if (problems.length > 20) console.log(`  … 其餘 ${problems.length - 20} 條見 --sample 輸出`);
  }

  console.log('\n== 覆蓋率（token）==');
  console.log(`  補表前 ${before.toLocaleString()} / ${tokens.toLocaleString()} = ${pct(before, tokens)}`);
  console.log(`  補表後 ${after.toLocaleString()} / ${tokens.toLocaleString()} = ${pct(after, tokens)}`);
  console.log('\n== 覆蓋率（distinct 詞形）==');
  console.log(`  補表前 ${distinctBefore.toLocaleString()} / ${distinctAll.toLocaleString()} = ${pct(distinctBefore, distinctAll)}`);
  console.log(`  補表後 ${distinctAfter.toLocaleString()} / ${distinctAll.toLocaleString()} = ${pct(distinctAfter, distinctAll)}`);
  console.log('\n== hapax（全庫只出現一次）==');
  console.log(`  ${hapaxAll.length} 個；有詞譜 ${hapaxBefore.length}（${pct(hapaxBefore.length, hapaxAll.length)}）→ 補表後 ${hapaxAfter.length}（${pct(hapaxAfter.length, hapaxAll.length)}）`);

  console.log('\n== 長詞（≥10 字母）==');
  let lb = 0;
  let la = 0;
  let lall = 0;
  for (const [k, v] of byLen) {
    if (k < 10) continue;
    lb += v.before;
    la += v.after;
    lall += v.all;
  }
  console.log(`  補表前 ${lb.toLocaleString()} / ${lall.toLocaleString()} = ${pct(lb, lall)}`);
  console.log(`  補表後 ${la.toLocaleString()} / ${lall.toLocaleString()} = ${pct(la, lall)}`);
  console.log('\n  長度  補表前      補表後      總數');
  for (const [k, v] of [...byLen].sort((a, b) => a[0] - b[0])) {
    if (k < 4) continue;
    console.log(`  ${String(k).padStart(3)}  ${String(v.before).padStart(8)}  ${String(v.after).padStart(8)}  ${String(v.all).padStart(8)}`);
  }

  console.log('\n== 每冊（dn1 先看）==');
  const books = [...bookStats].sort((a, b) => (a[0] === 'dn1' ? -1 : b[0] === 'dn1' ? 1 : b[1].all - a[1].all));
  for (const [book, s] of books.slice(0, 8)) {
    console.log(`  ${book.padEnd(5)} ${String(s.all).padStart(7)} 詞  ${pct(s.before, s.all)} → ${pct(s.after, s.all)}`);
  }

  if (dict) {
    const partTotal = rows.reduce((n, r) => n + r.parts.length, 0);
    const known = rows.reduce((n, r) => n + r.parts.filter((p) => dict.known(p)).length, 0);
    console.log(`\n詞件 ${partTotal.toLocaleString()} 個，字典查得到 ${known.toLocaleString()}（${pct(known, partTotal)}）`);
    dict.close();
  }

  // ── 3. 抽樣 200 筆 ────────────────────────────────────────
  if (process.argv.includes('--sample') || true) {
    mkdirSync(join(ROOT, 'out'), { recursive: true });
    const picked = sample(rows, 200);
    const lines = ['word\tcount\tparts\tsrc\tb\tj'];
    for (const r of picked) {
      lines.push(`${r.word}\t${inv.words.get(r.word)?.plain ?? 0}\t${r.parts.join('+')}\t${r.src}\t${r.b}\t${r.j}`);
    }
    const out = join(ROOT, 'out', 'decomp-sample200.tsv');
    writeFileSync(out, lines.join('\n') + '\n', 'utf8');
    console.log(`\n抽樣 200 筆（固定種子）：${out}`);
  }
  if (problems.length) {
    writeFileSync(join(ROOT, 'out', 'decomp-problems.txt'), problems.join('\n') + '\n', 'utf8');
    console.log(`問題清單：${join(ROOT, 'out', 'decomp-problems.txt')}`);
    process.exitCode = 1;
  }
};

main();
