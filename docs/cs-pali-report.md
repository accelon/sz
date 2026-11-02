# 巴利底本 `cs` 與儉約巴利：我讀到的東西

> 讀過的檔案：`D:\2023\cs`（repo `dhamma/cs`）、`D:\2023\sc`（repo `accelon/sc`）、
> `D:\2023\provident-pali`、`D:\2023\ptk`（`provident-pali/`、`align/`、`offtext/`）、`D:\2023\kmj`。
> 文中每個數字都是實跑出來的，腳本在 `out/cs-*.mjs`（`bun run out/cs-probe.mjs` 等），
> 不是憑印象寫的；驗法見 §10。

---

## 0. 三句話

1. **`cs` 不是普通純文字**。`off/*.cs.off` 是「儉約巴利（provident-pali）＋詞譜（formula）」的文本：
   每個複合詞被拆成詞件，連音（sandhi）壓成一位數字。所以它同時是**可讀的經文**、
   **可還原的連音紀錄**、**可查字典的詞件序列**。
2. **`sc/sc-pli.offtext` 是分句骨架**：SC 的 segment（`dn1:1.1`）再細切一級（`dn1:1.1.1`…），
   一句一行，並掛上 VRI 的段號 `^n`。
3. 兩邊**逐行、逐段號同構**——22 冊、118,019 行、6,554 段，`^n` 序列 22/22 完全相同。
   這條同構線就是 `sz` 裡所有譯本可以用 `ck.n` 互相定位的根。

---

## 1. 五層管線

| # | 產物 | 來源 | 指令 | 這層在做什麼 |
|---|---|---|---|---|
| 0 | `Cst4/Xml/*.xml` | VRI 的 CST4 安裝（junction `Cst4/Xml`） | — | 天城體 TEI、UTF-16、`<p rend pn>`、`<pb ed n>`、`<note>` 異讀 |
| 1 | `ro/*.xml` | CST4 | `node conv-ro [filepat]` | 先套 `src/cst4-errata.js` 修天城體非法組合，再 `deva2IAST` 轉羅馬；`splitbook.js` 可一拆多 |
| 2 | `books/*.xml` | `ro/` | `node tidy [filepat]` | `fixMarkups`→`changequotepunc`→`removeparanum`→`backmovepb`→`parseCite`；`<pb>` 併成四套頁碼；依 `src/newname.js` 改成 SC 書名 |
| 3 | `off/*.cs.off` | `books/` ＋ `brk/` | `node gen [filepat]`（加 `p` → `par/`，不分句） | 八步：`transliterate`→`reparanum`→`offtextgen`→`stepStripNotes`→`guidedBreakLines`→`removePureN`→`addEpilog`→`connectGrammar` |
| 4 | `brk/*.cs.txt` | `off/`（＋SC 對照） | `pitaka pin <bk>` | 釘文：一段一行、`段號 \t 釘 \t 釘 …`，記錄「這一段要切成哪幾句」 |
| 5 | `cs.ptk` | `off/` ＋ `cs.lst` ＋ `pitaka.json` | `pitaka` 打包 | zip 內含 `cs/001.js`（jsonp），成品資料庫 |

第 3 層的細節值得記下來，因為它決定了 `off` 的長相：

- `offtextgen` 走 TEI DOM，`xmlhandlers.js` 把 `<p rend="...">` 映射成 `^ak/^bk/^ck/^ckan/^cksn/^h/^sz/^end/^trailer/^b/^n`；
  **每個 `<p>` 出一行**，段號來自 `pn` 屬性。
- 沒有 `pn` 的 `<p>` 先補 `^n `（純 N，只有空格沒有號），最後 `removePureN` 把 `^n ` 刪掉——
  所以「沒有段號的行」＝同一段裡的其他句子。這是我一開始誤讀的地方：`^n` 是**段首**，
  不是每行都有。
- `<p rend="subhead">` 會 `newline=false` 併進下一段的首行，小標題才不會被算進上一段
  （`sc` 那邊的解法是設第 0 號段 `1.0`，兩邊思路不同、結果等價）。
- `^pb` 在 `xmlhandlers` 是空處理器：**頁碼在這一層被丟掉**（見 §7）。

`gen.js` 最後會拿 `../sc/sc-pli.offtext/<bk>.ms.off` 對行數，不等就印 `警告`。
這不是裝飾——它是整個系統的核心不變量。

---

## 2. 為什麼要有儉約巴利

`provident-pali` 的動機在 README 寫得很清楚，我把它們整理成「問題 → 對策」：

