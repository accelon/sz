/**
 * 來源：`data/cs` 的詞清單、`D:\2023\cs` 的拆分表、OpenTipitaka 的 `dictionaries.db`。
 * 只讀，不改任何來源。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
// @ts-expect-error 沒有型別宣告（純 JS 套件）
import { toIAST } from 'D:/2023/provident-pali/index.js';
import { ROOT } from '../profiles';

/** 24 冊（與 src/cs2accelon.ts 的 BOOKS 一致；00.xml 是目錄，不算） */
export const BOOKS = [
  'dn1', 'dn2', 'dn3',
  'mn1', 'mn2', 'mn3',
  'sn1', 'sn2', 'sn3', 'sn4', 'sn5',
  'an1', 'an2', 'an3', 'an4', 'an5', 'an6', 'an7', 'an8', 'an9', 'an10', 'an11',
  'vs', 'aas',
];

export const CS_OUT = join(ROOT, 'data', 'cs');
export const CS_SRC = 'D:/2023/cs';
export const OUT_DIR = join(ROOT, 'data', 'cs-decomp');
export const PREVIEW_DIR = join(ROOT, 'out', 'cs-decomp-preview');
export const DICT_DB =
  'C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db';

/** 只取 24 冊；找不到檔案就報錯（不要默默少一冊）。 */
export const bookFiles = (): string[] => {
  const have = new Set(readdirSync(CS_OUT));
  const missing = BOOKS.filter((b) => !have.has(`${b}.xml`));
  if (missing.length) throw new Error(`data/cs 缺書：${missing.join(', ')}（先跑 cs2accelon）`);
  return BOOKS.map((b) => join(CS_OUT, `${b}.xml`));
};

/** 一段 XML 的內容：`<詞 …>顯示</詞>` 與一般文字（標籤不含內容）。 */
const TOKEN_G = /<詞 ([^>]*)>([^<]*)<\/詞>|<[^>]*>|([^<]+)/g;
const WORD_G = /[\p{L}\p{M}]+/gu;

export interface WordStat {
  /** 出現在正文（沒有詞譜）的次數 */
  plain: number;
  /** 出現在 `<詞>` 裡的次數 */
  formula: number;
  /** 出現在哪幾冊（plain 的） */
  books: Set<string>;
}

export interface Inventory {
  words: Map<string, WordStat>;
  /** 既有的詞譜：詞形 → b（同一詞形多數取第一次；全部一致才用） */
  existing: Map<string, { b: string; j: string }>;
  /** 既有的詞譜若同一詞形有兩種寫法，這裡記下來（不沿用） */
  conflicting: Set<string>;
}

/** 掃 24 冊：每個詞形的「有詞譜／沒詞譜」次數。 */
export const inventory = (): Inventory => {
  const words = new Map<string, WordStat>();
  const existing = new Map<string, { b: string; j: string }>();
  const conflicting = new Set<string>();
  const touch = (w: string): WordStat => {
    let s = words.get(w);
    if (!s) {
      s = { plain: 0, formula: 0, books: new Set() };
      words.set(w, s);
    }
    return s;
  };
  for (const file of bookFiles()) {
    const book = file.slice(file.lastIndexOf('\\') + 1).replace('.xml', '');
    const xml = readFileSync(file, 'utf8');
    for (const m of xml.matchAll(TOKEN_G)) {
      if (m[0].startsWith('<詞 ')) {
        const w = m[2].trim();
        if (!w || !WORD_G.test(w)) continue;
        WORD_G.lastIndex = 0;
        touch(w).formula++;
        const b = /b="([^"]*)"/.exec(m[1])?.[1] ?? '';
        const j = /j="([^"]*)"/.exec(m[1])?.[1] ?? '';
        const prev = existing.get(w);
        if (!prev) existing.set(w, { b, j });
        else if (prev.b !== b || prev.j !== j) conflicting.add(w);
      } else if (m[3]) {
        for (const w of m[3].match(WORD_G) ?? []) {
          const s = touch(w);
          s.plain++;
          s.books.add(book);
        }
      }
    }
  }
  return { words, existing, conflicting };
};

