# accelon26 × sz：整合決策與待辦

> 2026-11-02。這一頁記「支持 sz 多譯本＋逐詞語法」的**已決事項**與**待辦清單**；
> 實作在另一個話題進行。
>
> 來源：
> - `out/accelon26-prompt.md`（索引端需求、驗收數字）
> - `docs/addressing.md`（`塊.段:句#詞`）
> - `docs/decomp.md`、`data/cs-decomp/`（拆詞、格位、詞族資料）
> - 母區 `ts/src/accelon26/` 的現況（閱讀器、搜尋、著色、平行段）

## 0. 一句話

sz 已經有「查得到」的資料；accelon26 目前只有「讀得到」的介面。
下一個階段要把資料接成三層 UI：**詞（word）→ 查詢（stem／case／phrase）→ 譯本對讀（segment）**。

作者已拍板：**十個 adb、token 各自獨立、全部建全文索引**；詞頁用 drawer，對讀用段抽屜；
純外文查詢先片語、找不到再 AND／鄰近。
剩下的風險是：

1. 查詢與著色目前是「字串比對」，不是「詞 occurrence」；
2. 十個 adb 的 tokenizer／stoplist 不同，不能共用索引假設；
3. 漢語譯本沒有逐詞語法，只能選取查＋連到 cs。

### UI 原則（2026-11-02）

- **最小衝擊、慢慢修**：先加新 pane／新 block，不改既有 `dict-pane`、搜尋預設與閱讀手勢。
- **可以多開右欄 pane**：`lex-pane`、段對照 pane…各自獨立；不要為了省一個 pane 把功能塞進 `dict-pane`。
- **可以多建 adb block／container**：不因 VA／檔案大小犧牲資料；正確性優先。
- **不影響現有使用者習慣**：舊的單擊、選取、搜尋、目錄、詞典行為保持；新功能依 capability 出現。

## 1. 目前已經有的（不要重做）

### sz 端

- 9 個譯本已轉成 Accelon XML，另有 `cs`（巴利底本）與 `cllk`（泰譯）。
- `cs` 有 404,072 個 `<詞 b="…" j="…">表面詞</詞>`；詞譜／連音資訊在 `b`／`j`。
- 拆詞與語法資料已產生：
  - `out/pwa-tree-all.tsv`（956,729）
  - `data/cs-decomp/pwa-atoms.tsv`（256,429）
  - `data/cs-decomp/tokens.tsv`（180,696；帶格位）
  - `data/cs-decomp/index-policy.tsv`（155,396；40 個 stop）
  - `out/projection.tsv`（442,256）
  - `data/cs-decomp/case-by-word.tsv`（6,597）
  - `data/cs-decomp/case-by-word-model.tsv`（915,375）
  - `data/cs-decomp/case-hints.tsv`（31）
  - `data/cs-decomp/case-by-stem.tsv`（15,457）
- 定址：`塊.段`／`塊.段:句`／`塊.段:句#詞`；跨庫 `d1.28` 已驗可在 `cs.adb` 與 `komyoji.adb` 跳到同一段。
- `accelon26/` 目前有 10 個本機 adb（2026-11-02 全部重建全文索引：`cs`、`cs-mm`、`sc`、`yh`、`ccc`、`xsq`、`pku`、`hz`、`kmj`、`cllk`）＋硬連結的 `accelon26.exe`。

### accelon26 端

- 三欄閱讀器、本文分頁、讀窗分頁、目錄／摘要／詞典／檔頭等右欄分頁。
- `<段 n>` 晶片：列出同結構的譯本，選一個就**換庫**到同一段（`parallel.ts`）。
- 搜尋：token 索引、詞組、`+`／`-`／`*`、萬用字元、摘要卡、塗色。
- 詞典分頁：`#dictBody` 給詞典條目用（佛光大辭典、康熙、漢語大詞典）。
- 無全文索引的 adb 可以開、可以讀；搜尋顯示「未建全文索引」。

## 2. 已決事項（2026-11-02 作者拍板）

### D1（已決）十個 adb，不合併

- **十個 adb，語言不同、翻譯風格是研究對象，token 必須獨立。**
- 不做單一 `sz.adb`；每個譯本自己的 tokenizer／stoplist／token 索引，不能共用。
- 十個 adb **都要建全文索引**；不再用 `fullTextIndex:false` 當預設。
- accelon26 的譯本清單要**動態**（catalog／manifest／adb metadata），不能寫死 `PARALLEL_DBS`。
- UI 每個 adb 要能標語言／譯本風格；跨庫搜尋要顯示「哪一個譯本」。

