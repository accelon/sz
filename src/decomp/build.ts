#!/usr/bin/env bun
/**
 * 產生「詞譜補充表」：把 data/cs 裡**沒有詞譜**的詞，補上可還原的 b／j，
 * 並且**遞迴**拆下去（多階：`盟 = 明 + 皿`，`明 = 日 + 月`）。
 *
 *   bun run src/decomp/build.ts
 *
 * 輸出（只新增，不改 data/cs）：
 *   data/cs-decomp/splits.tsv   正文詞形 → b／j＋多階樹（全部經過 orthOf 還原驗證）
 *   data/cs-decomp/parts.tsv    只出現在「詞件」裡、正文沒單獨出現的詞的拆法（多階用）
 *   data/cs-decomp/failures.tsv 拆不出來的詞（詞形、次數、卡在哪）
 *
 * 優先序（前面的贏）：reuse（同詞在別處已有詞譜）→ reuse-prefix（已知詞件＋字尾）→
 * decomp-manual → manual2 → aux → kmj → pwa（AI 詞形分析）→ dpd（複合詞構詞）。
 *
 * 每個候選都試「原樣」與「依詞件長度切表面」（連音會改接縫的字，pwa 給的是還原後的
 * 形式，所以要回到原文重新切），交給 sandhi.ts 驗證；詞件還要「查得到」（pwa 詞形／
 * dpd 詞頭／CST 既有詞件／lexeme 表），做不到就不寫。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseIAST, formulaOf, splitFormula, toOrth, verifies } from './sandhi';
import {
  decompTables,
  inventory,
  loadLexemes,
  openDictionaries,
  OUT_DIR,
  type Dictionaries,
} from './sources';

/** 拆法來源（給人看／給 check 分類）。 */
export type Source =
  | 'reuse'
  | 'reuse-prefix'
  | 'manual'
  | 'manual2'
  | 'aux'
  | 'kmj'
  | 'pwa'
  | 'dpd';

export interface Split {
  word: string;
  b: string;
  j: string;
  parts: string[];
  src: Source;
}

/**
 * 詞件品質：每個詞件至少 2 個字母，而且都是「查得到的詞」。
 * 單字詞件（`a`、`n`）不收——那不是可以查的詞幹。
 */
const quality = (parts: string[], known: (w: string) => boolean): boolean =>
  parts.length >= 2 &&
  parts.length <= 10 &&
  parts.every((p) => p.length >= 2 && known(p)) &&
  new Set(parts).size > 1;

/** 切點：前 k−1 個詞件的長度決定切點，最後一件吃到字尾；切點可 ±jitter。 */
const cutVariants = (word: string, parts: string[], jitter: number, limit = 12): string[][] => {
  const base: number[] = [];
  let acc = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    acc += parts[i].length;
    base.push(acc);
  }
  const ranges = base.map((c) => {
    const r: number[] = [];
    for (let d = -jitter; d <= jitter; d++) r.push(c + d);
    return r;
  });
  const out: string[][] = [];
  const walk = (i: number, cuts: number[]): void => {
    if (out.length >= limit) return;
    if (i === ranges.length) {
      const sorted = [...new Set(cuts)].sort((a, b) => a - b);
      if (sorted.some((c) => c <= 0 || c >= word.length)) return;
      const pieces: string[] = [];
      let prev = 0;
      for (const c of sorted) {
        pieces.push(word.slice(prev, c));
        prev = c;
      }
      pieces.push(word.slice(prev));
      if (pieces.length === parts.length) out.push(pieces);
      return;
    }
    for (const c of ranges[i]) walk(i + 1, [...cuts, c]);
  };
  walk(0, []);
  return out;
};

/** 候選詞件 → 可還原、且每個詞件都查得到的詞譜。 */
const resolveParts = (
  word: string,
  orth: string,
  parts: string[],
  known: (w: string) => boolean,
): string | null => {
  if (parts.length < 2 || parts.length > 10) return null;
  if (quality(parts, known)) {
    const direct = formulaOf(orth, parts);
    if (direct) return direct;
  }
  for (const jitter of parts.length <= 3 ? [0, 1] : [0]) {
    for (const cut of cutVariants(word, parts, jitter)) {
      if (!quality(cut, known)) continue;
      const found = formulaOf(orth, cut);
      if (found) return found;
    }
  }
  return null;
};

/**
 * 既有詞譜的「詞件邊界」索引：只登記**詞件結尾**對應的前綴，值＝到那個邊界為止的
 * 詞件。用來把新詞接在已知切法後面（tathāgata → tathāgatassa）。
 */
const prefixIndex = (existing: Map<string, { b: string; j: string }>): Map<string, string[]> => {
  const index = new Map<string, string[]>();
  for (const [word, { b }] of existing) {
    const bases = b.split('|');
    if (bases.length < 2) continue;
    const parts = bases.map((x) => baseIAST(x));
    if (parts.some((p) => !p)) continue;
    let cut = 0;
    for (let i = 0; i < parts.length - 1; i++) {
      cut += parts[i].length;
      if (cut <= 1 || cut >= word.length) break;
      const key = word.slice(0, cut);
      if (key !== parts.slice(0, i + 1).join('')) continue; // 連音改過字，對不上就不登記
      if (!index.has(key)) index.set(key, parts.slice(0, i + 1));
    }
  }
  return index;
};

