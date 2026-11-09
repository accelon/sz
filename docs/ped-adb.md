# ped.adb — SuttaCentral 精修版 PTS PED（已接 cs.adb）

## 這是什麼

把 SuttaCentral `sc-data` 的 **PTS Pali English Dictionary 精修版**
（`dictionaries/complex/en/pli2en_pts.json`，16,100 條）做成 Accelon ADB，
並把 PED 的 PTS 出處（`MN.i.59`、`Snp verse 995`、`Ja.ii.104`…）**轉成 cs.adb 的
`塊.段` 連結**。

- 成品：`D:\2026\sz\accelon26\ped.adb`（17.4 MiB，`dbname=ped`、`dbcname=PTS PED`、`dbtype=2` 字典庫）
- 來源 commit：`d85451882dd1c73edb2cd9ac34a168587e14baf7`
- 本地原始檔：`data/sc-dict/pli2en_pts.json`（16.8 MB）
- 去 HTML 版：`data/sc-dict/pts.tsv.gz`（16,100 列，`word` + `text`）

## 建置（從零重跑）

```powershell
cd D:\2026\sz
python -X utf8 src/decomp/ped-extract.py       # JSON → out/ped-records.json（乾淨版）
python -X utf8 src/decomp/ped-link.py          # PTS → cs 對照 → out/ped-refs.tsv
bun run src/decomp/build-ped-adb.ts            # records + refs → D:\2026\sz\accelon26\ped.adb
python -X utf8 src/decomp/ped-export.py        # 機器可讀 JSON／TSV（可選）
```

`ped-extract.py` 用 Python `html.parser` 把 PED 的 `<dl>/<dt>/<dd>` 拆成結構化欄位；
所有文字都做 `html.unescape()`、去標籤、壓空白。原始 `<dd>` HTML **不進主庫**；
需要時 `ped-extract.py --raw` 另存 `out/ped-raw.json`。

## 結構

- 一筆 `<dd>`（一個詞頭＋同形號）一塊；`區`＝首字母、`書`＝前兩字母、`塊`＝詞。
- 共 **16,781 筆**、**246,306 行**、tag 650,236。
- 第一棵樹是 `<樹 s="$詞">詞</樹>`（詞典型；閱讀器左欄「詞」分頁直接查詞頭），
  第二棵才是目錄：`<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>`。
- 詞條查詢：**第一個字母不分大小寫**（打 `D` 找得到 `dukkha`／`Dukkha`），其餘照原樣；
  PED 詞頭通常只有首字母大寫。