| IAST 的問題 | 儉約巴利的對策 |
|---|---|
| 帶變音符號，手機／桌面都難輸入 | 只用 `a–z` ＋大寫；輸入只要 Shift，不需要輸入法 |
| 省變音符號會失真（`pañña`／`paṇṇa`／`panna`） | 一個巴利字母＝一個字元，不會省 |
| 字母散在 Unicode 三段（1/2/3 bytes） | 全部落在 ASCII（1 byte） |
| `ha` 會同時命中 `bha pha tha`（非 prefix code） | 吐氣音各給一個大寫，前綴即詞首 |
| 羅馬轉寫橫向太長 | 元音用大寫「當變音符」，字寬接近印度字母；再套 100KB 字型就成了緊湊巴利文 |

實測（全 `cs/off` 正文 1,825,266 個詞，略過 4 個無法轉換的）：

```
儉約巴利 11,054,852 bytes
IAST     15,114,374 bytes   → 省 26.9%
```

和 README 說的「30% 左右」相符。而且**小寫字母與標點完全不變**，所以和 XML/HTML 標記、
和純 IAST（只要不用大寫）都能共存——這是它能直接放進 offtext 的前提。

---

## 3. 編碼規則（我驗過的對照表）

| 巴利 | 儉約 | 例（`fromIAST` 實跑） |
|---|---|---|
| 輔音後的 `a` | **不寫**（隱含） | `ka` → `k` |
| 詞首 `a` | `a` | `anatta` → `antVt` |
| `ā` | `A`（詞首 `aA`） | `bhagavā` → `BgvA`；`ārammaṇa` → `aArmVmN` |
| `i` / `ī` | `I` / `II` | `sīla` → `sIIl` |
| `u` / `ū` | `U` / `UU` | `bhūta` → `BUUt` |
| `e` / `o` | `E` / `O` | `loke` → `lOkE`、`otāra` → `otAr` |
| `ṃ` | `M` | `dhammaṃ` → `DmVmM` |
| `k kh g gh ṅ` | `k K g G N` | `saṅgha` → `sNVG` |
| `c ch j jh ñ` | `c C j J Y` | `paññā` → `pYVYA` |
| `ṭ ṭh ḍ ḍh ṇ` | `W X F Q N` | `aṭṭha` → `aWVX`、`vaṇṇa` → `vNVN` |
| `t th d dh n` | `t T d D n` | `uposatha` → `upOsT` |
| `p ph b bh m` | `p P b B m` | `dukkha` → `dUkVK` |
| `y r l v s h ḷ` | `y r l v s h L` | `kāya` → `kAy` |
| 中間無元音的輔音串 | `V` | `yad` → `ydV`、`mahant` → `mhnVtV` |
| 梵文 `ś ṣ ḥ ṛ ṝ ḹ` | `Z S H R RA LA` | — |

幾個「看懂了才不會出錯」的點：

- **`N` 是一碼兩用**：`ṅ` 只出現在 `k kh g gh` 前，`ṇ` 不會出現在那裏，所以共用不衝突；
  差別交給字型（軟顎音化成上方的點）。
- **長音有兩種寫法**：從 IAST 進來是 `II`／`UU`（`sIIl`、`BUUt`）；從詞譜還原是 `IA`／`UA`
  （`atVtUApmA`）。`sbProvident()`／`mbProvident()` 就是負責在兩者間正規化。
- **詞首元音仍用小寫**（`a i u e o`，長音 `aA iI uU`），詞中才用大寫。
  這條在詞譜合併後會「看起來」被破壞（新詞的 `i` 出現在詞中間），
  所以**不能對詞譜字串做字串處理**，一定要走 `parseFormula()`／`lexify()`。

---

## 4. 詞譜（formula）：把連音存成數字

### 4.1 語法

```
詞件 數字 詞件 數字 詞件 …
```

數字是「這兩個詞件怎麼接」。核心的設計是：**數字不是規則表的條號，而是「同一對音的第幾種結果」**。

