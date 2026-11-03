# 提示詞：建「吠陀與奧義書」三語平行 adb（`veda.adb`）

> 用法：開一個新話題（同一工作區 `D:\2026\sz`），把下面整段貼進去。
> 目的：梵語原文／英譯／漢語（以漢譯佛經為主）三語同址，做成可跳頁、可對照的 adb，
> 供小說《析聲記》查背景、也供日後做「佛經↔奧義書」對照研究。

---

## 可直接貼上的提示詞

```text
在這個工作區（D:\2026\sz）開一個子專案 veda/，建一顆三語平行的 adb：veda.adb
（dbname=veda，dbcname=吠陀與奧義書）。不要動 sz.adb，也不要改 sz 的 data/。

【先讀，再動手】
1. AGENTS.md（本區紀律）、D:\2026\adb-converter\AGENTS.md（母區）
2. D:\2026\adb-converter\docs\adb\adb-knowhow.md、off-to-accelon.md
3. docs\addressing.md（定址規格；本專案要照它的哲學，不要照它的前綴）
4. docs\canon-status.md（看「外部化」「驗收」兩節的做法）

【目標】
一顆 adb，三個「區」：sa（梵語原文，IAST）／en（英譯）／zh（漢語）。
同一段落在三區共用同一個地址；缺的語言用 <缺/> 標記，不要空白、不要湊。
跨區跳頁：zh?bu.2.4.5、en?bu.2.4.5。

【地址規格（照 sz 的 塊.段 哲學）】
- 地址 = 書.層….單元，例：rv.10.90.3（梨俱第10卷90頌第3偈）、bu.2.4.5（大林間2.4.5）、
  cu.6.8.7（歌讚6.8.7）、sb.2.1.1.1（百道梵書）、mdu.1.7（蛙氏）、iu.1（伊莎）。
- 塊 = 地址去掉最後一段（bu.2.4、rv.10.90）；段 = 最後一個數字。
- 句：地址:2（該段第2句）；詞：地址:2#ātman。
- 書前綴（小寫、固定、不再改）：rv sv yv av｜bu cu au tu iu ku kth mu pr mdu sve kau mai｜sb（Śatapatha）。
- 不同校本共用同一地址；異文放 <var>，不要另開地址。

【範圍：先做垂直切片，不要一次全下載】
P0（第一輪，必須跑通一整條）：
  rv.10.90（原人歌）、rv.10.129（創造歌）、bu.2.4（Yājñavalkya–Maitreyī）、
  bu.4.3–4.5、cu.6.8–6.16（tat tvam asi）、cu.5.3–5.10（五火二道）、
  kth.1.20–2.25（車喻）、mdu.1–12、iu.1–18、au.1.1、pr.1、sve.2、kau.4、mai.6.30–34。
  每段要三語齊：梵（GRETIL／Sanskrit Documents）、英（Max Müller SBE 1／15，PD）、
  漢（優先放「對應的漢譯佛經」，CBETA；奧義書漢譯只作參照，不進 adb）。
P1：十三主要奧義書全（SBE 1+15 已含 12 部＋Maitrāyaṇa）。
P2：四吠陀全文（RV 1028 頌、AV 20 卷、SV、YV 選）。

【來源地圖（先驗證可用性與授權，再下載）】
梵語：
- GRETIL：https://gretil.sub.uni-goettingen.de/gretil.html
  RV 全文（Aufrecht, TEI/plaintext）：gretil/corpustei/transformations/plaintext/sa_Rgveda-edAufrecht.txt
  RV 詞譜（padapāṭha）：…/sa_RgvedasaMhitApadapATha.txt　← 這是「天然詞譜」，務必取
  AV（Śaunaka）：gretil/1_sanskr/1_veda/1_sam/avs___u.htm（無重音）
  SV：…/sa_sAmavedasaMhitA.txt
  Śatapatha：gretil/1_sanskr/1_veda/2_bra/satapath/sb_01_u.htm 起
  奧義書：sa_kathopaniSad.txt（乾淨）、sa_chAndogyopaniSad-comm.txt、sa_bRhadAraNyakopaniSadkANva-recension-comm.txt（後兩者含註，要切掉註）
- Sanskrit Documents：https://sanskritdocuments.org/doc_upanishhat/（.itx／.pdf／html，ITRANS 要轉）
- TITUS（BAU 等，重音本）：http://titus.fkidg1.uni-frankfurt.de/texte/etcd/ind/aind/ved/yvw/upanisad/bau/bau.htm
英譯（全部 PD，可散布）：
- Max Müller, SBE 1（Chāndogya, Kena, Aitareya, Kauṣītaki, Īśā）與 SBE 15（Kaṭha, Muṇḍaka,
  Taittirīya, Bṛhadāraṇyaka, Śvetāśvatara, Praśna, Maitrāyaṇa）：http://www.sacred-texts.com/hin/upan/
- Griffith, RV（1896）；Whitney, AV（1905）；Eggeling, Śatapatha（SBE 12/26/41/43/44）
漢語：
- 首選：CBETA 漢譯佛經（T01 阿含部等），PD／CC BY-NC-SA，附 T 號與卷行。
- 奧義書漢譯（徐梵澄《五十奧義書》、姚衛群、黃寶生）都在著作權內：只當校讀參考，
  **不要**寫進 data/zh/；要放進 adb 就自己節譯，並在檔頭註明「本區為自譯」。

【三個必要產物（除了 adb）】
1. veda/data/veda-index/parallels.tsv：佛經↔奧義書對照。欄位
   addr / theme / sutta（例 DN27、MN93）/ cbeta（例 T1.24 卷行）/ note / confidence（高/中/待查）。
   種子（全部標「待查」，要逐一核）：
   - rv.10.90 ↔ 種姓起源：《長阿含》22〈世記經〉、T1.24《起世經》、T1.23《大樓炭經》
   - rv.10.129.6–7（誰知道呢）↔ 無記：《中阿含》221〈箭喻經〉、T2.99 無記諸經
   - bu.2.4／4.5（neti neti）↔ 無我：SN22.59《無我相經》、《雜阿含》對應經
   - cu.6.8.7（tat tvam asi）↔ 如來藏：《大般涅槃經》《勝鬘經》
   - cu.5.3–10（五火二道）↔ 輪迴與中有
   - kth.1.20–2.25（車喻）↔ 《彌蘭王問經》車喻（Mil 2.1）
   - mdu.1–12（四狀態）↔ 四禪／四無色定／滅盡定（《清淨道論》）
   - au.1.1 ↔ 創世：《起世經》
   - cu.1.1（唵）↔ 佛教咒語（《心經》末咒等）
   - bu.2.1（王教婆羅門）↔ 小說背景（非佛經，標 theme=王權神權）
2. veda/data/veda-index/glossary.tsv：梵語／IAST／天城體／漢譯佛經語／奧義書譯語／英譯／備註。
   重點列「同一梵語、兩種譯法」：ātman 我／神我、brahman 梵、dharma 法、karman 業、
   saṃsāra 生死／輪迴、yoga 相應／瑜伽、nirvāṇa、śraddhā 信、tapas 苦行、ṛta、satya 諦／真實。
3. veda/docs/sources.md：每個檔的來源、版本、授權、下載日、已用／未用、缺什麼。

【技術要求】
- 一行一個 adb 行；梵語行用空格分詞（不拆 compound），重音（svara）另存 data/veda/svara/，
  主文用無重音 IAST，避免 tokenizer 被組合字元打斷。
- 用 RV 的 saṃhitā／padapāṭha 兩本做「天然詞譜」：同址並置，另出 sandhi.tsv
  （saṃhitā 形／padapāṭha 詞／連音類型）。這是本專案最有價值的一張表，也是小說母題的來源。
- 轉檔腳本放 veda/src/，中間產物 veda/out/（不進版控）；打包用母區 authorAdb（fullTextIndex: false 先不建索引）。
- 目錄樹：區→書→塊（<樹 s="*" t="區,書,塊.">）。
- 驗收：veda/src/check.ts（段序列、地址唯一、三區同址數、缺漏統計、無掉字），
  通過回 0、不通過回 1，並印出「zh 缺幾段、en 缺幾段」。

【第一步（只做這一步，做完停下來報告）】
取 rv.10.90 一段，三語齊（梵 GRETIL、英 Griffith、漢 T1.24 起世經對應段），
寫進 veda/data/{sa,en,zh}/，跑通 pack → accelon26/veda.adb，
用 zh?rv.10.90.3 跳頁截圖／輸出驗證，然後回報：行數、地址數、三區對齊數、缺什麼、授權風險。

【禁止】
- 不要把吠陀／奧義書塞進 sz.adb。
- 不要用有著作權的漢譯填 data/zh/。
- 不要為了湊三語而機器翻譯；寧可 <缺/>。
- 不要一次下載全部四吠陀；先 P0。
```

