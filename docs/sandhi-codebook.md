# 1+1 頻次 codebook 實測（2026-11-03）

> 用 [`sandhi-patterns-11.tsv`](../data/cs-decomp/sandhi-patterns-11.tsv) 的前 500 名，
> 加上 **0 = identity**，在 dn1／mn1 上量「可編碼率、fallback、正文成長、token 數」。
>
> 原型：[`src/decomp/sandhi-codebook.py`](../src/decomp/sandhi-codebook.py)
> 資料來源：pwa 769,086 條有拆解；只讀 `data/cs`，不寫檔。

## 1. 做法

- Codebook：`0` + code 1..500（按頻次）；每個 code 對應一個 `(left, right) → result`。
- 對每個 `<詞>`：
  1. 用 pwa 的詞件，1+1 窗口取每個接縫的 `(left, right, result)`。
  2. 若 `result == left+right` → code 0；否則是表裡的 code；表裡沒有 → **seam escape**。
  3. 任何一個接縫 escape，整個詞 fallback（存表面，不拆）。
  4. 組出 `parts[0] + code + parts[1] + …`，再 decode 回表面；**decode 不等於原詞 → 也 fallback**（不算成功）。
- 這樣「可編碼」的每一個詞都是 **lossless**：decode 一定回到原詞。

## 2. 結果

### dn1（12,530 個 `<詞>`）

| 項目 | 數字 |
|---|---:|
| 可編碼（lossless） | **10,137（80.9%）** |
| word fallback | 2,393（19.1%） |
| － 無 pwa 拆解 | 1,800（14.4%） |
| － 接縫 escape | 193（1.5%） |
| － 詞幹尾巴不合 | 394（3.1%） |
| － 接縫抽取不完整 | 6（0.05%） |
| 接縫 | 12,422（identity 7,634；escape 193＝1.55%） |
| 字數 | 138,623 → 155,797（**+12.4%**） |
| token | 24,209（原 12,530，**×1.93**） |

### mn1（22,788 個 `<詞>`）

| 項目 | 數字 |
|---|---:|
| 可編碼（lossless） | **17,823（78.2%）** |
| word fallback | 4,965（21.8%） |
| － 無 pwa 拆解 | 3,957（17.4%） |
| － 接縫 escape | 247（1.1%） |
| － 詞幹尾巴不合 | 747（3.3%） |
| － 接縫抽取不完整 | 14（0.06%） |
| 接縫 | 22,311（identity 12,434；escape 248＝1.11%） |
| 字數 | 254,796 → 286,555（**+12.5%**） |
| token | 43,916（原 22,788，**×1.93**） |

### 前 500 vs 前 1,000（dn1）

| | 前 500 | 前 1,000 |
|---|---:|---:|
| 可編碼 | 80.9% | **81.5%** |
| 接縫 escape | 1.55% | 0.88% |
| 詞幹尾巴不合 | 394 | 401 |
| 字數成長 | +12.4% | +12.5% |

多收 500 條只換來 0.6 個百分點；**瓶頸已經不是 codebook，而是詞幹尾巴**。

### 加上 fallback（整合版）

`src/decomp/sandhi-codebook.py` 已經接上 §5.1 的兩層救援：codebook 接不回時，
先試「詞幹 + 屈折」，再試「pwa 切點 ±3 的兩階拆分」。救援結果用 `+` 分隔的
**表面片段**存（例如 `purisapuggala+assa`、`uttari+manussa+dhammā`），
片段直接串接就等於原詞，所以仍然是 lossless。

| | dn1 | mn1 |
|---|---:|---:|
| codebook 可編碼 | 10,137（80.9%） | 17,823（78.2%） |
| fallback 救援 | **487（3.9%）** | **825（3.6%）** |
| **合計 lossless** | **10,624（84.8%）** | **18,648（81.8%）** |
| word fallback | 1,906（15.2%） | 4,140（18.2%） |
| － 無 pwa 拆解 | 1,800 | 3,957 |
| 字數成長 | +12.8% | +12.8% |
| token | ×1.97 | ×1.97 |

