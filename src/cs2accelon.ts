#!/usr/bin/env bun
/**
 * 巴利底本（`D:\2023\cs`，VRI／CST4 → 儉約巴利 offtext）→ Accelon XML。
 *
 *   bun run src/cs2accelon.ts            # 轉檔（data/cs/）＋驗收
 *   bun run src/cs2accelon.ts --check    # 只驗收，不寫檔
 *
 * 與其他譯本不同，這一批的來源是 **provident-pali**（儉約巴利）＋**詞譜**，所以要：
 *   ① 轉成 IAST（作者 2026-11-02：「第一步先把 provident-pali 轉成 IAST」）
 *   ② 保留「拆詞／連音」資訊：`<辭 b="詞譜分段" j="連音編號">正詞</辭>`（見 src/provident-text.ts）
 *   ③ 塊 id 唯一化：義注加 `a`、複注加 `t`、再複注加 `x`（作者 2026-11-02）
 *   ④ provident-pali 只在轉檔時用，adb 與閱讀器不引用它
 *
 * 範圍：四部尼柯耶的**根本經** 22 冊 ＋ 清淨道論（vs）＋ 攝阿毘達磨義論（aas）＝ 24 冊
 * （＝ `cs.lst` 的範圍再加 aas）。注疏 35 冊暫不進來：來源的塊 id 有 `dNaN`／`mNaN`／`sNaN`
 * 與同檔重複（例 an2a 的 `a2` 出現 3 次），要先修 id 才能加 `a`／`t`／`x`（見 docs/steps.md §5）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertOffDir, escapeText, readTag, reportText, ruleOf } from '../../adb-converter/ts/tools/off2accelon';
import { providentText } from './provident-text';
import { PROFILES, ROOT } from './profiles';
// @ts-expect-error 沒有型別宣告（純 JS 套件）
import { orthOf, toIAST, fromIAST } from 'D:/2023/provident-pali/index.js';

const BUILD = join(ROOT, 'out');

/**
 * 由 `books/*.xml` 產生的書（`src/books2off.ts`）：來源本來就是 IAST，不是儉約巴利，
 * 所以不能再過 provident 解碼器（會把 `buddhaṃ` 解成別的字），只做轉義、不產 `<辭>`。
 */
const IAST_BOOKS = new Set<string>();
{
  const man = join(ROOT, 'out', 'books2off.tsv');
  if (existsSync(man)) {
    for (const line of readFileSync(man, 'utf8').trimEnd().split('\n').slice(1)) {
      const [book, , , , script] = line.split('\t');
      if (book && script === 'iast') IAST_BOOKS.add(book);
    }
  }
}

/**
 * 預設保留原本 provident→IAST 的輸出；`--cst-raw` 只做實驗：
 * 它會改變行長／換行，實測 `cv` 等書的 line count 會和現有譯本對齊版不同。
 * 要 CST-raw 且分句一致，必須用「現有行骨架」逐行換字，不能直接重跑轉檔。
 */
const RAW_CST = process.argv.includes('--cst-raw');

/** 正文轉寫：CST-raw 模式只做 XML 轉義；舊模式才走 provident。 */
const textOf = (s: string, plain: boolean, book?: string): string =>
  RAW_CST ? escapeText(s) : (book && IAST_BOOKS.has(book) ? escapeText(s) : providentText(s, plain));

/**
 * 四部尼柯耶的根本經（22 冊）＋ 注疏（義注／複注／再複注 28 冊）＋ 論書 2 冊。
 * 順序：一個部類裡「先根本經、再注疏」，這樣注疏才會落在對的 `區` 底下（沒有 `^ak` 的書靠前一個 `區`）。
 */
