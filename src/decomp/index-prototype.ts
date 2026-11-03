#!/usr/bin/env bun
/**
 * 索引原型：同一本書，建兩種索引，比 token list、posting 與查詢結果。
 *
 *   bun run src/decomp/index-prototype.ts
 *
 * A：表面詞（現在的做法）——一詞一 token，posting 是「出現在哪幾行」。
 * B：詞件（拆詞）——拆開的詞記到各詞件，拆不開的記原詞；虛詞進 stoplist 不建索引。
 *
 * 只讀 data/cs 與 out/pwa-tree-all.tsv；不寫任何版控檔案。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Database } from 'bun:sqlite';
import { ROOT } from '../profiles';
import { DICT_DB } from './sources';

const BOOKS = ['dn1', 'dn2', 'dn3', 'mn1', 'sn1'];
const WORD_G = /[\p{L}\p{M}]+/gu;

/* ── 語料（整批，用來定 stoplist）───────────────────────── */
const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const corpus = new Map<string, number>();
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) corpus.set(w, (corpus.get(w) ?? 0) + 1);
}

/* ── 詞性（dpd grammar）：用來判斷虛詞 ──────────────────── */
const db = new Database(DICT_DB, { readonly: true });
const grammar = new Map<string, string>();
for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
  if (!grammar.has(r.dict_key)) grammar.set(r.dict_key, (r.dict_content.split('\n')[0] || '').trim());
}
const stem = new Map<string, string>();
for (const r of db.query('select dict_key, dict_content from pwa').all() as { dict_key: string; dict_content: string }[]) {
  const m = /\(([^()]*)\)\s*$/.exec(r.dict_content);
  const s = m ? m[1].split(',')[0].trim() : '';
  if (s) stem.set(r.dict_key, s);
}
db.close();

const PARTICLES = /^(ind|adv|conj|prep|prefix|sandhi|pron)\b/;
const isParticle = (w: string): boolean => {
  const g = grammar.get(stem.get(w) ?? w) ?? grammar.get(w) ?? '';
  return PARTICLES.test(g);
};

/* ── stoplist：高頻＋虛詞 ──────────────────────────────── */
const MIN_FREQ = 10000;
const stop = new Set<string>();
for (const [w, n] of corpus) {
  if (n >= MIN_FREQ && isParticle(w)) stop.add(w);
}
console.log(`stoplist：${stop.size} 個（頻率 ≥${MIN_FREQ} 且是虛詞）`);
console.log([...stop].sort((a, b) => (corpus.get(b) ?? 0) - (corpus.get(a) ?? 0)).join(' '));

/* ── 詞形 → 詞件 ───────────────────────────────────────── */
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
    if (!corpus.has(w)) continue;
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

/* ── 建兩種索引（posting = 出現的行號）──────────────────── */
const xml: string[] = [];
let base = 0;
for (const book of BOOKS) {
  const lines = readFileSync(join(dir, `${book}.xml`), 'utf8').split('\n');
  xml.push(...lines);
  void base;
}
const idxA = new Map<string, Set<number>>();
const idxB = new Map<string, Set<number>>();
const idxH = new Map<string, Set<number>>();  // 混合：表面詞 + 詞件都建
const add = (m: Map<string, Set<number>>, k: string, line: number): void => {
  let s = m.get(k);
  if (!s) { s = new Set(); m.set(k, s); }
  s.add(line);
};
xml.forEach((line, li) => {
  const text = line.replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) {
    add(idxA, w, li);
    add(idxH, w, li);
    const ps = parts.get(w);
    if (ps) {
      for (const p of ps) { if (!stop.has(p)) { add(idxB, p, li); add(idxH, p, li); } }
    } else if (!stop.has(w)) {
      add(idxB, w, li);
    }
  }
});

const stats = (m: Map<string, Set<number>>): { tokens: number; posts: number; hapax: number; bytes: number } => {
  let posts = 0;
  let hapax = 0;
  for (const s of m.values()) { posts += s.size; if (s.size === 1) hapax++; }
  const json = JSON.stringify([...m].map(([k, v]) => [k, [...v]]));
  return { tokens: m.size, posts, hapax, bytes: gzipSync(Buffer.from(json, 'utf8'), { level: 9 }).length };
};
const a = stats(idxA);
const b = stats(idxB);
const h = stats(idxH);
console.log(`\n${BOOKS.join('+')}：${xml.length} 行`);
console.log(`A 表面詞：${a.tokens} token、${a.posts} post、hapax ${a.hapax}、gzip ${(a.bytes / 1024).toFixed(0)} KB`);
console.log(`B 詞件  ：${b.tokens} token、${b.posts} post、hapax ${b.hapax}、gzip ${(b.bytes / 1024).toFixed(0)} KB`);
console.log(`C 混合  ：${h.tokens} token、${h.posts} post、hapax ${h.hapax}、gzip ${(h.bytes / 1024).toFixed(0)} KB`);
console.log(`B vs A：token ${((1 - b.tokens / a.tokens) * 100).toFixed(0)}%↓、post ${((b.posts / a.posts - 1) * 100).toFixed(0)}%↑、索引 ${((b.bytes / a.bytes - 1) * 100).toFixed(0)}%`);
console.log(`C vs A：token ${((h.tokens / a.tokens - 1) * 100).toFixed(0)}%、post ${((h.posts / a.posts - 1) * 100).toFixed(0)}%↑、索引 ${((h.bytes / a.bytes - 1) * 100).toFixed(0)}%`);

console.log('\n查詢（命中的行數）：');
for (const q of ['gata', 'dhamma', 'buddha', 'saṅgha', 'tathāgata', 'ca']) {
  const A = idxA.get(q)?.size ?? 0;
  const B = idxB.get(q)?.size ?? 0;
  console.log(`  ${q.padEnd(10)} A ${String(A).padStart(4)} 行   B ${String(B).padStart(4)} 行`);
}
