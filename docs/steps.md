# sz 建置步驟

> 這一頁記「新三藏」（`sz.adb`）的來源、定位規則與建置流程。
> 2026-11-02：定位規則已定（`塊.段`）；兩個來源的**文字層**已轉好，尚未打包。

## 1. 來源

方向：**巴利三藏平行文本**（巴利原文＋各語譯本，共十種）。

| 譯本 | 來源 | 本區輸出 | 書 | 狀態 |
|---|---|---|---|---|
| **巴利底本（VRI／CST4）** | `D:\2023\cs\off`（`*.cs.off`，儉約巴利＋詞譜） | `data/cs/` | 24 | ✅ 見 §1.1 |
| 巴利原文（SuttaCentral） | `D:\2023\sc\sc-pli.offtext`（`*.ms.off`） | `data/sc/` | 22 | ✅ |
| 緬譯巴利藏 | `D:\2023\cs-mm\off`（`*.mm.off`＋`*-fn.off`） | `data/cs-mm/` | 22 | ✅ |
| 元亨寺南傳大藏經 | `D:\2023\cb-n\off`（`*.yh.off`＋`*.yh.tsv`） | `data/yh/` | 22 | ✅ |
| 莊春江 | `D:\2023\ccc\off`（`*.ccc.off`） | `data/ccc/` | 22 | ✅ |
| 蕭式球 | `D:\2023\cs-xsq\off`（`*.off`） | `data/xsq/` | 8 | ⚠️ 段號未對齊 |
| 法勝巴利佛典 | `D:\2023\sutra-mobi\cs-pku.offtext`（`*.pku.off`） | `data/pku/` | 3 | ✅ |
| 杭州佛學院 | `D:\2023\sutra-mobi\off`（`*.hz.off`） | `data/hz/` | 6 | ✅ |
| 光明寺日譯 | `D:\2023\kmj\off`（`*.kmj.off`） | `data/kmj/` | 22 | ⚠️ sn3 段差 1 |
| 英譯（SuttaCentral） | `D:\2023\sc\off`（`*.sc.off`） | — | — | ⬜ |

- 前八個是 pitaka 的 `.off` 格式，轉換規則見母區 `docs/adb/off-to-accelon.md`；
  泰譯（cllk）已於 2026-11-02 搬到 `D:\2026\cllk`。
- 授權要逐一記：SC 的巴利／英譯是 CC0；緬譯（PnDaza app）與其餘譯本另記。
- 參考（不是來源）：`D:\2026\sc`（SC↔PTS 對照）。

### 1.1 巴利底本 `cs`（2026-11-02）

這一批與其他譯本**不同格式**：來源是作者自研的**儉約巴利**（provident-pali）
＋**詞譜**（連音壓成數字，例 `pd3Upm` ＝ pada ＋ 3 ＋ upama）。所以：

- 轉檔腳本獨立：`bun run src/cs2accelon.ts`（`--check` 只驗收）。它呼叫共用轉換器，
  額外給三個 hook：`text`（儉約巴利 → IAST）、`ckTransform`（塊 id 加層級尾綴）、
  `areaOf`（aas 歸「阿毘達磨」）。
- **正文轉 IAST**，每個詞譜詞留成 `<辭 b="詞譜分段" j="連音編號">正詞</辭>`：
  `b` 是詞譜原文分段（`pd|upm`）、`j` 是連音編號（`3`），兩者 join 起來就是原詞譜，
  一字不差；要 IAST 再逐段轉即可。**拆詞／連音資訊因此不會在轉寫時丟掉**。
- **2026-11-06 作者指示：詞譜標籤 `<詞>` → `<辭>`**。理由：和詞典（cyd／hydzd…）的
  `<詞>` 詞頭分開，閱讀器才不必靠「有沒有 b／j」猜。只有 cs 用 `<辭>`；屬性 `b`／`j`
  原樣，`data/cs` 由 `src/cs-rename-tag.ts` 就地改名（可重跑），轉檔端
  （`provident-text.ts`）已直接產 `<辭>`，從零重跑也會是 `<辭>`。母區閱讀器的新分支兩種都認
  （`render_accelon3.ts` 的 `name === '詞' || '辭'`；**注意這分支尚未 commit，RC3 沒有**），
  舊版閱讀器讀舊 `<詞>` 不受影響；部署前母區要先 commit＋重建閱讀器，否則 `<辭>` 沒有
  `.word` span（文字仍在）。