### D2（已決）純外文先片語，找不到再 AND／鄰近

- **cs／sc 這類純外文語料**：空白先當**片語**（`tathā gata` 就是相鄰的兩個詞），
  不必加引號；片語找不到，再退回 AND／鄰近查。
- 中文／混合語料維持現有 OR／`+`／`-`／`*` 語意；要片語時用引號 `"…"`。
- 輸入框右側的 mode badge 要顯示目前模式：`片語`／`AND`／`鄰近`／`目錄路徑`…
- 這個「先片語、後 AND」是**查詢策略**，不是把空白語意全域改掉。

### D3（已決）新增 `lex-pane`，不動 `dict-pane`

- 新增 `ts/src/accelon26/lex-pane.ts`：右側 drawer（寬約 360–420px），給詞形／語法信息用。
- **`dict-pane.ts` 不動**：它繼續只管詞典條目（佛光大辭典、康熙、漢語大詞典等）。
- 不把詞頁塞進 `#dictBody`；兩個 pane 的資料來源與互動分開。
- 窄視窗改成 bottom sheet；Esc／點背景關閉，關閉後焦點回本文。

### D4（已決）單擊開詞；雙擊選全詞；漢語要選取再查

- 巴利原文的 `<詞>`：**單擊**開詞 drawer（onclick）。
- **西文詞雙擊**：照瀏覽器原生行為選取整個詞，放開後跳出選取選單；
  **不要因為 onclick 而攔掉雙擊選取**。單擊與雙擊要能並存。
- 漢語譯本沒有逐詞語法：**選取文字**後由選取選單查（「查詞」／「查字典」）。
- 拖曳選取、連結、註腳、圖片、`<段>` 晶片不攔截。

### D5（已決）段對照抽屜

- 多譯本對讀先做**段對照抽屜**：點 `<段>` 晶片，列出十個譯本中同一段的內容（2–3 個即可）。
- 不做中央分欄；連結分頁可之後再加。

### D6（已決）語法只給 `cs`

- 逐詞語法、格位、詞族、拆解樹只給 `cs`。
- 其他譯本先**連到 cs 的同一段**，再看 cs 的語法信息。
- 未來才做「詞對齊」；在那之前，譯本端不能假裝有逐詞語法。

### D7（已決）詞資料放 adb 容器

- 不用 sidecar；word info／case／family／decomp 都放 adb 容器（或既有 `tables`／`attributes`）。
- 十個 adb 各自帶自己的 token 索引；`cs` 另外帶語法資料。
- **多建 block／container 沒關係**：以「查得到、看得懂」為先，不要為省空間拆散資料。
- UI 用同一個 `AdbReader` 讀，桌面／網頁一致。

### D8（已決）UI 不暴露詞性；高階用 prefix

- 一般 UI 只顯示詞形、詞性中文、格位；不把 `dhamma#n` 這種內部 token 露出來。
- 高階使用者可用 prefix 查，例如 `pos:n`（實際 prefix 待定，但**不要用 `#`**，避免和跳行／詞地址衝突）。
- `#123`（跳行）、`d1.1:5#4`（詞地址）保持原義。

## 3. 待辦清單（依風險與先後）

### P0：契約與 capability（無 UI）

- [ ] 定 `WordHit` 資料契約（見 §4）。
- [ ] 十個 adb 的 capability：`fullText:true`（全部）、`wordGrammar`（只有 `cs`）、`surfaceIndex`、`caseIndex`、`family`、`decomp`、`segments`、`language`。
- [ ] 譯本清單改成動態（catalog／manifest／adb metadata）；移除寫死的 `PARALLEL_DBS`。
- [ ] 每個 adb 的 tokenizer／stoplist／正規化 profile；十個 token 索引互不共用。
  - [x] `cs-mm`：`Intl.Segmenter('my', {granularity:'word'})`；舊 tokenizer 只有 113 個單字母 token，
        新索引 9,341 個詞 token，`ဘုရား` 6,569 筆；`cs-mm-clean.ts` 清掉 3 處 HTML 殘留，
        `dropPunct` 排除 `၏`／`၊`／`။`。
  - [x] `cllk`：`Intl.Segmenter('th', {granularity:'word'})`；舊 356 個 token，新 11,310 個
        （泰文 11,033），`พระพุทธเจ้า` 2,156 筆。
  - [x] `kmj`：`Intl.Segmenter('ja', {granularity:'word'})`（只有 kmj 開）；舊 2,957 個 token，
        新 10,855，`仏陀` 376 筆；`dropPunct` 排除日文句讀。
