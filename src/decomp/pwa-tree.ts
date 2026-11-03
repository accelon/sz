#!/usr/bin/env bun
/**
 * 以 **pwa**（OpenTipitaka 的 Pali words analyzer，956,936 個詞形）為基礎做多階拆詞，
 * 並把「原子」的統計整理出來，用來設計拆解表（factorization）。
 *
 *   bun run src/decomp/pwa-tree.ts
 *
 * 不看經文、不靠機率，只用 pwa 自己的分析。遞迴規則：
 *   一個詞形 W 的「下一階」＝ pwa 的 hyphen 詞件（≥2 件時）或括號詞幹（≥2 個時）；
 *   每個詞件再查 pwa，查到就再拆，查不到或只剩一件就是**原子**。
 *
 * 輸出：
 *   data/cs-decomp/pwa-tree.tsv      深度 ≥2 的詞（多階樹；7.5 MB）
 *   data/cs-decomp/pwa-atoms.tsv     全部原子＋出現次數＋詞幹（6.3 MB）
 *   data/cs-decomp/pwa-alphabet.tsv  前 4096 個原子（建議的「一字元」字母表）
 *   out/pwa-tree-all.tsv             全部詞形（38 MB，不進版控）
 *
 * 記憶體：**不快取**（pwa 有一百萬筆，快取會爆）；每一筆都直接查 SQLite。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { OUT_DIR, DICT_DB } from './sources';
import { ROOT } from '../profiles';

const MAX_DEPTH = 6;
/** 「一字元」字母表最多收幾個原子 */
const ALPHABET = 4096;

const db = new Database(DICT_DB, { readonly: true });
const qPwa = db.query('select dict_content from pwa where dict_key = ? limit 1');

/** 一個詞形在 pwa 的下一階；沒有就回 null。 */
const childrenOf = (word: string): string[] | null => {
  const row = qPwa.get(word) as { dict_content: string } | null;
  if (!row) return null;
  const content = row.dict_content;
  const parts = content.split('(')[0].trim().split('-').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts;
  const m = /\(([^()]*)\)\s*$/.exec(content);
  const stems = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (stems.length >= 2) return stems;
  return null;
};

/** 遞迴展開：回傳樹字串、深度、原子序列。`stack` 防環。 */
const expand = (
  word: string,
  level: number,
  stack: Set<string>,
  atoms: string[],
): { text: string; depth: number } => {
  const children = level >= MAX_DEPTH || stack.has(word) ? null : childrenOf(word);
  if (!children) {
    atoms.push(word);
    return { text: word, depth: 0 };
  }
  stack.add(word);
  let depth = 1;
  const pieces: string[] = [];
  for (const child of children) {
    const sub = expand(child, level + 1, stack, atoms);
    depth = Math.max(depth, sub.depth + 1);
    pieces.push(sub.depth > 0 ? `${child}[${sub.text}]` : child);
  }
  stack.delete(word);
  return { text: pieces.join('|'), depth };
};