| 數字 | 意思 | 語料實例（我實跑 `orthOf()` 還原） |
|---|---|---|
| `0` | 直接相接 | `BIkVKU0sNVGEn` → bhikkhusaṅghena |
| `1` | 刪左尾、留右 | `pYVYA1inVdVrIyEn` → paññindriya（ā 被刪） |
| `2` | 刪右頭、留左 | `mh2agVgtEn` → mahaggatena |
| `3` | 連音（最常用的一格） | `pd3Upm` → padopama（a+u→o）；`mAn3anUsyO` → mānānusayo（a+a→ā） |
| `4` | 同一對音的另一結果 | `kUUW4gmA` → kūṭaṅgamā（a+g→ṅg） |
| `5` | 同上 | `smVm5Ev` → sammadeva（a+e→插入 d） |
| `6` | 同上 | `yAv6atVTM` → yāvadatthaṃ（a+a→插入 d） |
| `7` | 同上 | `tsVmA7Ih` → tasmātiha（ā+i→插入 t） |
| `8` | 同上 | `sOtAptVtI8aNVgEhI` → sotāpattiyaṅgehi（ī+a→iya） |
| `9` | 同上 | `ajVj9agVgE` → ajjatagge（a+a→插入 t） |
| `10` | 同上 | `pIItI10atVTM` → pītatthaṃ（ī+a→i，併） |
| `65` | 特殊：只插入 `ā` | `ttVr65pI` → tatrāpi |

表裡左欄是語料原文，右欄是 `orthOf()` 還原、`toIAST()` 轉回來的結果，全部實跑
（`out/cs-decode.mjs`），不是手抄的。順帶一提：`pd3Upm` 正好是
`src/test-lexification.js` 裡的測資，說明這條路徑有單元測試在守。

為什麼「同一對音要編號」？因為同樣的兩音可以併成不同結果：`a + ā` 可以變 `ā`（`3`）、
也可以變 `am`（`4`）。規則表 `src/sandhi.js` 以 `(左尾音, 右首音) → 結果` 為鍵，數字就是
「第幾個候選」。所以 `3` 同時裝了 `a+u→o`、`a+ā→ā`、輔音同化等一大格（語料出現 16,710 次），
`4`–`10` 各只有數百次。要注意：**同一個數字在不同對音上代表不同變化**
（`4` 在 `a+ā` 是 `-am`，在 `a+g` 是 `-ṅg`），查表永遠是「數字 × 前後音」兩者一起看。

### 4.2 與您信裡的一個小出入

您寫 `dhamma1udaya`、`a1u → o`。實際程式裡 **`a+u→o` 是 `3`**：

```
['pdOpm', ['pd','upm'], 'pd3Upm', ['pd','O','U>pm']]     ← src/test-lexification.js 的測資
```

`1` 已經被結構性用途佔用（刪左尾，如 `paññā1indriya`）。我猜您說的「第一條規則」是指
**巴利語法課本裡連音表的第一條**（a+a=ā、a+i=e、a+u=o），那是教學上的編號；
程式裡用的是「同一對音的第幾種結果」，兩套號碼不是同一回事。

**作者 2026-11-02 答覆**：這套編號是作者自己設計的，久了自己也忘了；
**將來一定從文本再推導出來**。所以轉檔時**照原樣保留數字**，不要重編——
語料裡每個 (正詞, 詞件) 都附了答案，反推規則表不難（見 §12 的 `<詞 j>`）。

### 4.3 為什麼值得這樣存

1. **可還原**：`orthOf()` 從詞譜還原正詞，連音不必查表。
2. **可退化**：把數字換成 `-` 就回到詞件序列，規則改了重新 `lexify`＋`formulate` 即可。
3. **索引單元變詞件**：`padīpopamasuttaṃ` 這種長詞不再進索引，`padīpa`／`upama`／`sutta` 才是；
   token 數量降 2–3 個數量級。
4. **查字典**：PCED 會把 `padopama` 拆成 `padīpo-pama`（錯的）；詞譜直接給對的詞件。
5. **正則可及**：`/\d+upama0suttaṃ/` 就能找到「某某喻經」，不必管連音。

### 4.4 語料實況

```
正文詞數            1,825,266
帶詞譜的詞            157,144（8.6%）
連音數字總數          179,844
  └ 0（直接相接）    139,304
  └ 非零（真連音）    40,540
```

也就是說：**每 9 個詞有 1 個帶詞譜；每 4 個連音數字有 1 個不是「直接相接」**。
那 4 萬個位置，就是「純文字會失真、只有詞譜能還原」的地方。

（另有 2,885 個「字母＋數字＋字母」的 token 不是詞譜，抽樣看是注疏正文裡徵引的書名，
如 `an1`、`dn1`——不是詞譜損壞。）

### 4.5 詞譜從哪裡來

`formula.json`：

```json
{ "lexicon": "../kmj/entries.txt",
  "decomposes": ["decomp-manual.txt", "../kmj/decomp.txt"],
  "encoding": "iast" }
```

