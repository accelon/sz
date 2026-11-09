# OpenTipitaka 的底層資料（2026-11-02 勘查）

> 作者開了 OpenTipitaka（<https://www.opentipitaka.org/>，師兄做的多語機翻平台）。
> 這份記「資料在哪、長什麼樣、能拿來做什麼」。

## 1. 位置（本機實測）

程式是 MSIX 套件（`BhanteSunanda.OpenTipitaka_7.0.0.0_x64__rgdt2xn07hd18`），
資料分兩處：

| 檔案 | 大小 | 內容 |
|---|---|---|
| `%APPDATA%\Sunanda\OpenTipitaka\openTipitaka\databases\tipitaka-translation-data.db` | **528 MB** | 正文＋譯文（主角） |
| 同目錄 `dictionaries.db` | 1,112 MB（2026-11-02 實測，會長大） | 字典 |
| 同目錄 `user_data.db` | 小 | 書籤、閱讀進度 |
| 安裝目錄 `data\flutter_assets\shared\sutta_index.json` | 5.0 MB | **6,368 筆經名＋SC 編號對照** |
| 安裝目錄 `data\flutter_assets\shared\tipitaka_index.json` | 0.21 MB | 目錄樹＋254 張表的書名（24 語） |

## 2. `tipitaka-translation-data.db`

- SQLite 3.53；**218 張表**＝1 張版本表 `_pali_package_version` ＋ **217 張正文表**。
- 表名就是 CST 檔名（和 `D:\2023\cs\ro\` 一一對應）：
  `s0101m_mul`、`abh01a_att`、`vin01m_mul`、`e0101n_nrf`…
  後綴分佈：**`_mul` 61、`_att` 49、`_tik` 22、`_nrf` 85**。
- 每張表的 schema：

  ```sql
  CREATE TABLE "s0101m_mul" (
    "id" INTEGER PRIMARY KEY,        -- 行號（sutta_index 的 row_id 指這個）
    "rend" TEXT,                     -- centre/nikaya/book/chapter/subhead/bodytext/gatha…
    "paranum" TEXT,                  -- VRI 段號
    "pali_text" TEXT,                -- CST 的 HTML 片段
    "chinese_translation" TEXT, "chinese_translation_mark" TEXT, "chinese_translation_timestamp" TEXT,
    "english_translation" TEXT, "english_translation_mark" TEXT, "english_translation_timestamp" TEXT
  );
  ```

- `pali_text` **保留 CST 的原始片段**，連 `n=`、`data-sub=`、`<pb ed="M|V|P|T">`、`<note>` 都在：

  ```html
  <p rend="bodytext" n="1" data-sub="1"><hi rend="paranum">1</hi><hi rend="dot">.</hi>
  Evaṃ <pb ed="M" n="1.0001"/><pb ed="V" n="1.0001"/><pb ed="P" n="1.0001"/><pb ed="T" n="1.0001"/>
  me sutaṃ – ekaṃ samayaṃ bhagavā …</p>
  ```

  → `paranum` 是段、`data-sub` 是同一段裡的第幾個小段；
  → **`<pb>` 還是錯位**（在 `Evaṃ` 之後），和上游一樣，所以我們的 `backmovepb` 仍然必要。
- 版本戳：`_pali_package_version` = `(1, '2026-10-17', '4289feb6…')`。
- **217 張表完全涵蓋我們的 `ro/` 223 檔**：DB 沒有而我們有的只有 6 個
  （`vin02t1..4_tik`、`abh07t1_nrf`——上游已合併，以及 `test`）。

## 3. `sutta_index.json`（6,368 筆，只有 mūla）

```json
{"id":"s0101m_mul:4","book_key":"s0101m_mul","table_name":"s0101m_mul",
 "title_row_id":4,"start_row_id":4,"end_row_id":216,
 "pali_title":"1. Brahmajālasuttaṃ","source_paranum":"1",
 "sc_uid":"dn1","sc_uids":["dn1"],"display_reference":"DN 1",
 "reference_prefix":"dn","number_start":1,"number_end":1,
 "mapping_evidence":"title_and_structure","text_status":"source_text",
 "mapping_kind":"single","anchor_sha256":"1d31cead…"}