dn1+mn1 合計：**29,272／35,318＝82.9%** lossless。剩下的絕大多數是
`no_pwa` 的原子詞（`sāriputta`、`hetu`、`natthi`），它們本來就是一個 token，
不算損失；真正的 word fallback 只有 dn1 106 個、mn1 183 個（接縫 escape＋
詞幹尾巴不合＋接縫抽取不完整）。

### 再放寬：部分切分（作者：不在乎完美）

既然不需要完美拆分，最後一層是「**找最長的已知前綴或後綴，切兩件**」：

- 前綴／後綴 ≥4 字，且覆蓋原詞 ≥50%；尾巴不要求是詞。
- 片段是表面子串，直接串接等於原詞；只是尾巴可能不是詞。
- **高頻詞不切**：同一本書出現 ≥50 次的詞（`sāriputta` 233、`tathāgato` 131、
  `natthi` 170）保持一個 token；硬拆反而礙眼。

| | dn1 | mn1 |
|---|---:|---:|
| codebook + fallback | 84.8% | 81.8% |
| 再部分切分（freq < 50） | **+7.0%** | **+8.1%** |
| **合計有切** | **91.8%** | **89.9%** |
| word fallback | 1,023（8.2%） | 2,302（10.1%） |
| － 無 pwa 拆解 | 983 | 2,271 |
| 字數成長 | +13.4% | +13.5% |
| token | ×2.05 | ×2.05 |

例：`mahāyaññaṃ` → 詞幹 fallback；`tathāgato`（131 次）不切；
低頻長詞如 `poṭṭhapāda` → `poṭṭhapā+da`、`sacchikatvā` → `sacchi+katvā`。

若**完全不設頻次門檻**，部分切分會到 8.4%／10.0%，合計有切 93.2%／91.8%，
word fallback 6.8%／8.2%，但會把 `tathāgato` 這類高頻詞也切開；作者認為沒必要，
所以目前預設 `FREQ_MIN = 50`。

代價是尾巴可能是碎片（`da`、`ssa`、`gato`），這層只為 tokenizer／搜尋，
不當語法分析。剩下 8.2%／10.1% 幾乎都是高頻短詞或專名（`sāriputta`、`hetu`、
`natthi`），本來就一個 token。

## 3. 詞幹尾巴不合是什麼

pwa 的詞件是**字典形／詞幹**，表面形的最後一段常常是屈折尾巴，不在詞件裡：

```text
lohitahomaṃ   pwa: lohita + homa       表面多一個 ṃ
subhakiṇhato  pwa: subha + kiṇha       表面多一個 to
chaṭṭhanayabhūmiparicchedo
              pwa: … + pariccheda      表面多一個 o
ekacco        pwa: eka + ci            表面是 cco
ajjhattaṃ     pwa: adhi + attaṃ        表面是 ajjha…
```

這不是 decoder 的 bug，是 **pwa 的詞件沒有覆蓋表面尾巴**。目前的編碼器只檢查接縫，沒有檢查每個詞件本身是否等於表面片段；decode 驗證把這些抓出來，然後 fallback。

### 怎麼修

1. **把最後一個詞件改成表面尾巴**（canonical part）：`homa`→`homaṃ`、`kiṇha`→`kiṇhato`、`pariccheda`→`paricchedo`。這樣 decode 就對，接縫也不變。
2. 或加一個 **suffix code**：`詞件 + 尾巴碼 + 尾巴字串`；只對最後一段編碼。
3. 或把「詞幹尾巴不合」也算進 escape 率，接受 3% 的 word fallback。

作者之前指出的就是這件事：**pwa 給詞幹，可以改成表面需要的形**。`src/decomp/boundary-fallback.py` 驗證了「詞幹 + 屈折」與「兩階拆分」：303 個 hard 詞裡可救 203 個（67.0%），覆蓋 1,312 次（81.9%）；這層已接進 `sandhi-codebook.py`（見 §2 整合版），dn1 84.8%、mn1 81.8%。

## 4. 接縫 escape 的實際成本

