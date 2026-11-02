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

export const PROFILES: Record<string, Profile> = {
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
    srcDir: 'D:/2023/cs-xsq/off',
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
  // 朱拉隆功泰譯巴利三藏（cllk）：來源是 html，不是 .off，
  // 由 src/cllk2accelon.ts 轉檔（不放 glob，off2accelon 會跳過）。
  cllk: {
    srcDir: 'D:/2023/cllk/html',
    outDir: join(ROOT, 'data', 'cllk'),
    dbname: 'cllk',
    dbcname: '朱拉隆功泰譯巴利三藏',
    enname: 'Thai Tipitaka (MCU)',
    report: 'cllk-report.txt',
  },
  // 巴利底本（VRI／CST4 → 儉約巴利＋詞譜）：正文要轉 IAST、保留拆詞，
  // 由 src/cs2accelon.ts 轉檔（不放 glob，off2accelon 會跳過）。
  cs: {
    srcDir: 'D:/2023/cs/off',
    outDir: join(ROOT, 'data', 'cs'),
    strip: '.cs.off',
    dbname: 'cs',
    dbcname: '巴利三藏（VRI／CST4）',
    enname: 'Pali Tipitaka (VRI)',
    report: 'cs-report.txt',
  },
};
