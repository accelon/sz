# 外部資料源清單（2026-11-03）

> 這一頁記「值得用、但還沒接進來」的外部資料，以及已經接進來的本地資料。
> 每筆都要有：位置、格式、為什麼重要、接了沒有。

## 一、sc-data 的英文字典（精修版 PTS）

作者指出的重要來源：**SuttaCentral `sc-data` 的 PTS 英文字典是精修過的，修正了原版很多錯誤。**

| | |
|---|---|
| 位置 | `https://github.com/suttacentral/sc-data/tree/d8545188/dictionaries/complex/en` |
| 版本 | 釘在 commit `d85451882dd1c73edb2cd9ac34a168587e14baf7` |
| 授權 | 待確認（sc-data 一般為 CC BY 4.0；引用時要標來源） |

目錄下三個檔：

| 檔 | 大小 | 內容 |
|---|---|---|
| `pli2en_pts.json` | **16.8 MB** | **PTS《巴利英詞典》精修版**——本頁的重點 |
| `pli2en_dppn.json` | 1.26 MB | DPPN（巴利專名詞典），人名地名 |
| `pli2en_dhammika.json` | 609 KB | Bhante Dhammika 的動植物／自然詞典 |

下載（任一種）：

```
https://raw.githubusercontent.com/suttacentral/sc-data/d85451882dd1c73edb2cd9ac34a168587e14baf7/dictionaries/complex/en/pli2en_pts.json
```

### 格式

JSON 陣列，每筆 `{ "word": "akka", "text": "<dl><dt><dfn>…</dfn></dt><dd><p>…</p></dd></dl>" }`。
`text` 是 HTML；`<a href='/define/xxx'>` 是交叉參照，`<a class='ref' href='https://suttacentral.net/…'>` 是出處。

### 為什麼重要

1. **它是 PTS 的精修版**：原版 PTS PED 有許多錯字、錯引、漏義（例如 `dīpa` 只寫燈、
   漏了「島」）；sc-data 這一版修過。我們本地 `dictionaries.db` 的 `pe3` 是**未修版**。
2. **`dīpa` 這種「梵語合流」的詞，正好需要它**：`dvīpa`（島）與 `dīpa`（燈）在巴利合流，
   本地 `dpd` 只給「lamp; light」，中文詞典給三義，PTS 精修版能補詞源與分義。
3. **DPPN** 補專名（人名、地名、族名），正是我們「專名表只有 670 條」的缺口。
4. **Dhammika** 補動植物與自然詞——註疏裡大量出現，本地的中文詞典與 dpd 都很弱。

### 已下載並比對（2026-11-03）

```
data/sc-dict/pli2en_pts.json   16.8 MB（原始）
data/sc-dict/pts.tsv.gz        2.3 MB（去 HTML、word + text 兩欄，16,100 列）
```

`bun run src/decomp/pts-compare.ts` 的結果：

| | sc-data（精修） | 本地 pe3（未修） |
|---|---|---|
| 條目 | **16,100** | 15,642 |
| 唯一詞頭 | 15,991 | 15,642 |
| 平均長度 | **342 字** | 307 字 |
| 含未清理 HTML | **0** | **13,990 條** |

- 交集 14,598；**只有 sc-data 1,393**；只有 pe3 1,044。
- 交集裡 sc-data 比 pe3 長：中位數 +10 字、90% 分位 +49 字、最長 +11,755 字。
- `dīpa` 一條就含三義（燈／島／豹皮），而且分得清楚：
  「Dīpa 1 a lamp …」「Dīpa 2 masculine & neuter an island, continent … terra firma,
  resting-place, shelter, refuge」。
- `te` 在 sc-data 有條目（`Te˚ secondary base of numeral three…`），**pe3 沒有**。

**結論：可用它取代 `pe3` 作為 PTS 來源。** `pe3` 保留做對照（它的詞源引文有時更完整）。

### 下一步（優先序）：

