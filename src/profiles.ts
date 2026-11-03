/**
 * 各譯本的來源與輸出設定（off2accelon.ts 轉檔、pack.ts 打包共用）。
 * 只放資料，不含流程，所以誰 import 都安全。
 */
import { join } from 'node:path';
import type { ConvertOptions } from '../../adb-converter/ts/tools/off2accelon';

export const ROOT = join(import.meta.dir, '..');
export interface Profile extends ConvertOptions {
  /** 報告檔名（放 out/） */
  report: string;
  /** 打包後的 adb 名稱（預設同 key） */
  adb?: string;
}

/**
 * 平行文本群（2026-11-02 作者指示：不要寫死在閱讀器裡）。
 *
 * 值＝**上游／基準庫的 dbname**，pack 時寫進 `00.xml` 的 `<集 p="…">`。
 * 這一批巴利譯本共用 CST 的 `段` 編號，基準是 `cs`（VRI／CST4）；閱讀器看到
 * `<集 p="cs">` 就只把同群的庫列進「對讀」選單，不會把《原人歌》連到巴利藏。
 */
export const PARALLEL_GROUP: Record<string, string> = {
  cs: 'cs',
  'cs-split': 'cs',
  'cs-mm': 'cs',
  sc: 'cs',
  yh: 'cs',
  ccc: 'cs',
  xsq: 'cs',
  pku: 'cs',
  hz: 'cs',
  kmj: 'cs',
  cllk: 'cs',
};

