# 接縫碼：把經文存成「詞件＋規則數字」（2026-11-03）

> 作者的方向：經文直接存這個型態，tokenizer 只要切數字；渲染時再解回組合詞。
> 巴利語是有限集合，長詞搜尋時用 pwa 拆一下就好。
>
> 原型：[`src/decomp/sandhi-code.ts`](../src/decomp/sandhi-code.ts)
> （`bun run src/decomp/sandhi-code.ts`，預設 dn1）。

## 1. 格式

```text
sappiphāṇitameva
  pwa：sappi | phāṇitaṃ | eva
  編碼：sappi0phāṇitaṃ8eva
  解碼：sappi + phāṇitaṃ + eva
        0 = 不變；8 = ṃ+e → me
```

- 詞件之間放一個數字（必要時兩位，例如 `10`）。
- `0`＝identity，前後都不改。
- 其他數字的語意見 §2；解碼器只看數字左右各一個字。
- 數字必須「前後都是拉丁字母」才算接縫碼；否則是一般數字（頁碼、偈號）。
- 但 **`#` 引用 token 例外**：`(#snp0a/1;)`、`225#vism/586-587;` 裡的 `0`、`1` 是書號，不是接縫碼。tokenizer 看到 token 含 `#` 就整段跳過。

## 2. 規則表（11 條）

| 數字 | 名稱 | 動作（左字 L、右字 R） | 例 |
|---|---|---|---|
| 0 | identity | `L + R` | `sappi0phāṇitaṃ` |
| 1 | repeat-R | `L + R + R`（R 是子音） | `a1p` → `app` |
| 2 | repeat-L | `L + L + R`（L 是子音） | 少見；dn1 0 次 |
| 3 | elide-L | `R`（刪左字） | `sāmañña3atthaṃ` → `sāmaññatthaṃ` |
| 4 | elide-R | `L`（刪右字） | `o4i` → `o` |
| 5 | lengthen | 同族長母音 | `a5a` → `ā`；`i5i` → `ī` |
| 6 | coalesce | `a+i→e`、`a+u→o` | `a6i` → `e` |
| 7 | nasal-assim | `ṃ` + 子音 → 同部位鼻音＋子音 | `ṃ7c` → `ñc` |
| 8 | ṃ→m | `ṃ` + 母音 → `m` + 母音 | `ṃ8e` → `me` |
| 9 | vriddhi | `a+i→ā`、`a+u→ū` | `ca9iti` → `cāti` |
| 10 | insert-m | `L + m + R`（兩邊母音） | `a10e` → `ame` |

作者要求保留的兩個數字是 **1（repeat 右邊字母）** 與 **2（repeat 左邊字母）**。實測 dn1：repeat-R 170 次、repeat-L 0 次——重複右邊子音很常見，重複左邊幾乎沒遇到。

## 3. 多接縫例

```text
sāmaññatthañcāti
  pwa：sāmañña | atthaṃ | ca | iti
  編碼：sāmañña3atthaṃ7ca9iti
  解碼：
    3：a+a → a          sāmaññatthaṃ
    7：ṃ+c → ñc         sāmaññatthañca
    9：a+i → ā          sāmaññatthañcāti
```

## 4. dn1 實測（12,530 個 `<詞>`）

| 項目 | 數字 |
|---|---|
| 可編碼 | **9,473（75.6%）** |
| 無 pwa 拆解（原子／pwa 沒收） | 1,800（14.4%） |
| 有 pwa 拆解但規則接不回 | 1,257（10.0%） |
| 原字數 → 編碼後 | 138,623 → 151,815（**+9.5%**） |
| 數字總數 | 11,062（每詞 1.17） |
| token 數 | 23,418（原 12,530，**×1.87**） |
| round-trip 失敗 | **0** |

規則使用次數：

```text
0 identity 7,223 ｜ 3 elide-L 1,296 ｜ 4 elide-R 627 ｜ 8 ṃ→m 508
5 lengthen 409 ｜ 7 nasal-assim 339 ｜ 10 insert-m 174 ｜ 1 repeat-R 170
9 vriddhi 131 ｜ 6 coalesce 11 ｜ 2 repeat-L 0
```

mn1 交叉檢查（22,788 個 `<詞>`）：可編碼 72.9%、無 pwa 拆 17.4%、規則失敗 9.8%，
字數 +9.7%、token ×1.87、round-trip 0——與 dn1 同一個量級。

長詞搜尋（pwa 拆 → 連續 token）：dn1 最長五個複合詞都命中（各 2 次）。

## 5. 剩下 10% 是什麼

不是「規則不夠」居多，而是 **pwa 給的是詞幹，不是表面形**：

```text
attānañca    pwa: attan + ca     表面要 attānaṃ + ca
vīsampi      pwa: vīsaṃ + api    表面要 vīsa + mpi（刪 a + ṃ→m）
ekacco       pwa: eka + ci       表面要 eka + cco
itipetaṃ     pwa: iti + etaṃ     表面插入 p
salākahatthaṃ pwa: salākā + hatthaṃ  表面 ā→a
```

前四個是構詞／詞幹問題，不是 sandhi；再加規則也救不了。要拉高覆蓋率，方向是：

1. **per-seam escape**：只把接不回的那一個接縫存成表面片段，不要整個詞 fallback。
2. **換詞件來源**：dpd／pm1 或 CST 詞譜的切點，可能比 pwa 的詞幹更接近表面。
3. **加 2–3 條規則**：長母音縮短（`ā→a` 在子音前）、glide（`i→y`、`u→v`）、插入連結子音（`p/d/t`）。這會把 10% 壓到 5% 左右，但規則表就不再是「10 條」了。

## 6. 對儲存／索引的影響

- **優點**：tokenizer 只切數字，不必在索引端跑 pwa；詞件就是 token；渲染時解回表面形。
- **成長**：+9.5%（dn1），比 `cs` 目前 `b`/`j` 的 6.49 MiB 小；但 `b`/`j` 是可逆公式，這裡是規則數字。
- **`#詞` 位址**：token 從「表面詞」變成「詞件」，`塊.段:句#詞` 會變。作者說代價小、可重新定義；若外部有引用，需保留一個 surface-word 索引。
- **規則表版本**：必須 freeze + version；同一個數字換版不能換意思。
- **大小寫**：原型把詞轉小寫再編碼；專名（`Suppiya`）要在解碼後還原首字母大寫，或另存 case 旗標。
- **編輯**：編輯器要嘛顯示解碼後的字（存檔再編碼），要嘛只能編輯編碼形；這是另一個工程。

## 7. 重跑

```powershell
cd D:\2026\sz
bun run src/decomp/sandhi-code.ts        # dn1
bun run src/decomp/sandhi-code.ts mn1    # 別本書
```

輸出：可編碼／無 pwa／規則失敗、字數成長、token 數、規則使用、`sappiphāṇitameva` 例、長詞搜尋、guard 測試。
