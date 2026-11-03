# cs：CST IAST 文字、分句對齊與拆詞策略（2026-11-03）

> 作者定案：**CST 文字本身應該是 IAST**；不要拿儉約巴利（provident）當正式文字。
> 先保住 CST／既有 IAST 的分句；分句一改，所有譯本都會聯動。
> 理想是 `cs` 存**拆好的詞**，unique token 才會下降。

## 目前 `cs.adb`

| 指標 | 數值 |
|---|---:|
| 文字 | **IAST** |
| 相異 token | **842,532** |
| 總出現次數 | 10,466,685 |
| 只出現 1 次（hapax） | 470,936（55.9%） |
| 行數 | **1,028,311** |
| 檔案 | 119.25 MiB |
| `??` | **1,820**（CST 原文，待 patch） |

## 分句對齊

目前 `data/cs` 是 IAST 對齊版（`data/cs.bak-2026-11-02`），行數與段數和 provident 版一致。

```powershell
bun run src/cs-align-check.ts
```

目前：**220 檔、1,028,311 行、lines/segs／逐行 `<段>` 位置不符 0**。

另比對 `cs.adb` 與 `cs.adb.old-2026-11-02`：

- 行數：1,028,311／1,028,311
- `<段>`：359,662／359,662
- 每個 `<段>` 落在同一行：**0 個差異**

## CST-raw 只作對照

先前試過 `cs2accelon --cst-raw`，得到的是儉約巴利文字（`DmVm` 等），不是 IAST；
分句也會因行長改變。因此：

- **不把 CST-raw 當正式 `cs.adb`**。
- 原始 raw 副本保留在 `data/cs.cst-raw-2026-11-03`，只作對照。
- 正式重建用 `bun run src/pack.ts cs`，不要用 `--cst-raw`。

## 為什麼 token 還是高

目前 `cs` 仍有 `<詞>`，但 token 仍是**表面形**：

```text
tajjanīyakammaṃ
```

不是：

```text
tajjanīya + kammaṃ
```

所以 unique token 還沒下降。下一步要用 patch／詞表提供詞邊界，索引只放拆好的詞，顯示保留原 surface。

## 下一步：拆詞但不動分句

```text
book  segment  sentence  surface            parts
cv    1        1         tajjanīyakammaṃ    tajjanīya|kammaṃ
```

- 保留目前 1,028,311 行與 `段:句`。
- 顯示保留 `tajjanīyakammaṃ`。
- 索引只放 `tajjanīya`、`kammaṃ`。
- 不要重跑 `cs2accelon` 改行。

## 重建

```powershell
cd D:\2026\sz
bun run src/pack.ts cs
bun run src/cs-align-check.ts
```

`pack.ts` 對 `cs`／`sc` 只做 `dropNumeric`／`dropPunct`；不改文字、不改行數。
