# sz — 新三藏（`sz.adb`）建置工作區

這個 repo 放**新三藏**的來源資料、轉換與打包腳本。通用的 adb 讀寫／打包工具在隔壁的
[`adb-converter`](../adb-converter) 工作區；閱讀器與官網也由那邊維護。

> **現況（2026-11-02）**：來源方向已定為**巴利三藏平行文本**（Pali Canon 的巴利原文＋
> 對應的漢譯平行文本）。版本、取用範圍、分層與頁 id 規則尚未定案；先不要把來源或格式寫死，
> 定案後補進本檔與 `docs/steps.md`。

- 版控：<https://github.com/accelon/sz>（分支 `main`）
- 成品：`D:\accelon3\sz.adb`（建置後才會有；不進 git）
- 母工作區：`D:\2026\adb-converter`（共用工具、紀律、版本紀錄）

## 來源

- **巴利三藏平行文本**：巴利原文，以及對應的漢譯平行文本。
- 可參考的既有資料（尚未定案，不要直接當成最終來源）：
  - `D:\2023\sc`：SuttaCentral `bilara-data` 產生的巴利／英譯（`README.md` 有格式與分句說明）。
  - `D:\2026\sc`：SC↔PTS 的對照與頁碼資料（`sc_pts_map*.csv`、`scdata/`）。
- 版本、授權、取用範圍與頁 id 規則定案後，寫進 `docs/steps.md` 與本節。

## 目錄

| 路徑 | 說明 |
|---|---|
| `AGENTS.md` | 這一區的規則；§0 要求先讀母區的紀律文件 |
| `src/` | 轉檔／patch／pack 腳本（建置要能從零重跑） |
| `data/` | 原始資料或小型對照表（唯讀；大檔與 zip 不進版控） |
| `docs/` | 這一庫的 steps、來源說明、限制 |
| `out/` | 中間產物與測試輸出（不進版控） |

## 開工前先讀

1. `D:\2026\adb-converter\AGENTS.md`（母區規則）
2. `D:\2026\adb-converter\docs\adb\adb-knowhow.md`（共用 know-how）
3. `D:\2026\adb-converter\docs\adb\adb-version-log.md`（版本紀錄）
4. `D:\2026\adb-converter\docs\adb\new-adb-workspace.md`（新工作區流程）

## 下一步

- [ ] 決定來源版本與取用範圍（哪些部類、巴利原文用哪一份、漢譯平行文本用哪一份）
- [ ] 決定頁 id 規則（本區討論；**不預設沿用 `NpMc`**）
- [ ] 把來源、版本、頁 id 規則寫進 `docs/steps.md`
- [ ] 建第一版文字 → `out/` → 打包 → `D:\accelon3\sz.adb`
- [ ] 在母區 `deploy/adb-notes.json` 與 `docs/adb/adb-version-log.md` 記帳 (sha／大小／buildTime)
- [ ] 要發布才跑 `publish-adb.ts`（大檔加 `--allow-large`）；官網 exe release 仍由母區
