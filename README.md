# sz — 新三藏（`sz.adb`）建置工作區

這個 repo 放**新三藏**的來源資料、轉換與打包腳本。通用的 adb 讀寫／打包工具在隔壁的
[`adb-converter`](../adb-converter) 工作區；閱讀器與官網也由那邊維護。

> **現況（2026-11-09）**：十種譯本都已轉好並打包成 adb，放 `accelon26/`
> （`cs.adb`、`ped.adb`…；adb 不進 git）。**接手先讀 [`HANDOVER.md`](HANDOVER.md)**：
> 現況、2026-11-06 的 cs 詞譜 `<詞>` → `<辭>`、重建與驗收指令、待辦與已知的坑。
> 定位標準仍是 **`塊.段`（`ck.n`）**——`ck` 是 chunk、`n` 是段號（例 `a6.7`），
> 跨語言穩定、和原書頁碼無關；頁 id（`<頁 id="塊.段">`）之後才補。

- 版控：<https://github.com/accelon/sz>（分支 `main`）
- 成品：`D:\2026\sz\accelon26\sz.adb`（建置後才會有；不進 git；所有 adb 一律放 `accelon26/`）
- 母工作區：`D:\2026\adb-converter`（共用工具、紀律、版本紀錄）

## 1. 來源與現況

| 譯本 | 來源（唯讀） | 轉出的文字 | 段序列 | 狀態 |
|---|---|---|---|---|
| **巴利底本（VRI／CST4）** | `D:\2023\cs\off`（`*.cs.off`，儉約巴利＋詞譜） | `data/cs/`（219 冊） | ✅ | ✅ 轉 IAST、保留詞譜（437,557 個 `<辭>`；2026-11-06 由 `<詞>` 改名） |
| 巴利原文（SuttaCentral） | `D:\2023\sc\sc-pli.offtext`（`*.ms.off`） | `data/sc/` | ✅ | ✅ |
| 緬譯巴利藏 | `D:\2023\cs-mm\off`（`*.mm.off`＋`*-fn.off`） | `data/cs-mm/`＋註文檔 | ✅ | ✅ |
| 元亨寺南傳大藏經 | `D:\2023\cb-n\off`（`*.yh.off`＋`*.yh.tsv`） | `data/yh/`＋註文檔 | ✅ | ✅ |
| 莊春江 | `D:\2023\ccc\off`（`*.ccc.off`） | `data/ccc/` | ✅ | ✅（無註文檔） |
| 蕭式球 | `D:\2023\xsq\off`（`*.xsq.off`，先經 `src/xsq-src.ts` 拉掉 PTS 段號 `^m`） | `data/xsq/`（22 冊） | ✅ | ✅ 段號 `^n` 與 cs 相同（6,554） |
| 法勝巴利佛典 | `D:\2023\sutra-mobi\cs-pku.offtext`（`*.pku.off`） | `data/pku/` | ✅ | ✅（只有 dn1–3） |
| 杭州佛學院 | `D:\2023\sutra-mobi\off`（`*.hz.off`） | `data/hz/` | ✅ | ✅（只有 dn1–3、mn1–3） |
| 光明寺日譯 | `D:\2023\kmj\off`（`*.kmj.off`） | `data/kmj/`（22 冊） | ✅ | ✅（`sn3` 多出的 `^n553` 由 `src/kmj-line-patch.ts` 拿掉） |
| 英譯（SuttaCentral） | `D:\2023\sc\off`（`*.sc.off`；註在 `notes.json`，不轉） | — | — | ⬜ 未轉 |

- 八庫都已轉成 **Accelon XML**（一行一個 adb 行），規則見母區
  [`docs/adb/off-to-accelon.md`](../adb-converter/docs/adb/off-to-accelon.md)；
  泰譯（`cllk`）已於 2026-11-02 搬到 `D:\2026\cllk`（四部＋小部 31 冊），不在本區。