export const PROFILES: Record<string, Profile> = {
  // 實驗（2026-11-03）：dn1–dn3 的正文先把複合詞拆成空白，reader 不必揹拆分詞庫。
  // 來源是 data/cs 轉寫，見 src/cs-split-exp.ts；只供實驗，不取代 cs。
  'cs-split': {
    outDir: join(ROOT, 'data', 'cs-split'),
    srcDir: '',
    glob: '',
    strip: '',
    dbname: 'cs-split',
    dbcname: '巴利（拆詞實驗）',
    enname: 'Pali (word-split experiment)',
    report: 'cs-split-report.txt',
  },
  // 巴利底本（data/cs 已由 cs2accelon 轉成 IAST／詞譜；pack 只負責打包）
  cs: {
    srcDir: 'D:/2023/cs/off',
    outDir: join(ROOT, 'data', 'cs'),
    glob: '*.cs.off',
    strip: '.cs.off',
    dbname: 'cs',
    dbcname: '巴利三藏（VRI／CST4）',
    enname: 'Pali Tipitaka (VRI)',
    report: 'cs-report.txt',
  },
  // 緬譯巴利藏（PnDaza app 的 HTML → off）。正文 `.mm.off`、註文 `-fn.off`。
  'cs-mm': {
    srcDir: 'D:/2023/cs-mm/off',
    outDir: join(ROOT, 'data', 'cs-mm'),
    glob: '*.mm.off',
    strip: '.mm.off',
    notesSuffix: '-fn.off',
    notesOutSuffix: '-fn',
    dbname: 'cs-mm',
    dbcname: '緬譯巴利藏',
    enname: 'Tipitaka Myanmar',
    report: 'cs-mm-report.txt',
  },
  // 巴利原文（SuttaCentral bilara-data → offtext）。沒有註文檔。
  sc: {
    srcDir: 'D:/2023/sc/sc-pli.offtext',
    outDir: join(ROOT, 'data', 'sc'),
    glob: '*.ms.off',
    strip: '.ms.off',
    dbname: 'sc',
    dbcname: '巴利三藏（SuttaCentral）',
    enname: 'Pali Tipitaka (SuttaCentral)',
    report: 'sc-report.txt',
  },
  // 英譯（SuttaCentral bilara-data）：`*.sc.off`；段號 `^n` 與 cs 相同（2026-11-03 新增）
  'sc-en': {
    srcDir: 'D:/2023/sc/off',
    outDir: join(ROOT, 'data', 'sc-en'),
    glob: '*.sc.off',
    strip: '.sc.off',
    dbname: 'sc-en',
    dbcname: '英譯（SuttaCentral）',
    enname: 'English Translation (SuttaCentral)',
    report: 'sc-en-report.txt',
  },
  // 元亨寺南傳大藏經（cb-n）：正文 `*.yh.off`、註文 `*.yh.tsv`（編號 → 注文）
  yh: {
    srcDir: 'D:/2023/cb-n/off',
    outDir: join(ROOT, 'data', 'yh'),
    glob: '*.yh.off',
    strip: '.yh.off',
    notesTsv: '.yh.tsv',
    dbname: 'yh',
    dbcname: '元亨南傳大藏經',
    report: 'yh-report.txt',
  },
  // 莊春江巴利藏中譯（ccc）
  ccc: {
    srcDir: 'D:/2023/ccc/off',
    outDir: join(ROOT, 'data', 'ccc'),
    glob: '*.ccc.off',
    strip: '.ccc.off',
    dbname: 'ccc',
    dbcname: '莊春江巴利藏中譯',
    report: 'ccc-report.txt',
  },
  // 蕭式球譯四部尼柯耶（cs-xsq）：檔名沒有中間名，`dn1.off` 這樣
  xsq: {
    // 2026-11-03：改用 D:/2023/xsq/off（有 ^n 段號）→ out/xsq-src（拉掉 ^m）；見 src/xsq-src.ts
    srcDir: join(ROOT, 'out', 'xsq-src'),
    outDir: join(ROOT, 'data', 'xsq'),
    glob: '*.off',
    strip: '.off',
    dbname: 'xsq',
    dbcname: '蕭式球譯四部尼柯耶',
    // 來源的 dn2／dn3 塊 id 壞掉（全部是 $1）：依出現順序換成 d15–d23、d25–d34
    // （d14／d24 沒有塊標記，是檔首的經文，保持原樣）
    ckIds: {
      dn2: ['d15', 'd16', 'd17', 'd18', 'd19', 'd20', 'd21', 'd22', 'd23'],
      dn3: ['d25', 'd26', 'd27', 'd28', 'd29', 'd30', 'd31', 'd32', 'd33', 'd34'],
    },
    report: 'xsq-report.txt',
  },
  // 法勝巴利佛典（sutra-mobi/cs-pku）
  pku: {
    srcDir: 'D:/2023/sutra-mobi/cs-pku.offtext',
    outDir: join(ROOT, 'data', 'pku'),
    glob: '*.pku.off',
    strip: '.pku.off',
    dbname: 'pku',
    dbcname: '法勝巴利佛典',
    report: 'pku-report.txt',
  },
  // 巴利佛典譯叢（杭州佛學院，sutra-mobi/off）
  hz: {
    srcDir: 'D:/2023/sutra-mobi/off',
    outDir: join(ROOT, 'data', 'hz'),
    glob: '*.hz.off',
    strip: '.hz.off',
    dbname: 'hz',
    dbcname: '巴利佛典譯叢（杭州佛學院）',
    enname: 'Pali Text in Mandarin',
    report: 'hz-report.txt',
  },
  // 光明寺日譯（kmj）
  kmj: {
    srcDir: 'D:/2023/kmj/off',
    outDir: join(ROOT, 'data', 'kmj'),
    glob: '*.kmj.off',
    strip: '.kmj.off',
    dbname: 'kmj',
    dbcname: '光明寺日譯',
    report: 'kmj-report.txt',
  },
  // 朱拉隆功泰譯（cllk）：cllk2accelon.ts 直接讀 html，data/cllk 已是 Accelon XML
  cllk: {
    srcDir: 'D:/2023/cllk/html',
    outDir: join(ROOT, 'data', 'cllk'),
    glob: '*.html',
    strip: '.html',
    dbname: 'cllk',
    dbcname: '泰譯巴利三藏（朱拉隆功大學）',
    enname: 'Thai Tipitaka (MCU)',
    report: 'cllk-report.txt',
  },
};