- 成品一律放 `D:\2026\sz\accelon26\`；`D:\accelon3\ped.adb` 已退役為
  `ped.adb.old-2026-11-04`。
- 塊 id `p000001`… 依詞頭排序；對照表在 `out/ped-blocks.tsv`。

## 標籤

| 標籤 | 內容 |
|---|---|
| `<詞>` | 詞頭（`dfn`） |
| `<同形>` | 同形號（`<sup>1</sup>`／`2`…） |
| `<語法>` | `<span class="grammar">`（如 `masculine & neuter`） |
| `<義>` | 每個 `<p>` 或 `<ol>/<ul>` 的 `<li>` 義項 |
| `<複合>` | `<ul class="compounds">` 的複合詞 |
| `<詞源>` | `<p class="eti">` 的詞源 |
| `<出處>` | `<span class="ref">`／`<a class="ref">` 的 PTS 出處；有 cs 對照時內含 `<聯>` |
| `<參見>` | `<a href="/define/...">` 的交叉參照 |
| `<來源>` | `PTS PED · sc-data d8545188` |

### cs 連結

```xml
<出處><聯 i="cs?d1.14">DN.i.7</聯></出處>
<出處>Pv-a.153</出處>
```

- `<聯 i="cs?塊.段">` 是閱讀器的跨庫連結；點下去跳到 `cs.adb` 的 `d1.14`。
- 段號可以是**區間**（cs 有 1,290 個 `<段 n="157-163">`）：`<聯 i="cs?a3.157-163">`；
  閱讀器 2026-11-04 起接受，取首段 157。這種出處有 52 個（278 次引用）。
- 只對 **high／medium** 信心的對照給 `<聯>`；low 只在 `out/ped-refs.tsv` 留 `cs`，不讓讀者亂跳。
- PTS 原文一定保留在 `<出處>` 的文字裡；沒有對照就只是純文字。

## PTS → cs 怎麼對（`src/decomp/ped-link.py`）

資料鏈：

1. **PED 的 href**（`<a class=ref href="https://suttacentral.net/...">`）→ SC 的精確段
   （例 `dn1:1.14.1`）。83,139 次引用有 href，其中 99.7% 的 fragment 在 bilara-data 找得到。
2. 沒有 href 的，用 **bilara-data `reference/pli/ms`** 的 `pts-vp-pli`（PTS 卷/頁）或
   `vnp`（偈號）找到對應的 SC 段。
3. 把 SC 段的巴利文（`root/pli/ms`）和 `cs.adb` 的同一本書做**拼字正規化後的字串比對**：
   `ṃ/ṁ→m`、`ā→a`、`ṭ/ḍ/ṇ/ñ/ḷ` 去變音符號、只留 a–z。
4. 比對時優先看「段首」的詞窗，其次才看後面的詞；避免被重複的定型句帶到別的段。
5. 得到 cs 的 `塊.段`。`<小塊>` 的位址一律退回所屬的 `<塊>`（閱讀器 `塊.id` 只認 `<塊>`）。

**為什麼不用 VRI 段號**：bilara 的 `vri` 是 VRI 版**頁碼**（`MN.i.59` 的 vri 是 76），
不是 cs 的 CST 段號（cs 是 `m10.112`）。所以用文字比對，不用 vri 直接換算。

## 覆蓋率（2026-11-04）

| 來源 | 引用次數 | 有 cs 連結 | 覆蓋 |
|---|---:|---:|---:|
| AN | 10,669 | 10,585 | 99.2% |
| SN | 9,267 | 9,162 | 98.9% |
| Vin | 7,768 | 7,613 | 98.0% |
| DN | 7,682 | 7,552 | 98.3% |
| MN | 4,808 | 4,751 | 98.8% |
| Mil | 4,849 | 4,829 | 99.6% |
| Snp | 7,834 | 7,789 | 99.4% |
| Dhp | 2,444 | 2,370 | 97.0% |
| Pv | 2,239 | 2,233 | 99.7% |
| Ja | 21,010 | 11,203 | 53.3% |
| 全部 | 125,808 | 78,809 | **62.6%** |

- 四部尼柯耶、律、小部主要偈集幾乎都接上；`Ja` 的其餘是**注疏頁**（SC 沒有對應文本）。
- 注疏（`Pv-a` 7,035、`Dhp-a` 5,187、`Vism` 3,617、`Vv-a` 3,014、`Snp-a` 2,284…）
  目前**不給連結**：cs 有這些注疏，但 bilara-data 沒有 PTS 頁碼對照，硬猜會錯。
- 未對照清單在 `out/ped-refs.tsv`（`cst_block` 空）與 `out/ped-link-report.txt`。

## 也給外部工作區的匯出

```powershell
python -X utf8 src/decomp/ped-export.py
```

| 檔 | 內容 |
|---|---|
| `out/ped-refs.tsv` | 23,549 個 unique ref：`raw / source / kind / vol / value / sc / cst_book / cst_block / cst_seg / method / confidence` |
| `out/ped-export.json` | 16,781 筆詞條 JSON（headword／variants／pos／etymology／sk_forms／citations／xrefs） |
| `out/ped-export-sample.json` | spec 指定的抽查詞（Sukha、Dukkha、Brahma…） |
| `out/ped-citations.tsv` | 125,808 列書證（一列一筆） |
| `data/ped/sources.tsv` | 縮寫 → 正規來源／全名／kind／cs 書／是否在庫 |

`out/ped-export.json` 的 `citations` 例：

```json
{"raw":"MN.i.59","source":"mn","kind":"page","vol":1,"page":59,
 "sc":"mn10:30.1","cst4":{"book":"mn1","block":"m10","seg":"112"},"cs":"cs?m10.112"}
```

## 驗證

```powershell
cd D:\2026\adb-converter\ts
bun run src/cli.ts inspect D:\2026\sz\accelon26\ped.adb
cd D:\2026\sz
bun run src/addr-resolve.ts d1.14
```

預期：

```text
dbname "ped"  dbcname "PTS PED"
linecount 246306  tagcount 650236
dbtype 2 (dictionary: true)
```

- 全部 13,466 個 cs 位址都在 `data/cs` 找得到（`塊`＋`段`）。
- `<聯 i>` 抽樣用閱讀器 `anchorVa()` 解析成功。

## 已知限制

- PED 原文是 **PTS 的英文**；`<義>` 已去 HTML，但英文縮寫、`lit.`、`cp.` 等照舊。
- `<義>` 仍把「釋義／例句」混在一起；`<詞源>` 只放 `p.eti`，有些 Vedic 說明在 `<義>` 裡
  （例 `Brahma & Brahmā` 的 `Vedic bráhman`）。詞源細分留給下一版。
- `Ja` 的注疏頁、以及 Pv-a／Dhp-a／Vism 等注疏尚未接；要做需另一套「PED 引文 → 注疏段」對齊。
- 原始 `<dd>` HTML 不在主庫；要查排版／連結請用 `out/ped-raw.json` 或原始 JSON。
- JSON 的 16,100 條 vs records 16,781：差在同形號與 `<dt>/<dd>` 分組，不是漏資料。

## 也接進 lemma map

15,991 個 PED 詞頭也加進 `src/decomp/whole-canon-lemma-stats.py` 的 lemma map（identity）。
清理與 PTS→cs 的規劃見 [`ped-todo.md`](ped-todo.md)。
