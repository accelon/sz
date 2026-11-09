# ped-todo — 把 PED 弄乾淨、接 SC 連結

> 2026-11-04。**P0／P1 已完成**；目前成品是
> `D:\2026\sz\accelon26\ped.adb`（2026-11-04 版，17.4 MiB、125,808 次出處中 78,809 次接上 cs）。
> 下面保留原本的規劃與驗收，結果見 §4 與 [`ped-adb.md`](ped-adb.md)。
> 相關：[`ped-adb.md`](ped-adb.md)、[`data-sources.md`](data-sources.md)。

## 0. 現況（2026-11-04）

- 成品：`D:\2026\sz\accelon26\ped.adb`，17.4 MiB、16,781 records、246,306 行、650,236 tags。
- 來源：`data/sc-dict/pli2en_pts.json`（16,100 條、sc-data `d8545188`）。
- 標籤：`詞/同形/語法/義/複合/詞源/出處/參見/來源`（`原文` 已移除）。
- `<出處>` 有 cs 對照時包 `<聯 i="cs?塊.段">`；沒對照就保留 PTS 原文。
- 已無 raw HTML／未解 entity；`&lt;` 是 PED 原文的「<」字符，已正確 escape。

## 1. 清乾淨（no HTML / no entity）

### 1.1 目標

主 `ped.adb` 的**可見文字**不再出現 HTML 標籤或 entity；raw HTML 另存，
不進主庫、不進全文索引。

### 1.2 做法

1. `ped-extract.py` 增加 `--clean`（預設）與 `--raw`：
   - `--clean`：不輸出 `<原文>`；所有欄位做 `html.unescape()`、去標籤、壓空白。
   - `--raw`：另出 `out/ped-raw.json`，必要時再包成 `ped-raw.adb`。
2. 欄位正規化：
   - `&amp;`→`&`、`&lt;`→`<`、`&gt;`→`>`、`&nbsp;`→空白；
   - `&amp;amp;` 這種雙重 escape 也要解；
   - 去掉行內多餘空白、`\n`、`\t`；保留 `■` 作為段落標記。
3. `<出處>` 只留文字 PTS ref；HTML `<a class='ref'>` 的 `href` 另存成
   `ref_links`（見 §2），不要放進正文。
4. `<原文>` 若真的要保留：
   - 另做 `ped-raw.adb`（`fullTextIndex:false`），或存成 `resources/ped-raw/…`；
   - 主庫不建這個標籤。
5. 驗收：
   - 主庫所有文字節點不含 `<[a-zA-Z]`、`&[a-zA-Z]+;`；
   - `abx inspect` 的 tag 清單沒有 `原文`；
   - 體積應明顯小於 24.4 MiB。

### 1.3 要改的檔

- `src/decomp/ped-extract.py`：clean/raw 模式、entity 正規化、`ref_links`。
- `src/decomp/build-ped-adb.ts`：預設不輸出 `<原文>`；`--raw` 才加。
- `docs/ped-adb.md`：更新標籤表與體積。

## 2. PTS 頁碼 → SC 連結

### 2.1 已有的資源（不要再造）

`D:\2026\sc` 已經從 PED 的 `<a class='ref' href='https://suttacentral.net/...'>`
抽出對照：

| 檔 | 內容 |
|---|---|
| `sc_pts_index.json` | 13,436 個 PTS ref ↔ SC URL；83,139 次引用；`pts_to_sc` 可直接查 |
| `sc_pts_map.csv` | `pts_ref, collection, sc_uid, sc_author, sc_fragment, sc_url, occurrences, example_word, pts_variants` |
| `pts_sc_pages.csv` | PTS volume/page → SC segment 範圍（`start_segment`／`end_segment`） |
| `D:\2023\sc\pts-par` | 四部 Nikaya 的 PTS 段落字數（`dn/an/mn/sn.json`），可做頁→段對齊 |

實測（2026-11-03，PED 的 125,808 次 `<出處>`、23,549 個 unique ref）：

- 13,427 個 unique ref 在 `sc_pts_index`（**57.0%**）；
- 79,192 次引用有對照（**62.9%**）；
- 10,122 個 unique ref 沒對照。

### 2.2 第一步：把 PED 自己的 href 留下

目前 `ped-extract.py` 只抓 `<a class='ref'>` 的文字，丟掉 `href`。
先改成：

```json
{"text": "Ja.ii.104", "href": "https://suttacentral.net/ja...", "kind": "sc"}
```

- 有 `href` 的直接得到 SC URL，不必查表。
- 只有 `<span class='ref'>` 文字的，才查 `sc_pts_index`。
- 這一步應該能把「有 href 但被丟掉」的引用全部救回。

### 2.3 第二步：按來源分類

未對照的 ref 按縮寫統計（次數）：

```text
Ja 9,624｜Pv-a 7,035｜Dhp-a 5,187｜Vism 3,618｜Vv-a 3,014
Snp-a 2,284｜DN-a 2,182｜Mhvs 1,919｜Ds 1,610｜Sdhp 1,405
Cnd 1,333｜Dhs-a 1,110｜Vb-a 928｜Kp-a 811｜Thag-a 781…
```

分成三類：

1. **SC 有對應文本**（Ja、DN、Vin、部分注疏）：用 PTS volume/page + `pts_sc_pages.csv`／`pts-par` 推 SC segment。
2. **SC 沒有、但 GRETIL 有 PTS 原文**：靠 GRETIL 的頁碼標記對齊（§3）。
3. **兩邊都沒有**（部分注疏、Vism、Mhvs、Divy 等）：保留 PTS ref 文字，連到 PTS 頁圖或外部連結；不要硬猜。