- **巴利底本 `cs`** 是另一條管線：來源是儉約巴利＋詞譜，`src/cs2accelon.ts` 轉成
  IAST，並把每個詞譜詞留成 `<辭 b="詞譜分段" j="連音編號">正詞</辭>`（拆詞／連音不丟）。
  provident-pali 只在轉檔時用，adb 不引用它。範圍 **219 冊**（律、四部、小部、阿毘達磨及其注疏；`off/` 57 冊＋由 `books/`／`ro/` 產生 82 冊），
  注疏的塊 id 在來源是壞的，轉換前先跑 `src/cs-atta-ids.ts` ＋ `src/cs-atta-normalize.ts`
  （見 [`docs/steps.md`](docs/steps.md) §1.1、[`docs/known-issues.md`](docs/known-issues.md) #1）。
- **CST `deva master` 直譯版（2026-11-03，已換進 `data/cs`）**：`bun run src/cs-deva-iast.ts`
  從 `raw/cst-deva/`（accelon/tipitaka-xml，VipassanaTech 的 fork，commit `2d134ff`）的 Devanagari 直接轉 IAST，
  不動行骨架（220 檔、1,028,311 行、359,662 段全部相同）；舊 provident 版留在
  `data/cs.bak-2026-11-02`。作者的 CST 勘誤在 [`data/cs-index/errata.tsv`](data/cs-index/errata.tsv)
  （`bun run src/cs-errata.ts` 重生成，open 的建置時自動套用）；詳見
  [`docs/steps.md`](docs/steps.md) §1.2–§1.3。
- `sc`／`yh`／`ccc`／`pku`／`hz` 的 `段` 序列與 `cs-mm` **完全相同**（6,554 段，部分庫只有幾本）。
- **行數與來源相同**（`<居中>` 等標籤可以和文字同一行，方便捲動比對）；只有少數超長行切開
  （`an8`／`an9`／`an10`／`an11`、hz dn1）。
- 原書頁碼（`^pb`）留在 `<pb n>`，不是定位用的頁；`<頁 id="塊.段">` 之後補。

## 2. 目錄

