# 提示詞：怎麼用 `cs-lex.adb`

> 給母區（accelon26 精讀模式）的 agent。這是**測試用**的詞庫 adb，只收 DN（dn1–dn3）的 lemma。

## 檔案

- `D:\2026\sz\accelon26\cs-lex.adb`（約 2.70 MiB；dn1–dn3 經文 1,360 段＋2,479 個 lemma、22,527 行）
- **目錄樹就是經文**（`<樹 s="*" t="區,書,塊.">`），顯示 dn1–dn3，像「只有 dn 的 cs」。
- 詞條用 `<條 w="lemma" iast="lemma">` 標記（**不在**樹的 tag 清單裡），查詞掃 tags 的
  `條.w`，不要用 `塊.w`。`w` 是查詞鍵，`iast` 是閱讀器 ruby／詞卡的顯示形。
- `dbname=cs-lex`、`dbcname=巴利詞庫（四語對齊）`
- 沒有全文索引；用 `條.w` 屬性查，不要用搜尋。

## 結構（經文在前、詞庫在後；樹只顯示經文）

```text
<檔 n="cs-lex"><集>巴利詞庫（四語對齊）</集>…</檔>
<區 id="a" t="書.">(a)</區>
<書 id="ab" t="塊.">(ab)</書>
<條 id="l000123" w="bhikkhu" iast="bhikkhu">(bhikkhu)</條>
sc-en：mendicant、monk
yh：比丘、僧
kmj：比丘、僧
```

- 一詞一條：`條.w` 是 Pali **lemma**（已去屈折），`條.iast` 是顯示形。
- 內文第一行是 `(lemma)`，之後每個語言一行：`<語言>：詞1、詞2`（分隔符是 `、`）。
- 沒有 `sc-en`／`yh`／`kmj` 的詞就不會有那一行。

## 怎麼讀（Bun／TS）

```ts
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
const r = await AdbReader.open(new SyncIO('accelon26/cs-lex.adb'));
const src = r.containers.get('source')!;
let all = '';
for (let i = 0; i < src.count; i++) all += await r.sourceText(i);
// 建 lemma → { sc-en?: string[], yh?: string[], kmj?: string[] }
```

更快的做法：掃 source 一次，用 `<條 id="…" w="…" iast="…">` 的 `w` 建 Map；或直接讀 `attributes/條.w` 的 VA 清單。

## 給 ruby 的用法

1. 拿正文的 Pali 詞形（surface），先經 `out/lemma-pwa.tsv`（或執行期的 pwa 表）換成 lemma。
2. 用 lemma 查這個 adb，取目標語言那一行，按 `、` 切開就是候選詞。
3. 一次只顯示一種語言；hover 顯示全部候選，點擊展開詞卡（詞卡可再查 `lex.adb` 的完整釋義）。

## 限制（測試版）

- 只收 **dn1–dn3** 的 lemma；其他書查不到是正常的。
- 詞對是**共現挖掘**的結果，會有錯（例如 `ābādha` 的英文是 sound／grounds）。
  正式版要加分數門檻、同形詞分義與人工校對。
- 沒有詞形／格位／次數欄位；需要的話下一版再加。