### 2.4 第三步：ADB 的呈現

主庫 `<出處>` 保留 PTS 原文，另外加：

```xml
<出處 sc="https://suttacentral.net/ja..." uid="ja...">Ja.ii.104</出處>
```

- 不確定 SC 對應時，只寫 `<出處>Ja.ii.104</出處>`，不給 `sc`。
- 閱讀器要不要把 `sc` 變成可點連結，是另一個 UI 決定；先存資料，不擋閱讀。
- 若日後要內部 `<聯>`，再另做 `ped-sc` 對照表，不要直接把 SC URL 當 `<聯 i>`。

## 3. GRETIL 的角色（先盤點，不預設有）

PTS 頁碼最難的是「頁」→「字」的对齊。GRETIL 可能有 PTS 底的原文，但：

- 不是每个 PTS 文本都有；注疏尤其不確定。
- 即使有原文，也不一定有 PTS 頁碼標記。
- 授權要逐檔確認（GRETIL 各檔授權不同）。

### 3.1 盤點清單

1. 從 §2.3 的未對照清單取出**文字縮寫 → 全名 → PTS 版本**（例 `Ja` = Jātaka, PTS ed. Fausbøll）。
2. 到 GRETIL 目錄找對應檔（Pali / Prakrit 區），記 URL、格式（HTML/TEI）、有無頁碼。
3. 抽 20 個有頁碼的樣本，檢查頁碼是 `[p. 104]`、`p104`、或只有段號。
4. 若 GRETIL 沒有頁碼，改找：
   - PTS PDF 的 page image／OCR（存頁圖，不做全文）；
   - archive.org 的 PTS 版；
   - 已存在的 `D:\2023\sc\pts-par` 段落字數，做頁→段近似。
5. 產出一張 `data/ped/pts-sources.tsv`：

```text
abbrev  full_name  pts_edition  gretil_url  has_page_markers  license  coverage
```

### 3.2 對齊策略

- 先做**有頁碼標記**的文本：頁碼→行→字，對到 SC segment。
- 沒有頁碼的，只做「卷／品」級對應，不給頁內 fragment。
- 頁碼對齊不了就保留 PTS ref，不硬塞 SC link。

## 4. 工作清單（優先序）

- [x] **P0** `ped-extract.py --clean`：去 `<原文>`、解 entity、正規化空白；重建 `ped.adb`，確認無 HTML/entity。
- [x] **P0** 保留 `a.ref` 的 `href`，加 `ref_links`；用 `sc_pts_index` 補文字 ref。
- [x] **P1** 用 bilara-data 的 `pts-vp-pli`／`vnp`＋cs 文字比對產生 `out/ped-refs.tsv`：`raw, source, kind, vol, value, sc, cst_book, cst_block, cst_seg, method, confidence`。
- [x] **P1** 未對照 ref 按縮寫分類（`out/ped-link-report.txt`）。
- [ ] **P2** 注疏（Pv-a／Dhp-a／Vism／Vv-a／Snp-a…）的引文→段對齊；bilara 沒有 PTS 頁碼，需另一套方法。
  - 2026-11-04 試過「PED 引文唯一錨點＋LIS＋線性插值」：Pv-a 只 54 個錨點、可覆蓋 46%，
    但插值頁用詞頭檢查只有 32% 命中；cs 注疏與 PED 引文有時態／拼寫差異，**不硬接**。
- [ ] **P2** 決定 `<出處 sc=...>` 的 UI 呈現；目前用 `<聯 i="cs?塊.段">`。
- [x] **P3** raw HTML 另存（`ped-extract.py --raw` → `out/ped-raw.json`），主庫不建 `<原文>`。

### 2026-11-04 結果

- 主 `ped.adb`：16,781 筆、246,306 行、650,236 tags、**17.4 MiB**（原 24.4 MiB）；第一棵樹是 `$詞`。
- 無 `<原文>`；全部可見文字無 HTML 標籤（`&lt;` 是 PED 原文的「<」字符，已正確 escape）。
- 125,808 次出處中 **78,809 次（62.6%）** 有 `<聯 i="cs?塊.段">`；13,466 個 unique cs 位址全部可解析。
- 四部尼柯耶／律／主要偈集 97–99%；Ja 53%（其餘是注疏頁）；注疏 0%（尚未做）。
- 來源縮寫表：`data/ped/sources.tsv`；結構化匯出：`out/ped-export.json`、`out/ped-citations.tsv`。

### 驗收

- [x] 主 `ped.adb` 文字無 `<tag>`、無未解 entity。
- [x] `<出處>` 至少 60% 有 cs 連結（62.6%）。
- [x] 未對照的 ref 有清單、有分類，不是靜默消失。
- [x] raw HTML 另外存，不進主庫索引。

## 5. 開放問題

1. `<原文>` 要完全丟，還是另存 `ped-raw.adb`？我傾向另存，主庫乾淨。
2. SC URL 要不要做成可點？ADB 的 `<聯>` 是內部 `db?page`，外部 URL 需要閱讀器支援；先存 `sc` 屬性。
3. GRETIL 的 Pali 覆蓋到底多少？先盤點再決定要不要投入。
4. PTS 頁碼版本（PTS 第一版／重印）是否一致？PED 引用的是哪一版要抽樣確認。

---

**這份只規劃，不動手。** 下次另開話題時，從 §4 的 P0 開始。