- dn1 的接縫 escape 只有 **193／12,422（1.55%）**；mn1 是 **248／22,311（1.11%）**。
- 用前 1,000 名可以壓到 0.88%，但只多 0.6 個百分點的可編碼率。
- 所以 codebook 本身已經夠用；接下來把力氣放在「詞幹尾巴」與「無 pwa 拆解」上，比繼續加大表有效。

## 5. 接不回的詞（dn1 + mn1）

只算詞形（去重），dn1+mn1 共有 **1,053 個**接不回：

| 原因 | 詞形數 | 意思 |
|---|---:|---|
| `no_pwa` | 750 | pwa 根本沒有拆解（多為原子詞、專名） |
| `shape_fail` | 201 | 有 pwa 拆，但詞幹尾巴和表面不合 |
| `seam_escape` | 92 | 有 pwa 拆，但某個接縫不在 top 500 |
| `seam_missing` | 10 | 接縫抽取不完整 |

其中真正「有 pwa 拆但接不回」的 **hard** 有 **303 個**。依詞頻前 10：

| 次數 | 長度 | 詞 | 原因 |
|---:|---:|---|---|
| 160 | 9 | `ajjhattaṃ` | shape_fail |
| 91 | 16 | `purisapuggalassa` | shape_fail |
| 52 | 6 | `ekacco` | shape_fail |
| 49 | 12 | `āneñjappatte` | shape_fail |
| 45 | 9 | `attānañca` | seam_escape |
| 43 | 10 | `pariyodāte` | seam_escape |
| 42 | 14 | `attānukkaṃseti` | shape_fail |
| 35 | 10 | `mahāyaññaṃ` | shape_fail |
| 31 | 19 | `uttarimanussadhammā` | shape_fail |
| 30 | 12 | `iddhānubhāvā` | shape_fail |

依長度前 5：

| 長度 | 次數 | 詞 | 原因 |
|---:|---:|---|---|
| 38 | 1 | `abhijjhālukāmesutibbasārāgasandosahetu` | seam_escape |
| 37 | 1 | `viññāṇañcāyatanasukhumasaccasaññīyeva` | seam_escape |
| 31 | 2 | `nevasaññānāsaññāyatanūpapattiyā` | shape_fail |
| 31 | 1 | `adukkhamasukhasukhumasaccasaññā` | shape_fail |
| 31 | 1 | `asandiṭṭhiparāmāsianādhānaggāhi` | seam_escape |

**注意**：全部 1,053 個的詞頻第一名是 `sāriputta`（233 次），但它是 `no_pwa`——pwa 沒有拆解，不代表它需要拆；它本來就是一個專名。要看真正該修的，請用 `unresolved-hard-*`。

### 5.1 救援：詞幹 + 屈折 + 兩階拆分

`src/decomp/boundary-fallback.py` 對 303 個 hard 詞做三層救援：

1. **連字號**：`nevasaññānāsaññāyatana-upapattiyā` → `nevasaññānāsaññāyatana` ＋ `upapattiyā`。
2. **pwa 已有 3 件以上**：以 pwa 切點為中心，左右移 0–3 字，每件 ≥4 字、都是 pwa 詞；
   `uttarimanussadhammā` 的 pwa 切點是 `uttarima|manussa|dhammā`（接起來多一個 `ma`），
   往左移 2 字就是 `uttari|manussa|dhammā`，完全接回表面。
3. **詞幹 + 屈折**：用 31 個常見結尾（`assa/āya/esu/…`）加簡單 sandhi
   （`a+o→o`、`a+e→e`、`a+ā→ā`、`ṃ+c→ñc`）找詞幹：
   `purisapuggalassa` → `purisapuggala` ＋ `assa`；`ekacco` → `ekacca` ＋ `o`；
   `attānañca` → `attānaṃ` ＋ `ca`。

結果：

| | 詞形 | 佔 hard | 次數 | 佔 hard 次數 |
|---|---:|---:|---:|---:|
| 可救援 | **203** | **67.0%** | **1,312** | **81.9%** |
| 仍接不回 | 100 | 33.0% | 289 | 18.1% |

