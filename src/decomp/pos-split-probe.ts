#!/usr/bin/env bun
/**
 * 先量：把 token 依「詞形的多數詞性」拆成 `stem#pos`，token 會多多少？
 *
 *   bun run src/decomp/pos-split-probe.ts
 *
 * 不寫任何檔，只印數字與樣本。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { ROOT } from '../profiles';
import { DICT_DB } from './sources';
import { OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;

/* 詞形 → 詞件、詞件 → 詞幹 */
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
const stemOf = new Map<string, string>();
for (const line of readFileSync(join(OUT_DIR, 'pwa-atoms.tsv'), 'utf8').split('\n').slice(1)) {
  const [a, , s] = line.split('\t');
  if (a && s) stemOf.set(a, s);
}

/* 詞形 → 多數詞性（komyoji） */
const posByForm = new Map<string, { pos: string; n: number }>();
const caseByForm = new Map<string, string>();
{
  const acc = new Map<string, Map<string, number>>();
  const raw = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/pos-distribution.tsv.gz')).toString('utf8');
  for (const line of raw.split('\n').slice(1)) {
    const [w, p, c] = line.split('\t');
    if (!w) continue;
    const m = acc.get(w) ?? new Map<string, number>();
    m.set(p, (m.get(p) ?? 0) + (Number(c) || 0));
    acc.set(w, m);
  }
  for (const [w, m] of acc) {
    const top = [...m].sort((a, b) => b[1] - a[1])[0];
    if (top) posByForm.set(w, { pos: top[0], n: top[1] });
  }
}

/* 形 → 唯一格位（只有單一格位的形才可安全使用；一形多格的不指派） */
{
  const raw2 = gunzipSync(readFileSync('D:/2026/komyoji/out/grammar/tokens.tsv.gz')).toString('utf8').split('\n');
  const h2 = raw2[0].split('\t');
  const iC2 = h2.indexOf('case');
  const iF2 = h2.indexOf('form_clean');
  const acc2 = new Map<string, Set<string>>();
  for (let k = 1; k < raw2.length; k++) {
    const f = raw2[k].split('\t');
    if (f.length <= Math.max(iC2, iF2)) continue;
    if (!f[iC2] || f[iC2] === '‐') continue;
    const st = acc2.get(f[iF2]) ?? new Set<string>();
    st.add(f[iC2]);
    acc2.set(f[iF2], st);
  }
  for (const [w, st] of acc2) if (st.size === 1) caseByForm.set(w, [...st][0]);
  console.log(`單一格位的形 ${caseByForm.size.toLocaleString()} / 有格位 ${acc2.size.toLocaleString()}`);
}

/* 詞幹 → dpd 詞性（komyoji 沒有的詞形用它補） */
const dpdPos = new Map<string, string>();
{
  const db = new Database(DICT_DB, { readonly: true });
  const gram = new Map<string, string>();
  for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
    if (!gram.has(r.dict_key)) gram.set(r.dict_key, (r.dict_content.split('\n')[0] || '').trim());
  }
  db.close();
  // 「最早出現的類別」勝：dpd 會寫 "idiom, ind + pr + fem"，取 ind；"masc, comp" 取 masc。
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
  console.log(`dpd 詞性 ${dpdPos.size.toLocaleString()} 個詞頭`);
}

const dir = join(ROOT, 'data', 'cs');
const files = readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== '00.xml');
const plain = new Map<string, number>();
const split = new Map<string, number>();
let covered = 0;
let total = 0;
const sample = new Map<string, Set<string>>();

for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const w of text.match(WORD_G) ?? []) {
    total++;
    const komyojiPos = posByForm.get(w.toLowerCase())?.pos;
    if (komyojiPos && komyojiPos !== 'x') covered++;
    const ps = parts.get(w);
    const toks = (ps ? ps.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w]).flatMap((x) => x.split(/\s+/));
    for (const t of toks) {
      // 每個詞件自己的詞性：komyoji 的詞性掛在整詞上，沒有就用該詞件的 dpd 詞性
      const pos = komyojiPos ?? dpdPos.get(t) ?? 'x';
      plain.set(t, (plain.get(t) ?? 0) + 1);
      const cs = caseByForm.get(w.toLowerCase());
      const key = cs ? `${t}#${pos}#${cs}` : `${t}#${pos}`;
      split.set(key, (split.get(key) ?? 0) + 1);
      const set = sample.get(t) ?? new Set<string>();
      set.add(pos);
      sample.set(t, set);
    }
  }
}

console.log(`語料 ${total.toLocaleString()} 詞次；有 komyoji 詞性的 ${covered.toLocaleString()}（${((covered / total) * 100).toFixed(1)}%）`);
console.log(`不拆：${plain.size.toLocaleString()} token`);
console.log(`依詞性拆：${split.size.toLocaleString()} token（+${(((split.size - plain.size) / plain.size) * 100).toFixed(1)}%）`);
const multi = [...sample].filter(([, s]) => s.size > 1);
console.log(`跨多個詞性的 stem：${multi.length.toLocaleString()} 個（${((multi.length / sample.size) * 100).toFixed(1)}%）`);
const ranked = [...split].sort((a, b) => b[1] - a[1]);
console.log('\n最大的 10 個 token：');
for (const [k, n] of ranked.slice(0, 10)) console.log(`  ${k.padEnd(18)} ${n.toLocaleString()}`);
const xPost = [...split].filter(([k]) => k.endsWith('#x')).reduce((a, [, n]) => a + n, 0);
const xTok = [...split.keys()].filter((k) => k.endsWith('#x')).length;
console.log(`#x 桶：${xTok.toLocaleString()} 個 token、${xPost.toLocaleString()} post（${((xPost / total) * 100).toFixed(1)}%）`);
const tiny = ranked.filter(([, n]) => n <= 5).length;
console.log(`posting ≤5 的 token：${tiny.toLocaleString()}（${((tiny / split.size) * 100).toFixed(1)}%）`);

console.log('\n最多詞性的 stem：');
for (const [t, s] of multi.sort((a, b) => b[1].size - a[1].size).slice(0, 10)) {
  console.log(`  ${t.padEnd(16)} ${[...s].join(',')}  共 ${[...split.keys()].filter((k) => k.startsWith(t + '#')).length} 個 token`);
}
