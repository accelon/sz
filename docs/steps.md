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
| 朱拉隆功泰譯 | `D:\2023\cllk\html`（`*.html`，直接讀） | `data/cllk/` | 22 | ✅ 四部，長部段號與 `cs-mm` 相同 |
| 英譯（SuttaCentral） | `D:\2023\sc\off`（`*.sc.off`） | — | — | ⬜ |

- 前八個是 pitaka 的 `.off` 格式，轉換規則見母區 `docs/adb/off-to-accelon.md`；
  `cllk`（泰譯）是 html，由 `src/cllk2accelon.ts` 轉，規則見 `docs/cllk.md`。
- 授權要逐一記：SC 的巴利／英譯是 CC0；緬譯（PnDaza app）與其餘譯本另記。
- 參考（不是來源）：`D:\2026\sc`（SC↔PTS 對照）。

### 1.1 巴利底本 `cs`（2026-11-02）

這一批與其他譯本**不同格式**：來源是作者自研的**儉約巴利**（provident-pali）
＋**詞譜**（連音壓成數字，例 `pd3Upm` ＝ pada ＋ 3 ＋ upama）。所以：

- 轉檔腳本獨立：`bun run src/cs2accelon.ts`（`--check` 只驗收）。它呼叫共用轉換器，
  額外給三個 hook：`text`（儉約巴利 → IAST）、`ckTransform`（塊 id 加層級尾綴）、
  `areaOf`（aas 歸「阿毘達磨」）。
- **正文轉 IAST**，每個詞譜詞留成 `<詞 b="詞譜分段" j="連音編號">正詞</詞>`：
  `b` 是詞譜原文分段（`pd|upm`）、`j` 是連音編號（`3`），兩者 join 起來就是原詞譜，
  一字不差；要 IAST 再逐段轉即可。**拆詞／連音資訊因此不會在轉寫時丟掉**。
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
     也**沒有 `<詞>` 詞譜**（見 [`known-issues.md`](known-issues.md) #13）。
- 塊 id 唯一化：義注加 `a`、複注加 `t`、再複注加 `x`（`dn1a` 的塊是 `d1a`）。
  規則寫在 `src/cs2accelon.ts` 的 `layerOf()`；注疏另由 `src/cs-atta-ids.ts` 重編。
- SC 經號：`src/cs-sc.ts` 在 `<塊>`／`<小塊>` 加 `sc="dn1"`（不改 `id`，免得八庫的 `ck.n` 斷掉），
  1,110／2,428 個塊有；對照表是 `data/cs-index/`（見 [`opentipitaka.md`](opentipitaka.md) §11）。
- 實測（`--check`，2026-11-02）：219 冊、行 1,028,311、段 359,662、塊 3,993、詞 9,917,614、詞譜 404,072（其中 268,229 來自 `data/cs-decomp/splits.tsv` 補充）；
  **163 冊全部相符**，10 冊字數差 0–21 字（`mn1a`／`sn1a`／`dn1u2`／`dn3t`／`vsnk`／`snp0a`／`aas0a`／
  `cv`／`ja1`／`mv`，見 [`known-issues.md`](known-issues.md) #12）。

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
② 轉文字（bun run src/off2accelon.ts → data/<db>/；泰譯用 bun run src/cllk2accelon.ts）
③ 補資料（頁 id、缺字、術語、圖片；外部檔或 patch，不改來源）
④ 連結（<聯>、<嵌>、j；patch 最後跑）
⑤ 打包（bun run src/pack.ts → accelon26/<db>.adb，不建索引）
⑥ 驗證＋記帳（母區 adb-version-log.md、deploy/adb-notes.json）
```

## 4.0 打包現況（2026-11-02）

- 一譯本一顆 adb，放 `D:\2026\sz\accelon26\`：`cs`（巴利底本 24 冊，11.70 MiB）、
  `cs-mm`、`sc`、`yh`、`ccc`、`xsq`、`pku`、`hz`、`kmj`（合計約 16.5 MB），
  加上 `cllk`（泰譯四部，4.24 MiB）。
- **不建全文索引**（`fullTextIndex: false`）：容器只有 `source`／`tags`／`tables`／
  `attributes`／`attributes.sorted`，沒有 `tokens`；`abx inspect` 可以確認。
- 同資料夾有一個 `accelon26.exe`（hardlink 到 `D:\accelon3\accelon26.exe`），
  桌面版會把「exe 所在資料夾」的 `*.adb` 列出來，這個資料夾可直接當書庫。
- **目錄樹**（2026-11-02）：`00.xml` 有 `<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>`（部→冊→塊），
  `區` 帶 `t="書."`、`書` 帶 `t="塊."`；`caches` 容器因此產生。
  沒有 `區` 的冊（cs-mm 的 an1）轉換時補一個；區／書寫在塊後面的（sc mn1）會搬正。
  塊沒有夾文時用同行前面的標題（沒有就用 `id`）補 `n=`，目錄才不會一片空白。
- **跨庫跳頁**用 `塊.段`（`yh?a6.7`），不需要 `<頁>` 標籤：閱讀器 `anchorVa()` 會退回查
  `attributes/塊.id` ＋ `attributes/段.n`。

## 4.1 全文索引可選（2026-11-02）

有些語種（例如某些巴利／譯本）還沒有可用的 tokenizer。建置時可以**不建全文索引**：

- `authorAdb({ fullTextIndex: false })`，或 `tei-pack` 加 `--no-index`。
- 仍保留 `source`／`tags`／`tables`／`attributes`／`caches`，**VA 照 tokenizer 的
  token 數前進**，所以頁 id、目錄、標籤位置都讀得到；只是沒有 `tokens` 容器
  （沒有 token 清單與 postings），搜尋會是 0 筆。
- 閱讀器（accelon26）仍可開檔、看正文、目錄、頁碼；搜尋摘要會顯示
  「此資料庫未建全文索引（建置時略過）」。
- 建置快、檔案小；等該語種的 tokenizer 做好後，再重跑有索引的版本即可。
- **注意**：不要用「空 tokenizer」假裝有索引；沒有索引就明確不建，讓閱讀器知道。

## 5. 待辦

> 不影響閱讀與定位的小毛病，集中記在 [`known-issues.md`](known-issues.md)（抓大放小，慢慢處理）。

- [ ] 轉英譯（`D:\2023\sc\off`，`--glob "*.sc.off"`）
- [ ] 補頁 id（`<頁 id="塊.段"/>`）
- [ ] `caches`／目錄宣告（`t=`／`s=`：區→書→塊→段）
- [x] cllk：四部 22 冊（2026-11-02；16 個缺的 siri 已補抓）
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