- [ ] 定詞邊界：`<詞>` 標籤 vs `#詞` 的空白切詞，兩者要以哪一個為準。
- [ ] 定 phrase 的位置資訊：index 要存 sentence position 還是用 VA 推算。
- [ ] 高階 POS prefix 語法（暫定 `pos:n`，不要用 `#`）。

### P1：詞 span ＋ drawer（低／中風險）

- [x] `render_accelon3.ts` 把 cs 的 `<詞 b j>` 渲染成 `<span class="word">`；dict 的 `<詞>` 不長 span。
- [x] 巴利原文：單擊詞 → `lex-pane` drawer（最小版：詞形、b/j、`塊.段:句#詞` 位置，若 lex.adb 在 catalog／桌面清單則查詞條）。
      實測 cs `tajjanīyakammaṃ` → `cv1.1:1#1`、lex「278 次／呵责羯磨／tajjanīya + kammaṃ」。
- [ ] 漢語譯本：不長 word span；選取文字 → 選取選單「查詞」（尚未加選單項）。
- [x] 新 `lex-pane.ts`：drawer、關閉、Esc、單擊；**沒有改 `dict-pane.ts`**。
- [ ] 四層完整版（樣本／模型標籤、例句、詞族、拆解樹）。
- [ ] 詞頁載入中、查無資料、譯本無語法的完整空狀態。

### P2：查詢與著色（高風險）

- [ ] 查詢正規化：各 adb 自己的 tokenizer／stoplist；小寫、保留原形判斷。
- [ ] 詞幹展開：`dhamma` → `dhamma#*`；`dhamma@主` → 只取該格。
- [x] 純外文（cs／sc）查詢策略：空白先片語；沒結果退 AND／鄰近（2026-11-02 已做）。
- [x] input 右側 mode badge 顯示「片語／AND／鄰近」（2026-11-02 已做）。
- [ ] 引號片語仍支援；中文維持現有。
- [ ] 後備「拆成詞件」。
- [ ] 高階 `pos:` prefix；一般 UI 不顯示 token。
- [ ] 查無結果的文案：停用詞、無此格、已拆詞件、模型推估。
- [ ] 著色改成 span／occurrence 為單位；不要用 `text.indexOf(phrase)` 比對表面字串。
- [ ] 摘要 snippet 顯示表面詞，不顯示 `dhamma#n#主`。
- [ ] 摘要 facet：詞形／詞性／格位／樣本或推估。
- [ ] 十個 adb 都有全文索引：全庫搜尋要標譯本／語言，不要共用 token 假設。

### P3：詞族、拆解樹、例句（中風險）

- [ ] 詞族清單（例如 `dhamma` → 1,033 個詞）：虛擬清單、分段載入。
- [ ] 拆解樹：多階可點、可返回。
- [ ] 例句：兩句真實經文，目標詞加粗；點例句跳到 `塊.段:句#詞` 並標詞。
- [ ] 詞頁的「返回」與 history。
- [ ] 高歧義詞的「怎麼判斷」只有 31 個；沒有就隱藏。

### P4：多譯本對讀（段對照抽屜）

- [ ] 動態譯本清單（十個 adb；不要寫死 `PARALLEL_DBS`）。
- [ ] 段對照抽屜：同一段列出 2–3 個譯本；可加語言／譯本風格標籤。
- [ ] 十個 adb 都有全文索引；抽屜裡可以直接顯示該譯本同段文字，不必再掃描。
- [ ] 缺段狀態（pku／hz 只有部分書、xsq 未對齊、cs／cllk 未完成）。
- [ ] 譯本端「看巴利原文」：連到 `cs` 同一段，再開 cs 的語法詞頁。
- [ ] 不做中央分欄；若未來要做，另開設計（會動 `doc-pane.ts`／`read-state.ts`／`paint.ts`）。
- [ ] 對讀時字級、行高、主題一致；滾動用段界，不用行號比例。

### P5：收尾

