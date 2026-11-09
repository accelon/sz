# 交接手冊（2026-11-09）

> 給下一個接手的 Agent／人。**先讀完這一頁**，再讀 [`AGENTS.md`](AGENTS.md) 與母區
> `D:\2026\adb-converter\AGENTS.md`。這裡只寫「現在是什麼狀態、東西在哪、怎麼重跑、
> 還有哪些坑」，規格與原則不重複。
>
> 本次交接的 commit：**`86fdf09`**（2026-11-09，`main`，已 push 到
> <https://github.com/accelon/sz>）。之後的 commit 用 `git log -1 --oneline` 看。

## 1. 一句話

`D:\2026\sz` 是十種巴利譯本的 adb 建置工作區；成品在 `accelon26/`、**不進 git**。
2026-11-06 已完成 **cs 詞譜標籤 `<詞>` → `<辭>`**，重建了 `cs.adb`／`cs-lex.adb`，
**尚未發布**（依作者 2026-11-06 規則，adb 由母區統一部署）。

## 2. 現在的成品（`D:\2026\sz\accelon26\`）

| adb | 大小（bytes） | 建置時間 | 狀態 |
|---|---:|---|---|
| `cs.adb` | 124,965,051 | 2026-11-06 12:39 | **新**：`<辭>` 437,557、`<詞>` 0；sha256 前 12 `48253dfa294e` |
| `cs-lex.adb` | 2,826,760 | 2026-11-06 12:39 | **新**：`<辭>` 39,479、`<詞>` 0；sha256 前 12 `50bc371ff6e3` |
| `cs-mm.adb` | 8,393,846 | 2026-11-02 | 舊；緬譯，沒有詞譜標籤（`<詞>` 0） |
| `ped.adb` | 18,218,454 | 2026-11-04 | PED 字典；`<聯 i="cs?塊.段">` 78,809 次（cs 的 VA 沒變，連結不受影響） |
| `sc.adb`／`yh`／`ccc`／`pku`／`hz`／`kmj`／`xsq`／`cllk` | 見資料夾 | 11-02～11-05 | 這一輪沒動 |

- `accelon26/accelon26.exe` 已換成 **2026-11-09 RC5** 的複本（sha256 前 12 `7C1BF7574821`），
  這一顆認得 `<辭>`。舊備份是 `accelon26.exe.old-2026-11-02`。
- `D:\accelon3` 是母區的舊書庫，**沒有** sz 系列的 `cs.adb`；sz 系列一律留在 `accelon26/`。

## 3. 這一輪做了什麼：cs 詞譜 `<詞>` → `<辭>`

**為什麼**：作者 2026-11-06 指示，把 cs 的詞譜（`<詞 b j>`）和詞典（cyd／hydzd…）的
`<詞>` 詞頭分開；屬性 `b`／`j` 不變，只換標籤名。閱讀器新舊都認（見 §5）。

**改了什麼**：

| 檔案 | 內容 |
|---|---|
| `data/cs/*.xml` | 57 檔有詞譜：`<詞>`／`</詞>` → `<辭>`／`</辭>`（正文的「詞」字不動、長度不變）。**`data/` 不進 git**，重建方式見 §4 |
| [`src/provident-text.ts`](src/provident-text.ts) | 轉檔端直接產 `<辭 b j>`；從零重跑也是 `<辭>` |
| [`src/cs2accelon.ts`](src/cs2accelon.ts) | 驗收 regex 改 `<辭>` |
| [`src/cs-rename-tag.ts`](src/cs-rename-tag.ts) | **可重跑**的資料遷移：`bun run src/cs-rename-tag.ts`（`--check` 只盤點）；只動標籤、逐檔驗證「去掉標籤後文字一字不差」 |
| [`src/cs-tag-check.ts`](src/cs-tag-check.ts) | **驗收腳本**：`bun run src/cs-tag-check.ts`（見 §4） |
| `src/cs-split-exp.ts`、`cs-digit-exp.ts`、`src/decomp/*` | 讀 `data/cs` 的 regex 改吃 `<[詞辭]>`；`preview.ts` 產 `<辭>` |
| `README.md`、`docs/steps.md` §1.1、`docs/canon-status.md`、`docs/lex-pane.md` | 「目前格式」改成 `<辭>` |
| `version-log.md`（新進版控） | 2026-11-06 兩列：cs、cs-lex 的 sha／大小／buildTime／說明 |
| `docs/journal/2026-11-06.md`、`README.md`（journal 索引） | 當天札記 |