```

- **6,358／6,368 有 `sc_uid`**，10 筆沒有 → 這就是「SuttaCentral 沒編入」的那批。
- `mapping_kind`：`single` 6,134、`compressed` 234（一個經對多個 SC uid 或反之）。
- `mapping_evidence`：`title_and_structure` 5,264、`numbered_text_part` 678、
  `reviewed_mapping` 313、`numbered_text_part_similarity` 44、`text_fingerprint_and_structure` 38、
  `text_and_structure` 13。
- `reference_sources`：`sc_data_commit`、`bilara_data_commit`（都是 sha）——所以對照是有版本的。

**這正是我們缺的「書名＋編號」**：CST 的表／行 → SC uid → 顯示用編號（`DN 1`），
而且只涵蓋 mūla（注疏沒有 SC 編號，見下）。

## 4. `tipitaka_index.json`

- `structure`：4 層樹（`Tipiṭaka Mūla` → 部 → 書 → 表），節點是 `{"pali": "…", "table": "s0101m_mul"}`。
- `translations`：**254 張表**的書名，**24 種語言**（pali／zh／en／vi／ja／fr／ko／th／hi／id／es／si／my…）。
  例：`vin01m_mul` → zh「波罗夷」、en「Pārājika」、vi「Phân Tích Giới Tỳ Khưu 1」…

## 5. 對我們的用處

| 用途 | 做法 |
|---|---|
| SC naming 的橋 | 用 `sutta_index.json` 的 `table + start/end_row_id → sc_uid`，不必自己猜 |
| 經名（含 SC 沒有的） | `pali_title`（6,368 筆）＋ `tipitaka_index` 的 24 語書名 |
| 注疏結構 | 49 张 `_att`＋22 张 `_tik`＋85 张 `_nrf` 表，每表有 `paranum`／`rend` → 直接抽結構，不必再對 tipitaka.lk |
| 段／小段編號 | `paranum` ＋ `data-sub`，可以拿來交叉驗證我們的 6,554 段／118,019 句 |
| 多語譯本（未來） | 目前 DB 只有 zh／en 兩欄；其他語言應該是另外下載 |

## 6. 要注意

- **pb 錯位沒修**（同上游）：`Evaṃ <pb/> me sutaṃ`。要頁碼就得先套我們的「往前移一個詞」。
- 只有 zh／en 兩欄，其他語言不在這顆 DB。
- 授權：譯文 CC BY-NC-SA 4.0；巴利原文屬 VRI／CST，非商用、要標註。
- DB 跟著 App 版本走（`_pali_package_version` 可當版本戳），升級後結構可能變。
- 這是**別人的 App 資料**，只當「對照參考」讀；不要當成我們的來源版本。

## 7. 下一步（建議）

1. 抽兩張對照表（小而穩定）：`table → 書 id／書名（24 語）`、`sutta → sc_uid → pali_title → row 範圍`。
2. 用 `paranum`＋`data-sub` 驗我們的段／句：抽長部一本，比對「段數、每段小段數」。
3. 注疏（49＋22＋85 表）的 `rend`／`paranum` 直接抽成結構，補 cs 壞掉的義注 id。

## 8. 已抽出的對照表（2026-11-02）

`bun run src/otp-index.ts` → `data/cs-index/`（兩張小 TSV，可進版控）：

| 檔 | 內容 |
|---|---|
| `tables.tsv` | 217 張表：`table / book / layer / title_pali / title_zh / title_en / rows / paras`。**172 張對到書 id**；45 張沒有（`e06xx`–`e12xx` 的 anya 系列，和我們 `newname` 缺的是同一批） |
| `suttas.tsv` | 6,368 筆經：`table / book / start_row / end_row / pali_title / source_paranum / sc_uid / display_reference / number_start / number_end / mapping_kind` |

層級分佈（tables.tsv）：根本 61、義注 49、複注 22、其他 85。

## 9. 驗證：我們的「段」對得上嗎？（2026-11-02 實測）

拿 22 冊根本經比 `paranum`（DB）與 `^n`（我們的 off）：

| 書 | DB 段 | cs 段 | 序列 | 說明 |
|---|---|---|---|---|
| dn1 | 559 | 559 | **完全相同 ✓** | 逐值比對，一字不差 |
| mn1 | 513 | 497 | 差 16 | CST 寫 `n="119-135"`（我們保留一個標籤），DB 拆成 119…135 逐段 |
| sn5 | 621 | 628 | 差 7 | 方向相反：DB 把多個 `<p>` 併成一列，段落反而少 |
| 全 22 冊 | 6,567 | 6,554 | +13 | 差異都來自上面兩種寫法，不是錯 |

**結論：段號是同一套**（CST 的 `pn`），差別只在「範圍段號」的表示法。

「句」則是我們多出來的一層：DB 一列 = 一個**顯示塊**（常常是好幾個 `<p>` 併在一起），
所以 22 冊只有 **27,159 列**，而我們有 **117,997 句**（約 4.3 句／列）。
換句話說：

```
段（paranum，6,554） → 顯示塊（DB 列，27,159） → 句（我們的 adb 行，117,997）
```

DB 是**閱讀用**的分塊，不是句級；所以它可以當「書名／編號／對照」的來源，
**不能**當句級對齊的來源。

## 10. `dictionaries.db`：有沒有「長詞拆分」？（2026-11-02 勘查）

**有，而且不只一套。** 1.11 GB、32 張表，幾乎每張都是 `(id, dict_key, dict_content)`
（`dict_key` = 詞頭、`dict_content` = 正文，一行一義項）。表名只是來源代號（`pc1`、`pm12e`…），
App 的 assets 裡**沒有**名稱對照表，所以只能按語言／格式認。

### 10.1 表清單（列數／詞頭數）

| 表 | 列 | 詞頭 | 認得出的內容 |
|---|---|---|---|
| `pwa` | 956,936 | 956,936（唯一） | **Pali words analyzer**，AI 產生：詞形 → 拆詞 |
| `dpd` | 88,785 | 74,687 | **Digital Pāḷi Dictionary**：語法＋構詞＋義 |
| `opentipitaka_dict_zh` | 248,032 | — | AI 中文譯（gemini，`needs_review` 3,828） |
| `opentipitaka_dict_en` | 247,991 | — | AI 英譯（gemini-3.5-flash） |
| `pm12e`／`pm1`／`pm2`／`pm3`／`pm4` | 204,363／184,617／60,782／11,086／1,894 | | 緬：`pm1` 是 Tipiṭaka 緬文辭典的 HTML，`pm12e` 是它的英譯版 |
| `pe4`／`pe5`／`pe1`／`pe2`／`pe3`／`pe6`／`pe7`／`pe8` | 381,754／330,972／23,859／20,968／16,274／5,775／4,663／5,364 | | 英：`pe3`＝PTS PED（有 Vedic 語源）、`pe6`＝DPPN 人名地名、`pe8`＝緬甸阿毘達磨辭典英譯 |
| `ps1`／`ps2` | 23,118／18,993 | | 僧伽羅 |
| `pg1` | 22,729 | | 德 |
| `pi1` | 16,183 | | 印地（天城體） |
| `pc2`／`pc1`／`pc3` | 20,113／10,530／39 | | 中：`pc2` 有 `[C3]` 標記與 Vedic 語源，`pc1` 是較簡的中文釋義 |
| `pv2`／`pv3` | 3,855／916 | | 越 |
| `ppn`／`proper_noun` | 667／670 | | 漢譯專名（`proper_noun` 另有新舊譯兩欄） |
| `pd1` | 1,611 | | 印尼 |
| `usr` | 0 | | 使用者自建（空） |

### 10.2 拆詞資訊的四個來源

| 來源 | 格式 | 量 | 特性 |
|---|---|---|---|
| **`pwa`** | `dict_content` = `a-b-c(stem, stem, stem)` | 956,936 列；82% 拆 ≥2 段 | 收**實際詞形**（含變格、連聲），詞幹是字典形；`dict_key` 有 UNIQUE 索引，查一詞 ~0 ms |
| **`dpd`** | 一行語法（`nt, abstr, comp`／`sandhi`／`in comps`）＋一行 `a + b + c` 結構 | 75,700 列有 `+` 行；9,222 列有**多層**分析；語法標 `comp` 的 39,033 列中 6,341 列沒有結構行 | 只收**詞頭**，不收變格形；結構行會標 `√root`、`na > a`、插入音 `[t]`；無 `dict_key` 索引 |
| `pe8`／`pm12e` | 詞義開頭 `[A+b+c]` | 5,097／201,614 列 | 緬甸阿毘達磨辭典的老式拆法，粗（否定前綴寫成 `Na`） |
| `pm1` | `<div class="viggaha">` 內 `[စိ+အ။ …]` | 155,166 列 | 緬文詞源／viggaha，含文法理由，緬文難直接用 |

`dpd` 的兩層分析長這樣（一個詞多種拆法，由粗到細）：

```
akaṇhāsukkavipākatta
  nt, abstr, comp
  akaṇha + asukka + vipāka + tta
  akaṇhāsukkavipāka + tta
  fact of having neither bad nor good results …