- `provident-pali` 只在轉檔時用（`D:\2023\provident-pali`），**adb 與閱讀器不引用它**。
- 為什麼是兩個屬性（`b`、`j`）而不是一個 `f="pd3Upm"`：`b`／`j` 是自描述欄位，
  任何 consumer 直接 `split('|')`／`split(',')` 就拿到「詞件」與「連音編號」，不必知道
  儉約巴利的規則。存 `f` 只佔一份屬性（約省 3 MiB），但每個 consumer 都要多一步
  「把字串切成詞件＋編號」（`f.split(/(\d+)/)`），而且資料契約裡就多了一條語法。
  目前選前者；要省空間再換（只改轉檔，閱讀器不用動）。
- 範圍 **174 冊**：`D:\2023\cs\off` 的 57 冊（律 6＋四部 22＋注疏 28＋論 2 的一部分）
  ＋ 由 TEI 產生的 117 冊（律注、小部、阿毘達磨、史書、文法、`*_nrf` 其他類）。
- 來源分兩段：
  1. `D:\2023\cs\off` 的 57 冊（儉約巴利＋詞譜）。注疏的塊 id 在來源是壞的（`dNaN`），
     轉換前要先跑 `src/cs-atta-ids.ts` 再 `src/cs-atta-normalize.ts`（產生 `out/cs-src/`）。
  2. 沒有 off 的 117 冊：`src/books2off.ts` 從 `books/*.xml`（優先）或 `ro/*.xml` 產生 off。
     **句界自己切**：沒有 SC 分句指引，就按標點 `।`／`॥` 切（一個 adb 行＝一句）；
     沒有段號的書給流水段號（`^n1`、`^n2`…），所以每句都定位得到。
     這批來源是 **IAST**，轉換時跳過 provident 解碼（`IAST_BOOKS`，清單來自 `out/books2off.tsv`），
     也**沒有 `<辭>` 詞譜**（見 [`known-issues.md`](known-issues.md) #13）。
- 塊 id 唯一化：義注加 `a`、複注加 `t`、再複注加 `x`（`dn1a` 的塊是 `d1a`）。
  規則寫在 `src/cs2accelon.ts` 的 `layerOf()`；注疏另由 `src/cs-atta-ids.ts` 重編。
- SC 經號：`src/cs-sc.ts` 在 `<塊>`／`<小塊>` 加 `sc="dn1"`（不改 `id`，免得八庫的 `ck.n` 斷掉），
  1,110／2,428 個塊有；對照表是 `data/cs-index/`（見 [`opentipitaka.md`](opentipitaka.md) §11）。
- 實測（`--check`，2026-11-02）：219 冊、行 1,028,311、段 359,662、塊 3,993、詞 9,917,614、詞譜 404,072（其中 268,229 來自 `data/cs-decomp/splits.tsv` 補充）；
  **163 冊全部相符**，10 冊字數差 0–21 字（`mn1a`／`sn1a`／`dn1u2`／`dn3t`／`vsnk`／`snp0a`／`aas0a`／
  `cv`／`ja1`／`mv`，見 [`known-issues.md`](known-issues.md) #12）。

### 1.2 CST `deva master` → IAST（2026-11-03）

`data/cs` 的 IAST 是 provident→IAST 的**過渡版**；正式來源改用 **accelon/tipitaka-xml**
（VipassanaTech 的 fork，作者 2026-11-03 指定當資料源）的 `deva master`（Devanagari），
只做字元轉寫，**不用 provident 反推**，也不重跑分句。

