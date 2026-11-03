/**
 * pm1（緬甸 Tipiṭaka 辭典）的 `viggaha`：緬文詞解析，用 `mm2iast` 轉成 IAST 後，
 * 當作 pwa／dpd 之外的**第三層**。
 *
 * viggaha 是「詞解析」的傳統，混了三種東西：
 *   一）真正的複合詞（`cakka + aṅkita`）→ 要用
 *   二）文法派生（`abbahī → ā + vaha + a + ti`）→ 不要
 *   三）字母的詞源（`ca → ci + a`）→ 不要
 * 所以規則比 dpd 嚴：詞件全部要是字典詞、不能是詞綴、不能是數詞、第一個詞件不能就是原詞。
 * 作者另外可以用 `data/cs-decomp/pm1-exclude.tsv` 逐條排除。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { DICT_DB, OUT_DIR } from './sources';
import { mm2iast } from './mm2iast';
import { NUMERAL, SUFFIX, type Verdict } from './dpd-comp';

/** pm1：詞頭 → viggaha 詞件（IAST）。只收 2–6 件、轉寫後是純字母的。 */
export const loadPm1 = (): Map<string, string[]> => {
  const db = new Database(DICT_DB, { readonly: true });
  const VIG = /<div class="viggaha">([\s\S]*?)<\/div>/;
  const out = new Map<string, string[]>();
  for (const r of db.query('select dict_key, dict_content from pm1').all() as {
    dict_key: string;
    dict_content: string;
  }[]) {
    const m = VIG.exec(r.dict_content);
    if (!m) continue;
    const inner = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!inner || !inner.includes('+')) continue;
    const head = inner.split('။')[0].replace(/\[|\]/g, ' ').trim();
    const parts = head.split('+').map((x) => mm2iast(x.trim())).filter(Boolean);
    if (parts.length < 2 || parts.length > 6) continue;
    if (!parts.every((p) => /^[A-Za-zāīūṅñṭḍṇḷṃ]+$/.test(p))) continue;
    if (!out.has(r.dict_key)) out.set(r.dict_key, parts);
  }
  db.close();
  return out;
};

/** 人工排除清單：`詞<TAB>原因`。 */
export const loadPm1Exclusions = (): Map<string, string> => {
  const out = new Map<string, string>();
  let text = '';
  try {
    text = readFileSync(join(OUT_DIR, 'pm1-exclude.tsv'), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [w, ...rest] = t.split('\t');
    if (w) out.set(w, rest.join(' ').trim() || '（未寫原因）');
  }
  return out;
};

/** 這一條 viggaha 能不能當第三層。 */
/** 詞件至少要在幾個 pwa 詞形裡出現過，才當它是「詞」而不是詞根 */
const MIN_PART_COUNT = 50;

export const judgePm1 = (
  word: string,
  lemma: string,
  parts: string[],
  excluded: Map<string, string>,
  known: (w: string) => boolean,
  countOf: (w: string) => number,
): Verdict => {
  const why = excluded.get(word) ?? excluded.get(lemma);
  if (why) return { ok: false, reason: '排除清單：' + why };
  if (NUMERAL.test(lemma)) return { ok: false, reason: '數詞詞源拆法' };
  if (parts.length < 2) return { ok: false, reason: '只有一件' };
  if (parts.length > 4) return { ok: false, reason: '超過 4 件' };
  const bad = parts.find((p) => p.length < 2 || /[^A-Za-zāīūṅñṭḍṇḷṃ]/.test(p));
  if (bad) return { ok: false, reason: '壞詞件：' + bad };
  const suffix = parts.find((p) => SUFFIX.has(p));
  if (suffix) return { ok: false, reason: '詞綴當詞件：' + suffix };
  if (parts[0] === word) return { ok: false, reason: '第一件就是原詞（派生，不是複合）' };
  if (parts.join('') === word) return { ok: false, reason: '接起來就是原詞' };
  const unknown = parts.find((p) => !known(p));
  if (unknown) return { ok: false, reason: '詞件不是字典詞：' + unknown };
  const rare = parts.find((p) => countOf(p) < MIN_PART_COUNT);
  if (rare) return { ok: false, reason: '詞件太少見（< ' + MIN_PART_COUNT + '）：' + rare };
  return { ok: true, reason: '' };
};

/** 檢視表：全部候選 ＋ 判定，給人工再過一輪。 */
export const writePm1Review = (
  rows: { word: string; count: number; lemma: string; parts: string[]; verdict: Verdict }[],
): string => {
  const file = join(OUT_DIR, 'pm1-viggaha-review.tsv');
  const lines = ['word\tcount\tlemma\tpm1_parts\tverdict\treason'];
  for (const r of rows.sort((a, b) => b.count - a.count)) {
    lines.push(
      `${r.word}\t${r.count}\t${r.lemma}\t${r.parts.join('+')}\t${r.verdict.ok ? '用' : '不用'}\t${r.verdict.reason}`,
    );
  }
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
};