```

`pwa` 長這樣：

```
dhammacakkappavattana   → dhamma-cakka-pavattana(dhamma, cakka, pavattana)
kāraṇañcāti             → kāraṇaṃ-ca-iti(kāraṇa, ca, iti)      ← 連聲已還原
cakkhuviññāṇagocaravaṇṇāyatanabhāvato
  → cakkhu-viññāṇa-gocara-vaṇṇa-āyatana-bhāvato(cakkhu, viññāṇa, gocara, vaṇṇa, āyatana, bhāva)
```

### 10.3 對我們的實測

- **覆蓋**：`data/cs` 的 dn1–dn3＋mn1 共 42,902 個 `<詞>`、8,546 個不同詞形，
  `pwa` 命中 **8,512（99.6%）**；沒中的多是連聲黏在一起的形式
  （`sammāppadhānā`、`tevettha`、`tesappi`）。
- **接中文**：`pwa` 詞幹 → `opentipitaka_dict_zh`，實測 **95.5%** 的詞幹有中文條目；
  `opentipitaka_dict_zh` 的 74,686 個鍵就是 `dpd` 的詞頭（幾乎全收）。
  所以「長詞 → 拆 → 中文」這條鏈是通的：

  ```
  addhānamaggappaṭipanno
    → pwa: addhāna-magga-paṭipanno (addhāna, magga, paṭipajjati)
    → zh:  漫長旅程 ／ 道 ／ 踐行
  ```

### 10.4 坑

1. **`pwa` 的連字符不是原文切點。** 它會還原連聲：`sāpekkhāya → sa-apekkhāya`、
   `brāhmaṇamāṇavakānañca → brāhmaṇa-māṇavakānaṃ-ca`。實測只有 **48%** 去掉連字符等於原詞，
   所以**不能**拿它算 span／位置。要對齊原文，用我們已有的 CST 詞譜 `<詞 b="…">`
   （那是原文的切點），`pwa` 只當「詞形 → 詞幹」的字典。
2. **連字符段數 ≠ 括號段數**：`bhikkhusaṅghañca → bhikkhu-saṅghaṃ-ca(bhikkhusaṅgha, ca)`。
   要詞幹就解析括號，不要數連字符。
3. 詞幹是**字典形**（`paṭipajjati`、`antevāsin`），不是句中詞尾形（`paṭipanno`、`antevāsī`）。
   中文詞典也是按字典形收的，所以這點反而方便；但還原成原文要用第 1 條的辦法。
4. `pwa` 只有一列 meta（`pwa(pali words analyzer) | @sunanda generated by ai`），
   **沒有版本／model 戳**，品質無法逐條稽核；拆的粒度也不一致（`sammā-sambuddha` 切兩段，
   `bhikkhusaṅgha` 卻是一段），要細切就得靠 `dpd` 或 CST 詞譜交叉檢查。
5. 兩張 AI 字典（`opentipitaka_dict_zh`／`_en`）有 `model`、`input_hash`、`needs_review` 可稽核；
   中文那份換過三個 model（3.5／3.6／3.8-flash），`needs_review` 3,828 筆。
6. `dictionaries.db` 目前有 **418 MB 的 `-wal`** 沒 checkpoint；用 `mode=ro` 讀得到已提交的資料，
   但要複製檔案時**不能只複製主檔**。

### 10.5 取用方式（2026-11-03 更新）

**位置**（Windows，MSIX 版）：

```text
C:\Users\<user>\AppData\Roaming\Sunanda\OpenTipitaka\openTipitaka\databases\dictionaries.db
```

本機是 `C:\Users\yapch\AppData\Roaming\Sunanda\OpenTipitaka\openTipitaka\databases\dictionaries.db`。
不要只複製主檔；`-wal` 也要，或直接用唯讀連線：

```python
import sqlite3
DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
for k, c in con.execute("select dict_key, dict_content from pwa limit 5"):
    print(k, c)
