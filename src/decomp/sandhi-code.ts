#!/usr/bin/env bun
/**
 * 接縫碼原型（2026-11-03）：pwa 詞件 + 語意規則數字。
 *
 *   bun run src/decomp/sandhi-code.ts            # dn1
 *   bun run src/decomp/sandhi-code.ts mn1        # 別本書
 *
 * 编码：`sappi0phāṇitaṃ8eva`；0＝不變，其餘數字見 RULES。
 * 解碼：`sappiphāṇitameva`。
 * tokenizer：只有「前後都是拉丁字母、且 token 不含 #」的數字串才是接縫碼。
 *
 * 只讀 pwa 與 data/cs；不寫檔。
 */
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';

const DICT = 'C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db';
const BOOK = process.argv[2] ?? 'dn1';
const XML = `D:/2026/sz/data/cs/${BOOK}.xml`;

const VOW = new Set([...'aāiīuūeo']);
const NASAL: Record<string, string> = {
  k: 'ṅ', kh: 'ṅ', g: 'ṅ', gh: 'ṅ', ṅ: 'ṅ',
  c: 'ñ', ch: 'ñ', j: 'ñ', jh: 'ñ', ñ: 'ñ',
  ṭ: 'ṇ', ṭh: 'ṇ', ḍ: 'ṇ', ḍh: 'ṇ', ṇ: 'ṇ',
  t: 'n', th: 'n', d: 'n', dh: 'n', n: 'n',
  p: 'm', ph: 'm', b: 'm', bh: 'm', m: 'm',
};

interface Rule { code: number; name: string; apply(lc: string, rc: string): string | null }
const RULES: Rule[] = [
  { code: 0, name: 'identity', apply: (l, r) => l + r },
  { code: 1, name: 'repeat-R', apply: (l, r) => (VOW.has(r) ? null : l + r + r) },
  { code: 2, name: 'repeat-L', apply: (l, r) => (VOW.has(l) ? null : l + l + r) },
  { code: 3, name: 'elide-L', apply: (_l, r) => r },
  { code: 4, name: 'elide-R', apply: (l) => l },
  {
    code: 5, name: 'lengthen', apply: (l, r) => {
      if ('aā'.includes(l) && 'aā'.includes(r)) return 'ā';
      if ('iī'.includes(l) && 'iī'.includes(r)) return 'ī';
      if ('uū'.includes(l) && 'uū'.includes(r)) return 'ū';
      return null;
    },
  },
  {
    code: 6, name: 'coalesce', apply: (l, r) => {
      if (l === 'a' && r === 'i') return 'e';
      if (l === 'a' && r === 'u') return 'o';
      return null;
    },
  },
  {
    code: 7, name: 'nasal-assim', apply: (l, r) =>
      l === 'ṃ' && !VOW.has(r) ? (NASAL[r] ?? 'ṃ') + r : null,
  },
  { code: 8, name: 'ṃ→m', apply: (l, r) => (l === 'ṃ' && VOW.has(r) ? 'm' + r : null) },
  {
    code: 9, name: 'vriddhi', apply: (l, r) => {
      if (l === 'a' && r === 'i') return 'ā';
      if (l === 'a' && r === 'u') return 'ū';
      return null;
    },
  },
  { code: 10, name: 'insert-m', apply: (l, r) => (VOW.has(l) && VOW.has(r) ? l + 'm' + r : null) },
];
const ruleOf = new Map(RULES.map((r) => [r.code, r]));

/** 回傳每個接縫的規則編號；不可能回 null。 */
function encodeWord(surface: string, parts: string[]): number[] | null {
  const target = surface.toLowerCase();
  const dfs = (i: number, out: string, pending: string, codes: number[]): number[] | null => {
    if (i === parts.length) return out + pending === target ? codes : null;
    const part = parts[i]!;
    for (const rule of RULES) {
      const neo = rule.apply(pending, part[0]!);
      if (neo === null) continue;
      let cand = out + neo;
      let nextPending: string;
      if (part.length > 1) {
        cand += part.slice(1, -1);
        nextPending = part.at(-1)!;
      } else {
        // 單字詞件：neo 的最後一字要留給下一個接縫，先不進 cand
        cand = cand.slice(0, -1);
        nextPending = neo.at(-1)!;
      }
      if (!target.startsWith(cand)) continue;
      const got = dfs(i + 1, cand, nextPending, [...codes, rule.code]);
      if (got) return got;
    }
    return null;
  };
  return dfs(1, parts[0]!.slice(0, -1), parts[0]!.at(-1)!, []);
}

/** 把 `a0b8c` 解回表面形。 */
function decodeWord(encoded: string): string {
  const pieces: { text: string; code?: number }[] = [];
  let last = 0;
  for (const m of encoded.matchAll(/\d+/g)) {
    pieces.push({ text: encoded.slice(last, m.index) });
    pieces.push({ code: Number(m[0]) });
    last = m.index! + m[0].length;
  }
  pieces.push({ text: encoded.slice(last) });
  let out = pieces[0]!.text.slice(0, -1);
  let pending = pieces[0]!.text.at(-1)!;
  for (let i = 1; i < pieces.length; i += 2) {
    const code = pieces[i]!.code!;
    const part = pieces[i + 1]!.text;
    const rule = ruleOf.get(code);
    if (!rule) throw new Error(`unknown code ${code}`);
    const neo = rule.apply(pending, part[0]!);
    if (neo === null) throw new Error(`rule ${code} not applicable: ${pending}|${part[0]}`);
    out += neo;
    if (part.length > 1) {
      out += part.slice(1, -1);
      pending = part.at(-1)!;
    } else {
      // 單字詞件：neo 的最後一字是 pending，不重複加
      out = out.slice(0, -1);
      pending = neo.at(-1)!;
    }
  }
  return out + pending;
}

