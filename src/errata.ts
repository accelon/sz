/**
 * CST deva master 的勘誤（作者用 SuttaCentral 對勘，多半是 CST 的輸入錯誤）。
 *
 * 這裡只留**還有效**的：`open` 的 19 條。官方 deva master 已經改掉的 44 條
 * 移到 `data/cs-index/errata-retired.tsv`（不再套用，也不占版面）。
 *
 * 格式：`[錯誤, 正確, 次數?]`；次數 0＝全部取代，n＝最多 n 次（舊管線 patchBuf 的語意）。
 * `TYPO` 是羅馬轉寫（在產出的 IAST 上套用，不分大小寫）；
 * `DEVA` 是 Devanagari（在轉寫前的原始 XML 上套用）。
 */
export type Patch = [string | RegExp, string, number?];

export const TYPO: Record<string, Patch[]> = {
  "s0302m.mul.xml": [
    ["anatiṇṇo", "anitthiṇṇo"],
    ["pavattetti", "pavatteti"],
  ],
  "s0305m.mul.xml": [
    ["sotapanno", "sotāpanno"],
    ["upekkilesā", "upakkilesā"],
  ],
  "s0402m2.mul.xml": [
    ["abhiviniye", "abhivinaye"],
    ["nikāmalāmī", "nikāmalābhī"],
  ],
  "s0403m2.mul.xml": [
    [" viññā ", " viññāya "],
  ],
  "s0403m3.mul.xml": [
    ["atthahitāya", "attahitāya"],
  ],
};

export const DEVA: Record<string, Patch[]> = {
  "abh01m.mul.xml": [
    [/\u0903/g, ";", 11],
  ],
  "s0202m.mul.xml": [
    ["मालुङ्क्यपुत्तस्स", "मालुन्क्यपुत्तस्स", 1], // Māluṅkyaputtassa==>Mālunkyaputtassa
  ],
  "s0304m.mul.xml": [
    ["मालुङ्क्यपुत्तो", "मालुन्क्यपुत्तो", 1], // 'māluṅkyaputto ==> mālunkyaputto'
  ],
  "s0305m.mul.xml": [
    ["सकुणग्धि", "सकुणग्घि", 1], // sakuṇagdhi ==> sakuṇagghi , typo see context
  ],
  "s0402m3.mul.xml": [
    ["मालुङ्क्यपुत्तो", "मालुन्क्यपुत्तो", 1], // 'māluṅkyaputto ==> mālunkyaputto'
  ],
  "s0504m.mul.xml": [
    [/\u0903/g, ";", 6],
  ],
  "s0508m.mul.xml": [
    ["मालुङ्क्यपुत्तो", "मालुन्क्यपुत्तो", 1], // māluṅkyaputto ==> mālunkyaputto'
    ["मालुङ्क्यो", "मालुन्क्यो ", 1], // māluṅkyo ==> Mālunkyo
  ],
  "s0513m.mul.xml": [
    ["रमस्स्वज्‍ज", "रमस्सवज्ज", 1], // Ramassvajja ==> Ramassavajja  , //  "ja519:9.4": "ramassvajja mayā saha.", did not fix
  ],
  "s0519m.mul.xml": [
    [/\u0903/g, ";", 1],
    ["भिक्खवेऋ", "भिक्खवे", 1], // extra R at the end
  ],
};
