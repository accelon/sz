/**
 * 緬文（Myanmar script）巴利 → IAST。
 *
 * 為什麼自己寫：`myanmaropenwordnet/mya2rom`（CC BY-SA 4.0）是給**緬甸語**用的
 * （MLCTS／IPA，သ → th、ည → ny 這種緬甸讀音），不是巴利。巴利在緬文裡是
 * 「一字母一音」的對寫，只需要 ~45 條對照表＋堆疊子音的處理，自己寫反而乾淨，
 * 也不會把 CC BY-SA 的 share-alike 帶進來。
 *
 * 規則（依 Unicode Myanmar 區塊）：
 *   - 子音 + 母音符號 → 子音 + 母音；沒有母音符號時自帶 a
 *   - 子音 + ္（virama／堆疊）→ 子音本身（去掉自帶的 a），下一個子音照常處理
 *   - 子音 + ်（asat）→ 子音本身（去掉自帶的 a）
 *   - ေ + ာ → o（印度系文字的 o 是 e + ā）
 *   - ံ → ṃ；း 是緬甸語的聲調符號，巴利不用，直接忽略
 *   - 中綴 ျ/ြ/ွ/ှ → y/r/v/h（巴利的梵語借詞偶爾出現）
 */

const CONS: Record<string, string> = {
  'က': 'k', 'ခ': 'kh', 'ဂ': 'g', 'ဃ': 'gh', 'င': 'ṅ',
  'စ': 'c', 'ဆ': 'ch', 'ဇ': 'j', 'ဈ': 'jh', 'ဉ': 'ñ', 'ည': 'ñ',
  'ဋ': 'ṭ', 'ဌ': 'ṭh', 'ဍ': 'ḍ', 'ဎ': 'ḍh', 'ဏ': 'ṇ',
  'တ': 't', 'ထ': 'th', 'ဒ': 'd', 'ဓ': 'dh', 'န': 'n',
  'ပ': 'p', 'ဖ': 'ph', 'ဗ': 'b', 'ဘ': 'bh', 'မ': 'm',
  'ယ': 'y', 'ရ': 'r', 'လ': 'l', 'ဝ': 'v', 'သ': 's', 'ဿ': 'ss', 'ဟ': 'h', 'ဠ': 'ḷ',
  'အ': '', // 母音的載體：အ = a、အာ = ā、အိ = i…
};

const VOWEL: Record<string, string> = {
  'ာ': 'ā', 'ါ': 'ā',
  'ိ': 'i', 'ီ': 'ī', 'ု': 'u', 'ူ': 'ū',
  'ေ': 'e', 'ဲ': 'ai',
  'ံ': 'ṃ',
};

const INDEP: Record<string, string> = {
  'ဣ': 'i', 'ဤ': 'ī', 'ဥ': 'u', 'ဦ': 'ū', 'ဧ': 'e', 'ဩ': 'o', 'ဪ': 'o',
};

const MEDIAL: Record<string, string> = { 'ျ': 'y', 'ြ': 'r', 'ွ': 'v', 'ှ': 'h' };

const VIRAMA = '\u1039'; // ္
const ASAT = '\u103A'; // ်
const ANUSVARA = 'ံ';
const TONE = 'း';

/** 緬文巴利 → IAST。非緬文字元（空白、標點、數字）原樣保留。 */
export const mm2iast = (input: string): string => {
  let out = '';
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (ch in INDEP) {
      out += INDEP[ch];
      i++;
      continue;
    }
    if (!(ch in CONS)) {
      out += ch;
      i++;
      continue;
    }
    // 子音（含 အ，對照表是空字串）
    out += CONS[ch];
    let j = i + 1;
    // 中綴
    let med = '';
    while (j < n && input[j] in MEDIAL) {
      med += MEDIAL[input[j]];
      j++;
    }
    // 母音符號（先處理 ေ + ာ = o）
    if (j < n && input[j] === 'ေ' && (input[j + 1] === 'ာ' || input[j + 1] === 'ါ')) {
      out += 'o' + med;
      j += 2;
    } else if (j < n && input[j] in VOWEL) {
      const v = VOWEL[input[j]];
      out += (v === 'ṃ' ? 'aṃ' : v) + med;
      j++;
    } else if (j < n && (input[j] === VIRAMA || input[j] === ASAT)) {
      out += med; // 子音被「殺掉」，不加自帶的 a
      const wasAsat = input[j] === ASAT;
      j++;
      // 緬文的 kinzi：င + ် + ္ + 下一子音（asat 後面再接 virama），兩個都要吃掉
      while (wasAsat && j < n && input[j] === VIRAMA) j++;
    } else {
      out += med + 'a';
    }
    i = j;
  }
  // း 是聲調符號，不是巴利的音，最後統一去掉
  return out.split(TONE).join('');
};

export default mm2iast;