| 路徑 | 說明 |
|---|---|
| `AGENTS.md` | 這一區的規則；§0 要求先讀母區的紀律文件 |
| `src/` | 轉檔／patch／pack 腳本（建置要能從零重跑） |
| `data/` | **各譯本轉好的文字**（`data/<db>/`，由 `src/off2accelon.ts` 產生；`data/cs/` 由 `src/cs2accelon.ts`）與小型對照表；大檔與 zip 不進版控 |
| `data/cs-mm/` | 緬譯：`<書>.xml`、`<書>-fn.xml`、`00.xml`（其他庫同結構，`yh/` 也有 `-fn.xml`） |
| `accelon26/` | **本機書庫（所有 adb 都放這裡）**：各譯本 `<db>.adb`、`cs.adb`、`cs-lex.adb`、`ped.adb` 等＋ `accelon26.exe`（2026-11-09 RC5 複本；`accelon26.exe.old-2026-11-02` 是更早的備份）；`src/pack.ts` 產生 |
| `docs/` | 這一庫的 steps、來源說明、限制；[`docs/cs-pali-report.md`](docs/cs-pali-report.md) 是巴利底本 `D:\2023\cs` 與儉約巴利的理解報告；[`docs/tipitaka-lk.md`](docs/tipitaka-lk.md) 評估僧伽羅本、[`docs/opentipitaka.md`](docs/opentipitaka.md) 記錄 OpenTipitaka 的資料庫與抽出的對照表；小毛病記在 [`docs/known-issues.md`](docs/known-issues.md) |
| `docs/ped-adb.md` | **SC 精修 PTS PED → `D:\2026\sz\accelon26\ped.adb`**：16,781 筆、246,306 行、17.4 MiB；第一棵樹 `$詞`；標籤 `詞/同形/語法/義/複合/詞源/出處/參見/來源`；`<出處>` 78,809 次接 `cs.adb` 的 `<聯 i="cs?塊.段">`；15,991 個詞頭也加進 lemma map |
| `docs/ped-todo.md` | **PED 待辦規劃與結果**：去 HTML/entity 已完成、PTS→cs 連結 62.6%、注疏待做、GRETIL 盤點 |
| `data/cs-index/` | 外部化的參照表：`tables.tsv`（表→書／書名）、`suttas.tsv`（六經→SC 編號）、`pages.tsv`（紙本頁碼→塊／段／句，113,768 列）、`variants.tsv`（異文 21,294 條）；由 `src/otp-index.ts`／`src/cs-pages.ts`／`src/cs-variants.ts` 產生 |
| `docs/canon-status.md` | **現況總表**：範圍、數字、外部化清單、驗證指令、已知限制 |
| `docs/cs-mm-tokenizer.md` | 緬譯 `cs-mm` 的分詞實測（ICU `Intl.Segmenter('my')`、token 數、已知限制） |
| `docs/cllk-tokenizer.md` | 泰譯 `cllk` 的分詞實測（ICU `Intl.Segmenter('th')`、token 數、已知限制） |
| `docs/kmj-tokenizer.md` | 日譯 `kmj` 的分詞實測（ICU `Intl.Segmenter('ja')`、token 數、已知限制） |
| `docs/cs-token-count.md` | `cs` 842k 相異 token 的組成與「拆詞」策略（不用 provident 反推） |
| `docs/lex-pane.md` | `lex-pane` 詞抽屜：詞形／詞譜／位置／lex 詞條／例句／詞件樹 |
| `docs/grammar-arsenal.md` | **文法武器清單**：手上可用的文法資料、程式與量測（詞譜／拆詞／komyoji／pe5／詞典／索引／UI），按「降低頭痛率」排序，含覆蓋、可信度、缺口與下一步 |
| `docs/sandhi-code.md` | **接縫碼原型**：經文存「詞件＋規則數字」（`sappi0phāṇitaṃ8eva`），tokenizer 切數字、渲染解回組合詞；11 條規則、dn1 實測與 `#` 引用例外 |
| `docs/sandhi-stats.md` | **接縫統計**：四種窗口（1+1／2+1／1+2／2+2）的 `context → sandhi 結果` 全表，按頻次編碼；1+1 只要 3,547 個 pattern，前 500 名覆蓋 97.9% |
| `docs/sandhi-codebook.md` | **1+1 codebook 實測**：全藏快速投影 10.25M 詞；切後頭痛 40%→4.3%（PMD len≥8），surface unique 914,104→96,935，lemma 化後只剩 **14,851 個已知詞幹** |
| `docs/addressing.md` | **定址規格**：`塊.段`／`塊.段:句`／`塊.段:句#詞` 的語法、解析方式、外部化清單 |
| `docs/journal/` | **工作札記（按日期）**：每天做了什麼、為什麼、數字、留給後人的待辦 |
| `docs/insights.md` | **設計理念與洞察紀錄**：為什麼先做句、抓大放小、寧細勿粗、SC 的設計問題、詞庫方向 |
| `docs/sentence-alignment.md` | **句對齊**：四語（cs／sc-en／yh／kmj）詞對齊→段內句對齊的方法、結果與重跑指令；原對齊保留 |
| `docs/segmentation.md` | **斷句觀察與決策紀錄**：SC 標點切法的後遺症、定型句切法不一致、長句待切清單 |
| `out/` | 轉換報告、清除紀錄與中間產物（不進版控） |

## 3. 轉換（從零重跑）

```powershell
cd D:\2026\sz
bun run src/off2accelon.ts            # 全部來源
bun run src/off2accelon.ts cs-mm      # 只轉一個（cs-mm、sc、yh、ccc、xsq、pku、hz、kmj）
bun run src/off2accelon.ts --check    # 驗收全部：沒掉字、<段> 序列、殘留 ^／行長
```

