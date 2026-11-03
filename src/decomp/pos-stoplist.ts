#!/usr/bin/env bun
/**
 * 用「逐次詞性分佈」決定 stoplist：只停用虛詞用法，不整詞停用。
 *
 *   bun run src/decomp/pos-stoplist.ts            # 檢查／模擬
 *   bun run src/decomp/pos-stoplist.ts --write    # 有資料時才寫檔
 *
 * 輸入（komyoji 那邊的產物，還不存在時會用 dpd 的多類標記模擬）：
 *   data/cs-decomp/pos-distribution.tsv
 *   word <TAB> pos <TAB> count
 *   pos 用 dpd 的寫法（ind/adv/conj/prep/prefix/pron/neg vs masc/fem/nt/adj/pr/pp…）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';

const WRITE = process.argv.includes('--write');
const POS_FILE = join(OUT_DIR, 'pos-distribution.tsv');

/* 現行政策 */
const policy = new Map<string, { posting: number; action: string }>();
for (const line of readFileSync(join(OUT_DIR, 'index-policy.tsv'), 'utf8').split('\n').slice(1)) {
  const [t, p, a] = line.split('\t');
  if (t) policy.set(t, { posting: Number(p) || 0, action: a });
}
const currentStop = new Set([...policy].filter(([, v]) => v.action === 'stop').map(([k]) => k));
console.log(`現行政策：token ${policy.size.toLocaleString()}、stop ${currentStop.size}`);

/* 逐次詞性分佈 */
// komyoji 的 8 個枚舉（n/v/adj/ptcp/pron/ind/num/other）＋舊的 dpd 寫法都吃。
// 虛詞只認 ind（不變詞）與 pron（代名詞）；other（含「不定」「‐」）保守算內容詞。
const FUNC = new Set(['ind', 'pron', 'adv', 'conj', 'prep', 'prefix', 'neg', 'part', 'func']);
type Dist = { func: number; content: number };
const dist = new Map<string, Dist>();
let simulated = false;

if (existsSync(POS_FILE)) {
  for (const line of readFileSync(POS_FILE, 'utf8').split('\n').slice(1)) {
    const [word, pos, count] = line.split('\t');
    if (!word || !pos) continue;
    const n = Number(count) || 0;
    const d = dist.get(word) ?? { func: 0, content: 0 };
    if (FUNC.has(pos)) d.func += n;
    else d.content += n;
    dist.set(word, d);
  }
  console.log(`讀到 ${POS_FILE}：${dist.size.toLocaleString()} 個詞形`);
} else {
  // 沒有資料：用 dpd 的多類標記模擬（只為了驗證邏輯，不是真實分佈）
  simulated = true;
  const db = new Database(DICT_DB, { readonly: true });
  const gram = new Map<string, string>();
  for (const r of db.query('select dict_key, dict_content from dpd').all() as { dict_key: string; dict_content: string }[]) {
    if (!gram.has(r.dict_key)) gram.set(r.dict_key, (r.dict_content.split('\n')[0] || '').trim());
  }
  db.close();
  for (const [t, v] of policy) {
    const g = gram.get(t) ?? '';
    const f = FUNC.has('x') ? 0 : /\b(ind|adv|conj|prep|prefix|sandhi|pron|neg)\b/.test(g) ? 0.5 : 0;
    const c = /\b(masc|fem|nt|adj|letter|pr|pp|ptp)\b/.test(g) ? 0.5 : 0;
    if (f + c === 0) continue;
    dist.set(t, { func: Math.round(v.posting * f), content: Math.round(v.posting * c) });
  }
  console.log(`（模擬）用 dpd 多類標記造了 ${dist.size.toLocaleString()} 筆分佈——真實資料要等 komyoji`);
}

/* 新政策：虛詞佔比 ≥ 90% 且 posting ≥ 10,000 才停用 */
const MIN_POST = 10000;
const SHARE = 0.9;
// 證據覆蓋率門檻：komyoji 只做了部分書，覆蓋太低時不要推翻字典判定
const MIN_COVERAGE = 0.05;
const next = new Map<string, { posting: number; action: string; reason: string }>();
let freed = 0;
let added = 0;
for (const [t, v] of policy) {
  const d = dist.get(t);
  let action = v.action;
  let reason = 'dpd-rule';
  if (d) {
    const total = d.func + d.content;
    const share = total ? d.func / total : 0;
    const coverage = v.posting ? total / v.posting : 0;
    // 佔比極端時不需要覆蓋率：0.1% 與 99% 不會是抽樣誤差
    const decisive = share <= 0.05 || share >= 0.95;
    if (total > 0 && v.posting >= MIN_POST && (coverage >= MIN_COVERAGE || decisive)) {
      const stop = share >= SHARE;
      if (stop !== (v.action === 'stop')) {
        if (stop) added++;
        else freed++;
      }
      action = stop ? 'stop' : 'keep';
      reason = `pos-share ${(share * 100).toFixed(0)}% cov ${(coverage * 100).toFixed(0)}%`;
    } else if (total > 0) {
      reason = `pos-thin ${(coverage * 100).toFixed(0)}%`;
    }
  }
  next.set(t, { posting: v.posting, action, reason });
}

console.log(`\n${simulated ? '（模擬）' : ''}新政策：stop ${[...next.values()].filter((v) => v.action === 'stop').length}`);
console.log(`  由停用改回保留：${freed} 個`);
console.log(`  由保留改為停用：${added} 個`);
for (const [t, v] of next) {
  if (v.reason.startsWith('pos-share') && v.action === 'keep' && currentStop.has(t)) {
    console.log(`  保留：${t.padEnd(12)} ${v.reason}`);
  }
}

if (WRITE && !simulated) {
  const rows = ['token\tposting\taction\treason'];
  for (const [t, v] of [...next].sort((a, b) => b[1].posting - a[1].posting)) {
    rows.push(`${t}\t${v.posting}\t${v.action}\t${v.reason}`);
  }
  writeFileSync(join(OUT_DIR, 'index-policy.tsv'), rows.join('\n') + '\n', 'utf8');
  console.log(`\n已寫入 ${join(OUT_DIR, 'index-policy.tsv')}`);
} else if (WRITE) {
  console.log('\n沒有真實的 pos-distribution.tsv，不寫檔（避免用模擬資料污染政策）。');
}
