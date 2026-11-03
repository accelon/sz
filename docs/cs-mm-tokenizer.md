# cs-mm 緬文 tokenizer（2026-11-02）

> 這頁記「緬譯巴利藏」的分詞現況；不是完整語言學驗收，而是重建後的實測。
> 相關程式：母區 `ts/src/tokenize.ts`（`Intl.Segmenter('my')`）、`ts/test/tokenize.test.ts`。

## 1. 之前

舊 tokenizer 走 Delphi 的 western 分支，把每個緬文字母當一個 token：

- 全庫 **113 個 token**
- `ဘုရား` → `ဘ`、`ု`、`ရ`、`ာ`、`း`
- 搜尋幾乎沒有詞彙意義

## 2. 現在

緬文改用：

```ts
Intl.Segmenter('my', { granularity: 'word' })
```

索引與查詢共用同一個 tokenizer。

| 項目 | 之前 | 現在 |
|---|---:|---:|
| token 數 | 113 | **9,341** |
| 緬文 token | 約 0 | **9,310** |
| 單字母 token | — | 72 |
| ASCII token | — | 20 |
| 檔案 | 15.77 MiB | **8.00 MiB** |

### 查詢實測

| 查詢 | 命中 |
|---|---:|
| `ဘုရား` | 6,569 |
| `ဗုဒ္ဓ` | 272 |
| `သံဃာ` | 765 |
| `တရား` | 1,000 以上 |

### 分詞樣本

```text
အကျွန်ုပ်သည် ဤသို့ ကြားနာခဲ့ရပါသည်
→ အကျွန်ုပ် / သည် / ဤသို့ / ကြားနာ / ခဲ့ / ရ / ပါသည်
```

## 3. 高頻 token

緬文標點 `၏`／`၊`／`။` 已在打包時用 `dropPunct` 排除（VA 照樣前進，片語不受影響）。
剩下最高頻的是助詞與內容詞：

- `သော`（關係詞）
- `ကို`（受格）
- `တို့`（複數）
- `သည်`（主格／句末）
- `မ`（否定）
- `ဖြစ်`（成為）
- `၌`（在）
- `ခြင်း`（動名詞）

這代表分詞大致落在詞的層級；也代表目前**沒有 stoplist**，常見助詞仍會佔 posting。

## 4. 已知限制

1. ICU 的緬甸詞典是通用詞典，專有名詞、複合詞、來源斷詞不一致時仍可能切錯。
2. 沒有做「人工分詞 vs ICU」的全面抽樣；目前只驗常用詞與樣本句。
3. 來源的英文表頭仍留下 `myanmar`、`tipitaka` 等 token；不影響緬文查詢。
4. 來源有 3 處 `p class="footnote"` 殘留，已用 `src/cs-mm-clean.ts` 清掉。
5. 桌面 WebView2 的 `Intl.Segmenter` 尚未實測；Chromium／Bun 已驗。

## 5. 重建指令

```powershell
cd D:\2026\sz
bun run src/cs-mm-clean.ts
bun run src/pack.ts cs-mm
```

驗收：

```powershell
# 母區
cd D:\2026\adb-converter\ts
bun test test/tokenize.test.ts
```

## 6. 下一步（如果要更準）

- 抽 100–200 句人工分詞，和 ICU 比對，量 precision／recall。
- 針對高頻誤切建立自訂詞典（例如 `အကျွန်ုပ်`、複合詞）。
- 再決定要不要加 stoplist；不要先砍助詞，否則 phrase 查詢會受影響。
