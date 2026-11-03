/**
 * deva master 的文字處理：Devanagari→IAST 字元轉寫、XML→正文字。
 * 建置（src/cs-deva-iast.ts）與勘誤（src/cs-errata.ts）共用。
 */
/* ------------------------------------------------------------ Devanagari → IAST */
const HEADING_REND = new Set(['subhead', 'subsubhead', 'title', 'chapter', 'centre', 'nikaya', 'book']);


const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ṅ',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'ñ',
  'ट': 'ṭ', 'ठ': 'ṭh', 'ड': 'ḍ', 'ढ': 'ḍh', 'ण': 'ṇ',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'ś', 'ष': 'ṣ', 'स': 's', 'ह': 'h',
  'ळ': 'ḷ',
};
const VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'ā', 'इ': 'i', 'ई': 'ī', 'उ': 'u', 'ऊ': 'ū', 'ऋ': 'ṛ', 'ॠ': 'ṝ',
  'ऌ': 'ḷ', 'ॡ': 'ḹ', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऍ': 'ĕ', 'ऑ': 'ŏ',
};
const MATRAS: Record<string, string> = {
  'ा': 'ā', 'ि': 'i', 'ी': 'ī', 'ु': 'u', 'ू': 'ū', 'ृ': 'ṛ', 'ॄ': 'ṝ',
  'ॢ': 'ḷ', 'ॣ': 'ḹ', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'ĕ', 'ॉ': 'ŏ',
};
const MARKS: Record<string, string> = { 'ं': 'ṃ', 'ः': 'ḥ', 'ँ': 'm̐', 'ऽ': "'" };
/** 母音記號前面沒有子音時（來源殘缺）改用的獨立母音。 */
const MATRA_VOWEL: Record<string, string> = {
  'ा': 'ā', 'ि': 'i', 'ी': 'ī', 'ु': 'u', 'ू': 'ū', 'ृ': 'ṛ', 'ॄ': 'ṝ',
  'ॢ': 'ḷ', 'ॣ': 'ḹ', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'ĕ', 'ॉ': 'ŏ',
};
const VIRAMA = '्';
const SKIP = new Set(['\u200c', '\u200d', '\ufeff']);

/** 純字元映射：一個 Devanagari 音節 → 一個 IAST 字串（不對詞、不改連音）。 */
export function devaToIast(src: string): string {
  let out = '';
  const cps = [...src];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i]!;
    if (SKIP.has(c)) continue;
    const cons = CONSONANTS[c];
    if (cons !== undefined) {
      const next = cps[i + 1];
      if (next === VIRAMA) { out += cons; i++; continue; }
      const m = next !== undefined ? MATRAS[next] : undefined;
      if (m !== undefined) { out += cons + m; i++; continue; }
      out += cons + 'a';
      continue;
    }
    const v = VOWELS[c];
    if (v !== undefined) { out += v; continue; }
    const m = MATRAS[c];
    if (m !== undefined) {
      // 母音記號前面沒有子音（來源的罕見殘缺，如 `िंद…`）：當獨立母音
      out += MATRA_VOWEL[c] ?? m;
      continue;
    }
    const mk = MARKS[c];
    if (mk !== undefined) { out += mk; continue; }
    if (c >= '०' && c <= '९') { out += String(c.charCodeAt(0) - 0x0966); continue; }
    out += c;
  }
  return out;
}

/* ------------------------------------------------------------ 新檔（deva） */

/** deva XML → 正文字（去掉段落編號、頁碼、校勘註、標題類段落；只取 <body>）。 */
export function newTextOf(xml: string): string {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(xml)?.[1] ?? xml;
  const clean = body
    // 夾註（`(दी॰ नि॰ २.३७३)`）：舊版已外部化成 `<聯>`，不是正文
    .replace(/\([^()]*॰[^()]*\)/g, ' ')
    .replace(/<\?[^>]*\?>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, ' ')
    .replace(/<hi rend="paranum">[\s\S]*?<\/hi>/g, ' ')
    .replace(/<hi rend="dot">[\s\S]*?<\/hi>/g, ' ');
  let text = '';
  for (const m of clean.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const rend = /\brend="([^"]+)"/.exec(m[1]!)?.[1] ?? '';
    if (HEADING_REND.has(rend)) continue;
    // `<pb>` 直接去掉、不插空格：CST 把頁碼放在詞後（舊管線 backmovepb.js 把它往前挪一個詞），
    // 新來源有時**差一個字母**、落在詞中間（`…<pb/>्…`），插空格會把一個詞切成兩個。
    // 其餘行內標籤（`<hi>` 粗體／斜體）照舊插空格：來源常在引文結尾切開（`…पाणिन</hi>न्ति`），
    // 舊骨架也在這裡斷詞，插空格才對得上。
    text += ' ' + m[2]!.replace(/<pb\b[^>]*\/>/g, '').replace(/<[^>]*>/g, ' ');
  }
  return devaToIast(text);
}