export interface Resolved {
  formula: string;
  src: Source;
}

export interface BuildResult {
  splits: Split[];
  parts: Split[];
  trees: Map<string, { tree: string; depth: number; leaves: number }>;
  failures: { word: string; count: number; reason: string }[];
  stats: Map<Source, { words: number; tokens: number }>;
}

export const build = (log = console.log): BuildResult => {
  const started = Date.now();
  const inv = inventory();
  const extra: string[] = [];
  for (const { b } of inv.existing.values()) {
    for (const base of b.split('|')) {
      const iast = baseIAST(base);
      if (iast) extra.push(iast);
    }
  }
  extra.push(...loadLexemes());
  const dict: Dictionaries | null = openDictionaries(extra);
  const known = (w: string): boolean => !!dict && dict.known(w);
  const tables = decompTables();
  const prefixes = prefixIndex(inv.existing);
  log(`詞清單：${inv.words.size} 個詞形（既有詞譜 ${inv.existing.size} 個）`);
  log(`拆分表：${tables.map(([n, m]) => `${n} ${m.size}`).join('、')}`);
  log(`字典：${dict ? `pwa＋dpd（詞表 ${dict.lexiconSize}）` : '（沒有 dictionaries.db，只用本地表）'}`);

  const cache = new Map<string, Resolved | null>();

  /** 一個詞形（IAST）→ 可還原詞譜＋來源；拆不出來回 null。 */
  const resolveWord = (word: string): Resolved | null => {
    if (cache.has(word)) return cache.get(word)!;
    const orth = toOrth(word);
    if (!orth) {
      cache.set(word, null);
      return null;
    }
    let formula: string | null = null;
    let src: Source | null = null;

    // ① 同一個詞在別處已經有詞譜
    const reuse = inv.existing.get(word);
    if (reuse) {
      const parts = reuse.b.split('|').map((x) => baseIAST(x));
      formula = resolveParts(word, orth, parts, known);
      if (formula) src = 'reuse';
    }

    // ② 已知切法的前綴 ＋ 剩下的字尾（例：tathāgata 已拆 → tathāgatassa）
    if (!formula) {
      for (let i = word.length - 1; i >= 2 && !formula; i--) {
        const knownParts = prefixes.get(word.slice(0, i));
        if (!knownParts) continue;
        const parts = [...knownParts.slice(0, -1), knownParts[knownParts.length - 1] + word.slice(i)];
        formula = resolveParts(word, orth, parts, known);
        if (formula) src = 'reuse-prefix';
      }
    }

    // ③ 手改／既有拆分表
    for (const [name, table] of tables) {
      if (formula) break;
      const parts = table.get(word);
      if (!parts) continue;
      formula = resolveParts(word, orth, parts, known);
      if (formula) src = name as Source;
    }

    // ④ pwa（AI 詞形分析）：多詞件直接試；單詞件就看 dpd 的複合詞分析
    if (!formula && dict) {
      const pwa = dict.pwa(word);
      if (pwa && pwa.hyphen.length >= 2) {
        formula = resolveParts(word, orth, pwa.hyphen, known);
        if (formula) src = 'pwa';
      } else if (pwa && pwa.stems.length >= 2) {
        formula = resolveParts(word, orth, pwa.stems, known);
        if (formula) src = 'pwa';
      }
      if (!formula && pwa) {
        const lemma = pwa.stems[0];
        const parts = lemma ? dict.dpd(lemma) : null;
        // dpd 是構詞分析（根＋詞尾），詞件太短的（`mā|na|so`）不要
        if (parts && parts.every((p) => p.length >= 3)) {
          formula = resolveParts(word, orth, parts, known);
          if (formula) src = 'dpd';
        }
      }
    }

    const resolved = formula && verifies(formula, orth) ? { formula, src: src ?? 'manual' } : null;
    cache.set(word, resolved);
    return resolved;
  };

  const stats = new Map<Source, { words: number; tokens: number }>();
  const splits: Split[] = [];
  const failures: { word: string; count: number; reason: string }[] = [];

  const toSplit = (word: string, formula: string, src: Source): Split => {
    const { b, j } = splitFormula(formula);
    return { word, b, j, parts: b.split('|').map((x) => baseIAST(x)), src };
  };

  const todo = [...inv.words.entries()]
    .filter(([w, s]) => s.plain > 0 && !inv.conflicting.has(w))
    .sort((a, b) => b[1].plain - a[1].plain);

  let done = 0;
  for (const [word, stat] of todo) {
    done++;
    if (done % 5000 === 0) log(`  … ${done}/${todo.length}（已拆 ${splits.length}，${((Date.now() - started) / 1000).toFixed(0)}s）`);
    const hit = resolveWord(word);
    if (hit) {
      splits.push(toSplit(word, hit.formula, hit.src));
      const s = stats.get(hit.src) ?? { words: 0, tokens: 0 };
      s.words++;
      s.tokens += stat.plain;
      stats.set(hit.src, s);
    } else {
      const reason = !dict ? 'no-dict' : dict.pwa(word) ? 'no-source' : 'not-in-pwa';
      failures.push({ word, count: stat.plain, reason });
    }
  }

  // ── 多階：詞件本身再拆（正文沒出現過的詞件也拆，放到 parts） ──────────
  const splitOf = new Map<string, Split>();
  for (const s of splits) splitOf.set(s.word, s);
  const partSplits = new Map<string, Split>();
  let frontier = new Set<string>();
  for (const s of splits) for (const p of s.parts) if (!splitOf.has(p)) frontier.add(p);
  for (let depth = 0; depth < 4 && frontier.size; depth++) {
    const next = new Set<string>();
    for (const word of frontier) {
      if (splitOf.has(word) || partSplits.has(word)) continue;
      const hit = resolveWord(word);
      if (!hit) continue;
      const s = toSplit(word, hit.formula, hit.src);
      partSplits.set(word, s);
      for (const p of s.parts) if (!splitOf.has(p) && !partSplits.has(p)) next.add(p);
    }
    log(`  多階第 ${depth + 1} 層：新增 ${partSplits.size} 個詞件拆法`);
    frontier = next;
  }

  // ── 樹：詞 → 巢狀字串（`a[b|c]|d`） ────────────────────────────
  const trees = new Map<string, { tree: string; depth: number; leaves: number }>();
  const treeOf = (word: string, level: number, stack: Set<string>): { text: string; depth: number; leaves: number } => {
    const s = splitOf.get(word) ?? partSplits.get(word);
    if (!s || level <= 0 || stack.has(word)) return { text: word, depth: 0, leaves: 1 };
    stack.add(word);
    let depth = 1;
    let leaves = 0;
    const pieces = s.parts.map((p) => {
      const sub = treeOf(p, level - 1, stack);
      depth = Math.max(depth, sub.depth + 1);
      leaves += sub.leaves;
      return sub.depth > 0 ? `${p}[${sub.text}]` : p;
    });
    stack.delete(word);
    return { text: pieces.join('|'), depth, leaves };
  };
  for (const s of splits) {
    const t = treeOf(s.word, 4, new Set());
    trees.set(s.word, { tree: t.text, depth: t.depth, leaves: t.leaves });
  }

  dict?.close();
  return { splits, parts: [...partSplits.values()], trees, failures, stats };
};