const BOOKS = [
  'dn1', 'dn2', 'dn3', 'dn1a', 'dn1t', 'dn1u1', 'dn1u2', 'dn2a', 'dn2t', 'dn3a', 'dn3t',
  'mn1', 'mn2', 'mn3', 'mn1a', 'mn1t', 'mn2a', 'mn2t', 'mn3a', 'mn3t',
  'sn1', 'sn2', 'sn3', 'sn4', 'sn5', 'sn1a', 'sn1t', 'sn2a', 'sn2t', 'sn3a', 'sn3t', 'sn4a', 'sn4t', 'sn5a', 'sn5t',
  'an1', 'an2', 'an3', 'an4', 'an5', 'an6', 'an7', 'an8', 'an9', 'an10', 'an11',
  'an1a', 'an1t', 'an2a', 'an2t', 'an3a', 'an3t', 'an4a', 'an4t',
  'vs', 'vsnk', 'vs0a',
  // 律藏：cv 先開 `區 vin`，其餘跟在後面
  'cv', 'pj', 'pc', 'mv', 'pvr', 'pvr0t',
  'cv0a', 'cv0t', 'mv0a', 'mv0t', 'pc0a', 'pc0t', 'pj0a', 'pj0t', 'pvr0a', 'sd0t',
  // 小部：ja1 先開 `區 kn`
  'ja1', 'ja1a1', 'ja1a2', 'ja1a3', 'ja1a4', 'ja2', 'ja2a1', 'ja2a2', 'ja2a3',
  'kp', 'kp0a', 'dhp', 'dhp0a', 'ud', 'ud0a', 'iti', 'iti0a', 'thag', 'snp0a',
  'bv', 'bv0a', 'cnd', 'cnd0a', 'cp', 'cp0a', 'mnd', 'mnd0a', 'ne', 'ne0a', 'ne0t', 'ne0u', 'ps', 'ps0a',
  'pv', 'pv0a', 'snp', 'thag0a1', 'thap', 'thap0a', 'thig', 'thig0a', 'thig0a2', 'thip', 'vv', 'vv0a',
  'aas', 'aas0a',
  'ds', 'ds0a', 'ds0t', 'dt', 'kv', 'pp', 'pt0a', 'pt0t', 'pt1', 'pt2', 'pt3', 'pt4', 'pt5',
  'vb', 'vb0a', 'vb0u', 'ya1', 'ya2', 'ya3',
  // 其他（*_nrf：不屬六部類的典籍、史書、文法、注疏）
  'aas0t', 'aas0u', 'adn', 'adv', 'bggv', 'cgv', 'dmtp', 'ds0u', 'kcybk', 'ksms', 'kvpn', 'kvpt',
  'mglsp', 'mhmp', 'mil', 'mvp', 'ndn', 'nmjr', 'nmkr', 'pcy', 'pe', 'pmdp', 'pt0u', 'ptdp',
  'rsvh', 'stp', 'svpd', 'tpvs', 'vbt', 'vinsg', 'vlkt', 'vncy', 'vncy0a', 'vtsm', 'vvt',
  // 沒有書 id 的 nrf 文獻（文法、史書、儀軌）：書名取自 TEI，id 用檔名
  'e0603n_nrf_xml', 'e0604n_nrf_xml', 'e0605n_nrf_xml', 'e0606n_nrf_xml', 'e0607n_nrf_xml',
  'e0803n_nrf_xml', 'e0804n_nrf_xml', 'e0805n_nrf_xml', 'e0806n_nrf_xml', 'e0807n_nrf_xml',
  'e0808n_nrf_xml', 'e0809n_nrf_xml', 'e0810n_nrf_xml', 'e0811n_nrf_xml', 'e0812n_nrf_xml',
  'e0813n_nrf_xml', 'e0902n_nrf_xml', 'e0903n_nrf_xml', 'e0904n_nrf_xml', 'e0905n_nrf_xml',
  'e0906n_nrf_xml', 'e0907n_nrf_xml', 'e1003n_nrf_xml', 'e1004n_nrf_xml', 'e1005n_nrf_xml',
  'e1006n_nrf_xml', 'e1007n_nrf_xml', 'e1008n_nrf_xml', 'e1009n_nrf_xml', 'e1010n_nrf_xml',
  'e1102n_nrf_xml', 'e1103n_nrf_xml', 'e1203n_nrf_xml', 'e1204n_nrf_xml', 'e1205n_nrf_xml',
  'e1206n_nrf_xml', 'e1207n_nrf_xml', 'e1208n_nrf_xml', 'e1209n_nrf_xml', 'e1210n_nrf_xml',
  'e1211n_nrf_xml', 'e1212n_nrf_xml', 'e1213n_nrf_xml', 'e1214n_nrf_xml', 'e1215n_nrf_xml',
].filter((b) => existsSync(join(ROOT, 'out', 'cs-src', `${b}.cs.off`)));

