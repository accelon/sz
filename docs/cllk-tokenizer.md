# cllk 泰文 tokenizer（2026-11-02）

> 朱拉隆功泰譯（`cllk`）的 `cllk.adb` 分詞實測；與 `cs-mm` 的緬文 tokenizer 同一套做法。
> 程式：母區 `ts/src/tokenize.ts`、`ts/test/tokenize.test.ts`。

## 1. 之前

舊 tokenizer 把每個泰文字母當一個 token：

- 全庫只有 **356 個 token**（其中泰文 79 個，都是單字母）
- `พระพุทธเจ้า` 會被拆成 `พ`、`ร`、`ะ`、`พ`、`ุ`、`ท`、`ธ`、`เ`、`จ`、`้`、`า`
- 搜尋沒有詞彙意義

## 2. 現在

泰文改用：

```ts
Intl.Segmenter('th', { granularity: 'word' })
```

重建後：

| 項目 | 之前 | 現在 |
|---|---:|---:|
| token 數 | 356 | **11,310** |
| 泰文 token | 79 | **11,033** |
| 檔案 | 7.7 MiB | **7.69 MiB** |

### 查詢實測

| 查詢 | 命中 |
|---|---:|
| `พระพุทธเจ้า` | 2,156 |
| `พระ` | 1,000 以上 |
| `ธรรม` | 1,000 以上 |
| `พุทธ` | 1,000 以上 |

### 分詞樣本

```text
พระพุทธเจ้า
→ พระพุทธเจ้า        （一個詞，不是逐字母）

พระ พุทธ
→ พระ / 空白 / พุทธ
```

## 3. 已知限制

1. ICU 的泰文詞典是通用詞典；專有名詞、巴利借詞、複合詞仍可能切錯。
2. 沒有泰文 stoplist；常用詞與助詞會佔 posting。
3. 泰文標點（`ฯ` 等）目前仍可能進索引；要省 posting 可再加 `dropPunct`。
4. 桌面 WebView2 的 `Intl.Segmenter` 尚未實測；Chromium／Bun 已驗。

## 4. 重建指令

```powershell
cd D:\2026\sz
bun run src/pack.ts cllk
```

驗收：

```powershell
cd D:\2026\adb-converter\ts
bun test test/tokenize.test.ts
```

## 5. 下一步（如果要更準）

- 抽 100–200 句人工分詞，量 ICU 泰文 precision／recall。
- 針對巴利借詞與專有名詞建立自訂詞典。
- 再決定要不要加 stoplist；不要先砍助詞，否則 phrase 查詢會受影響。

