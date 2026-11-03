#!/usr/bin/env bun
/**
 * 索引政策：B3（詞件→詞幹）＋ stoplist ＋ bigram，一起量。
 *
 *   bun run src/decomp/index-policy.ts
 *
 * 輸出 data/cs-decomp/index-policy.tsv：token、posting、處置（keep/stop/bigram）。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;
const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const corpus = new Map<string, number>();
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) corpus.set(w, (corpus.get(w) ?? 0) + 1);
}

/* 詞形 → 詞件（pwa 樹）與詞件 → 詞幹（pwa 詞件表） */
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
const stemOf = new Map<string, string>();
for (const line of readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8').split('\n').slice(1)) {
  const [a, , s] = line.split('\t');
  if (a && s) stemOf.set(a, s);
}

/* dpd 詞性：判斷虛詞 */
const db = new Database(DICT_DB, { readonly: true });
const grammar = new Map<string, string>();
for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
  if (!grammar.has(r.dict_key)) grammar.set(r.dict_key, (r.dict_content.split('\n')[0] || '').trim());
}
db.close();
// 虛詞判斷：關鍵字出現在 grammar 任何位置都算（dpd 有時寫 "idiom, ind + pr"）。
// 但 "idiom" 不算——dpd 用它標「慣用語」，很多是內容詞（karoti、rāga、labhati 都被標 idiom），
// 把它當虛詞會把內容詞踢出索引。
const PARTICLES = /\b(ind|adv|conj|prep|prefix|sandhi|pron|neg)\b/;
const MANUAL_PARTICLE = new Set(['a', 'na', 'an', 'api', 'ti', 'pe']);
// 前綴永遠不停用：它不獨立成詞，停用等於讓 akusala、dukkha 少了可查的詞件。
// "a" 是唯一例外：dpd 把它記成字母（letter），但它在語料裡只有 1.5% 獨立出現
// （其餘都是 a- 否定前綴，來自 akusala 這類詞），komyoji 的逐詞標記也只有 4.5% 虛詞。
const KEEP_ALWAYS = new Set(['a']);
const isPrefix = (t: string): boolean => KEEP_ALWAYS.has(t) || /\bprefix\b/.test(grammar.get(t) ?? '');
const isParticle = (t: string): boolean =>
  !isPrefix(t) && (MANUAL_PARTICLE.has(t) || PARTICLES.test(grammar.get(t) ?? ''));

/* B3：詞件 → 詞幹 */
const freq = new Map<string, number>();
let postings = 0;
for (const [w, n] of corpus) {
  const ps = parts.get(w);
  const toks = ps ? ps.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w];
  for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + n);
  postings += n * toks.length;
}
const hapax = [...freq.values()].filter((n) => n === 1).length;
const total = [...freq.values()].reduce((a, b) => a + b, 0);
const maxTok = [...freq].sort((a, b) => b[1] - a[1]);
console.log(`B3：${freq.size.toLocaleString()} token、${total.toLocaleString()} post、最長 ${maxTok[0][1].toLocaleString()}（${maxTok[0][0]}）、hapax ${hapax.toLocaleString()}`);

/* stoplist：posting ≥ 10000 且是虛詞 */
const STOP_MIN = 10000;
const stop = new Set<string>();
for (const [t, n] of freq) if (n >= STOP_MIN && isParticle(t)) stop.add(t);
let stopPosts = 0;
for (const t of stop) stopPosts += freq.get(t) ?? 0;
console.log(`stoplist：${stop.size} 個詞元、佔 ${stopPosts.toLocaleString()} post（${((stopPosts / total) * 100).toFixed(1)}%）`);
console.log([...stop].sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0)).join(' '));

const kept = freq.size - stop.size;
const keptPosts = total - stopPosts;
console.log(`套 stoplist 後：${kept.toLocaleString()} token、${keptPosts.toLocaleString()} post`);

/* bigram：結論是不做——stoplist 之後剩下的長 posting 都是內容詞（使用者要查的），
   bigram 化只會讓查詢變成聯集上千個 bigram。這裡只列出「觀察名單」。
const watch = maxTok.filter(([t]) => !stop.has(t)).slice(0, 20).map(([t]) => t);
console.log(`bigram 觀察名單（不做）：${watch.join(' ')}`);
const afterStop = maxTok.filter(([t]) => !stop.has(t)).slice(0, 8);
console.log('停用虛詞後最長的 posting：' + afterStop.map(([t, n]) => `${t}(${n.toLocaleString()})`).join(' '));
console.log(`posting 相對 A（10,254,117）：B3 ×${(total / 10254117).toFixed(2)}、B3+stoplist ×${(keptPosts / 10254117).toFixed(2)}`);

/* 輸出政策表 */
const rows = ['token\tposting\taction'];
for (const [t, n] of maxTok) rows.push(`${t}\t${n}\t${stop.has(t) ? 'stop' : 'keep'}`);
writeFileSync(join(OUT_DIR, 'index-policy.tsv'), rows.join('\n') + '\n', 'utf8');
console.log(`\n${join(OUT_DIR, 'index-policy.tsv')}（${rows.length - 1} 列）`);