**數字**（驗收基準）：

- `data/cs`：`<辭>` 437,557（開＝閉）、`<詞>` 0；分佈在 **135,088 行**。
  （作者原話「約 135,088 個」是**行數**，不是標籤數；`grep -c` 的算法。）
- `cs.adb`：行 **1,028,311**、字元 **116,146,056**、tokens **841,154** —— 三項與改名前
  **完全相同**（所以搜尋、VA、`塊.段` 引用都不變）。
- `cs-lex.adb`：`<辭>` 39,479（DN1 12,530＋DN2 13,937＋DN3 13,012），行 22,527、詞條 2,479。
- `tags` 容器只剩 `辭`／`/辭`；`attributes` 是 `辭.b`／`辭.f`／`辭.j`（沒有 `詞.*`）。
- 渲染：用閱讀器的 `Accelon3Renderer` 實吃 adb 的行，仍長 `.word` span，`data-b`／`data-j` 都在。

## 4. 怎麼重建、怎麼驗收

```powershell
cd D:\2026\sz

# 只重建 adb（最常用；data/cs 已是 <辭>）
bun run src/pack.ts cs          # 約 75 秒，含全文索引 → accelon26/cs.adb
bun run src/build-cs-lex.ts     # → accelon26/cs-lex.adb

# 驗收（只讀）
bun run src/cs-tag-check.ts
# 會檢查：data/cs 與兩個 adb 的 <詞> 為 0、<辭> 開閉相等、tags/attributes 名稱、
# 詞譜仍長 .word span、cs.adb 的 <辭> 數＝data/cs（437,557）

# 閱讀器端（母區）
cd D:\2026\adb-converter
bun test ts/test/dict-annotations.test.ts   # 含「<詞 b> 走 word」「<辭 b/j> 走 word」
```

**從零重建 `data/cs`**（來源是唯讀的 `D:\2023\cs\off` 與 `raw/cst-deva`）：

```powershell
bun run src/cs-atta-ids.ts          # 注疏塊 id（來源壞掉，先修）
bun run src/cs-atta-normalize.ts    # → out/cs-src
bun run src/cs2accelon.ts           # 儉約巴利 → IAST + <辭> → data/cs
# 或 CST deva master 直譯（2026-11-03 之後的正式來源；骨架是 data/cs）：
bun run src/cs-deva-iast.ts         # → data/cs-deva-iast/，再換進 data/cs
```

注意：

- **`data/cs-deva-iast/`、`data/cs.bak-2026-11-02/` 還是舊 `<詞>`**（歷史備份，故意不動）。
  若你從這些備份重建 `data/cs`，先跑 `bun run src/cs-rename-tag.ts`。
- `data/` 整個被 `.gitignore` 忽略（可重建、133 MB）。換機器時 `data/cs` 要重建或另外 copy。
- `pack.ts cs --from <dir>` 可以從別的目錄打包（例如驗收 `data/cs-deva-iast`）。

## 5. 閱讀器／發布狀態（重要）

- 母區 `ts/src/accelon26/word-spec.ts`（2026-11-06 refactor）：
  `if (tag !== '詞' && tag !== '辭') return null;`，`<辭>` 有 `b/j/w` 就長 `.word` span，
  沒有 `b/j/w` 只留文字；`dictHead` 只給 `<詞>`。舊版閱讀器仍讀舊 `<詞>`。
