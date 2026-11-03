/**
 * dpd 的「詞級複合」拆分（grammar 標 `comp`）——當作 pwa 之外的**第二層**。
 *
 * dpd 不能照單全收（2026-11-02 作者指示）：
 *   - 數詞的詞源拆法（`dvādasa → dvā + dasa + a`）不是詞組，排除；
 *   - 詞綴式的最後一件（`santike → santi + ka`）不是詞，排除；
 *   - 單字母、`??`、超過 4 件，一律排除；
 *   - 其餘由作者用 `data/cs-decomp/dpd-exclude.tsv` 逐條排除（`sace` 是第一個）。
 *
 * 只讀 dictionaries.db；排除清單是人工維護的檔案。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { ROOT } from '../profiles';
import { DICT_DB, OUT_DIR } from './sources';

/** 看起來是詞尾／詞綴、不是可以查的詞 */
export const SUFFIX = new Set([
  // 一級詞尾
  'ka', 'ya', 'ti', 'ta', 'tā', 'tta', 'ana', 'iya', 'itā', 'vant', 'mant',
  'ssa', 'smiṃ', 'e', 'o', 'aṃ', 'ā', 'ī', 'ū', 'ahaṃ', 'ṇa', 'ima', 'ramma',
  // 二級派生詞尾（viggaha 很常給這個，不是複合詞件）
  'ṇika', 'ṇya', 'ika', 'eyya', 'tabba', 'inī', 'ssati', 'ṇāpe', 'anti',
  'ssāma', 'ṇaya', 'tāvī', 'ṇṇa', 'ṇeyya', 'ttha', 'āna', 'aka', 'ālu',
]);

export interface Verdict {
  ok: boolean;
  reason: string;
}

/** 一條 dpd comp 能不能用：規則先過，再看人工排除清單。 */
/** 數詞（含各式變格）：dvādasa、pannarasame、soḷasahi… 詞源拆法不是詞組 */
export const NUMERAL = /^(eka|dvi|ti|catukka|pañca|cha|satta|aṭṭha|nava|dasa|ekādasa|dvādasa|terasa|cuddasa|catuddasa|pannarasa|soḷasa|sattarasa|aṭṭhārasa|ekūnavīsati|vīsati|tiṃsa|cattālīsa|paññāsa|saṭṭhi|sattati|asīti|navuti|sata|sahassa)(ṃ|ā|ī|ū|e|o|a|i|u|ssa|smiṃ|āya|assa|ato|āni|ehi|ānaṃ|ma|me|mā|hi|su|yo|yaṃ|ena)?$/;

export const judge = (
  word: string,
  lemma: string,
  parts: string[],
  excluded: Map<string, string>,
  known: (w: string) => boolean,
): Verdict => {
  if (NUMERAL.test(lemma)) return { ok: false, reason: '數詞詞源拆法' };
  const why = excluded.get(word) ?? excluded.get(lemma);
  if (why) return { ok: false, reason: '排除清單：' + why };
  if (parts.length < 2) return { ok: false, reason: '只有一件' };
  if (parts.length > 4) return { ok: false, reason: '超過 4 件' };
  const bad = parts.find((p) => p.length < 2 || /[?()\s]/.test(p));
  if (bad) return { ok: false, reason: '壞詞件：' + bad };
  const suffix = parts.find((p) => SUFFIX.has(p));
  if (suffix) return { ok: false, reason: '詞綴當詞件：' + suffix };
  if (parts.join('') === word) return { ok: false, reason: '接起來就是原詞' };
  const unknown = parts.find((p) => !known(p));
  if (unknown) return { ok: false, reason: '詞件不是字典詞：' + unknown };
  return { ok: true, reason: '' };
};

/** dpd：詞頭 → 詞級複合分析（只取 grammar 標 comp 的）。 */
export const loadDpdComp = (): Map<string, string[]> => {
  const db = new Database(DICT_DB, { readonly: true });
  const out = new Map<string, string[]>();
  const clean = (s: string): string => {
    let x = s.trim();
    if (x.includes('>')) x = x.split('>').pop()!.trim();
    return x.replace(/[\[\]*√]/g, '').trim();
  };
  for (const r of db.query('select dict_key, dict_content from dpd').all() as {
    dict_key: string;
    dict_content: string;
  }[]) {
    const lines = r.dict_content.split('\n');
    if (!/(^|,)\s*comp\b/.test(lines[0] ?? '')) continue;
    const cons = lines.find((l) => l.includes('+'));
    if (!cons) continue;
    const parts = cons.split('+').map(clean).filter(Boolean);
    if (parts.length >= 2) out.set(r.dict_key, parts);
  }
  db.close();
  return out;
};

/** 人工排除清單：`word<TAB>原因`；沒有檔案就當空。 */
export const loadExclusions = (): Map<string, string> => {
  const file = join(OUT_DIR, 'dpd-exclude.tsv');
  const out = new Map<string, string>();
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
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

/** 寫一份「全部候選 ＋ 判定」的檢視表，方便人工再過一輪。 */
export const writeReview = (
  rows: { word: string; count: number; lemma: string; parts: string[]; verdict: Verdict }[],
): string => {
  const file = join(OUT_DIR, 'dpd-comp-review.tsv');
  const lines = ['word\tcount\tlemma\tdpd_comp\tverdict\treason'];
  for (const r of rows.sort((a, b) => b.count - a.count)) {
    lines.push(
      `${r.word}\t${r.count}\t${r.lemma}\t${r.parts.join('+')}\t${r.verdict.ok ? '用' : '不用'}\t${r.verdict.reason}`,
    );
  }
  // 用 Bun.write 讓中文/變音符號不會被平台的換行或編碼動到
  void ROOT;
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
};