仍接不回的前幾名：`attānukkaṃseti`（42，跨詞 sandhi）、`yaññadeva`（14）、
`adhiccasamuppannikā`（11）、`sampadamidaṃ`（11）、`brāhmaṇosmī`（11）。
這些多半是兩個詞的連音（`attānaṃ` + `ukkaṃseti`），不是單一詞的屈折。

產物：`data/cs-decomp/hard-fallback.tsv`（word / count / kind / segments）。

排序檔：

| 檔 | 內容 |
|---|---|
| `data/cs-decomp/unresolved-words-by-freq.tsv` | 全部 1,053 個，詞頻降冪 |
| `data/cs-decomp/unresolved-words-by-length.tsv` | 全部 1,053 個，長度降冪 |
| `data/cs-decomp/unresolved-hard-by-freq.tsv` | 303 個「有拆但接不回」，詞頻降冪 |
| `data/cs-decomp/unresolved-hard-by-length.tsv` | 303 個，長度降冪 |

## 6. 重跑

```powershell
cd D:\2026\sz
python -X utf8 src/decomp/sandhi-codebook.py 500 dn1 mn1
python -X utf8 src/decomp/sandhi-codebook.py 1000 dn1
python -X utf8 src/decomp/unresolved-words.py          # 接不回的詞，按詞頻／長度排序
```

輸出：可編碼（lossless）、fallback 細分、接縫 escape、字數成長、token 數、code 使用、shape fail 例。

## 7. 還沒做

- 救援規則已接進 `sandhi-codebook.py` 的 encoder；目前 fallback 用 `+` 分隔表面片段，還沒有正式的 escape 容器格式。
- 還沒測 sn1／an1／全 219 冊。
- 還沒定 escape 的實際格式（目前是 word fallback；per-seam escape 見 [`grammar-arsenal.md`](grammar-arsenal.md) 的討論）。
- 大小寫、`#詞` 位址、規則表 freeze＋version 仍待處理。

## 8. 頭痛率（dn1–dn3）

用同一批語料（`data/cs` 的 dn1–dn3 全部詞，144,143 個）、同一個定義
（未拆詞音節中位數 = 3；頭痛率＝音節數 >3 的單位占比），量切完後的結果。
「freq≥50 不切」是先前的高頻保護；「全部可切」是作者後來指示放寬的版本。

| | 未拆 | freq≥50 不切 | 全部可切 |
|---|---:|---:|---:|
| 單位數 | 144,143 | 211,896（×1.47） | **217,060（×1.51）** |
| 音節中位數 | 3 | 2 | 2 |
| 平均音節 | 3.25 | 2.26 | **2.20** |
| **頭痛率** | **38.9%** | **9.9%** | **8.4%** |
| **unique token** | **17,349** | 12,884（74.3%） | **12,871（74.2%）** |

分書（全部可切）：dn1 37.4→**7.6%**、dn2 39.6→**8.7%**、dn3 39.8→**8.8%**。
unique 分書：dn1 6,006→5,507、dn2 8,877→7,507、dn3 8,162→7,006。

**unique token 降低 25.8%**（17,349 → 12,871，少 4,478 個）；放寬高頻詞只讓頭痛率
從 9.9% 降到 8.4%，unique 幾乎沒再降（12,884 → 12,871）——因為高頻詞拆出來的
成分多半本來就常見，不會新增 unique。

拆開看 unique 的加減：

| | 數量 |
|---|---:|
| 原詞型 | 17,349 |
| 拆後消失的詞型 | **12,386（71.4%）** |
| 拆後新出現的詞件型 | 7,908 |
| 淨減 | **4,478（−25.8%）** |

拆後 12,871 個單位中，**10,880 個是 pwa 詞**，只有 1,991 個是尾巴／碎片。
若只把「已知詞」算 token（碎片不算），unique 是 **17,349 → 10,880（−37.3%）**。
所以「大幅減少」表現在兩處：**71.4% 的舊詞型消失**、**已知詞彙 −37.3%**；
淨 unique 只減 25.8%，是因為 7,908 個詞件型補了進來。

