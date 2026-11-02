# 定址規格：句層級（2026-11-02）

> 這一頁只講「怎麼指到一段文字」。原則（作者 2026-11-02）：
> **一切以 VRI 為準，異文、頁碼、其他來源的參照全部外部化，只要能追溯就好。**

## 1. 三層地址

```
區.書            目錄用（不定位）
塊.段            d1.7        ← 段（CST 的 pn）
塊.段:句         d1.7:3      ← 句（一個 adb 行）   ← 最小單位
```

- `塊`＝CST 的 chunk（`d1` 長部第一經、`m22`、`s5`、`a6`…），八個譯本共用同一套。
- `段`＝CST 的 `pn`；可以是範圍（`^n119-135`），照原樣當字串。
- `句`＝段內第幾行，**1 起算**；段標記所在的那一行就是第 1 句。

## 2. 怎麼解（閱讀器）

`anchorVa()` → `locatorVa()`（`ts/src/accelon26/page-text.ts`）：

1. `attributes/塊.id` 找塊的 VA；
2. `attributes/段.n` 找落在「這個塊到下一個塊」之間的第一個段；
3. 有 `:句` 時：用 `lines.virtual`（**每一行最後一個 token 的 VA**）找到段標記所在的行，
   往後推 `j-1` 行，起點 VA ＝ 上一行的行末 VA + 1；
   夾在「下一段」之前，單行段或超界就夾回段首；
4. 沒有 `<頁>` 標籤的庫（sz 系列）也照樣跳。

> 注意：adb 的 **VA 是 token 計數，不是字元位移**（`index-builder` 的 `addtoken`）。
> `fullTextIndex:false` 時仍然照 token 前進，所以 `lines.virtual` 照樣可用。

## 3. 為什麼這樣穩定

- 句就是 adb 的一行，行界由 `lines.virtual` 決定，**不必另外標 `<句>`**（省 13 萬個標籤）。
- 地址裡沒有絕對行號，只相對「塊→段→句」；重切長行、重打包都不影響。
- 段、塊、書的 id 都來自 CST，跨譯本一致，所以 `a6.7` 在八個庫指的是同一段。

## 4. 外部化的東西（正文裡沒有）

| 東西 | 放哪 | 怎麼用 |
|---|---|---|
| SC 經號 | `data/cs-index/suttas.tsv`；正文的 `<塊 sc="dn1">` | `dn1` ↔ `d1` 對照 |
| 書名（24 語） | `data/cs-index/tables.tsv` | 目錄、標題 |
| 紙本頁碼（m／v／p／t） | `data/cs-index/pages.tsv`（`書 塊 段 句 m v p t`，113,768 列） | 要翻紙本時才查；知道頁界落在哪一句 |
| 異文（variant） | `data/cs-index/variants.tsv` | 校勘時才查，見 §7 |

正文只有 `區`／`書`／`塊`／`段`／`詞` 這幾種標籤，沒有任何頁碼、版本注、校勘符號。

## 7. 異文（variants）怎麼外部化

`data/cs-index/variants.tsv`（`bun run src/cs-variants.ts`，**21,294 條／64 冊**）：

```
book  kind  seg  sentence  line  offset  pin  variant
an1   line  13   1         43            TIn0mId   TIInmIdVDM (sII sVyA kM pII)
dn1   para  8                                   55            anAcArII (k)
```

- `kind=line`（2,641 條）：VRI 的 `notes.json` 已釘到某一行 → 給 `段 句 行 釘`。
- `kind=para`（3,671 條）：斷句前就沒釘上，只知道落在哪一段（`y` 是 `段:小段`）→ 給 `段` 與當時的位移。
- `kind=note`（12,468 條）：由 `books/`／`ro/` 產生那 117 冊的 `<note>`（`out/cs-notes.tsv`），只到行／段／句，`pin` 空。
- `variant` 保留 VRI 原樣（儉約巴利），不改寫；`pin` 也保留原樣（含 `:n`／`<n` 次數）。
- 正文裡完全沒有這些東西；要校勘才查表，查法是「先 `塊.段[:句]`，再看這一段有沒有 variant」。

驗證：`line` 類的 `段／句` 由 `.cs.off` 的行號直接推得（行的 `^n` 標記），
`an1` 第 44 行（1-based）＝ `<段 n="13"/>`，表上就是 `seg=13 sentence=1` ✓。

## 5. 驗證（可重跑）

| 腳本 | 驗什麼 | 結果 |
|---|---|---|
| `out/addr-struct.mjs` | dn1 559 段的 `:1/:2/:3/:99` 是否遞增、不跨段 | **559/559 通過** |
| `out/addr-quick.mjs` | 13 個跨部類地址（含 `dhp-1.1`／`kp-1.2`／`mil-4.7`／`pt1-2.1`） | 12/13 解析（`sn45.1` 是 SC 號不是塊號，本來就不該解析） |
| `out/addr-regress.mjs` | `yh`／`sc`／`cs-mm` 的 `a6.7` 與 `a6.7:3` | 都正常（舊地址不受影響） |

## 6. 還沒做


- **異文的 `para` 類（3,671 條）**：只知道段、不知道句；要補就得回 `.cs.off` 對位移。

## 8. 詞層級定址（2026-11-02）

```
塊.段:句#詞     d1.1:5#4
```

- **詞序＝句內空白切詞的序號**（1 起算，標點不算）。
- 詞序**不寫進 adb**：一個 adb 行就是一句，詞界由文字本身決定，查詢時現算就可以。
  這樣不用為 930 萬個詞各插一個標記，而地址在任何時候都能重算出來。
- 閱讀端：`anchorVa()` 接受 `#詞`，但只跳到該句（詞的醒目提示要閱讀端自己切文字；
  見母區 `docs/adb/off-to-accelon.md` §6）。
- 工具：`src/cs-word-addr.ts`

```powershell
bun run src/cs-word-addr.ts d1.1:5#4        # → 第 5 句第 4 詞 antevāsī，詞譜 ante + vāsī
bun run src/cs-word-addr.ts --test 200      # 抽樣自檢（99/99 通過）
```

限制：

- 連聲處不會切開（`tathāgato` 是一個詞）——那是原文的樣子。
- 詞譜查 `data/cs-decomp/splits.tsv`（35,374 條）；查不到就只顯示詞形。
- 詞序會隨「句」的切法變動；句已經穩定，詞界（空白）也穩定，所以地址可以長期用。
