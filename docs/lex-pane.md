# lex-pane（右欄「詞」分頁）現況（2026-11-03）

> 右欄分頁，不是浮動抽屜；**沒有改 `dict-pane`**。程式：`ts/src/accelon26/lex-pane.ts`、
> 分頁鉤子 `lex-hooks.ts`、模板 `#lexInTab`／`data-tab="lex"`。

## 1. 觸發

- 本文只有 cs 的 `<辭 b j>`（舊版是 `<詞 b j>`，閱讀器兩種都認）會渲染成 `.word` span。
- 單擊 `.word`，或精讀模式點 ruby（`accelon26:lexword`）→ 切到右欄「詞」分頁。
- 拖曳選取時不搶（`selection.isCollapsed` 檢查）。
- 分頁沒有關閉鈕；切到別的分頁就收起來。

## 2. 顯示內容

| 區塊 | 來源 |
|---|---|
| 詞形 | `.word` text |
| 詞譜 b/j | `data-b`／`data-j` |
| 位置 `塊.段:句#詞` | `page-text.ts:locatorAtVa()`，可複製 |
| 次數／中文／詞件／格位／上下文／詞幹／PTS／義項 | `lex.adb` 的 `<塊 w>` 詞條 |
| 例句 | cs token postings 的前 1–3 句，只取含該詞形的行；點例句跳到該行 |
| 詞件拆解樹 | `詞件：a + b` 以 `+` 拆；每個詞件可點，切到該詞 |
| 格位長條 | `格位：主60 · 属40` 這類多項時才畫 |

## 3. 已驗證

實測 cs `tajjanīyakammaṃ`（lex.adb 在 catalog 時）：

```text
位置 cv1.1:1#1
278 次
呵责羯磨
例句 yo kho, upāli, samaggo saṅgho…
詞件 tajjanīya + kammaṃ
tajjanīyakammaṃ
├ tajjanīya
└ kammaṃ
```

## 4. 限制

- 例句是 token postings 的前幾句，不是人工標註例句庫。
- 詞件樹只拆 `+`，不是完整詞族網路。
- 詞形 lookup 先找 `lex.adb` 的 `attributes/塊.w`；找不到就只顯示 b/j。
- `lex.adb` 必須在 catalog／桌面清單；dev server 只開 cs-lex 時查不到 lex 詞條。
- 位置目前是 adb 行內算出的 `塊.段:句#詞`；句子界線以 adb 行為準，不是語言學斷句。

## 5. 測試

`lex-pane` 沒有獨立單元測試；以 `build/tmp-lex-tab-test.ts`（CDP）驗證：

- cs-lex `.word` 1,006 個；精讀 ruby 41 個
- 單擊 `.word`／ruby 都切到 `data-tab="lex"`，`#lexInTab .lexWord` 有詞形

正式回歸還缺一個穩定的 browser test。