### 四部 Nikaya（只算已知詞，碎片不算）

| 部 | 詞數 | 未拆頭痛 | 切後 units | 切後頭痛 | unique 前→後 | unique/千詞 |
|---|---:|---:|---:|---:|---:|---:|
| dn | 144,143 | 38.9% | 205,905 | **7.8%** | 17,348 → **10,880** | 75.5 |
| mn | 247,419 | 38.6% | 352,896 | **7.6%** | 21,517 → **12,536** | 50.7 |
| sn | 267,689 | 37.0% | 383,771 | **6.8%** | 23,040 → **12,762** | 47.7 |
| an | 302,763 | 37.8% | 439,824 | **7.7%** | 25,462 → **13,783** | 45.5 |

累計 unique（依序 dn → mn → sn → an）：

| 累計到 | 累計詞數 | 累計 unique | 每次新增 | unique/千詞 |
|---|---:|---:|---:|---:|
| dn | 144,143 | 10,880 | — | 75.5 |
| ＋mn | 391,562 | 16,462 | **+5,582** | 42.0 |
| ＋sn | 659,251 | 20,704 | **+4,242** | 31.4 |
| ＋an | 962,014 | 24,119 | **+3,415** | 25.1 |

作者的估計是對的：**unique 的增速明顯放慢**。每多一部，新增 unique 從 5,582
降到 4,242、再降到 3,415；unique/千詞從 75.5 一路降到 25.1，接近飽和。

### 全藏（快速投影）

`src/decomp/whole-canon-split-stats.py` 用 pwa 詞件直接拆（不跑 codebook，含注疏）。
後來發現 pwa 有 **18,318 條「沒有連字號、但括號裡有 ≥2 個詞幹」** 的條目
（例：`uttarimanussadhammapeyyālanīlacakkapeyyālādivavatthāpanavasena(uttari, manussa, dhamma, peyyāla, nīla, cakka, peyyāla, ādi, vavatthāpana, vasa)`），
原本被當成原子詞；`whole-canon-paren-stats.py` 把括號詞幹也拿來遞迴拆。

| | 只拆連字號 | **加括號詞幹＋遞迴** |
|---|---:|---:|
| unique（未拆） | 914,104 | 914,104 |
| unique（全部單位） | 231,155（−74.7%） | **199,909（−78.1%）** |
| unique（只算已知詞） | 128,423（−85.4%） | **97,714（−88.9%）** |
| units | 16,193,487（×1.58） | 16,644,060（×1.62） |
| 頭痛率 | 40.0% → 10.0% | 40.0% → **8.5%** |
| 平均音節 | 3.46 → 2.27 | 3.46 → **2.22** |
| unique/千詞 | 12.5 | **9.5** |

作者指出的長詞現在拆成：

```text
uttarimanussadhammapeyyālanīlacakkapeyyālādivavatthāpanavasena
→ uttari | manussa | dhamma | peyyāla | nīla | cakka | peyyāla | ādi | vavatthāpana | vasa
```

全藏從 91 萬 unique 降到 **9.77 萬個已知詞**（含碎片是 19.99 萬），unique/千詞 9.5。

### 再往下的兩種強拆（都變差）

| 方法 | unique known | 頭痛率 |
|---|---:|---:|
| **paren＋遞迴＋top-level loose＋dpd（len≥12）** | **96,935** | **8.1%** |
| paren＋遞迴＋top-level loose | 97,714 | 8.5% |
| loose 也套進 paren 詞件 | 105,200 | 10.0% |
| DP 把長單位切成已知詞 | 163,548 | 16.8% |
| 3–4 音節已知詞當前綴（只切前綴） | 242,683 | 23.2% |
| 3–4 音節已知詞出現在哪裡就切 | 232,346 | 23.6% |
| 3–4 音節前綴＋後綴都切 | 216,650 | 21.5% |
| dpd 全長度都套（不設 len≥12） | 85,638 | 13.5%（units ×3.13） |