- 母區 HEAD 已是 **RC5（2026-11-09）**；`D:\accelon3\accelon26.exe` 與本區
  `accelon26/accelon26.exe` 都是這一顆，**支援 `<辭>`**。
- **`cs.adb`／`cs-lex.adb` 還沒部署到官網**：依規則由母區統一部署。
  母區要的資料都在 [`version-log.md`](version-log.md) 的 2026-11-06 兩列；
  `deploy/adb-notes.json` 的說明文字可直接從那兩列剪。
- 本工作區**不要**自己跑 `publish-adb.ts`、不要改官網 manifest。

## 6. 還沒做／留給後人

1. **部署 cs**：等母區（或作者指示）。部署後確認兩個站 sha 與 manifest 一致。
2. **母區 `tag-style.ts` 的 `STRUCTURAL_TAGS` 沒有 `辭`**：設定 → 標籤樣式的清單看不到
   `<辭>`（只是樣式清單，不影響渲染）。要改在母區加一個字。
3. **其他 adb 沒重跑**：`cs-split.adb`（拆詞實驗）停在 11-03；`ped.adb` 的 cs 連結仍然有效
   （cs 的 VA／塊.段沒變），但若要求「最新 cs」可重跑 ped 的 link／pack（見 `docs/ped-todo.md`）。
4. **文件裡的歷史量測**（`docs/cs-pali-report.md`、`docs/sandhi-*.md`、
   `docs/accelon26-integration.md`、`docs/steps.md` 的 2026-11-02/03 區塊）仍寫 `<詞>`；
   那是當天的紀錄，不改寫。「目前格式」以 `README.md`、`docs/steps.md` §1.1 為準。
5. **`data/cs-dongheng/`（2026-11-09 新增，43 檔 119 MB）** 是另一個進行中的工作
   （東衡／字型對照？），不屬於這一輪；`data/` 不進 git，**不要清掉**。
6. **根目錄的 `*.tsv`**（`unique*.tsv`、`unsplittable*.tsv`、`sandhi-split.tsv`）是 2026-11-03
   decomp 分析產物，已被 `.gitignore` 排除；`src/decomp/*.py` 仍會讀它們，**先不要刪**。
7. **`out/` 有 506 MB 中間檔**（`lemma-pwa.tsv` 36 MB、`pwa-tree-all.tsv` 40 MB…）。
   `out/lemma-pwa.tsv` 是 `build-cs-lex.ts` 的輸入，**不要整包清掉**；
   要清就只刪你確定能重生的。
8. **`novel2/`** 是小說構思，與三藏建置無關，已 ignore。

## 7. 規則提醒（母區與本區的硬規矩）

- 不 commit `.adb`／`.zip`／`data/`／`out/`；成品放 `accelon26/`（sz 系列）。
- 每次建置 → `version-log.md` 加一列（日期／sha／大小／buildTime／說明／有沒有發布）。
- 每次工作 → `docs/journal/YYYY-MM-DD.md` 留一則，索引在 `docs/journal/README.md`。
- 不要改母區閱讀器（`ts/src/accelon26/*`）；要改在母區改。
- 不要未經指示發布官網 exe／adb，也不要改 `deploy/adb-status.json`。
- 共用 helper（漢字、VA、打包）一律用母區的，不在本區重寫。

## 8. 交接檢查清單

- [x] 最後一次建置可重跑（§4 指令；`src/cs-tag-check.ts` 全綠）
- [x] `version-log.md` 有 2026-11-06 兩列（cs、cs-lex）
- [x] `README.md` 的格式與 exe 說明已更新
- [x] 札記 `docs/journal/2026-11-06.md`（＋本手冊）
- [ ] 母區 `deploy/adb-notes.json` 的 cs 說明（等母區部署時一起做）
- [x] git commit／push（2026-11-09）