| | |
|---|---|
| 來源 | <https://github.com/accelon/tipitaka-xml>（`deva master/`；上游是 <https://github.com/VipassanaTech/tipitaka-xml>） |
| commit | `2d134ff9ef60f70a1eb03c9370580228811a3070`（2026-11-03 clone） |
| 本地 | `raw/cst-deva/`（sparse checkout，只取 `deva master`；不進版控） |
| remote | `origin`＝accelon fork、`upstream`＝VipassanaTech（要跟上游時 `git fetch upstream`） |
| 腳本 | `bun run src/cs-deva-iast.ts`（`--check` 只驗收；可指定書 id 只做幾本） |
| 輸出 | `data/cs/`（220 檔，**2026-11-03 已換成這一份**；舊 provident 版留在 `data/cs.bak-2026-11-02`） |
| 勘誤 | `bun run src/cs-errata.ts` → `data/cs-index/errata.tsv`（見 §1.3） |

做法：

1. deva XML（UTF-16LE）→ 去掉 `<note>` 校勘註、`<pb>` 頁碼、`<hi rend="paranum|dot">` 段號、
   標題類段落（`subhead`／`title`／`chapter`／`centre`／`nikaya`／`book`）與夾註
   `(दी॰ नि॰ १.२३)`，其餘做 Devanagari→IAST 字元轉寫（`devaToIast()`：一音節對一字串，
   不改連音、不切詞）。
   - **`<pb>` 去掉、不插空格**：CST 把頁碼放在詞後，舊管線 `backmovepb.js` 會把它往前挪一個詞；
     新來源有時差一個字母、落在詞中間（`…<pb/>्…`），插空格會把一個詞切成兩個
     （例 `aniccucchādanaparimaddanabhedanaviddhaṃsanadhammo` 被切成 6 個詞）。
   - 其他行內標籤（`<hi>` 粗體／斜體）**照舊插空格**：來源常在引文結尾切開（`…पाणिन</hi>न्ति`），
     舊骨架也在這裡斷詞，插空格才對得上。
   - 來源若有殘缺的母音記號（`िंद…`）當獨立母音處理；整份輸出會檢查「Devanagari 字母＝0」。
2. 舊 `data/cs` 的**每一行、每一個標籤都不動**，只把正文的詞換成 deva 的詞：舊詞序 ↔ 新詞序
   用 4-gram 錨點＋區塊 LCS 對齊；錨點之間按位置一對一換（版本異讀就是這樣換掉的）。
   對不到的新詞**不用**、對不到的舊詞**保留**——不插入新詞，免得破壞 `<辭 b j>` 的詞邊界。
3. 標籤內文字（`<小節>`／`<終>`／`<聯>`／`<書>`／`<區>`…）是標題與連結，不是正文，不動。

驗收（2026-11-03）：

- `bun run src/cs-align-check.ts --cur data/cs-deva-iast --ref data/cs.bak-2026-11-02`
  → **220 檔、1,028,311 行、359,662 段、0 不符**（逐行 `<段>` 位置相同）。
- 正文舊詞 10,175,165 個：**98.65% 換成 deva 的字**；1.35%（137,841）保留舊詞
  （deva 在該位置用省略語或夾註，沒有對應詞）；7,323 個新詞未用（deva 把省略語寫出來，
  舊骨架較短）；1,307 個儉約巴利殘碼（`VctYVc` 這種舊轉檔碎片）直接丟掉；`??` placeholder 不動。
- 15,372 行有變（1.5%）；`<詞>` 437,557 個，其中 1,197 個表面字換成 deva 的讀法。
- 輸出無 Devanagari 字母（只保留 `।`／`॥` 句讀）：轉寫表含梵語用的 `ऋ ॠ ऌ ॡ ॅ ॉ`，
  來源沒有落在表外的 Devanagari 碼位；腳本每冊都檢查一次，殘留 >0 會報錯。
- 實際換掉的例子：`uunaka`→`ūnaka`、`yāvaccidaṃ`→`yāvañcidaṃ`、`katamaṃccaca`→`katamañca`、
  `kāmopasaṃhitāni`→`kāmūpasaṃhitāni`；被 `<pb>`／`<hi>` 切開的複合詞會接回
  `aniccucchādanaparimaddanabhedanaviddhaṃsanadhammo`。

改成正式來源（2026-11-03 已完成；種子版在 `data/cs.bak-2026-11-02`）：