**dpd 的用法**：pwa 拆不動、且詞長 ≥12 時，用 dpd 的複合結構
（`a + b + c`，取最多件的那一層）當切點。這一層只讓 unique 少 779 個、
頭痛 8.5→8.1%，units ×1.62→×1.64，是很小的邊際改善。

**dpd 全長度都套**會把 unique 壓到 85,638，但 units 暴增到 ×3.13（`a`、`tta`
這種碎片全跑出來），頭痛反而 13.5%——不採用。

**komyoji** 是逐詞的 in-context 標註（詞形、品詞、格位），不是複合詞的
sub-word 切分；它可以幫忙對齊／還原詞形，但無法直接提供「長詞切成哪幾件」。
所以這一輪只引入了 dpd。

原因：把正常的長屈折詞切成小已知詞，會**新增**很多 unique，而且留下的尾巴
仍然長；單位的「短」沒有換到整體的「少」。3–4 音節前綴切法雖然勇敢，但
尾巴沒有繼續切成短單位，長尾仍然 >3 音節，頭痛率反而升到 23%。

### lemma 化（pwa lemma ＋ komyoji root ＋ dpd）

切完之後再把每個單位映射到 lemma：

- **pwa lemma**：`out/lemma-pwa.tsv`（939,703 個 form → lemma；`bhagavato→bhagavant`、
  `dhammā/dhammassa/dhammaṃ→dhamma`）。這是主力，覆蓋 15.92M 詞次。
- **komyoji root**：42,405 個 form 有 root；只補到 56,054 詞次（0.3%），因為 pwa lemma
  已經先接走了。komyoji 的長詞原形本身也已被 pwa lemma 拆成詞幹。
- **dpd lemma**：dpd 的詞頭與 pwa lemma 高度重疊；主要用它的複合結構當切點。

| | 未 lemma | **lemma 後** |
|---|---:|---:|
| unique all | 914,104 | **125,607（−86.3%）** |
| unique known | 877,503 | **16,983（−98.1%）** |
| units | 16,644,060 | 16,932,427（×1.65） |
| 頭痛率 | 8.5% | **8.1%** |
| 平均音節 | 2.22 | **2.21** |

全藏 91 萬個屈折形，lemma 後只剩 **16,983 個已知詞幹**（含未知名是 125,607）。
這已經接近 Pali 辭典的詞幹規模。產物：[unique-lemmas.tsv](../unique-lemmas.tsv)
（125,607 列，含 `known` 欄）。

### PED 詞頭加入 lemma map（最新）

PED 是最常用的詞典，所以把 **15,991 個 PED 詞頭**也加進 lemma map（identity）：

- 其中 **8,647 個**是 pwa lemma 沒收的，補進來後 lemma map 從 939,703 → 948,350。
- known keys 從 956,936 → **965,116**（pwa＋PED）。
- 最新結果：unique all **61,247**、unique known **14,016**、units 21,117,773（×2.06）、
  頭痛 **1.0%**、平均音節 1.89。
- `unique-lemmas.tsv` 61,247 列；`unique-lemmas-known.tsv` 14,016 列；
  濾 9 個語法表 artifact 後 14,007 列。

> 上面的 16,983／125,607 是 PMD 剛接上、尚未含 PED 與後續 strong-word 展開的版本；
> 最新數字以這一節為準。

> 這裡修了一個 parser bug：pwa 的複合詞寫成 `part(stem)-part(stem)-...`，
> 舊程式用 `content.split("(")[0]`，會在**第一個括號**就截斷，把
> `aṭṭhaṅgika(aṭṭhaṅgika)-magga(magga)-...` 當成原子詞。現在改成先用 `-`
> 切完整 content、再逐段去掉 `(...)`，這些長複合詞才真的被拆開。
> 修完後最長的已知 lemma 只剩 pwa 的**語法表字串**（`ssatissantissa...`
> 這種詞尾拼接），不是自然詞；真正的 60／55／54 字複合詞都已拆成詞件。

### Pali Myanmar Dictionary 的複合切分

OpenTipitaka 的 `pm12e`（PMD 英譯版，204,363 條）有現成的 `[Pati+khipa+tabba]`
格式，共 **143,548 個複合 key**；16,983 個已知 lemma 中有 **5,960 個**可被 PMD 拆。

