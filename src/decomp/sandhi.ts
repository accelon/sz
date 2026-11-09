/**
 * 詞譜（b／j）的產生與驗證。**全世界的拆法都要經過這裡**。
 *
 * 一個詞譜長這樣：`<辭 b="adVDAn|mgVg|pWIpnVnO" j="0,3">addhānamaggappaṭipanno</辭>`
 *   b＝儉約巴利（provident）詞件，`|` 分隔
 *   j＝連音編號，b[i] j[i] b[i+1] j[i+1]…（最後一個詞件後面沒有 j）
 * 還原：`orthOf(b.join(j))` → 儉約巴利正詞 → `toIAST` → 夾文。
 *
 * 規則（AGENTS.md／本次任務）：**每個拆法都必須可還原**，做不到就不寫進表。
 * 所以 `formulaOf()` 只回傳「用 provident-pali 的 orthOf 還原得回來」的詞譜；
 * 呼叫端不需要（也不准）自己拼字串。
 */
// @ts-expect-error 沒有型別宣告（純 JS 套件）
import { orthOf, toIAST, fromIAST } from 'D:/2023/provident-pali/index.js';

/**
 * 連音編號的候選值。來源資料（data/cs 的既有詞譜）實際出現 0–10 與 65；
 * 65 是 provident-pali 的 InsertRules（插入 A）。其餘不猜。
 */
export const DIGITS = [0, 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 65] as const;

/**
 * provident-pali 的 `parseFormula` 對「壞詞譜」會直接 `console.log`（例
 * `error single char lexeme …`），而我們會刻意試很多錯的組合。這裡在呼叫期間
 * 暫時關掉 console.log，避免幾萬行雜訊。
 */
const quiet = <T>(fn: () => T): T => {
  const saved = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = saved;
  }
};

/** IAST → 儉約巴利；來回轉不回去（含 `??`）就回 null。 */
export const toOrth = (iast: string): string | null => {
  let orth = '';
  try {
    orth = fromIAST(iast);
  } catch {
    return null;
  }
  if (!orth || orth.includes('?') || orth.includes(' ')) return null;
  try {
    return toIAST(orth) === iast ? orth : null;
  } catch {
    return null;
  }
};

/** 詞譜（儉約巴利字串）→ 顯示形（IAST）。壞掉回空字串。 */
export const formulaToIAST = (formula: string): string => {
  try {
    return toIAST(quiet(() => orthOf(formula)));
  } catch {
    return '';
  }
};

/** 詞譜是否真的還原成 `orth`。 */
export const verifies = (formula: string, orth: string): boolean => {
  if (!formula || !orth) return false;
  try {
    return quiet(() => orthOf(formula)) === orth;
  } catch {
    return false;
  }
};

/**
 * 給定正詞（儉約巴利）與 IAST 詞件，找出**可還原**的詞譜。
 *
 * 作法是逐個接縫試連音編號（0–10、65），每接一個就檢查「目前的還原結果」是不是
 * 正詞的前綴——連音只影響接縫前後幾個字，所以前綴檢查可以把搜尋砍到很小。
 * 全部接完再要求一字不差。
 *
 * `stripV`：詞件不是最後一件時，去掉 fromIAST 補的字尾 `V`（那是「字尾無預設 a」
 * 的標記，只有整詞結尾才需要）。兩種都試，先試去 V（大多數情況）。
 */
export const formulaOf = (orth: string, iastParts: string[]): string | null => {
  if (iastParts.length < 2) return null;
  if (iastParts.some((p) => !p || !/^[\p{L}\p{M}]+$/u.test(p))) return null;

  const build = (stripV: boolean): string | null => {
    const lex = iastParts.map((p, i) => {
      const s = fromIAST(p);
      return stripV && i < iastParts.length - 1 && s.endsWith('V') ? s.slice(0, -1) : s;
    });
    if (lex.some((s) => !s || s.includes('?') || s.includes(' '))) return null;

    const rec = (i: number, formula: string): string | null => {
      if (i === lex.length - 1) return verifies(formula, orth) ? formula : null;
      for (const d of DIGITS) {
        const next = formula + d + lex[i + 1];
        let partial = '';
        try {
          partial = quiet(() => orthOf(next));
        } catch {
          continue;
        }
        // 連音只動接縫，所以「接了一段的結果」一定要是正詞的前綴
        if (!partial || !orth.startsWith(partial)) continue;
        const found = rec(i + 1, next);
        if (found) return found;
      }
      return null;
    };
    return rec(0, lex[0]);
  };

  return build(true) ?? (iastParts.slice(0, -1).some((p) => {
    try {
      return fromIAST(p).endsWith('V');
    } catch {
      return false;
    }
  })
    ? build(false)
    : null);
};

/** 詞譜 → `{ b, j }`（寫進 `<辭>` 的兩個屬性）。 */
export const splitFormula = (formula: string): { b: string; j: string } => {
  const parts = formula.split(/(\d+)/);
  const b = parts.filter((_, i) => i % 2 === 0).join('|');
  const j = parts.filter((_, i) => i % 2 === 1).join(',');
  return { b, j };
};

/** `{ b, j }` → 詞譜字串。 */
export const joinFormula = (b: string, j: string): string => {
  const bases = b.split('|');
  const digits = j ? j.split(',') : [];
  if (bases.length !== digits.length + 1) return '';
  let out = bases[0];
  for (let i = 0; i < digits.length; i++) out += digits[i] + bases[i + 1];
  return out;
};

/** 詞譜的詞件（儉約巴利）。 */
export const basesOf = (b: string): string[] => b.split('|');

/** 詞件 → IAST（給人看／給詞表比對）。 */
export const baseIAST = (base: string): string => {
  try {
    return toIAST(base);
  } catch {
    return '';
  }
};