```powershell
bun run src/cs-deva-iast.ts                 # 產生 data/cs-deva-iast/（不直接寫 data/cs）
bun run src/cs-align-check.ts --cur data/cs-deva-iast --ref data/cs.bak-2026-11-02
copy data\cs-deva-iast\*.xml data\cs\       # 換掉 data/cs
bun run src/pack.ts cs                      # 打包（預設讀 data/cs）
bun run src/cs-align-check.ts               # 換完再驗一次
```

已知限制：

- **1,197 個 `<詞>` 的表面字**換成 deva 的讀法後，與 `b`／`j` 還原出的詞形不完全一致（版本異讀）；
  詞邊界 patch 時一併處理。
- 注疏／`*_nrf` 約 60 冊的對到率 97.7–99.5%：deva 用省略語，舊骨架保留較多舊詞（仍是 IAST）。
- 37 個殘碼落在 `<小節>`／`<終>` 標籤內（不是正文）；要清就等詞邊界／`??` patch 一起做。
- 兩個 deva 檔含多本書（`vin02t.tik` 四本、`abh07t.nrf` 兩本），用章／書標題切；
  `vs`／`vs0a` 各由兩個檔案接起來（第一、二冊）。
- 逐書數字在 `out/cs-deva-report.txt`（`書／行／段／舊詞／對到%／保留／新詞未用／丟掉殘碼／耗時`）。

### 1.3 勘誤表（`data/cs-index/errata.tsv`，2026-11-03）

作者在 CST 上陸續發現的錯字，**用 SuttaCentral 對勘**找出來，多半是 CST 的輸入錯誤
（錯字、無效的字母組合），不是版本異讀。2026-11-03 已把兩支 JS 改寫成 repo 裡的
[`src/errata.ts`](../src/errata.ts)（TS、附出處註解）：
只留還有效的 19 條，官方 deva master 已改掉的 44 條移到
[`data/cs-index/errata-retired.tsv`](../data/cs-index/errata-retired.tsv)（不再套用）。
書 id 對照（`cst4rename`／`newname`）也改寫成 [`src/cst-rename.ts`](../src/cst-rename.ts)，
建置不再依賴 `D:\2023` 的 JS。
`src/cs-errata.ts` 讀 `src/errata.ts`，逐條檢查**現在的** deva master 還有沒有那個錯：

| 欄 | 意思 |
|---|---|
| 檔案／書 | deva 檔名（`s0201m.mul1.xml` 這類拆冊寫法會併回 `.mul.xml`）與 cs 書 id |
| 種類 | `typo`（羅馬轉寫的錯字）／`errata`（Devanagari 的錯字或無法轉寫的組合） |
| 錯誤／正確／次數 | 舊管線 `patchBuf` 的語意：次數 0＝全部取代，n＝最多 n 次 |
| 現存 | 現在的 deva master 還剩幾處；**0 ＝官方已改** |
| 狀態 | `open`（建置時會套用；目前 19 條全是 open） |
| 依據 | 抄自 `src/errata.ts` 的註解（SC／bilara／PTS 的對照） |

- 2026-11-03：**63 條中 44 條官方已改**，已移到
  [`data/cs-index/errata-retired.tsv`](../data/cs-index/errata-retired.tsv)；
  `src/errata.ts` 只留 19 條，建置時 18 條實際套用（`pavattetti` 在輸出裡已經是正確形）。
- 上游又改好一條時，重跑 `bun run src/cs-errata.ts` 會標成「官方已改」並提示移到 retired。
- 判定「還有效」是看 deva 檔的原始文字還找不找得到這個錯字；若錯字只在 `<note>`（校勘註）
  而不在正文，套用後正文不會變（例 `s0304m` 的 `mālukyaputto`／`mālunkyaputto`）。

### 1.4 把改動送回上游（PR，2026-11-03 作者指示）

作者 2026-11-03 指示：**以後有改動就發 PR 給上游**（VipassanaTech）。資料源是
`accelon/tipitaka-xml`（fork），patch 與 PR 說明放 `out/`。

```powershell
bun run src/pr-deva.ts --dry-run     # 先看 commit（不推、不開 PR）
bun run src/pr-deva.ts               # push 到 accelon fork ＋ 開 PR
```

