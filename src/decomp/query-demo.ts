#!/usr/bin/env bun
/**
 * 照 §13.4 實作查詢端：詞幹化 → 查 token → 查不到就退回詞件。
 *
 *   bun run src/decomp/query-demo.ts
 *
 * 讀 out/index/tokens.tsv（token → posting 數）、pwa-tree-all.tsv（詞形→詞件）、
 * pwa-atoms.tsv（詞件→詞幹）、index-policy.tsv（stoplist）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { OUT_DIR } from './sources';

const tokens = new Map<string, number>();
/* 詞幹 → 它的詞性變體（token 現在是 `詞幹#詞性`） */
const variants = new Map<string, string[]>();
for (const line of readFileSync(join(ROOT, 'out', 'index', 'tokens.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, n] = line.split('\t');
  if (!t) continue;
  tokens.set(t, Number(n) || 0);
  const stem = t.split('#')[0];
  const arr = variants.get(stem) ?? [];
  arr.push(t);
  variants.set(stem, arr);
}
/** 一個詞幹的總命中數（所有詞性變體相加） */
const stemHits = (stem: string): number =>
  (variants.get(stem) ?? []).reduce((n, t) => n + (tokens.get(t) ?? 0), 0);
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

/** 詞形 → 詞件（查詢字可能不在整份樹裡，用線性掃描一次就好） */
const partsOf = new Map<string, string[]>();
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
    if (leaves.length >= 2) partsOf.set(w, leaves);
  }
}
const JUNK = /^\?\?|V/;

/** 詞形 → token（13.3 第 1–2 步） */
const tokenize = (word: string): string[] => {
  const ps = partsOf.get(word);
  if (ps) return ps.map((p) => stemOf.get(p) ?? p);
  return [stemOf.get(word) ?? word];
};

/**
 * 查詢語法：`dhamma` 查詞幹全部變體；`dhamma@主` 只查帶格位的（--case 索引才有）。
 */
const run = (input: string): { route: string; hits: number; used: string } => {
  const at = input.indexOf('@');
  if (at > 0) {
    const stem = input.slice(0, at).trim().toLowerCase();
    const gc = input.slice(at + 1).trim();
    const hit = (variants.get(stem) ?? []).filter((t) => t.endsWith('#' + gc));
    const total = hit.reduce((n, t) => n + (tokens.get(t) ?? 0), 0);
    return { route: '格位', hits: total, used: hit.map((t) => `${t}:${tokens.get(t)}`).join('+') || '（沒有這個格位）' };
  }
  // 查詢端也小寫化（索引 token 一律小寫，見 §13.6d）
  const w = input.trim().toLowerCase();
  const toks = tokenize(w).filter((t) => !stop.has(t) && !JUNK.test(t));
  const found = toks.filter((t) => stemHits(t) > 0);
  if (found.length === toks.length && found.length) {
    const total = found.reduce((n, t) => n + stemHits(t), 0);
    return { route: toks.length > 1 ? '詞件' : '詞幹', hits: total, used: found.map((t) => `${t}:${stemHits(t)}`).join('+') };
  }
  // 退路：整詞查不到 → 只用查得到的詞件（交集由索引端做）
  if (found.length) {
    const total = found.reduce((n, t) => n + stemHits(t), 0);
    return { route: '退回詞件', hits: total, used: found.map((t) => `${t}:${stemHits(t)}`).join('+') };
  }
  return { route: '無結果', hits: 0, used: toks.join('+') };
};

console.log('查詢端驗收（照 §13.4）：\n');
for (const c of ['dhamma', 'dhamma@主', 'dhamma@属', 'bhagavant', 'bhagavant@属', 'ca', 'tathāgatassa', 'rājā', 'gacchati', 'eva']) {
  const r = run(c);
  console.log(`  ${c.padEnd(15)} ${r.route.padEnd(5)} ${String(r.hits).padStart(8)}  ${r.used}`);
}
