/**
 * 儉約巴利（provident-pali）→ IAST 的正文轉寫器，順便把「詞譜」留成 `<辭>`。
 *
 * 2026-11-06 作者指示：cs 的詞譜標籤由 `<詞>` 改成 `<辭>`，和詞典的 `<詞>` 詞頭分開
 * （閱讀器兩種都認；只有 cs 產 `<辭>`，cyd／hydzd 等詞典仍用 `<詞>`）。
 *
 * 只有**轉換時**用到 provident-pali（`D:\2023\provident-pali`，作者自研的套件）；
 * adb 裡不引用它，閱讀器也不需要它——作者 2026-11-02 指定：
 * 「provident-pali 機制先不引用 accelon3」。
 *
 * 一個帶數字的詞（詞譜，例 `pd3Upm` ＝ pada ＋ 3 ＋ upama）輸出成：
 *
 *     <辭 b="pd|upm" j="3">padopama</辭>
 *
 *   b＝詞譜的**原始分段**（`pd`、`upm`，儉約巴利），`|` 分隔
 *   j＝連音編號（`3`），和 b 一一對應：b[0] j[0] b[1] j[1] b[2]…
 *   夾文＝還原連音後的正詞（IAST），畫面上看到的就是它
 *
 * 為什麼 b 不存 IAST：詞譜的第 2 段以後是「接上去的形式」，不是獨立單詞
 * （`rAj0AAgArkE` 的第 3 段是 `AAgArkE`，前導的 a 已被吃掉）。硬轉 IAST 會得到
 * `āāgārake` 這種不存在的字。存原文分段才能 **一字不差** 還原（b 依 j join 起來
 * 就是原詞譜），要 IAST 再逐段轉一次就好（純對照表，不需要程式庫）。
 */
// @ts-expect-error 沒有型別宣告（純 JS 套件，bun 直接跑）
import { orthOf, toIAST } from 'D:/2023/provident-pali/index.js';
import { escapeText } from '../../adb-converter/ts/tools/off2accelon';
import { readFileSync } from 'node:fs';

/** 一個「詞」：純字母，或字母＋數字（詞譜）。 */
const WORD_G = /[A-Za-z]+\d[\dA-Za-z]*|[A-Za-z]+/g;

/**
 * 補充詞譜：`data/cs-decomp/splits.tsv`（另一條線用 pwa／dpd 拆出來的）。
 * 只收「每個詞件 ≥2 字母」的列——沒有這個關卡會出現 `nti → n+ti` 這種單字詞件。
 * 鍵是 IAST 詞形（NFC），值＝`b`／`j`（儉約巴利分段與連音編號）。
 */
const SPLIT = new Map<string, { b: string; j: string }>();
{
  const f = 'D:/2026/sz/data/cs-decomp/splits.tsv';
  try {
    const lines = readFileSync(f, 'utf8').trimEnd().split('\n').slice(1);
    for (const line of lines) {
      const [word, b, j, parts] = line.split('\t');
      if (!word || !b || !j) continue;
      const segs = b.split('|');
      const ps = (parts ?? '').split('+');
      if (segs.length !== ps.length || ps.some((p) => p.length < 2)) continue;
      SPLIT.set(word.normalize('NFC'), { b, j });
    }
  } catch {
    /* 沒有補充表就照舊 */
  }
}

const iast = (p: string): string => {
  try {
    return toIAST(p);
  } catch {
    return p;
  }
};

/** 詞譜 → 還原連音後的正詞（儉約巴利）。失敗就退回「去掉數字」。 */
const orth = (tok: string): string => {
  try {
    const o = orthOf(tok);
    if (o) return o;
  } catch {
    /* 落到底下 */
  }
  return tok.replace(/\d+/g, '');
};

/** 一個詞譜 token → `<辭 b j>顯示</辭>`（plain 模式只要顯示）。 */
const formulaWord = (tok: string, plain: boolean): string => {
  let display = iast(orth(tok));
  if (display.includes('??')) display = iast(tok.replace(/\d+/g, '')); // 詞譜壞掉：至少把字轉出來
  if (plain) return display;
  if (display.includes('??')) return escapeText(tok); // 真的轉不出來：原文照留
  // 依數字切段：["rAj","0","AAgArkE"] → b="rAj|AAgArkE" j="0"
  const parts = tok.split(/(\d+)/);
  const bases = parts.filter((_, i) => i % 2 === 0);
  const joiners = parts.filter((_, i) => i % 2 === 1);
  if (bases.length !== joiners.length + 1 || bases.some((s) => !s)) {
    // 形狀不完整（來源本身壞掉，如 `aAdyO868`）：整串留著
    return `<辭 f="${escapeText(tok)}">${display}</辭>`;
  }
  return `<辭 b="${bases.join('|')}" j="${joiners.join(',')}">${display}</辭>`;
};

/**
 * 一段 off 正文 → Accelon 文字。
 * `plain`＝現在渲染的是節點名字（書名／塊名），不要插 `<辭>`。
 */
export const providentText = (s: string, plain = false): string => {
  // 來源殘留：phandler 的 `${x}` 沒值時留下字面的 undefined（實測 3 處，snp0a×2、sn1a×1）
  s = s.replace(/\bundefined\b/g, ' ');
  if (!/[A-Za-z]/.test(s)) return escapeText(s);
  let out = '';
  let last = 0;
  WORD_G.lastIndex = 0;
  for (let m = WORD_G.exec(s); m; m = WORD_G.exec(s)) {
    out += escapeText(s.slice(last, m.index));
    const tok = m[0];
    if (/\d/.test(tok)) out += formulaWord(tok, plain);
    else {
      const w = iast(tok);
      const sup = plain ? undefined : SPLIT.get(w.normalize('NFC'));
      out += sup ? `<辭 b="${sup.b}" j="${sup.j}">${w}</辭>` : w;
    }
    last = m.index + tok.length;
  }
  out += escapeText(s.slice(last));
  return out;
};

export default providentText;