```

**表格角色**（`dict_key` = 詞頭，`dict_content` = HTML／純文字）：

| 表 | 列數 | 我們怎麼用 |
|---|---:|---|
| `pwa` | 956,936 | 詞形 → 拆詞；`a-b-c(stem, stem)`。2026-11-03 修了 parser：**先對完整 content 用 `-` 切，再逐段去掉 `(...)`**；沒有連字號、但括號有 ≥2 詞幹的 18,318 條也要收 |
| `dpd` | 88,785 | 詞頭的語法＋`a + b + c` 結構（73,146 個複合 key）；只收詞頭，不收變格形 |
| `pm12e` | 204,363 | PMD 英譯版；`[Pati+khipa+tabba]` 是現成切分（143,548 個複合 key），`paṭikkhipitabba → pati+khipa+tabba` |
| `pm1` | 184,617 | PMD 緬文版；`viggaha` 內 `[ပတိ+ခိပ+တဗ္ဗ]`，要緬文轉羅馬才能直接用（目前沒接） |
| `opentipitaka_dict_zh` | 248,032 | 中文釋義；詞幹查中文用 |

**解析範例**：

```python
import re, sqlite3
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)

# pwa：連字號在「每個詞件」後面都可能有括號
for k, c in con.execute("select dict_key, dict_content from pwa where dict_key='khandhadhātu'"):
    s = str(c)
    if "-" in s:
        parts = [x.split("(")[0].strip() for x in s.split("-")]
        parts = [x for x in parts if x]
    print(parts)   # ['khandha', 'dhātu']

