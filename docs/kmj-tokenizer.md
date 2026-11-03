# kmj 日文 tokenizer（2026-11-02）

> 光明寺日譯（`kmj`）的分詞實測；與 cs-mm 緬文、cllk 泰文同一套「ICU 詞典」做法。
> 程式：母區 `ts/src/tokenize.ts`、`ts/test/tokenize.test.ts`。

## 1. 之前

舊 tokenizer 把日文漢字／假名逐字當 token：

- 全庫只有 **2,957 個 token**
- `仏陀` → `仏`、`陀`
- 查詢能命中，但只是字串相鄰，沒有詞的邊界

## 2. 現在

`kmj` 打包時開 `japanese: true`，`Tokenizer` 對漢字／假名使用：

```ts
Intl.Segmenter('ja', { granularity: 'word' })
```

重建後：

| 項目 | 之前 | 現在 |
|---|---:|---:|
| token 數 | 2,957 | **10,855** |
| 檔案 | 8.65 MiB | **6.62 MiB** |

### 查詢實測

| 查詢 | 命中 |
|---|---:|
| `仏陀` | 376 |
| `法` | 1,000 以上 |
| `比丘` | 1,000 以上 |
| `釈尊` | 50 |

### 分詞樣本

```text
仏陀は法を説いた
→ 仏陀 / は / 法 / を / 説 / い / た
```

## 3. 為什麼不全域開日文

中文庫（yh／ccc／hz／pku／xsq）也是漢字；若全域用 `ja`，會把中文詞亂切。
所以 `japanese` 只在 `pack.ts` 的 `name === 'kmj'` 時開，查詢端由
`SearchSession` 依 `reader.header.dbname === 'kmj'` 決定。

## 4. 已知限制

1. ICU 日文詞典對專有名詞、佛教複合詞仍可能切錯。
2. 沒有日文 stoplist；助詞（は／を／に…）會佔 posting。
3. `kmj` 的 `<註>` 目前沒有註文，tokenizer 不影響註。
4. 桌面 WebView2 的 `Intl.Segmenter` 尚未在 GUI 實測；Chromium／Bun 已驗。

## 5. 重建指令

```powershell
cd D:\2026\sz
bun run src/pack.ts kmj
```

驗收：

```powershell
cd D:\2026\adb-converter\ts
bun test test/tokenize.test.ts
```