詞典與拆分表都指向 **`kmj`（光明寺的逐字文法／日譯專案）**：
`entries.txt` 是 lemma 詞典，`decomp.txt` 是「正詞＝詞件-詞件」的拆分表（手改的在
`decomp-manual.txt`），`src/validate-sandhi.js` 拿整份拆分表跑 `lexify`→`formulate`→`orthOf`
的往返測試。`gen.js` 的 `connectGrammar` 更進一步：用 `kmj/grammar/<bk>` 的逐詞文法碼
**反過來決定詞件切法**，並把每行的文法碼序列寫進 `<bk>.cs.num`。

所以「詞譜」和「逐字文法／字典」是同一套資料的兩面：
一個存在正文裡（連音），一個存在 `.cs.num` 裡（語法碼）。這一點是我覺得最關鍵、
也最容易被外人忽略的設計。

`.cs.num` 的格式（`kmj/src/grammar-format.js`）：

```
grammar/<bk>.tsv 每行： pn \t rawtoken \t lemma \t root \t ps \t base \t gender \t num \t cas \t meaning
        ↓ 七個屬性各自查 stat/stat-<表>.txt 換成整數碼（5 起算）
.cs.num 每行：      詞1的文法碼 ,1, 詞2的文法碼 …
       每個詞：    lemma,root,ps,base,gender,num,cas,meaning（多個 lemma 之間用 ,2,）
```

`1`（詞分隔）、`2`（部件分隔）、`3`（有 lemma 但無文法）、`4`（null）是保留碼，
所以 `.cs.num` 裡看到的 `1`、`2` 不是詞性，是分隔符——我第一次看只覺得是一串數字。

---

## 5. 分句骨架：template ↔ 釘文

### 5.1 SC 一側：`template/<bk>.off`

`template/dn1.off` 的開頭：

```
^ak#dn(Long Discourses) ^bk#dn1(Long Discourse1) ^ck#d1(<dn1:0.2>)<dn1:1.0>^n1 <dn1:1.1.1>
<dn1:1.1.2>
<dn1:1.1.3>
<dn1:1.1.4>
<dn1:1.1.5>
<dn1:1.1.6>
^n2 <dn1:1.2.1>
```

- 骨幹（`^ak/^ck/^bk/^n`）是人寫的；每一行放一個（少數兩三個）SC 細段。
- `fillTemplate()` 把 `<scid>` 換成 SC 原文，`fromIAST` 轉成儉約巴利。
- `Breakseg`（14 條）處理「一個 SC 段要切成兩行」的情形，用 `pli:` 文字當切點；
  有 `pn` 的表示切完才是 VRI 段的起點。
- `inserts.js` 補 SC 沒有的標題與空行（例如 `mn50:33.0` 註明「VRI 有，MS 無」就補一個空行、
  `sn50.55-66:0.1` 補五個換行），**目的是讓行數對得上**。
- `SEGID_ERRATA` 修 SC 自己重號的段（`dn17:1.18.x`）。