/**
 * 書 id 的層級尾綴：義注 `a`、複注 `t`、再複注 `x`（根本經不加）。
 * `dn1a`→a、`dn1t`→t、`dn1u1`／`dn1u2`→x、`aas0a`→a…；`vs`／`aas`／`dn1` 這類回空字串。
 */
const layerOf = (book: string): string => {
  const m = /^(.*?)0?([atu])\d?$/.exec(book);
  if (!m) return '';
  return m[2] === 'a' ? 'a' : m[2] === 't' ? 't' : 'x';
};

/**
 * 注疏的塊 id：來源全壞（`dNaN`／`mNaN`／`sNaN`），要照標題序重編。
 * `out/atta-ids.tsv` 是 `src/cs-atta-ids.ts` 的試算結果（每本書依出現順序一行），
 * 這裡照同一個順序取用；根本經沒有這張表，就只加層綴（＝空字串）。
 */
/**
 * 注疏的塊 id 已經在 `out/cs-src/` 的副本裡改好（`src/cs-atta-normalize.ts`），
 * 所以這裡不用再換；根本經本來就是 `d1`／`a6` 這種，也不需要層綴。
 */
const ckTransform = (id: string): string => id;

/** 沒有 `^ak` 的書：aas 歸「阿毘達磨」，其餘照舊（部類代碼）。 */
const areaOf = (book: string): string => {
  if (book === 'aas') return 'abh';
  if (book === 'cv') return 'vin';
  if (book === 'ja1') return 'kn';
  if (book === 'aas0t') return 'anya'; // 其他類（*_nrf）的第一冊開「區 anya」
  if (/^(dn|mn|sn|an)1$/.test(book)) return book.slice(0, -1); // 沒有 ^ak 的庫才需要
  return '';
};

/** 詞（含詞譜）：與 provident-text.ts 的切詞一致。 */
const WORD_G = /[A-Za-z]+\d[\dA-Za-z]*|[A-Za-z]+/g;
const FORMULA_G = /[A-Za-z]+\d[\dA-Za-z]*/g;
const LETTER_G = /[\p{L}\p{M}]+/gu;

/** 夾文後面緊接的文字算節點名字的一部分（與共用轉換器的 JOIN_FOLLOW 一致）。 */
const JOIN_FOLLOW = new Set(['ak', 'bk', 'ck', 'ckan', 'cksn']);

/** 一行 off → 文字片段（標籤外的文字、以及夾文）；`name`＝這是節點名字（不會有 `<辭>`）。 */
function runs(line: string): { text: string; name: boolean }[] {
  const out: { text: string; name: boolean }[] = [];
  let i = 0;
  let pendingName = false;
  for (;;) {
    const at = line.indexOf('^', i);
    if (at < 0) {
      if (i < line.length) out.push({ text: line.slice(i), name: pendingName });
      return out;
    }
    if (at > i) {
      out.push({ text: line.slice(i, at), name: pendingName });
      pendingName = false;
    }
    const t = readTag(line, at);
    if (!t) {
      out.push({ text: line[at], name: false });
      i = at + 1;
      continue;
    }
    if (t.inner) {
      const isBlock = ruleOf(t.name, t.id)?.kind === 'block';
      out.push({ text: t.inner, name: isBlock });
      pendingName = isBlock && JOIN_FOLLOW.has(t.name);
    } else {
      pendingName = false;
    }
    i = t.end;
  }
}