const LATIN = /[\p{Script=Latin}\p{M}]/u;

/** 接縫碼 tokenizer；`#` 引用整段跳過。 */
function tokenize(text: string): string[] {
  return text.split(/\s+/).flatMap((tok) => {
    if (!tok) return [];
    if (tok.includes('#')) return [tok];   // 引用／書號：整段不動
    const out: string[] = [];
    let last = 0;
    for (const m of tok.matchAll(/\d+/g)) {
      const before = tok[m.index! - 1] ?? '';
      const after = tok[m.index! + m[0].length] ?? '';
      if (!LATIN.test(before) || !LATIN.test(after)) continue;
      out.push(tok.slice(last, m.index));
      last = m.index! + m[0].length;
    }
    out.push(tok.slice(last));
    return out.filter(Boolean);
  });
}

/* ── 資料 ── */
const db = new Database(DICT, { readonly: true });
const pwa = new Map<string, string[]>();
for (const r of db.query('SELECT dict_key, dict_content FROM pwa').all() as { dict_key: string; dict_content: string }[]) {
  const head = String(r.dict_content).split('(')[0]!.trim();
  if (!head.includes('-')) continue;
  const parts = head.split('-').filter(Boolean);
  if (parts.length >= 2) pwa.set(String(r.dict_key).toLowerCase(), parts);
}

const xml = readFileSync(XML, 'utf8');
const words = [...xml.matchAll(/<[詞辭][^>]*>([^<]*)<\/[詞辭]>/g)].map((m) => m[1]!);
console.log(`${BOOK} <辭> ${words.length.toLocaleString()} 詞次、${new Set(words.map((w) => w.toLowerCase())).size.toLocaleString()} 詞形；pwa 拆解 ${pwa.size.toLocaleString()} 條`);

let enc = 0, noPwa = 0, ruleFail = 0, digits = 0, origLen = 0, encLen = 0, roundTripFail = 0;
const used = new Map<number, number>();
const tokens: string[] = [];
const samples: string[] = [];

for (const w of words) {
  origLen += w.length;
  const parts = pwa.get(w.toLowerCase());
  if (!parts) {
    noPwa++; encLen += w.length; tokens.push(w); continue;
  }
  const codes = encodeWord(w, parts);
  if (!codes) {
    ruleFail++; encLen += w.length; tokens.push(w); continue;
  }
  let s = parts[0]!;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!;
    s += String(c) + parts[i + 1]!;
    digits += String(c).length;
    used.set(c, (used.get(c) ?? 0) + 1);
  }
  if (w.toLowerCase() === 'sappiphāṇitameva') samples.push(`${w} → ${s} → ${decodeWord(s)}`);
  if (decodeWord(s) !== w.toLowerCase()) roundTripFail++;
  enc++; encLen += s.length;
  tokens.push(...tokenize(s));
}

console.log(`可編碼 ${enc.toLocaleString()}（${(enc / words.length * 100).toFixed(1)}%）；` +
  `無 pwa 拆 ${noPwa.toLocaleString()}（${(noPwa / words.length * 100).toFixed(1)}%）；` +
  `規則失敗 ${ruleFail.toLocaleString()}（${(ruleFail / words.length * 100).toFixed(1)}%）`);
console.log(`原字數 ${origLen.toLocaleString()} → ${encLen.toLocaleString()}（+${((encLen / origLen - 1) * 100).toFixed(1)}%）；` +
  `數字 ${digits.toLocaleString()}（每詞 ${(digits / Math.max(enc, 1)).toFixed(2)}）`);
console.log(`token 數 ${tokens.length.toLocaleString()}（原 ${words.length.toLocaleString()}，×${(tokens.length / words.length).toFixed(2)}）`);
console.log(`round-trip 失敗 ${roundTripFail}（編碼後 decode 不等於原詞）`);
console.log('規則使用：');
for (const [code, n] of [...used.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(code).padStart(2)} ${ruleOf.get(code)!.name.padEnd(12)} ${n.toLocaleString()}`);
}
if (samples.length) console.log('樣本：\n  ' + samples.join('\n  '));

/* 作者給的例子：sappiphāṇitameva */
{
  const demo = 'sappiphāṇitameva';
  const parts = pwa.get(demo);
  if (parts) {
    const codes = encodeWord(demo, parts);
    if (codes) {
      let s = parts[0]!;
      codes.forEach((c, i) => { s += String(c) + parts[i + 1]!; });
      console.log(`例：${demo} → ${s} → ${decodeWord(s)}（parts=${parts.join('|')}）`);
    }
  }
}

/* 長詞搜尋：pwa 拆 → 連續 token */
const idx = new Map<string, number[]>();
tokens.forEach((t, i) => {
  const a = idx.get(t) ?? []; a.push(i); idx.set(t, a);
});
const find = (q: string): number => {
  const parts = pwa.get(q.toLowerCase());
  if (!parts) return 0;
  let hits = 0;
  for (const st of idx.get(parts[0]!) ?? []) {
    if (parts.every((p, k) => tokens[st + k] === p)) hits++;
  }
  return hits;
};
const long = [...new Set(words)].filter((w) => w.length > 20).sort((a, b) => b.length - a.length).slice(0, 5);
console.log('長詞搜尋：');
for (const q of long) console.log(`  ${q} → ${find(q)} 命中`);

console.log('guard 測試：' + tokenize('dhamma0cakka (#snp0a/1;)').join(' | '));
console.log('多接縫例：sāmañña3atthaṃ7ca9iti → ' + decodeWord('sāmañña3atthaṃ7ca9iti'));