關鍵：**`dn1:1.1.1` 這種三級 id 不是 SC 的**。我抓了 SC 的
[`dn7_root-pli-ms.json`](https://raw.githubusercontent.com/suttacentral/bilara-data/published/root/pli/ms/sutta/dn/dn7_root-pli-ms.json)
確認：SC 的鍵是 `dn7:1.1` … `dn7:5.11`（兩級），而且 `dn7:1.5` 這類一段裡就含兩三個句子。
您說的「**進一步分細句子**」，實作方式就是：把 SC 的每一段再切成更細的句，
用第三級 id（`1.1.1`、`1.1.2`…）記在自己的 bilara fork 裡。所以「分句」是**資料**，
不是程式——程式只是把細段一行一行排出來。

統計（22 個 template）：

```
118,019 行   =  cs 的行數（22/22 完全相同）
125,502 個 SC 段引用
  4,230 行放了 2 個以上的段（3.6%，多半是 SC 把一句拆成好幾段，這裡併回一行）
     28 行用 pin 屬性切一個段（SC 切得太粗 → 切）
      6 行沒有段
```

所以「以 SC 為基礎」的實際比例是：**96.4% 的行＝SC 的一段**，3.6% 併、0.02% 切。

### 5.2 cs 一側：`brk/<bk>.cs.txt` 釘文

```
1	 e	 sUp	 t	 sUpV:2	 i
2	 sU	 t	 sUpV:2	 i
3	 “	 ayY	 sUpV:2	 i
```

- 第一欄是段號，後面每一欄是一個「釘」＝切成下一句的位置。
- 釘是**文字**不是位移：取切點後 2 個字，若在行內不唯一才加 `:n`（第 n 次出現）；
  找不到就加長到 5 個字。`breakByPin()` 再把它們還原成位置。
- 這樣即使正文改字、VRI 改版，只要那兩個字還在，斷句就不會跑掉——這是它可以長期維護的原因。
- 檔案一冊一份，**一段一行**（不是一句一行），這點和 `off` 不同，容易看錯。

`gen.js` 的 `guidedBreakLines(buf, pins, fn)` 就是拿釘文去切 `par/` 的段落；
`pitaka pin` 則是反過來，從已切好的 `off` 抽出釘文。

### 5.3 兩邊如何鎖在一起（我實際驗的）

| 檢查 | 結果 |
|---|---|
| 22 冊 template 行數 vs `off` 行數 | **22/22 相同**（118,019） |
| 22 冊 `^n` 段號序列 vs `sc-pli.offtext` | **22/22 完全相同** |
| `off` 與 `sc` 的段數 | 6,554（四部尼柯耶） |
| 平均每段句數 | 18.01（`off`）／4.49（注疏等未對齊的 35 冊） |

這解釋了我在 `sz` 早就看到的數字：`cs-mm`（緬譯）也是 **6,554 段**、118,010 行
（比 `cs` 少 9 行）。**所有譯本都套在同一個骨架上**，所以 `ck.n` 才能跨語言。

---

## 6. 定位與 id

### 6.1 定位格式

```
cs:冊.段號:句     例 cs:mn1.272:2 ＝ 中部第一冊第 272 段、第 2 句
```

- `冊`＝`^bk` 的 id（`dn1`、`mn2`…）。
- `段號`＝`^n` 的值，VRI 自己的段落號；會有範圍號（`119-135`，全庫 1,179 個）。
- `:句`＝段內第幾句（一段平均 18 句，這一級不能省）。
  作者 2026-11-02 說明：**這個單位是「句」不是「行」**；這批 XML 已經沒有原書硬換行的資訊，
  但那不重要——巴利三藏的關鍵是**句子級的精準定位**，將來新譯本自動斷句才容易。

`sz` 現在用的 `ck.n` 對應到這裡的前兩級：`ck` 是 `^ck`（經／章），`n` 是 `^n`（段）。
所以 **`ck.n` 只定位到「段首」，再細就是 `:句`**。這一點在 `sz` 之後要用的時候值得記住。

### 6.2 `ck` 的命名規則（`src/phandler.js`）

| 部 | ck id | 說明 |
|---|---|---|
| 長部 | `d1`…`d34` | 依 `DN_SUTTA` 偏移，一冊的經號連續 |
| 中部 | `m1`…`m152` | 經名含數字者才是 ck，否則 `^h` |
| 相應部 | `s1`…`s56`；相應內 `^cksn#s12a` | 大相應才有 vagga 層 |
| 增支部 | `a1`…`a11`；集內 `^ckan#a6a` | 第一 vagga 用 `^ck`，其餘 `^ckan` |
| 本生 | `m1`…`m520` | 借用了 `m` 空間（見下） |
| 清淨道論 | `vs1`…`vs23` | |
| 攝阿毘達磨 | `aas1`…`aas9` | |
| 律藏 | `^ck#cv1`…（`cv`／`mv` 前綴）；`pj` 另走 `^mvN` | 這份快照的 `off/` 只有 `cv`，`pj`／`pc`／`mv`／`pvr` 不在 |

`書` 的 id 有 MAT 前綴（`src/utils.js` 的 `getMAT`）：mūla = `#`（省略）、
aṭṭhakathā = `1`、ṭīkā = `2`、uttara-ṭīkā（新注）= `3`。
所以 `^bk1aas0` ＝《攝阿毘達磨義論》的注。

### 6.3 三個真實的接縫（不是挑錯，是之後要繞過去的）

1. **`ck` id 只保證「書內唯一」**。`ptk/basicofftag.md` 明文：
   「ck 的 id 在同一書中，不可以重覆」。實測 680 個 id 裡有 **170 個跨書重用**——
   mūla 與它的注、複注刻意共用同一個 id（`a1` 同時在 `an1`／`an1a`／`an1t`），
   這是**設計**（注疏要能跳回根本經），但結果是 `塊.id` **不是全庫唯一鍵**。
   `sz` 的 `locatorVa()` 會把所有同 id 的塊都找出來、取「塊範圍內含該段」的第一個；
   而 mūla 在打包順序上排在注疏前面，所以跳「注疏的 `a1.7`」會落到根本經。
   要治本得讓 locator 帶書（`an1a.a1.7`）或用全庫唯一的塊 id。
2. **本生借了 `m` 空間**（`^ck#m` + `JA_JATAKA` 偏移），所以 `m1`–`m152` 與中部相撞。
3. **長部注的 ck 全變成 `dNaN`**：`phandler` 用 `ctx.bkid.substr(2)` 取冊號，
   `dn1a` 取到 `1a`，查表得 `undefined`，`d`+`NaN` 就寫進去了（8 個注疏檔受影響）。

這三點都不影響閱讀，但會影響「用 `ck.n` 跨庫連結」的正確性，值得在 `sz` 這邊先處理。

---

## 7. 註釋與頁碼

### 7.1 異讀註：正文與註分開存

`cs` 的異讀**不在正文裡**（`off` 裡 `^f` 的數量是 0）。流程是：

1. `offtextgen` 遇到 `<note>` 先插 `⚓n` 佔位，`addNote` 記下文字；
2. `stepStripNotes` 把 `⚓n` 從字串移除，同時記下 `(段, 位移)`；
3. 斷句之後，`stepPinNotes` 把 `(段, 位移)` 換成 `(行 y, 文字釘 pin)`；
4. `serializeNotes` 寫出 `<bk>.notes.json`：

```json
[{"y":5,"pin":" p","val":"anUbdVDA (k sII pII)"},
 {"y":6,"pin":"upg","val":"upgYVCI (sII sVyA kM pII)"}]
```

`y` 是行號、`pin` 是行內文字釘、`val` 是異讀本文（儉約巴利）。
好處和釘文一樣：正文改字，註還跟得住。這也回答了您之前說的
「正文和腳注分不同的文件存」——`cs` 早就是這樣做的。

### 7.2 頁碼：有，但在上一層

`books/*.xml` 裡有 `<pb t="m1.1;v1.1;p1.1;t1.1"/>`：CST4 的 `<pb ed="m" n="1.1"/>`
經 `backmovepb.js` 移到詞前，並把最多四個連續的 pb 併成一個屬性——
**四套紙本書頁碼**（作者 2026-11-02 說明）：

| 前綴 | 版本 |
|---|---|
| `m` | 緬甸版 |
| `v` | VRI 天城體 |
| `p` | PTS（英國巴利聖典學會） |
| `t` | 泰國版（朱拉隆功的底本） |

但 `xmlhandlers.js` 的 `pb` 處理器是空的，所以 **`off`／`adb` 裡沒有頁碼**。
這是刻意的：`cs` 用「冊.段:行」定位，不用頁。代價是若要對印刷本頁碼（PTS 頁等），
資料只留在 `books/`，`off` 之後就沒有了。

---

## 8. 建置與產物

- `off/0.off` 宣告方言與 metadata：

  ```
  ^:<ptk=cs zh=巴|巴利三藏 en="CS|Pali Tipitaka" lang=pp define=cs align=cs manualupdate=true>
  ^:trailer
  ^:end
  ^:b
  ^:nn
  ```

  `lang=pp` 就是 provident-pali。`^:` 開頭是宣告行（只宣告不顯示）。

- `cs.lst`：打包清單。前半是 22 冊本文＋`vs`，後半是 `*.cs.num`（逐行文法）與
  `roots.tsv`／`pss.tsv`／`bases.tsv`／`genders.tsv`／`nums.tsv`／`cass.tsv`／`meanings.tsv`
  （逐字文法表）、`parallels-{dn,sn,an}.tsv`（平行對照）。
  **第一次打包就把逐字文法放進資料庫了**——這是我覺得最容易被漏看的一點。
  （這份 lst 看起來停在 22 冊的階段，而 `off/` 已經有 57 冊，兩者不同步。）
- `pitaka.json`：`name=cs`、`template=cs`、`label=end,trailer,cite`、`notesjson=note`。
- `cs.ptk`：zip，開頭是 `PK`，內含 `cs/001.js` 而內容是 `jsonp(1,{...})`——已打包的資料庫。
- `off/*.cs.off.aligned`：舊的一次對齊輸出（留作對照）；`par/`：不分句版。
- `off/*.cs.num`：逐行文法碼（`connectGrammar` 產生），與 `kmj/grammar/` 對應。
- `doc/paranum.xlsx`：mūla／aṭṭhakathā／ṭīkā 的段號對應表，每格是
  `檔名(<p>數) ,段號範圍`（例：`s0101m(1059) ,1-559`、`s0101a(1354) ,1-559`、
  `s0104t(1328) ,1-149`）。這張表就是 §6.3 說的「三層共用段號」的依據，
  也是為什麼 `ck` id 可以在根本經與注疏之間重用。

---

## 9. 對 `sz` 的意義，以及我建議補的三件事

我做的 `sz` 是「把譯本轉成 accelon XML，用 `ck.n` 定位」。讀完這一層，我看到三件事
應該補，否則「巴利底本為核心」只做到一半：

1. **把詞譜帶進 `adb`**。現在 `sz/data/{sc,cs-mm,…}` 的 token 是整詞；如果 `cs` 的
   formula 能進 `tokens` 或做成 `attributes`，全文檢索就能用詞件當單位，
   而且可以做到「點詞查字典」。這是 `provident-pali` 最大的價值，目前完全沒用上。
2. **`塊.id` 唯一化**。如上 §6.3，`ck` 只在書內唯一；跨庫跳頁要用 `書.塊` 或加前綴，
   不然 `a6.7` 會在增支部與其注疏之間亂跳。
3. **頁碼回補**（可選）。若要顯示 PTS／緬甸版頁碼，得在 `gen` 加一個 `pb` 處理器，
   或在 `sz` 這邊從 `books/` 重新取 `<pb t="...">`。`sz` 的 `<頁 id="塊.段">`
   是另一套（語義定位），兩者可以並存。

另外，`sz` 現在的 `ck.n` 只到段首；若要指到「第 3 句」，`cs` 的 `:行` 語法可以直接借用。

---

## 10. 怎麼驗的（可重跑）

```powershell
cd D:\2026\sz
bun run out\cs-probe.mjs     # 詞數、詞譜數、連音數字分佈、抽樣還原
bun run out\cs-vs-sc.mjs     # 逐冊行數比對
bun run out\cs-final.mjs     # 22 冊段號序列比對、詞譜還原通過率、段數統計
bun run out\cs-shape.mjs     # 位元組節省、template 結構統計、行數不變量
bun run out\cs-decode.mjs    # 個別詞譜的還原（§4.1 那張表）
bun run out\cs-enc.mjs       # 編碼對照（§3 那張表，fromIAST 實跑）
bun run out\cs-ck.mjs        # ck id 跨書重用統計
bun run out\cs-split.mjs     # 22 冊對齊 vs 35 冊未對齊
```

主要輸出：

```
files 57  bytes 26,336,453
pali words 1,825,270   lex words 157,144   joiner 0: 139,304 / 非零: 40,540
provident 11,054,852 B vs IAST 15,114,374 B → 省 26.9%
templates 22  lines 118,019  segRefs 125,502  >1 seg 4,230  pin切 28
template vs cs 行數不符: none
^n 序列相同: 22/22
aligned 22: 118,019 行 / 6,554 段 / 18.01 句每段
others  35:  60,429 行 / 13,462 段 / 4.49 句每段
cs-mm: 118,010 行（差 9）
distinct ck ids 680，跨書重用 170
```

---

## 11. 作者 2026-11-02 的答覆（本節取代我先前的疑問）

1. **連音編號**：是作者自己設計的，久了自己也忘了；**將來一定從文本再推導出來**
   （語料裡 (正詞, 詞件) 都在，等於每個數字都附了答案，反推規則表不難）。
   所以現在只要**照原樣保留數字**就好，不要自作聰明重編。
2. **`m`／`v`／`p`／`t`**：四種紙本書——緬甸版／VRI 天城體／PTS／泰國版（朱拉隆功底本）。
   見 §7.2 的表。
3. **塊 id 唯一化**：一定要做。**義注用 `a`、複注用 `t`、再複注用 `x`**。
   （已寫進 `src/cs2accelon.ts` 的 `layerOf()`；目前 24 冊都是根本經，尾綴為空。）
4. **`:行` 其實是「句」**：這批 XML 已經沒有原書硬換行資訊，但那不重要——
   巴利三藏的關鍵是**句子級的精準定位**，將來新譯本自動斷句才容易。見 §6.1。

還開著的：`kmj/grammar/` 的實際 tsv 我沒看過（只有 `Readme.md`），只驗到 `.cs.num` 的格式。

---

## 12. 上游與分支現況（2026-11-02 補記）

作者說明：`cs` 大約十年前從 **[VipassanaTech/tipitaka-xml](https://github.com/VipassanaTech/tipitaka-xml)**
分支出來；上游的母本是 Devanagari（repo 裡的 `deva master/`），其餘 16 種字母（beng／cyrl／
gujr／guru／khmr／knda／mlym／mymr／romn／sinh／taml／telu／thai／tibt…）都是由它轉出來的。
分支後在 `cs` 找到不少錯誤（`src/cst4-errata.js`、`src/ro-errata.js`、`src/cst4-typo.js`），
**但沒有 upstream 回去**。

本地實測的落差：

| 層 | 數量 | 說明 |
|---|---|---|
| `Cst4/Xml`（junction） | 0 | 這份快照裡是空的（CST4 沒裝） |
| `ro/*.xml`（羅馬化） | **223** | s 101、e 68、vin 27、abh 26、test 1——等於當初 CST4 的檔案清單 |
| `src/newname.js` 有對照 | 119 | 其餘 **104 檔沒有名字對照**（多為 `e06xx`–`e12xx` 的 anya 系列） |
| `books/*.xml`（tidy 過） | 85 | 有對照但**連 books 都沒做**的還有 **91 冊**：整個阿毘達磨（ds／vb／pt1–5／pp／kv／ya1–3／dt）、律藏的注與複注（pj0a／pc0a／mv0a／cv0a／pvr0a／sd0t／pj0t…）、小部大半（snp／vv／pv／thag／thig／thap／bv／cp／ja1a／ja2a／mnd／cnd／ps／mil／ne／pe）、論書（adv／pmdp／adn／nmkr…） |
| `off/*.cs.off`（gen 過） | **57** | 另有 **28 冊有 books 但沒 off**（dhp／ud／iti／kp／thag／pc／pj／mv／pvr／vs0a／mn2a／mn3a…） |

也就是說：**「全藏（含義注）」的原料本來就在手邊**（`ro/` 223 檔），缺的是
① `newname` 的命名對照（104 檔）、② 把 91＋28 冊跑過 `tidy`／`gen`。
不需要為了結構去對 tipitaka.lk（那是 BJT 版，見 [`tipitaka-lk.md`](tipitaka-lk.md)）。

未 upstream 的修正（以檔名為鍵的補丁，可重放）：

| 檔 | 檔案鍵 | 修補項（約） |
|---|---|---|
| `src/cst4-errata.js` | 28 | 60 |
| `src/ro-errata.js` | 36 | 190 |
| `src/cst4-typo.js` | — | 22 |

上游狀態（2026-10-31 抓）：`main` 分支仍在更新（pushed 2026-10-31）、**1,880 個 open issues**、
README 明確寫「修正請在 `deva master` 做」。所以若要 re-sync，我們的 errata 得先對一次
「上游是否已自行修正」，再決定重放或丟棄。另外上游有 `romn/`（羅馬化）資料夾，
值得確認它是不是 IAST——若是，`conv-ro` 可以只留 errata 與 provident 轉換那一段。

## 13. 第一步的實作（2026-11-02）

「先把 provident-pali 轉成 IAST，做一個 adb 試試，保留丟失的拆詞信息；
provident-pali 機制先不引用 accelon3。」——已做，指令與驗收：

```powershell
cd D:\2026\sz
bun run src/cs2accelon.ts           # data/cs/（24 冊）
bun run src/cs2accelon.ts --check   # 逐冊驗收
bun run src/pack.ts cs              # accelon26/cs.adb（不帶索引）
```

- 正文轉 IAST；詞譜詞留成 `<詞 b="詞譜分段" j="連音編號">正詞</詞>`
  （`b` 是 `pd|upm` 這種原文分段，`j` 是數字；兩者 join 就是原詞譜，一字不差）。
- 範圍 24 冊＝四部根本經 22＋`vs`＋`aas`；注疏 35 冊的塊 id 在來源就有
  `dNaN`／`mNaN`／`sNaN` 與重複，要先修才能加 `a`／`t`／`x`。
- 實測：133,920 行、8,017 段、650 塊、1,078,357 詞、168,354 個 `<詞>`；
  `cs.adb` 11.70 MiB（`source` 4.13、`attributes` 6.49——後者幾乎全是 `<詞>` 的 `b`／`j`）。
- 細節寫在 `docs/steps.md` §1.1、母區 `docs/adb/off-to-accelon.md` §11.1。

---

## 14. 相關文件

- [`docs/steps.md`](steps.md)：建置步驟與現況
- [`docs/known-issues.md`](known-issues.md)：小毛病帳
- [`docs/tipitaka-lk.md`](tipitaka-lk.md)：僧伽羅本（BJT）能不能當參照系