/** 來源是 IAST 的書要用 Unicode 斷詞（WORD_G 只認 ASCII，會把 ā 切開）。 */
const countWordsOf = (s: string): number => (s.match(LETTER_G) ?? []).length;
const countWords = (s: string): number => (s.match(WORD_G) ?? []).length;
const countFormulas = (s: string): number => (s.match(FORMULA_G) ?? []).length;

interface CheckRow {
  book: string;
  lines: [number, number];
  segs: [number, number];
  chunks: [number, number];
  words: [number, number];
  ci: number;
  ciFallback: number;
  ciBroken: number;
  ciBad: string[];
}

/** 逐書驗收：行、段、塊、詞數，以及 `<辭 b j>` 與夾文是否一致。 */
function checkBooks(): CheckRow[] {
  const src = existsSync(join(ROOT, 'out', 'cs-src'))
    ? join(ROOT, 'out', 'cs-src')
    : PROFILES.cs.srcDir; // 有正規化副本就用它（注疏的塊 id 已修好，不會被大寫 id 切斷）
  const out = PROFILES.cs.outDir;
  const rows: CheckRow[] = [];
  for (const book of BOOKS) {
    const s = readFileSync(join(src, `${book}.cs.off`), 'utf8').replace(/\r\n?/g, '\n').split('\n');
    if (s.length && s[s.length - 1] === '') s.pop();
    const o = readFileSync(join(out, `${book}.xml`), 'utf8').trimEnd().split('\n');
    const count = (re: RegExp, ls: string[]) => ls.reduce((n, l) => n + (l.match(re) ?? []).length, 0);

    let srcWords = 0;
    let expectCi = 0;
    for (const line of s) {
      // 有引用連結的行不比字數：`^t@ds.641-642g3` 這類目標會搬進 `<聯 j=…>`，
      // 兩邊的「字」本來就不對等（不是掉字）。
      if (line.includes('^t@')) continue;
      for (const r of runs(line)) {
        srcWords += (IAST_BOOKS.has(book) ? countWordsOf : countWords)(r.text);
        if (!r.name && !IAST_BOOKS.has(book)) expectCi += countFormulas(r.text);
      }
    }
    const outText = o.map((l) => (l.includes('<聯') ? '' : l.replace(/<[^<>]*>/g, '')));
    const counted = o.filter((_, i) => !s[i]?.includes('^t@'));
    const outWords = outText.reduce((n, l) => n + (l.match(LETTER_G) ?? []).length, 0);

    const row: CheckRow = {
      book,
      lines: [s.length, o.length],
      segs: [count(/\^n\d/g, s), count(/<段 /g, o)],
      chunks: [count(/\^(ck|ckan|cksn)/g, s), count(/<塊 |<小塊 /g, o)],
      words: [srcWords, outWords],
      ci: counted.reduce((n, l) => n + (l.match(/<辭 /g) ?? []).length, 0),
      ciFallback: counted.reduce((n, l) => n + (l.match(/<辭 f=/g) ?? []).length, 0),
      ciBroken: 0,
      ciBad: [],
    };
    if (!RAW_CST) {
    // 一致性：b（詞譜分段）＋ j（連音編號）→ 詞譜 → 正詞，要對得上夾文；
    // 另一條獨立路徑是把夾文用 fromIAST 轉回儉約巴利再比。兩邊相等才算過。
    for (const m of o.join('\n').matchAll(/<辭 b="([^"]*)" j="([^"]*)">([^<>]*)<\/辭>/g)) {
      const [, bases, joiners, display] = m;
      const parts = bases.split('|');
      const digits = joiners.split(',');
      if (parts.length !== digits.length + 1) {
        if (row.ciBad.length < 5) row.ciBad.push(`段數不符 ${bases} / ${joiners}`);
        continue;
      }
      let f = parts[0];
      for (let i = 0; i < digits.length; i++) f += digits[i] + (parts[i + 1] ?? '');
      let fromFormula = '';
      try {
        fromFormula = toIAST(orthOf(f));
      } catch {
        fromFormula = '';
      }
      const fromDisplay = toIAST(fromIAST(display));
      if (fromFormula.includes('??')) {
        // 來源的詞譜本身就壞（例 an7 的 `dVvy3dVvy0smAptVtIM`）：b／j 仍一字不差，
        // 只是 provident-pali 還原不出來，記一筆不算錯
        row.ciBroken++;
      } else if (fromFormula !== display && row.ciBad.length < 5) {
        row.ciBad.push(`${bases}+${joiners} → ${fromFormula} ≠ ${display}`);
      } else if (fromDisplay !== display && row.ciBad.length < 5) {
        row.ciBad.push(`夾文回不去：${display} → ${fromDisplay}`);
      }
    }
    }
    // 期望的詞譜數：正文（非節點名字）裡的詞譜詞。名字裡的詞譜只轉 IAST，不建 `<辭>`。
    // 另外 `data/cs-decomp/splits.tsv` 會**補**上沒有詞譜的詞，所以實際數只會多、不會少。
    if (!RAW_CST && row.ci < expectCi && row.ciBad.length < 5) {
      row.ciBad.push(`詞譜數 ${row.ci} < 正文詞譜詞 ${expectCi}（有掉字）`);
    }
    rows.push(row);
  }
  return rows;
}