- [ ] 手機／窄視窗：詞頁 bottom sheet；分欄退回抽屜。
- [ ] 無障礙：不要讓每個詞都 tab stop；格位不能只靠顏色；Esc 關閉。
- [ ] 效能：千餘變體、147k 命中、33MB case model 的 lazy load／中斷。
- [ ] 回歸測試：`check-index.ts`、`query-demo.ts`、`file-protocol-test.ts`。

## 4. UI 所需的資料契約（草案）

```ts
interface WordHit {
  address: string;        // d1.1:5#4
  surface: string;        // dhammaṃ
  stem: string;           // dhamma
  pos: string;            // n / adj / …
  case?: string;          // 主 / 対 / 具 / 与 / 奪 / 属 / 処 / 呼
  confidence: 'sample' | 'model';
  sampleCount?: number;   // 樣本 3,867 次
  gloss?: string;         // 法
  start?: number;         // 行內字元位移（可選；由 <詞> 算）
  end?: number;
}

interface DbCapabilities {
  fullText: boolean;       // 十個 adb 都是 true
  wordGrammar: boolean;    // 只有 cs 是 true
  surfaceIndex: boolean;
  caseIndex: boolean;
  family: boolean;
  decomp: boolean;
  segments: boolean;
  language: string;        // pi / zh / ja / th / en …
  tokenProfile: string;    // 每個 adb 自己的 tokenizer／stoplist
  translationOf?: string;  // 譯本所屬的來源（通常是 cs）
}
```

UI 不直接吃 `dhamma#n#主`；那是索引內部 token。UI 只認 `surface`／`stem`／`pos`／`case`。

## 5. 驗收數字（索引／查詢）

| 查詢 | 預期 |
|---|---|
| `dhamma` | 147,103 次 |
| `dhamma@主` | 39,571 次 |
| `bhagavant@属` | 9,906 次 |
| `ca` | 0（停用詞） |
| `tathāgatassa` | 有結果（詞幹或片語後備） |
| token 總數 | 180,696（帶格位）／159,744（不帶） |
| 總出現次數 | 11,395,567 |

## 6. 已知地雷

1. **空白語意**：中文 `A B` 仍是 OR；**純外文 cs／sc 先片語、再 AND**。
2. **`#` 三重身份**：跳行、詞地址、token 名稱；POS 用 `pos:`，不用 `#`。
3. **著色是字串比對**：`paint.ts` 的 `text.indexOf` 對 `dhamma`→`dhammaṃ` 无效。
4. **`<詞>` 目前被丟掉**：renderer 不認識，文字照留但沒有 span。
5. **詞邊界兩套**：`<詞>` vs `#詞` 的空白切詞。
6. **十個 adb 的 token 不可共用**：語言與翻譯風格不同，tokenizer／stoplist 必須 per-adb。
7. **平行段是換庫**：不是同屏；`PARALLEL_DBS` 寫死，要改成動態＋段抽屜。
8. **`dhamma` 展開 1,033 個變體**：前端不能一次畫完。
9. **模型推估不能當確定**：UI 必須區分「有樣本」與「模型推估」。
10. **不要用 pe5 補格位、不要做 bigram、不要用相似度補重複段**（prompt §7）。
11. **漢語譯本不要長 word span**：沒有逐詞語法；用選取查，並連到 cs 同段。
12. **`dict-pane` 不要動**：詞典條目與詞形／語法信息分開；新功能放 `lex-pane.ts`。
13. **`sc` 的來源是儉約巴利**：`off2accelon sc` 之後要再跑 `src/sc2iast.ts`，否則正文是
    `bVrh…`，雖然有 tokens 也查不到 IAST。現在這一步已寫進 `docs/steps.md`。

## 7. 建議的第一步

D1–D8 已拍板，直接進入實作：

1. **P0**：十個 adb 的 capability／語言／token profile；動態譯本清單；定義 `WordHit`；
   定詞邊界與 phrase 位置。
2. **P1**：先用 `dn1` 做一個小試點：`cs` 的 `<詞>`＋grammar tokens＋word info，
   其他譯本只做段對齊；accelon26 做 word span＋詞 drawer（巴利單擊、漢語選取）。
3. **P2**：片語引號、`@格`、`pos:`（高階）、span 著色、摘要 facet。
4. **P3**：詞族／拆解樹／例句。
5. **P4**：段對照抽屜＋十個譯本的動態清單。
6. **P5**：手機、無障礙、效能、回歸測試。