const main = async (): Promise<void> => {
  const started = Date.now();
  const keys = (db.query('select dict_key from pwa').all() as { dict_key: string }[])
    .map((r) => r.dict_key)
    .filter((w) => w.length >= 2 && /^[a-zA-Zāīūṅñṭḍṇḷṃ]+$/.test(w)); // 2 字母也要：ca、me、te… 是最常見的虛詞
  console.log(`pwa 詞形（≥2 字母）：${keys.length}`);

  const atomCount = new Map<string, number>();
  const byDepth = new Map<number, number>();
  const deep: string[] = [];
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  let unknownParts = 0;
  let partTotal = 0;
  let sumLeaves = 0;

  mkdirSync(join(ROOT, 'out'), { recursive: true });
  const fullSink = Bun.file(join(ROOT, 'out', 'pwa-tree-all.tsv')).writer();
  fullSink.write('word\tdepth\tleaves\ttree\n');

  for (const word of keys) {
    const atoms: string[] = [];
    const node = expand(word, 0, new Set(), atoms);
    byDepth.set(node.depth, (byDepth.get(node.depth) ?? 0) + 1);
    for (const a of atoms) atomCount.set(a, (atomCount.get(a) ?? 0) + 1);
    sumLeaves += atoms.length;
    if (atoms.length) {
      first.set(atoms[0], (first.get(atoms[0]) ?? 0) + 1);
      last.set(atoms[atoms.length - 1], (last.get(atoms[atoms.length - 1]) ?? 0) + 1);
    }
    const kids = node.depth > 0 ? childrenOf(word) ?? [] : [];
    partTotal += kids.length;
    unknownParts += kids.filter((k) => !qPwa.get(k)).length;
    fullSink.write(`${word}\t${node.depth}\t${atoms.length}\t${node.text}\n`);
    if (node.depth >= 2) deep.push(`${word}\t${node.depth}\t${atoms.length}\t${node.text}`);
  }
  await fullSink.end();

  const atoms = [...atomCount.entries()].sort((a, b) => b[1] - a[1]);
  const stemOf = (a: string): string => {
    const row = qPwa.get(a) as { dict_content: string } | null;
    if (!row) return a;
    const m = /\(([^()]*)\)\s*$/.exec(row.dict_content);
    const stems = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
    return stems.length === 1 ? stems[0] : a;
  };

  const stemCount = new Map<string, number>();
  for (const [a, n] of atoms) {
    const s = stemOf(a);
    stemCount.set(s, (stemCount.get(s) ?? 0) + n);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(join(ROOT, 'out'), { recursive: true });

  const atomLines = ['atom\tcount\tstem'];
  for (const [a, n] of atoms) atomLines.push(`${a}\t${n}\t${stemOf(a)}`);
  writeFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), atomLines.join('\n') + '\n', 'utf8');

  const alphabetLines = ['rank\tatom\tcount\tstem'];
  atoms.slice(0, ALPHABET).forEach(([a, n], i) => alphabetLines.push(`${i + 1}\t${a}\t${n}\t${stemOf(a)}`));
  writeFileSync(join(OUT_DIR, 'pwa-alphabet.tsv'), alphabetLines.join('\n') + '\n', 'utf8');

  writeFileSync(join(OUT_DIR, 'pwa-tree.tsv'), ['word\tdepth\tleaves\ttree', ...deep].join('\n') + '\n', 'utf8');

  // ── 報告 ───────────────────────────────────────────────────
  const total = keys.length;
  console.log(
    `\n深度分佈：${[...byDepth]
      .sort((a, b) => a[0] - b[0])
      .map(([d, n]) => `${d} 階 ${n}（${((n / total) * 100).toFixed(1)}%）`)
      .join('、')}`,
  );
  console.log(`平均每個詞 ${(sumLeaves / total).toFixed(2)} 個原子`);
  console.log(`原子 ${atomCount.size} 個；收成詞幹後 ${stemCount.size} 個`);
  console.log(
    `詞件不是 pwa 詞形：${unknownParts}/${partTotal}（${((unknownParts / partTotal) * 100).toFixed(1)}%）`,
  );

  const atomTokens = atoms.reduce((n, [, c]) => n + c, 0);
  let acc = 0;
  const marks = [10, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];
  let mi = 0;
  console.log('\n「N 個原子當字母表」→ 覆蓋多少原子出現次數：');
  for (let i = 0; i < atoms.length && mi < marks.length; i++) {
    acc += atoms[i][1];
    while (mi < marks.length && i + 1 === marks[mi]) {
      console.log(`  前 ${String(marks[mi]).padStart(5)} 個 → ${((acc / atomTokens) * 100).toFixed(1)}%`);
      mi++;
    }
  }

  const show = (label: string, m: Map<string, number>, n = 15) =>
    console.log(`${label}：${[...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w, c]) => `${w}(${c})`).join(' ')}`);
  console.log('');
  show('最常見的開頭詞件', first);
  show('最常見的結尾詞件', last);
  console.log(`最常見的原子：${atoms.slice(0, 12).map(([a, n]) => `${a}(${n})`).join(' ')}`);

  writeFileSync(
    join(OUT_DIR, 'pwa-summary.txt'),
    [
      `pwa 詞形（≥3 字母）: ${total}`,
      `深度分佈: ${[...byDepth].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}:${n}`).join(' ')}`,
      `平均原子數: ${(sumLeaves / total).toFixed(2)}`,
      `原子: ${atomCount.size}（詞幹 ${stemCount.size}）`,
      `詞件不是 pwa 詞形: ${unknownParts}/${partTotal}`,
      `字母表（前 ${ALPHABET}）覆蓋: ${((atoms.slice(0, ALPHABET).reduce((n, [, c]) => n + c, 0) / atomTokens) * 100).toFixed(1)}%`,
    ].join('\n') + '\n',
    'utf8',
  );

  console.log(`\n${join(OUT_DIR, 'pwa-tree.tsv')}（深度 ≥2，${deep.length} 列）`);
  console.log(`${join(OUT_DIR, 'pwa-atoms.tsv')}（${atoms.length} 個原子）`);
  console.log(`${join(OUT_DIR, 'pwa-alphabet.tsv')}（前 ${ALPHABET}）`);
  console.log(`（${((Date.now() - started) / 1000).toFixed(0)} 秒）`);
  db.close();
};

await main();