const pad = (n: number, w = 6) => String(n).padStart(w);

function printCheck(rows: CheckRow[]): boolean {
  let ok = true;
  const same = <T,>(p: [T, T]) => p[0] === p[1];
  console.log('書      行數        段        塊        字母數      詞譜  問題');
  for (const r of rows) {
    const good = same(r.lines) && same(r.segs) && same(r.chunks)
      && (RAW_CST || same(r.words)) && !r.ciBad.length;
    if (!good) ok = false;
    console.log(
      r.book.padEnd(6),
      `${pad(r.lines[0])}${same(r.lines) ? ' ' : '≠'}`,
      `${pad(r.segs[0])}${same(r.segs) ? ' ' : '≠'}`,
      `${pad(r.chunks[0])}${same(r.chunks) ? ' ' : '≠'}`,
      `${pad(r.words[0], 8)}${same(r.words) ? ' ' : '≠'}`,
      pad(r.ci),
      r.ciFallback ? `f=${r.ciFallback}` : '',
      good ? '' : `✗ ${r.ciBad[0] ?? ''}`,
    );
  }
  const sum = (f: (r: CheckRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  console.log(
    `合計 ${rows.length} 冊：${sum((r) => r.lines[0])} 行、${sum((r) => r.segs[0])} 段、` +
      `${sum((r) => r.chunks[0])} 塊、${sum((r) => r.words[0])} 字母詞、${sum((r) => r.ci)} 個詞譜` +
      (sum((r) => r.ciFallback) ? `、${sum((r) => r.ciFallback)} 個退回 f=` : ''),
  );
  return ok;
}

if (import.meta.main) {
  const check = process.argv.includes('--check');
  if (!check) {
    console.log(`== cs ==  ${PROFILES.cs.srcDir} → ${PROFILES.cs.outDir}  （${BOOKS.length} 冊）`);
    const result = await convertOffDir({
      ...PROFILES.cs,
      srcDir: join(ROOT, 'out', 'cs-src'),
      books: BOOKS,
      text: textOf,
      ckTransform,
      areaOf,
      cleanupFile: join(BUILD, 'cs-cleanup.tsv'),
      log: (m) => console.log(m),
    });
    mkdirSync(BUILD, { recursive: true });
    writeFileSync(join(BUILD, PROFILES.cs.report!), reportText(result), 'utf8');
    console.log(`報告：${join(BUILD, PROFILES.cs.report!)}`);
  }
  if (!existsSync(join(PROFILES.cs.outDir, '00.xml'))) {
    console.error('還沒有 data/cs/00.xml，先跑一次轉檔');
    process.exit(2);
  }
  console.log('\n== 驗收 ==');
  const ok = printCheck(checkBooks());
  console.log(ok ? '✓ 全部相符' : '✗ 有差異');
  if (!ok) process.exit(1);
}
