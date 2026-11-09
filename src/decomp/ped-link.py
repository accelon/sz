#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PED 的 PTS 出處 → cs.adb 位址。

資料鏈：
  PED 的 `<a class=ref href=...>`（SC 精確段）
  或 PTS 卷/頁、偈號（bilara-data 的 reference：pts-vp-pli / vnp）
  → bilara root 的巴利文
  → 在 cs.adb 的同一本書內做「拼字正規化後的字串比對」
  → cs 的 `塊.段`。

為什麼不直接用 VRI 段號：bilara 的 `vri` 是 VRI 版**頁碼**，不是 cs 的
CST 段號（例：MN.i.59 的 bilara vri 是 76，cs 是 mn1 段 412）。所以用文字比對。

用法：
  python -X utf8 src/decomp/ped-link.py            # 全部
  python -X utf8 src/decomp/ped-link.py --limit 500  # 抽樣
"""
import csv, glob, json, re, sys, unicodedata, bisect, collections
from pathlib import Path

ROOT = Path(r"D:/2026/sz")
RECORDS = ROOT / "out/ped-records.json"
SOURCES = ROOT / "data/ped/sources.tsv"
OUT_REFS = ROOT / "out/ped-refs.tsv"
OUT_REPORT = ROOT / "out/ped-link-report.txt"
BILARA_REF = ROOT / "raw/bilara-data/reference/pli/ms"
BILARA_ROOT = ROOT / "raw/bilara-data/root/pli/ms"
CS_DIR = ROOT / "data/cs"
SUTTAS = ROOT / "data/cs-index/suttas.tsv"

# 這些來源在 cs 是單一 book，整組的相對位置可以用來否決重複偈。
SINGLE_BOOK = {"snp", "dhp", "thag", "thig", "pv", "vv", "iti", "ud", "kp",
               "cp", "bv", "mil", "ne", "ps", "cnd", "mnd", "vb", "pp", "kv",
               "ds", "dt"}

# 文字正規化：去變音符號、小寫、只留 a-z。
# PTS 的 ṁ 與 VRI/CST 的 ṃ 都會變成 m，ṭ/ḍ/ṇ/ñ/ḷ 也一併折疊。
def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z]+", " ", s)
    return " ".join(s.split())


def load_sources():
    src = {}
    with open(SOURCES, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            src[row["abbr"]] = row
    return src


def group_of(uid: str) -> str:
    if uid.startswith("pli-tv-"):
        return "vin"
    for p in ("tha-ap", "thi-ap"):
        if uid.startswith(p):
            return "thap" if p == "tha-ap" else "thip"
    m = re.match(r"^([a-z]+)", uid)
    return m.group(1) if m else uid


def parse_pts_vp(tok: str):
    """pts-vp-pli1.117 / pts-vp-pli1.1.1 / pts-vp-pli1ed1.5 / pts-vp-pli2ed82"""
    m = re.match(r"pts-vp-pli(\d+)ed(\d+)(?:\.(\d+))?$", tok)
    if m:  # edition, page (single-volume) 或 edition, volume? 實測 2ed82 = 2nd ed p82
        ed = int(m.group(1)); rest = [int(m.group(2))]
        if m.group(3) is not None:
            rest.append(int(m.group(3)))
        return ed, rest
    m = re.match(r"pts-vp-pli(\d+)(?:\.(\d+))?(?:\.(\d+))?$", tok)
    if m:
        return None, [int(x) for x in m.groups() if x is not None]
    return None, None


class Bilara:
    def __init__(self):
        self.ref = {}
        self.root = {}
        self.key_file = {}
        self.file_keys = {}
        self.page = collections.defaultdict(list)   # (group, ed, vol, page) -> [key]
        self.vnp = {}                                # (group, verse) -> key
        self.uid_first = {}                          # uid -> first key
        self.key_pos = {}                            # key -> (file, index)
        self.group_keys = {}                         # group -> [keys] in text order
        self.group_pos = {}                          # key -> index in group
        self._load()

    def _load(self):
        for f in glob.glob(str(BILARA_REF / "**/*_reference.json"), recursive=True):
            d = json.load(open(f, encoding="utf-8"))
            self.ref.update(d)
        for f in glob.glob(str(BILARA_ROOT / "**/*_root-pli-ms.json"), recursive=True):
            d = json.load(open(f, encoding="utf-8"))
            keys = list(d)
            self.file_keys[f] = keys
            for i, k in enumerate(keys):
                self.key_pos[k] = (f, i)
            self.root.update(d)

        for f, keys in self.file_keys.items():
            for k in keys:
                uid, seg = k.split(":", 1)
                g = group_of(uid)
                if not re.match(r"^0(\.|$)", seg):
                    self.uid_first.setdefault(uid, k)
                v = self.ref.get(k, "")
                for tok in v.split(", "):
                    if tok.startswith("pts-vp-pli"):
                        ed, nums = parse_pts_vp(tok)
                        if not nums:
                            continue
                        if ed is None:
                            if len(nums) >= 2:
                                self.page[(g, None, nums[0], nums[1])].append(k)
                            else:
                                self.page[(g, None, None, nums[0])].append(k)
                        else:
                            if len(nums) >= 2:
                                self.page[(g, ed, nums[0], nums[1])].append(k)
                            else:
                                self.page[(g, ed, None, nums[0])].append(k)
                    m = re.search(r"(?:^|, )vnp(\d+)", v)
                    if m:
                        self.vnp.setdefault((g, int(m.group(1))), k)

        # 每組（dn/mn/sn/an/snp/dhp/...）內，依 uid 數字排序的全部 key
        by_group = collections.defaultdict(list)
        for k in self.root:
            by_group[group_of(k.split(":")[0])].append(k)

        def ukey(k):
            uid = k.split(":")[0]
            nums = [int(x) for x in re.findall(r"\d+", uid)]
            return (nums, k)

        for g, ks in by_group.items():
            ks.sort(key=ukey)
            self.group_keys[g] = ks
            for i, k in enumerate(ks):
                self.group_pos[k] = i

    def keys_from(self, key: str, max_words=48, max_keys=30, same_verse=False):
        """從 key 起取後續段的文字（bilara 段很細，單段常常只有兩三個詞）。

        same_verse=True 時，只取同一個偈／同一個段號的續行（`1.1`…`1.4`），
        不跨到下一偈，避免把後面的定型句一起拿來比對。
        """
        fp = self.key_pos.get(key)
        if not fp:
            return []
        f, i = fp
        keys = self.file_keys[f]
        uid = key.split(":")[0]
        verse = key.split(":")[1].split(".")[0]
        snp_like = group_of(uid) == "snp"
        out = []
        words = []
        for k in keys[i:i + max_keys]:
            if k.split(":")[0] != uid:
                if same_verse or len(words) >= 8:
                    break
            if same_verse and snp_like and k.split(":")[1].split(".")[0] != verse:
                break
            out.append(k)
            words += norm(self.root.get(k, "")).split()
            if len(words) >= max_words:
                break
        return words


class Cs:
    def __init__(self):
        self.segs = []           # [book, block, seg, normtext]
        self.book_idx = collections.defaultdict(list)
        self.book_text = {}
        self.book_starts = {}
        self.book_global = {}
        self.unit_text = {}      # (book, block) -> text
        self.unit_starts = {}
        self.unit_global = {}
        self.sc_blocks = collections.defaultdict(list)  # sc uid -> [(book, block)]
        self.book_local = {}
        self._load()

    def _load(self):
        block_segs = collections.defaultdict(list)
        for f in sorted(glob.glob(str(CS_DIR / "*.xml"))):
            book = block = cur_block = None
            cur = None
            for line in open(f, encoding="utf-8"):
                m = re.search(r'<書 id="([^"]+)"', line)
                if m:
                    book = m.group(1)
                m = re.search(r'<塊 id="([^"]+)"([^>]*)>', line)
                if m:
                    cur_block = m.group(1)
                    block = cur_block
                    sm = re.search(r'\bsc="([^"]+)"', m.group(2))
                    if sm:
                        for u in self._expand_sc(sm.group(1)):
                            self.sc_blocks[u].append((book, block))
                else:
                    m = re.search(r'<小塊 id="([^"]+)"([^>]*)>', line)
                    if m:
                        # 閱讀器的 `塊.id` 只認 <塊>；<小塊> 要退回所屬的 <塊>
                        block = cur_block
                        sm = re.search(r'\bsc="([^"]+)"', m.group(2))
                        if sm:
                            for u in self._expand_sc(sm.group(1)):
                                self.sc_blocks[u].append((book, block))
                m = re.search(r'<段 n="([^"]+)"', line)
                if m:
                    cur = [book, block, m.group(1), []]
                    self.segs.append(cur)
                    gi = len(self.segs) - 1
                    self.book_idx[book].append(gi)
                    block_segs[(book, block)].append(gi)
                    line = line[m.end():]
                if cur is not None:
                    t = re.sub(r"<[^>]+>", "", line)
                    if t.strip():
                        cur[3].append(t)
        for s in self.segs:
            s[3] = norm(" ".join(s[3]))

        def build(units, store_text, store_starts, store_global):
            for k, idxs in units.items():
                parts, starts, pos = [], [], 0
                for i in idxs:
                    starts.append(pos)
                    parts.append(self.segs[i][3])
                    pos += len(self.segs[i][3]) + 3
                store_text[k] = " § ".join(parts)
                store_starts[k] = starts
                store_global[k] = idxs

        build(self.book_idx, self.book_text, self.book_starts, self.book_global)
        build(block_segs, self.unit_text, self.unit_starts, self.unit_global)
        for b, idxs in self.book_idx.items():
            self.book_local[b] = {gi: i for i, gi in enumerate(idxs)}

    @staticmethod
    def _expand_sc(sc):
        """`an1.1-10` → an1.1…an1.10；`dhp1-20`、`ja1`、`snp3.5`。"""
        m = re.match(r"^([a-z][a-z-]*?)([\d.]+)(?:-([\d.]+))?$", sc)
        if not m:
            return [sc]
        pre, a, b = m.group(1), m.group(2), m.group(3)
        if not b:
            return [pre + a]
        aa = [int(x) for x in re.findall(r"\d+", a)]
        bb = [int(x) for x in re.findall(r"\d+", b)]
        # 只展開最後一個分量
        if len(aa) != len(bb):
            return [pre + a]
        out = []
        if aa[:-1] != bb[:-1]:
            return [pre + a]
        for x in range(aa[-1], bb[-1] + 1):
            out.append(pre + ".".join(str(v) for v in aa[:-1] + [x]) if aa[:-1] else pre + str(x))
        return out

    def find(self, units, words, term_words=()):
        """units = [(book, block or None)]；回傳 {(book, seg_index): score}。"""
        cand = collections.defaultdict(set)
        phrase_windows = []
        n = len(words)
        for wlen in (20, 14, 10, 8, 6, 5, 4):
            if n < wlen:
                continue
            for j in range(0, min(n - wlen + 1, 40), max(1, wlen // 2)):
                phrase_windows.append((" ".join(words[j:j + wlen]), j))
        if not phrase_windows and n >= 5:
            phrase_windows.append((" ".join(words[:min(n, 12)]), 0))
        for wi, (ph, off) in enumerate(phrase_windows):
            if len(ph) < 8:
                continue
            for book, block in units:
                key = (book, block) if block else (book, None)
                txt = self.unit_text.get(key) if block else self.book_text.get(book)
                if not txt:
                    continue
                starts = self.unit_starts.get(key) if block else self.book_starts.get(book)
                gidx = self.unit_global.get(key) if block else self.book_global.get(book)
                pos = txt.find(ph)
                cnt = 0
                while pos >= 0 and cnt < 8:
                    si = bisect.bisect_right(starts, pos) - 1
                    if si >= 0:
                        cand[(book, gidx[si])].add((wi, off))
                    pos = txt.find(ph, pos + 1)
                    cnt += 1
        out = {}
        for k, ws in cand.items():
            # 目標段開頭（offset 0）權重最高，越後面越低；頁首／偈首才是落點
            score = sum(1.0 / (1.0 + off / 4.0) for _, off in ws)
            if any(off == 0 for _, off in ws):
                score += 2
            if term_words:
                segtext = self.segs[k[1]][3]
                if any(t and t in segtext for t in term_words):
                    score += 1
            out[k] = round(score, 2)
        return out


def parse_ref(raw: str):
    """回傳 dict(abbr, kind, vol, value, sub)。抓不到就 kind=None。"""
    t = raw.strip()
    # MN.i.59 / Dhp-a.iii.214 / Vin.iii.127
    m = re.match(r"^([A-Za-z][A-Za-z-]*?)\.([ivx]+)\.(\d+)(?::(\d+))?$", t)
    if m:
        vol = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6}.get(m.group(2), 0)
        return dict(abbr=m.group(1), kind="page", vol=vol, value=int(m.group(3)),
                    sub=int(m.group(4)) if m.group(4) else None)
    # Snp verse 995
    m = re.match(r"^([A-Za-z][A-Za-z-]*)\s+verse\s+(\d+)$", t)
    if m:
        return dict(abbr=m.group(1), kind="verse", vol=None, value=int(m.group(2)), sub=None)
    # Dhp.292 / Mil.402 / Pv.46:1
    m = re.match(r"^([A-Za-z][A-Za-z-]*)\.(\d+)(?::(\d+))?$", t)
    if m:
        return dict(abbr=m.group(1), kind="num", vol=None, value=int(m.group(2)),
                    sub=int(m.group(3)) if m.group(3) else None)
    # Mbh 1, 78
    m = re.match(r"^([A-Za-z][A-Za-z-]*)\s+(\d+),\s*(\d+)$", t)
    if m:
        return dict(abbr=m.group(1), kind="other", vol=int(m.group(2)), value=int(m.group(3)), sub=None)
    return dict(abbr=t.split(".")[0].split(" ")[0], kind=None, vol=None, value=None, sub=None)


class Linker:
    def __init__(self, limit=0):
        self.src = load_sources()
        self.b = Bilara()
        self.cs = Cs()
        self.rows = list(csv.DictReader(open(SUTTAS, encoding="utf-8"), delimiter="\t"))
        self.recs = json.load(open(RECORDS, encoding="utf-8"))
        self.limit = limit
        self.group_books = collections.defaultdict(set)
        for r in self.src.values():
            for b in (r.get("cs_books") or "").split(","):
                if b:
                    self.group_books[r["source"]].add(b)
        self._cs_books = set(self.cs.book_idx)
        # href 只留 unique；同一 raw 可能有多個 href，全部留著逐一試
        self.hrefs = collections.defaultdict(list)
        self.count = collections.Counter()
        self.terms = collections.defaultdict(set)
        for rec in self.recs:
            for c in rec["citations"]:
                raw = c["raw"]
                self.count[raw] += 1
                if c["href"] and c["href"] not in self.hrefs[raw]:
                    self.hrefs[raw].append(c["href"])
                for term in rec.get("terms", []):
                    n = norm(term)
                    if len(n) >= 3:
                        self.terms[raw].add(n)
            # 詞頭本身也是很好的驗證詞
            n = norm(rec["word"])
            if len(n) >= 3:
                for c in rec["citations"]:
                    self.terms[c["raw"]].add(n)

    def book_for_uid(self, uid):
        # 1) suttas.tsv 的 sc_uid 範圍
        m = re.match(r"^([a-z]+(?:-[a-z]+)*?)([\d.]+)$", uid)
        if m:
            pre, num = m.group(1), m.group(2)
            un = [int(x) for x in re.findall(r"\d+", num)]
            for r in self.rows:
                su = r["sc_uid"]
                if not su.startswith(pre):
                    continue
                body = su[len(pre):]
                mm = re.match(r"^([\d.]+)(?:-([\d.]+))?$", body)
                if not mm:
                    continue
                lo = [int(x) for x in re.findall(r"\d+", mm.group(1))]
                if mm.group(2):
                    end = [int(x) for x in re.findall(r"\d+", mm.group(2))]
                    hi = lo[:max(0, len(lo) - len(end))] + end
                else:
                    hi = lo
                if len(un) == len(lo) and all(lo[i] <= un[i] <= hi[i] for i in range(len(lo))):
                    if r["book"] in self._cs_books:
                        return [r["book"]]
        # 2) Vinaya 分卷
        if uid.startswith("pli-tv-kd"):
            n = int(re.match(r"pli-tv-kd(\d+)", uid).group(1))
            return ["cv"] if n >= 11 else ["mv"]
        if uid.startswith("pli-tv-bu-vb") or uid.startswith("pli-tv-bi-vb"):
            return [b for b in ("pj", "pc") if b in self._cs_books]
        if uid.startswith("pli-tv-pvr"):
            return ["pvr"]
        # 3) 來源表的書
        g = group_of(uid)
        books = [b for b in self.group_books.get(g, ()) if b in self._cs_books]
        if books:
            return books
        # 4) 前綴
        books = [b for b in self._cs_books if b == g or b.startswith(g)]
        return books[:6]

    def target_keys(self, raw):
        out = []  # (key, method)
        seen = set()

        def add(k, m):
            if k and k not in seen and k in self.b.root:
                seen.add(k)
                out.append((k, m))

        for h in self.hrefs.get(raw, [])[:8]:
            m = re.search(r"suttacentral\.net/([^/]+)/[^#]*#(.+)$", h)
            if m:
                add(f"{m.group(1)}:{m.group(2)}", "href")
        p = parse_ref(raw)
        ab = p["abbr"]
        src = self.src.get(ab, {})
        kind = src.get("kind", "")
        g = src.get("source", ab.lower())
        # 頁碼（PTS 卷/頁）
        if p["kind"] == "page":
            vol, page = p["vol"], p["value"]
            for key in ((g, None, vol, page), (g, None, None, page)):
                for k in self.b.page.get(key, [])[:4]:
                    add(k, "page")
        # 偈號
        if p["kind"] == "verse":
            k = self.b.vnp.get((g, p["value"]))
            if k:
                add(k, "vnp")
        # 數字（依來源 kind）
        if p["kind"] == "num":
            if kind in ("verse", "story"):
                k = self.b.vnp.get((g, p["value"]))
                if k:
                    add(k, "vnp")
            if not any(m == "vnp" for _, m in out):
                uid = f"{g}{p['value']}"
                if uid in self.b.uid_first:
                    add(self.b.uid_first[uid], "uid")
                if p["sub"] is not None:
                    k = f"{uid}:{p['sub']}.1"
                    add(k, "uid")
        return out

    def bilara_ratio(self, key):
        fp = self.b.key_pos.get(key)
        if not fp:
            return None
        f, i = fp
        n = len(self.b.file_keys[f])
        return i / n if n else None

    def cs_ratio(self, book, gi):
        loc = self.cs.book_local.get(book, {}).get(gi)
        n = len(self.cs.book_idx.get(book, ()))
        return loc / n if (loc is not None and n) else None

    def map_key(self, key, raw, short=False):
        uid = key.split(":")[0]
        books = self.book_for_uid(uid)
        words = self.b.keys_from(key, max_words=14 if short else 48, same_verse=short)
        if not words:
            return None
        term_words = self.terms.get(raw, set())
        units = []
        for book, block in self.cs.sc_blocks.get(uid, []):
            if not books or book in books:
                units.append((book, block))
        if not units:
            units = [(b, None) for b in books]
        cand = self.cs.find(units, words, term_words)
        method = "text"
        if not cand and books:
            # sc_blocks 的 sc 屬性有些書是錯的（例 Dhp 整組位移）；退回整本書找
            cand = self.cs.find([(b, None) for b in books], words, term_words)
            method = "text-book"
        if not cand and books:
            # 再退一步：全庫找，但只接受唯一且分數夠高的
            cand = self.cs.find([(b, None) for b in self._cs_books], words, term_words)
            method = "text-global"
        if not cand:
            return None
        # 偈集（snp/dhp/thag/…）常有定型句重複；用「在整組中的相對位置」加權，
        # 避免抓到後面的重複偈。page 類的 DN/MN/SN/AN 不套（cs 分卷與 bilara 不同）。
        g = group_of(uid)
        if g in SINGLE_BOOK and len(books) == 1:
            gk = self.b.group_keys.get(g)
            gr = (self.b.group_pos.get(key, 0) / len(gk)) if gk else None
            if gr is not None:
                for (b, gi), score in list(cand.items()):
                    cr = self.cs_ratio(b, gi)
                    if cr is None:
                        continue
                    dr = abs(gr - cr)
                    if dr < 0.02:
                        cand[(b, gi)] = score + 2
                    elif dr < 0.08:
                        cand[(b, gi)] = score + 1
                    elif dr > 0.30:
                        cand[(b, gi)] = score - 1
        top = sorted(cand.items(), key=lambda x: (-x[1], x[0][1]))[:5]
        best, score = top[0]
        second = top[1][1] if len(top) > 1 else 0
        if score < 1:
            return None
        conf = "high" if score >= 3 and score > second else ("medium" if score >= 2 and score >= second else "low")
        if method == "text-global":
            # 全庫亂抓的風險高：只有分數高又明顯唯一才留
            conf = "medium" if score >= 6 and score > second + 2 else "low"
        b, si = best
        s = self.cs.segs[si]
        return dict(book=s[0], block=s[1], seg=s[2], score=score, second=second,
                    conf=conf, method=method, sc_uid=uid, sc_seg=key)

    def run(self):
        raws = sorted(self.count, key=lambda r: (-self.count[r], r))
        if self.limit:
            raws = raws[:self.limit]
        rows = []
        hit = collections.Counter()
        by_src = collections.defaultdict(lambda: [0, 0, 0])  # unique, mapped, cites
        for raw in raws:
            p = parse_ref(raw)
            src = self.src.get(p["abbr"], {})
            method = ""
            got = None
            best_rank = 0
            best_score = -1
            for key, tm in self.target_keys(raw)[:12]:
                cand = self.map_key(key, raw, short=(p["kind"] == "verse" or src.get("kind") == "verse"))
                if not cand:
                    continue
                rank = {"high": 3, "medium": 2, "low": 1}.get(cand["conf"], 0)
                if rank > best_rank or (rank == best_rank and cand["score"] > best_score):
                    got = cand
                    best_rank = rank
                    best_score = cand["score"]
                    method = tm + "+" + cand["method"]
            if got:
                got["method"] = method
            row = dict(raw=raw, source=src.get("source", p["abbr"].lower()),
                       kind=src.get("kind", p["kind"] or ""), vol=p["vol"] if p["vol"] is not None else "",
                       value=p["value"] if p["value"] is not None else "", sub=p["sub"] if p["sub"] is not None else "",
                       count=self.count[raw], href=1 if raw in self.hrefs else 0,
                       sc_uid=got["sc_uid"] if got else "", sc_seg=got["sc_seg"] if got else "",
                       cst_book=got["book"] if got else "", cst_block=got["block"] if got else "",
                       cst_seg=got["seg"] if got else "", method=method,
                       confidence=got["conf"] if got else "", score=got["score"] if got else 0,
                       note=src.get("note", ""))
            rows.append(row)
            by_src[src.get("source", p["abbr"].lower())][0] += 1
            by_src[src.get("source", p["abbr"].lower())][2] += self.count[raw]
            if got:
                hit[got["conf"]] += 1
                by_src[src.get("source", p["abbr"].lower())][1] += 1
        with open(OUT_REFS, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), delimiter="\t")
            w.writeheader()
            w.writerows(rows)
        # 報告
        lines = [f"refs {len(rows):,}（全部 unique {len(self.count):,}）",
                 f"mapped {sum(by_src[s][1] for s in by_src):,} unique；"
                 f"citations {sum(by_src[s][2] for s in by_src):,}",
                 "confidence: " + ", ".join(f"{k}={v:,}" for k, v in hit.most_common())]
        lines.append("")
        lines.append("source\tunique\tmapped\tcites\t(mapped%)")
        for s, (u, m, c) in sorted(by_src.items(), key=lambda x: -x[1][2]):
            lines.append(f"{s}\t{u:,}\t{m:,}\t{c:,}\t{m/u:.1%}")
        OUT_REPORT.write_text("\n".join(lines), encoding="utf-8")
        print("\n".join(lines[:5]))
        print(f"→ {OUT_REFS}\n→ {OUT_REPORT}")


if __name__ == "__main__":
    limit = 0
    if "--limit" in sys.argv[1:]:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    Linker(limit).run()