# pm12e：羅馬字複合結構
pat = re.compile(r"\[([^\]]+)\]")
for k, c in con.execute("select dict_key, dict_content from pm12e where dict_key='paṭikkhipitabba'"):
    for m in pat.finditer(str(c)):
        parts = [x.strip() for x in m.group(1).split("+") if x.strip()]
        print(k, parts)   # paṭikkhipitabba ['Pati', 'khipa', 'tabba']
```

**誰在用**：`src/decomp/whole-canon-lemma-stats.py`（pwa＋dpd＋pm12e＋lemma）、
`src/decomp/sandhi-dp.py`（pwa units＋dpd/pm12e keys）、`src/decomp/unsplittable.py`、
`src/decomp/export-unique*.py`。詞形→lemma 的中間產物是 `out/lemma-pwa.tsv`（956,935 列），
不是 DB 裡的表。

**已知限制**：`pwa` 的連字符是還原連聲後的切點，不等於原文 span；`pm12e` 的前綴
（`Na`、`Ava`）只是構詞層，不等於詞組；`pm1` 緬文要轉寫。`dictionaries.db` 會隨 App
更新，數字以實測為準。

> SuttaCentral 的 **PTS PED 精修版**不在 `dictionaries.db`：本地是
> `data/sc-dict/pli2en_pts.json`（16.8 MB、16,100 條），另有去 HTML 的
> `data/sc-dict/pts.tsv.gz`。來源、格式與和本地 `pe3` 的比較見
> [`data-sources.md`](data-sources.md) 的「PTS《巴利英詞典》精修版」。

## 11. 把 SC 經號接進轉換（2026-11-02）

`bun run src/cs-sc.ts` → 在 `data/cs/*.xml` 的 `<塊>`／`<小塊>` 上加 **`sc="…"`**：

```xml
<塊 id="d1" sc="dn1">(1. brahmajālasuttaṃ)</塊>
<塊 id="s45" sc="sn45">…</塊>
<小塊 id="a1b" sc="an1.11-20">(2. nīvaraṇappahānavaggo)</小塊>
```

- **不改 `id`**：`d1`／`a6` 是八個譯本共用的 `ck.n` 定位鍵，改了會全斷；SC 經號另外存。
- 對法：塊的第一個段 → DB 該段的第一列 → `suttas.tsv` 的 row 範圍 → `sc_uid`。
  相應部的「塊」是一整個相應，所以把 `sn45.1` 收成 `sn45`。
- 覆蓋：**576／650 個塊（88.6%）**。缺的 74＝`vs` 23＋`aas` 9（不在 `suttas.tsv`）
  ＋42（`sn5` 36、`an` 系 6；那些塊的起始段在 DB 找不到對應列）。
- 重打包後 11.70 → **11.72 MiB**，行數不變（133,922），`cs2accelon --check` 仍全符。

## 12. 反向檢查：句有沒有落在顯示塊裡（2026-11-02）

作法：DB `pali_text` → 拉丁化、去標籤／註 → 「詞＋列號」；我們的 XML 去標籤 → 「詞＋行號」；
**以段為單位**對齊（段內用 LCS，DB 的 `paranum` 只在段首，要往下補），
看同一句的詞是否跨到兩列以上。

| 書 | 段 | 詞對上率 | 跨塊的句 |
|---|---|---|---|
| dn1 | 559 | **99.8%** | 10 |
| an1 | 323 | **99.9%** | 3 |
| mn1 | 496 | **99.9%** | 5 |
| sn1 | 271 | **99.9%** | 27 |
| sn5 | 617 | **99.9%** | 81 |

- **文字幾乎逐詞相同（99.9%）**，所以這份 DB 可以當「同一底本的另一種切法」來對照。
- 跨塊的句只佔 0.2%（dn1 10／約 4,145）到 1.2%（sn5 81／約 7,000）——這是 CST 的
  印刷段落在句子中間斷開造成的，不是錯；我們的句是依 SC 分句走的。
- 教訓：`paranum` 只有段首那一列有值（dn1 1,061 列裡 502 列是空的、sn1 87% 是空的），
  要 **fill-down**；不對的話對齊率會假性掉到 20–50%。