- 轉換器本體在母區 `ts/tools/off2accelon.ts`；這裡只放來源清單與參數（`src/profiles.ts`）。
- 產出：`data/<db>/` 的文字，以及 `out/<db>-report.txt`（逐書統計／警告）。
- **清除紀錄**：來源裡不該有的 HTML／孤立字元，轉換時清掉並逐處記在
  `out/<db>-cleanup.tsv`（書／行／種類／片段）。目前只有 ccc（29 處）與 cs-mm（5 個 `&nbsp;`）。
- 驗收看報告的行數／段／註三欄，以及母區文件的「驗收清單」（沒掉字、段序列一致）。

## 4. 打包成 adb（`accelon26/`）

```powershell
bun run src/pack.ts            # 10 個譯本 → accelon26/<db>.adb
bun run src/pack.ts cs-mm      # 只打一個
```

- 一譯本一個 adb（`cs-mm.adb`、`sc.adb`、`yh.adb`、`ccc.adb`、`xsq.adb`、`pku.adb`、`hz.adb`、`kmj.adb`），
  加上 `cs.adb`；2026-11-02 起全部建全文索引（`tokens` 在）。
- **十個 adb 的 token 必須獨立**：語言與翻譯風格不同，tokenizer／stoplist 不共用。
  `src/pack.ts` 預設建索引；`--no-index` 只留給 tokenizer 還沒定的實驗庫。
- **目錄樹**：每個 adb 有 `<隱><樹 s="*" t="書,塊.">目錄</樹></隱>`（書 → 塊兩層），
  `caches` 容器因此產生；`s="*"` 讓輸入區出現。
- 行序：`00.xml` → 各書（canon 順序）→ 該書的 `<書>-fn.xml`（註文緊接在正文後）。
- 驗證：`bun run src/pack.ts` 會開回來檢查行數與 tokens；`bun run src/toc-check.ts`
  會用閱讀器的 `loadTree`／`buildTree` 檢查目錄樹層級與節點名。
- 資料夾裡另有一個 `accelon26.exe`（**2026-11-09 RC5 的複本**，不是 hardlink）：
  桌面版會列出「工作目錄與 exe 所在資料夾」的 `*.adb`，所以這個資料夾可以直接當書庫開。
  這一顆認得 `<辭>`（`word-spec.ts` 的 `tag !== '詞' && tag !== '辭'`）；
  `accelon26.exe.old-2026-11-02` 是更早的備份。

## 5. 開工前先讀

0. [`HANDOVER.md`](HANDOVER.md)（**交接手冊**：現況、已完成、指令、待辦與坑）
1. `D:\2026\adb-converter\AGENTS.md`（母區規則）
2. `D:\2026\adb-converter\docs\adb\adb-knowhow.md`（共用 know-how）
3. `D:\2026\adb-converter\docs\adb\adb-version-log.md`（版本紀錄）
4. `D:\2026\adb-converter\docs\adb\off-to-accelon.md`（`.off` 轉換規格）
5. `docs/steps.md`（這一庫的來源、定位規則與建置流程）
6. [`docs/accelon26-integration.md`](docs/accelon26-integration.md)（接進 accelon26 的決策／待辦；另一話題實作）

## 6. 下一步

- [ ] 轉英譯（`D:\2023\sc\off`）
- [ ] 補頁 id 不必要（跨庫已用 `塊.段` 跳）；要顯示頁碼再加 `<頁>`
- [ ] 目錄再加標題層（章／節／項）？目前只有 書 → 塊
- [ ] 全部譯本合成一顆 `sz.adb`（現在是每譯本一顆，放在 `accelon26/`）
- [ ] 在母區 `deploy/adb-notes.json` 與 `docs/adb/adb-version-log.md` 記帳 (sha／大小／buildTime)
- [ ] 要發布才跑 `publish-adb.ts`（大檔加 `--allow-large`）；官網 exe release 仍由母區