- 腳本會 fetch `origin`（accelon）與 `upstream`（VipassanaTech）、確認 fork 的 `main` 與上游
  同步，從 `origin/main` 開 branch、套 `out/pr-cst-deva.patch`、commit、push，
  再用 Windows 憑證管理員裡的 GitHub 憑證開 PR（不需要 token 檔）。
- 換 patch／說明檔用 `--patch`／`--body`／`--branch`／`--title`；`--dry-run` 只在本機建 branch。
- 已經開過：#2740（2026-11-03，11 處、6 個檔、mergeable clean）。
- **不要**把未確認的「疑似錯誤」送上游；`<note>` 的變體讀法不動。

## 2. 定位規則（2026-11-02 定案）

**頁 id ＝ `塊.段`（`ck.n`）；句層級再加 `:句`（`ck.n:j`，1 起算）**：

```text
a6.7    ＝ 塊 a6（增支部第六集）的第 7 段
d1.1:3  ＝ 長部第一經第 1 段的第 3 句
m51.17  ＝ 塊 m51 的第 17 段
```

語法、解析演算法、外部化清單見 [`addressing.md`](addressing.md)。

- `ck`（塊）與 `n`（段號）**跨語言穩定**；同一段在不同譯本用同一個 `塊.段` 定址。
- 和原書頁碼**無關**：緬版的 `^pb` 只留在 `<pb n>`（顯示用），不當定位。
- **小標題不參與定位**：`center`／`subhead`／`subhead2` 各譯本可能有出入（緬版多、別版少），
  不要拿它對齊。
- 已知差異：有些譯本有漏譯，或把譯者注混進正文；絕大部份時候文句仍逐行對應。
- 文字裡目前只有 `<段 n>`；`<頁 id="塊.段"/>` 之後補（每個 `<段>` 前面插一個，不必重轉）。
- 實測（2026-11-02）：`sc`／`yh`／`ccc`／`pku`／`hz` 的 `段` 序列與 `cs-mm` **完全相同**；
  `kmj` 只有 sn3 差 1（`gen-jp` 把範圍段號截短）；`xsq` 尚未對齊（見下）。
- **xsq 的例外**：來源沒有緬甸版段號（dn1 用 PTS `^m`、dn2／dn3 用每經重編的 `^n`、
  其餘書完全沒有），dn2／dn3 的塊 id 也是壞的 `$1`。要用 `ck.n` 之前必須先做它的
  README 裡的「工序一：標注緬甸版經號及段落號」。

## 3. 文字格式（兩個來源都已轉）

| 標籤 | 意思 |
|---|---|
| `<區 id="dn">` | 部（`^ak`） |
| `<書 id="dn1">` | 冊（`^bk`） |
| `<塊 id="d1">` | 塊（`^ck`） |
| `<小塊 id="a1a">` | 塊再細分（`^ckan`／`^cksn`，只有 SC 巴利有） |
| `<段 n="7"/>` | 段號（`^n`） |
| `<pb n="12"/>` | 原書頁界（`^pb`；不是定位用的頁） |
| `<註 n="3" pg="d1.7"/>` | 文內註號（`^f`） |
| `<釋 n="3" pg="d1.7">…</釋>` | 註文（`^fn`；**另一本檔** `<書>-fn.xml`） |
| `<居中>` `<題>` `<章>` `<節>` `<項>` `<目>` `<頂格>` | 緬版的小節與標題（`^center` `^title` `^chapter` …） |
| `<篇>` `<章>` `<節>` | 目錄層級的標題（`^z1`–`^z3`，yh／hz） |
| `<小節>` | 行內小標題（`^h`，ccc／yh） |
| `<偈/>` | 偈頌行（`^sz`，yh） |
| `<m n="…"/>` | **該譯本自己的段號**（`^m`：PTS／原書；不是緬甸版的 `n`） |
| `<缺/>` `<疑/>` `<空/>` | 缺文／疑文／空的標記（pku／yh） |

- **一行對一行**：輸出行數＝來源行數（`<居中>` 等標籤可以和文字接在同一行），平行文本靠
  行號對齊、使用者也好捲動比較；只有超過 4,096 字的行會切開（`an8` ＋14、`an9` ＋18、
  `an10` ＋15、`an11` ＋3，這 4 本切點之後行號平移）。