例：

```text
paṭikkhipitabba  →  pati | khipa | tabba
paṭivekkhitabba  →  pati | ava | ikkha | tabba
uttarimanussa    →  uttari | manussa
```

PMD 的切點很細（`khipa`、`tabba` 是詞根／詞綴），所以 token 會變多；三種門檻：

| PMD 門檻 | unique known | 頭痛率 | units |
|---|---:|---:|---:|
| 不用 PMD | 16,983 | 8.1% | ×1.65 |
| len ≥ 12 | 16,904 | 7.9% | ×1.66 |
| **len ≥ 8（目前預設）** | **14,851** | **4.3%** | **×1.84** |
| 全部長度 | **11,420** | **1.4%** | ×4.71 |

`len ≥ 8` 是平衡點：unique 14,851、頭痛 4.3%、token 只 ×1.84。全部長度會把
unique 壓到 11,420、頭痛 1.4%，但 token ×4.71，閱讀端會很碎。

`unique-lemmas.tsv` 已用 len ≥ 8 重生成（115,503 列）；`unique-lemmas-known.tsv`
是 14,851 列；濾掉 9 個明顯語法表 artifact 後是 14,842 列。

### sandhi-aware DP

對 `unsplittable.tsv` 的 1,827 個長詞再做一層 DP，允許**邊界重疊一字**
（`a+ā→ā`、`a+u→u` 這類 sandhi），並把拆出的長複合 key 再依 pwa 詞件展開：

| | 數量 |
|---|---:|
| 輸入 | 1,827 |
| 可切 | **1,661（90.9%）** |
| 仍拆不開 | **166** |

例：

```text
khandhadhātuāyatanasaccapaccayākārasatipaṭṭhānādīsū
→ khandha | dhātu | āyatana | sacca | paccaya | ākāra | sati | paṭṭhāna | ādīsu

dhammasabhāvapaccavekkhaṇenā
→ dhamma | sabhāva | paccavekkhaṇena

samudayadukkhaniccata
→ samudaya | dukkha | niccatā

chandiddhipādādivasenā
→ chanda | iddhi | pāda | ādi | vasena
```

`dhammasabhāva` 先依 pwa 拆成 `dhamma`、`sabhāva`；`samudayadukkhaniccata`
則用「長詞優先」的 exact DP 切成三個高頻詞（`niccatā` 是字典形，表面是 `niccata`）。

產物：[sandhi-split.tsv](../sandhi-split.tsv)（1,485 列）、
[unsplittable2.tsv](../unsplittable2.tsv)（342 列）。剩下的多半是更複雜的
母音／鼻音 sandhi，或真正的專名／拼寫變體。

> komyoji 的「詞形對齊」對 lemma 的邊際貢獻很小（0.3%），因為 pwa 的
> parenthetical stem 已經先做了大部分；它的價值在四部的逐詞語法與詞形驗證，
> 不在全藏的 lemma 化。

> 這仍是 **pwa 詞件／括號詞幹直接拆**的投影，不是四部那套 codebook＋fallback 的
> 逐詞驗證；含注疏、可能有 pwa 的錯拆，數字屬於樂觀上限。

對照先前的兩條線：

| 版本 | 單位數 | 頭痛率 |
|---|---:|---:|
| 未拆 | 144,143 | 38.9% |
| 按字典拆（pwa） | 182,462（×1.27） | 20.7% |
| 自動拆（DP） | 240,943（×1.67） | 4.0% |
| **本管線（全部可切）** | **217,060（×1.51）** | **8.4%** |

比字典拆好（8.4% vs 20.7%），又不像自動拆那麼碎（×1.51 vs ×1.67）；
代價是部分尾巴只是 token，不是語法完整的詞。

重跑：

```powershell
python -X utf8 src/decomp/headache-after-split.py dn1 dn2 dn3              # 全部可切
$env:FREQ_MIN='50'; python -X utf8 src/decomp/headache-after-split.py dn1 dn2 dn3  # 高頻不切
```