---

## 短版（只想先探路時用）

```text
在 D:\2026\sz 開 veda/ 子專案，建 veda.adb：梵（IAST）／英／漢三區同址平行。
地址照 塊.段：rv.10.90.3、bu.2.4.5，句用 :2、詞用 #ātman。
先只做 rv.10.90 一段垂直切片（GRETIL + Griffith + CBETA T1.24），跑通打包與 zh?rv.10.90.3 跳頁，
回報行數、地址數、三區對齊數、授權風險，再等我決定要不要擴到十三奧義書。
來源與授權見 docs/prompt-veda-adb.md。
```

---

## 給作者的三個提醒

1. **漢語欄是本專案唯一的授權風險**。徐梵澄、姚衛群、黃寶生的譯本都還在著作權內；
   最乾淨的做法是「漢語欄放對應的漢譯佛經」，把奧義書漢譯留在 `docs/` 當校讀參考。
2. **RV 的 padapāṭha 是禮物**：它本來就是「逐詞本」，等於兩千五百年前就有人做好了詞譜。
   拿它跟 saṃhitā 並置，就是現成的「拆詞」資料，也正是小說裡徒弟那袋木牌的歷史原型。
3. **先一條垂直切片**。三語、多層地址、目錄樹、跳頁，這四件事只要在一段上跑通，
   其餘都是重複勞動；跑不通就早點發現，不要先下載 500 MB。

## 主要來源（核對用）

- GRETIL（哥廷根印度語電子文本庫）：<https://gretil.sub.uni-goettingen.de/gretil.html>
- Sanskrit Documents（奧義書原文，含 .itx／PDF）：<https://sanskritdocuments.org/doc_upanishhat/>
- TITUS（重音本，BAU 等）：<http://titus.fkidg1.uni-frankfurt.de/texte/etcd/ind/aind/ved/yvw/upanisad/bau/bau.htm>
- Sacred Texts（Max Müller SBE 1／15 英譯，PD）：<http://www.sacred-texts.com/hin/upan/>
- CBETA（漢譯佛經，T 號）：<https://cbetaonline.dila.edu.tw/>
- SuttaCentral（巴利↔漢譯對照，找 parallels 用）：<https://suttacentral.net/>