- 原書的空行照留（也是為了行號對應）。

## 4. 建置流程

```text
① 取源（`D:\2023\...`，唯讀）
② 轉文字（bun run src/off2accelon.ts → data/<db>/）
③ 補資料（頁 id、缺字、術語、圖片；外部檔或 patch，不改來源）
④ 連結（<聯>、<嵌>、j；patch 最後跑）
⑤ 打包（bun run src/pack.ts → accelon26/<db>.adb，預設建全文索引）
⑥ 驗證＋記帳（母區 adb-version-log.md、deploy/adb-notes.json）
```

## 4.0 打包現況（2026-11-02）

- 一譯本一顆 adb，放 `D:\2026\sz\accelon26\`：`cs`（巴利底本 219 冊）、
  `cs-mm`、`sc`、`yh`、`ccc`、`xsq`、`pku`、`hz`、`kmj`、`cllk`（十個，全部有 `tokens`）。
- **十個 adb 都建全文索引**（作者 2026-11-02 定案）：容器有 `tokens`；tokenizer／stoplist
  **每個庫獨立**，不能把一庫的 token 假設套到另一庫。
- `cs-mm`（緬文）用 `Intl.Segmenter('my', {granularity:'word'})` 分詞；舊版把每個緬文字母
  當一個 token（全庫只有 113 個），新版約 9,341 個詞 token。`ဘုရား` 可查 6,569 筆。
  打包時順便用 `dropPunct` 排除 `၏`／`၊`／`။`（VA 照樣前進，片語不受影響）。
  詳細實測與限制見 [`cs-mm-tokenizer.md`](cs-mm-tokenizer.md)。
- `cs-mm` 來源有 3 處 `p class="footnote"` 殘留，`bun run src/cs-mm-clean.ts` 先清掉再 pack。
- `cllk`（泰文）用 `Intl.Segmenter('th', {granularity:'word'})` 分詞；舊版只有 356 個 token，
  新版 11,310 個（泰文 11,033），`พระพุทธเจ้า` 可查 2,156 筆。見 [`cllk-tokenizer.md`](cllk-tokenizer.md)。
- `kmj`（日文）用 `Intl.Segmenter('ja', {granularity:'word'})` 分詞（`pack.ts` 的 `japanese:true`）；
  舊版 2,957 個 token，新版 10,855，`仏陀` 可查 376 筆；`dropPunct` 排除日文句讀。見 [`kmj-tokenizer.md`](kmj-tokenizer.md)。
- `src/pack.ts` 預設建索引；只有 tokenizer 還沒定的實驗庫才用 `--no-index`。
- `cs` 正式文字是 **IAST**（CST）：2026-11-03 起 `data/cs` 已換成從 CST `deva master`
  直接轉寫的版本（見 §1.2），`bun run src/pack.ts cs` 就是打這一版。
- `cs2accelon --cst-raw` 只作對照，會產生儉約巴利文字／改行長，**不要**當正式 `cs.adb`。
- `bun run src/cs-align-check.ts`：驗收定位骨架——行數、`<區>`／`<書>`／`<塊>`／`<小塊>`／`<段>`
  **落在哪一行**（逐行比對標記，且 `<段>` 的行號序列要完全相同；段也是讀窗的單元）。
  `--cur data/cs-deva-iast` 可比別的目錄。目前 220 檔、1,028,311 行、區 9、書 251、塊 3,044、
  小塊 949、段 359,662，**0 不符**。
- `bun run src/cs-parallel-check.ts`：比 `cs` 與其他譯本的 `<段>` 序列（平行閱讀那一層）。
  ccc／cs-mm／sc／yh／hz／pku／kmj／xsq **全部相同**（2026-11-03 修好 kmj `sn3` 與 xsq）；
  cllk 已搬去 `D:\2026\cllk`（`data/cllk` 是殘留，腳本跳過）。
  `句` 是各庫自己的行，不要求跨庫相同。
- `xsq` 換來源（2026-11-03）：`D:\2023\xsq\off`（有 `^n` 段號）→ `bun run src/xsq-src.ts`
  （拉掉 PTS 段號 `^m`、修 `an6` 的 `120-130`→`120-139`）→ `out/xsq-src/` → `off2accelon.ts xsq`。
- `kmj` 轉完要跑 `bun run src/kmj-line-patch.ts`：拿掉 `sn3` 多出來的 `<段 n="553"/>`
  （日譯的小標題段，CST 沒有）。
- `cs` 目前仍是表面 token（2026-11-03 從 deva 版重建後 841,154；舊版 842,532）；
  理想是存拆好的詞，詞邊界待 patch／外部詞表補。
- `pack.ts` 對 `cs`／`sc` 開 `dropNumeric`：目錄編號／頁碼不進 token 索引，但照樣佔 VA。
  `cs`／`sc` 也開 `dropPunct`（句讀、引號與 ASCII 標點），不進索引。
- `bun run src/tokenizer-report.ts`：重跑十個 adb 的 token 統計，寫 `out/tokenizer-report.txt`。
- **`sc` 要先把正文轉 IAST**：`bun run src/off2accelon.ts sc` 產生的還是儉約巴利（`bVrh…`），
  再多跑 `bun run src/sc2iast.ts`（只轉文字節點，保留區／書標題與所有標籤），才 `pack sc`。
- 同資料夾有一個 `accelon26.exe`（2026-11-02 本區測試版；舊版 `accelon26.exe.old-2026-11-02`），
  桌面版會把「exe 所在資料夾」的 `*.adb` 列出來，這個資料夾可直接當書庫。
- **目錄樹**（2026-11-02）：`00.xml` 有 `<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>`（部→冊→塊），
  `區` 帶 `t="書."`、`書` 帶 `t="塊."`；`caches` 容器因此產生。
  沒有 `區` 的冊（cs-mm 的 an1）轉換時補一個；區／書寫在塊後面的（sc mn1）會搬正。
  塊沒有夾文時用同行前面的標題（沒有就用 `id`）補 `n=`，目錄才不會一片空白。
- **跨庫跳頁**用 `塊.段`（`yh?a6.7`），不需要 `<頁>` 標籤：閱讀器 `anchorVa()` 會退回查
  `attributes/塊.id` ＋ `attributes/段.n`。

## 4.1 全文索引（2026-11-02 定案）

十個譯本都要全文索引；每個 adb 用自己的語言／翻譯風格建 tokenizer 與 stoplist：

- `authorAdb({ fullTextIndex: true })`，或 `src/pack.ts` 預設值。
- **不要**用「空 tokenizer」假裝有索引；也不要把一庫的 token 清單套到另一庫。
- 特殊實驗庫才用 `fullTextIndex:false`／`--no-index`；閱讀器仍可開、搜尋顯示「未建索引」。

## 5. 待辦

> 不影響閱讀與定位的小毛病，集中記在 [`known-issues.md`](known-issues.md)（抓大放小，慢慢處理）。

- [ ] 轉英譯（`D:\2023\sc\off`，`--glob "*.sc.off"`）
- [ ] 補頁 id（`<頁 id="塊.段"/>`）
- [ ] `caches`／目錄宣告（`t=`／`s=`：區→書→塊→段）
- [x] `cs`（巴利底本）24 冊轉 IAST＋詞譜（2026-11-02）
- [ ] `cs` 注疏 28 冊：塊 id 重編規則已試算通過（`src/cs-atta-ids.ts`，919/919、0 撞號），
      下一步接進 `cs2accelon.ts` 的 `ckTransform` 就能轉
- [x] `cs` 異文外部化：`data/cs-index/variants.tsv`（6,199 條，22 冊）
- [x] `cs` 紙本頁碼外部化：`data/cs-index/pages.tsv`（17,039 頁）
- [x] 「句層級」定址：`塊.段:句`（見 [`addressing.md`](addressing.md)）
- [ ] `cs` 的頁碼：`books/*.xml` 有四套頁碼（m／v／p／t），`off` 已丟；要就得回頭取
- [ ] 用 `<詞>` 做詞件索引／點詞查字典（本輪只存資料，沒有建索引）
- [ ] 第一版 `sz.adb` → `D:\accelon3\sz.adb`
- [ ] 母區記帳





