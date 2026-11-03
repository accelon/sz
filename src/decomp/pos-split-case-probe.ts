#!/usr/bin/env bun
/**
 * 用逐次投影（out/projection.tsv）試做 `詞幹#詞性#格`：token 會長多少？
 *
 *   bun run src/decomp/pos-split-case-probe.ts
 *
 * 規則：
 *   - 投影到的詞（442k）：名詞類（n/adj/ptcp/pron）且有格位 → `詞幹#詞性#格`；其餘 → `詞幹#詞性`
 *   - 沒投影到的詞：`詞幹#詞性`（詞性用 dpd 的，沒有就 x）
 * 只量 token 數與幾個例子，不改索引。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';

const WORD_G = /[\p{L}\p{M}]+/gu;
// 投影檔的 pos 是 komyoji 的日文標籤（代/名/形/過分…），也接受英文枚舉
const NOMINAL = new Set(['n', 'adj', 'ptcp', 'pron', '名', '形', '代', '過分', '現分', '未分', '名形', '名現分', '名過分', '名未分', '数', 'num']);

/* 投影：file → line → k → {pos, gc} */
const proj = new Map<string, Map<number, Map<number, { pos: string; gc: string }>>>();
for (const l of readFileSync(join(ROOT, 'out', 'projection.tsv'), 'utf8').split('\n').slice(1)) {
  const [file, line, k, , pos, gc] = l.split('\t');
  if (!file) continue;
  const perLine = proj.get(file) ?? new Map();
  const at = Number(line);
  const pk = Number(k);
  const m = perLine.get(at) ?? new Map();
  m.set(pk, { pos: pos ?? 'x', gc: gc ?? '' });
  perLine.set(at, m);
  proj.set(file, perLine);
}
let projCount = 0;
for (const m of proj.values()) for (const n of m.values()) projCount += n.size;
console.log(`投影 ${projCount.toLocaleString()} 筆`);

/* 詞件 → 詞幹、詞幹 → dpd 詞性 */
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
    let bp = '';
    for (const [re, pos] of RULES) {
      const m = re.exec(g);
      if (m && m.index < best) { best = m.index; bp = pos; }
    }
    if (bp) dpdPos.set(k, bp);
  }
}

const tok = new Set<string>();
const teCases = new Map<string, number>();
let words = 0;
let withCase = 0;
const dir = join(ROOT, 'data', 'cs');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.xml') && x !== '00.xml')) {
  const lines = readFileSync(join(dir, f), 'utf8').split('\n');
  const perLine = proj.get(f.replace(/\.xml$/, ''));
  lines.forEach((line, li) => {
    const ws = (line.replace(/<[^>]*>/g, ' ').match(WORD_G) ?? []).map((x) => x.toLowerCase());
    ws.forEach((w, k) => {
      words++;
      const stems = (parts.get(w) ? parts.get(w)!.map((p) => stemOf.get(p) ?? p) : [stemOf.get(w) ?? w])
        .flatMap((x) => x.split(/\s+/))
        .filter(Boolean);
      const p = perLine?.get(li + 1)?.get(k);
      if (p && p.gc && NOMINAL.has(p.pos)) withCase++;
      for (const s of stems) {
        const pos = p?.pos && p.pos !== '‐' ? p.pos : (dpdPos.get(s) ?? 'x');
        const key = p && p.gc && NOMINAL.has(p.pos) ? `${s}#${pos}#${p.gc}` : `${s}#${pos}`;
        tok.add(key);
        if (w === 'te' && p?.gc) teCases.set(p.gc, (teCases.get(p.gc) ?? 0) + 1);
      }
    });
  });
}
console.log(`語料 ${words.toLocaleString()} 詞次；可帶格位的 ${withCase.toLocaleString()}（${((withCase / words) * 100).toFixed(1)}%）`);
console.log(`token：${tok.size.toLocaleString()}（拆格位前 159,744）`);
console.log('te 的格位分佈（投影到的部分）：' + [...teCases].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => `${c}:${n}`).join('  '));