if (import.meta.main) {
  const started = Date.now();
  const { splits, parts, trees, failures, stats } = build();
  mkdirSync(OUT_DIR, { recursive: true });

  const splitLines = ['word\tb\tj\tparts\tsrc\tdepth\ttree'];
  for (const s of splits) {
    const t = trees.get(s.word);
    splitLines.push(`${s.word}\t${s.b}\t${s.j}\t${s.parts.join('+')}\t${s.src}\t${t?.depth ?? 1}\t${t?.tree ?? s.word}`);
  }
  writeFileSync(join(OUT_DIR, 'splits.tsv'), splitLines.join('\n') + '\n', 'utf8');

  const partLines = ['word\tb\tj\tparts\tsrc'];
  for (const s of parts) partLines.push(`${s.word}\t${s.b}\t${s.j}\t${s.parts.join('+')}\t${s.src}`);
  writeFileSync(join(OUT_DIR, 'parts.tsv'), partLines.join('\n') + '\n', 'utf8');

  const failLines = ['word\tcount\tlen\treason'];
  for (const f of failures.sort((a, b) => b.count - a.count)) {
    failLines.push(`${f.word}\t${f.count}\t${f.word.length}\t${f.reason}`);
  }
  writeFileSync(join(OUT_DIR, 'failures.tsv'), failLines.join('\n') + '\n', 'utf8');

  const tokens = [...stats].reduce((n, [, s]) => n + s.tokens, 0);
  console.log(`\n拆出 ${splits.length} 個正文詞形（${tokens} 次）；詞件補充 ${parts.length} 個`);
  for (const [src, s] of [...stats].sort((a, b) => b[1].tokens - a[1].tokens)) {
    console.log(`  ${src.padEnd(13)} ${String(s.words).padStart(6)} 詞形 ${String(s.tokens).padStart(7)} 次`);
  }
  const byDepth = new Map<number, number>();
  for (const t of trees.values()) byDepth.set(t.depth, (byDepth.get(t.depth) ?? 0) + 1);
  console.log(`  多階深度：${[...byDepth].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}階 ${n}`).join('、')}`);
  console.log(`拆不出來 ${failures.length} 個詞形 → ${join(OUT_DIR, 'failures.tsv')}`);
  console.log(`\n${join(OUT_DIR, 'splits.tsv')}`);
  console.log(`（${((Date.now() - started) / 1000).toFixed(0)} 秒）`);
}