/** 拆分表：`詞=詞件-詞件…`（IAST）。空行、`#` 註解跳過。 */
export const loadDecomp = (file: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const word = line.slice(0, eq).trim();
    const parts = line.slice(eq + 1).trim().split('-').map((s) => s.trim()).filter(Boolean);
    if (word && parts.length >= 2) out.set(word, parts);
  }
  return out;
};

/** 所有手改／既有拆分表（順序＝優先序）。 */
export const decompTables = (): [string, Map<string, string[]>][] => [
  ['manual', loadDecomp(join(CS_SRC, 'decomp-manual.txt'))],
  ['manual2', loadDecomp(join(CS_SRC, 'decomp-manual2.txt'))],
  ['aux', loadDecomp(join(CS_SRC, 'decomp-aux.txt'))],
  ['kmj', loadDecomp(join(CS_SRC, 'decomp-kmj.txt'))],
];

/** `lexeme.txt`（`儉約巴利,次數`）→ IAST 詞表。只用來充實「可查的詞」詞表。 */
export const loadLexemes = (): string[] => {
  const out: string[] = [];
  let text = '';
  try {
    text = readFileSync(join(CS_SRC, 'lexeme.txt'), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const w = line.split(',')[0]?.trim();
    if (!w) continue;
    try {
      const iast = toIAST(w);
      if (iast && !iast.includes('?')) out.push(iast);
    } catch {
      /* 壞掉的就跳過 */
    }
  }
  return out;
};

/** OpenTipitaka 字典（唯讀）。沒有檔案就回 null，呼叫端要能只靠本地表跑。 */
export interface Dictionaries {
  /** 詞形（IAST）→ pwa 的詞幹序列；單詞或查不到回 null */
  pwa: (word: string) => { hyphen: string[]; stems: string[] } | null;
  /** dpd 詞頭 → 構詞分析（`a + b + c`） */
  dpd: (word: string) => string[] | null;
  /** 這個詞形是不是可查的詞（pwa 詞形、dpd 詞頭、CST 既有詞件、lexeme 表都算） */
  known: (word: string) => boolean;
  /** 詞表大小（報告用） */
  lexiconSize: number;
  close: () => void;
}

export const openDictionaries = (extra: Iterable<string> = []): Dictionaries | null => {
  let db: Database;
  try {
    db = new Database(DICT_DB, { readonly: true });
  } catch {
    return null;
  }
  const qPwa = db.query('select dict_content from pwa where dict_key = ? limit 1');
  const qDpd = db.query('select dict_content from dpd where dict_key = ? limit 3');

  // 詞表：pwa 詞形（含變格）＋ dpd 詞頭＋呼叫端補的（CST 既有詞件、lexeme 表）。
  const lexicon = new Set<string>();
  for (const r of db.query('select dict_key from pwa').all() as { dict_key: string }[]) lexicon.add(r.dict_key);
  for (const r of db.query('select dict_key from dpd').all() as { dict_key: string }[]) lexicon.add(r.dict_key);
  for (const w of extra) if (w) lexicon.add(w);

  const clean = (s: string): string => {
    let x = s.trim();
    if (x.includes('>')) x = x.split('>').pop()!.trim();
    return x.replace(/[\[\]*√]/g, '').replace(/^\d+|\d+$/g, '').trim();
  };

  return {
    pwa(word) {
      const row = qPwa.get(word) as { dict_content: string } | null;
      if (!row) return null;
      const content = row.dict_content;
      const hyphen = content.split('(')[0].trim().split('-').map((s) => s.trim()).filter(Boolean);
      const m = /\(([^()]*)\)\s*$/.exec(content);
      const stems = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
      if (!hyphen.length && !stems.length) return null;
      return { hyphen, stems };
    },
    dpd(word) {
      for (const row of qDpd.all(word) as { dict_content: string }[]) {
        const lines = row.dict_content.split('\n');
        if (!(lines[0] ?? '').includes('comp')) continue;
        const cons = lines.find((l) => l.includes('+'));
        if (!cons) continue;
        const parts = cons.split('+').map(clean).filter(Boolean);
        if (parts.length >= 2 && parts.every((p) => /^[a-zA-Zāīūṅñṭḍṇḷṃ]+$/.test(p))) return parts;
      }
      return null;
    },
    known(word) {
      return lexicon.has(word);
    },
    lexiconSize: lexicon.size,
    close() {
      db.close();
    },
  };
};