1. 抓 `pli2en_pts.json`，抽 200 個詞與本地 `pe3` 對照，確認「精修」在哪（錯字、漏義、補義）；
2. 若確認較好 → 以它取代 `pe3` 作為 PTS 來源；`pe3` 保留做對照；
3. DPPN 接進專名流程（目前用 `proper_noun` 670 條 + 前綴比對）；
4. Dhammika 接進中文釋義的候選（英文→中文需要翻譯，先當英文補充）。

---

## 二、本地已有的字典（`dictionaries.db`）

| 表 | 筆數 | 用途 | 狀態 |
|---|---|---|---|
| `pwa` | 956,936 | 詞形 → 詞件（拆詞主來源） | ✅ 已用 |
| `dpd` | 88,785 | 詞性、拆法、英文釋義 | ✅ 已用（但漏義，如 `dīpa` 缺「島」） |
| `opentipitaka_dict_zh` | 248,032 | 中文釋義（含多義項） | ✅ 已用 |
| `pm1` | 154,229 | 緬甸辭典的 viggaha（詞解析） | ✅ 第三層拆分 |
| `pe3` | 16,274 | PTS PED（**未修版**） | ⚠️ 被 sc-data 版取代為宜 |
| `pe5` | 330,972 | 語法表（形 → 性數格） | ⚠️ 只當候選，不靜默採用（92.9%） |
| `proper_noun` | 670 | 專名 | ✅ 已用（覆蓋不足，DPPN 可補） |

---

## 三、komyoji（光明寺日譯）

| | |
|---|---|
| 位置 | `D:\2026\komyoji\out\grammar\`（`tokens.tsv.gz` 765,155 列、`sentences.tsv.gz`） |
| 用途 | 逐詞語法標註（詞性／格／數／人稱） |
| 狀態 | ✅ 已接（投影 442,256 筆、形式 100% 相同） |
| 限制 | 只涵蓋 dn/mn/sn/an/kn；覆蓋我們語料 10.1% 的詞次 |

---

## 四、bilara-data（SC 的巴利原文與全部譯本）

作者 2026-11-03 指示：**記下，先不動工。**

| | |
|---|---|
| 位置 | <https://github.com/suttacentral/bilara-data> |
| 內容 | `root/pli/…`（巴利原文）＋ `translation/<lang>/<author>/…`（各語言譯本）＋ `reference/`；全部是**同一組 segment key**（如 `dn1:1.1.1`） |
| 為什麼重要 | 這是 SC 的原始 bilara 資料：巴利與每個譯本共用 key。若拿到**全文版**，就能把 `cs` 的每一行對到同 key 的譯本句，不必再靠共現猜——正好解掉 2026-11-03「輪 11」的阻塞（我們從 GitHub raw 抓的 `dn1_root-pli-ms.json` 只有 662 segment／7,808 詞，而 `data/sc/dn1` 有 45,274 詞，是節略版對全文） |
| 接之前要先驗 | repo 的 `dn1_root-pli-ms.json` 實測仍是 **662 段**（與 GitHub raw 相同），而 `data/sc/dn1` 有 4,151 行 → bilara 的 segment 比我們的 adb 行粗，接的時候要用「一段對多行」的對映，不是 1:1 |
| 授權 | 一般為 CC BY 4.0（引用要標來源）；待確認 |
| 本地 | `raw/bilara-data/`（2026-11-03 clone：`published` 分支、commit `b9c23ceb`、166 MB、44,101 檔；不進版控） |
| 狀態 | 📝 已 clone，**尚未接進流程**（作者指示先不動工） |

---

## 五、待辦

- [ ] 下載並比對 `pli2en_pts.json` 與 `pe3`
- [ ] 接 DPPN 補專名
- [ ] 接 Dhammika 補自然詞
- [ ] 確認授權與引用方式
- [ ] bilara-data（已 clone 到 `raw/bilara-data`）：評估用 segment key 對映；bilara 662 段 vs `data/sc` 4,151 行，需要「一段對多行」的對映（見 §四）
