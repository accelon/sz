#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""1+1 頻次 codebook：0 + top N + (word fallback / per-seam escape)，量 dn1/mn1。"""
import sqlite3, difflib, collections, csv, re, sys, itertools, os

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
PAT = r"D:/2026/sz/data/cs-decomp/sandhi-patterns-11.tsv"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 500

rows = list(csv.DictReader(open(PAT, encoding="utf-8"), delimiter="\t"))
by_pattern = {}
by_code = {}
for r in rows:
    code = int(r["code"])
    if code > N: continue
    key = (r["left"], r["right"], r["result"])
    by_pattern[key] = code
    by_code[code] = (r["left"], r["right"], r["result"])
print(f"codebook：0 + 1..{N}（實際 {len(by_code)} 條）")

con = sqlite3.connect(DB)
pwa = {}
keys = set()
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    h = str(c).split("(")[0].strip()
    if "-" in h:
        p = [x for x in h.split("-") if x]
        if len(p) >= 2: pwa[k] = p

def amap(pre, s, ops):
    mp = [0] * (len(pre) + 1)
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            for k in range(i2 - i1 + 1): mp[i1 + k] = j1 + k
        elif tag == "delete":
            for k in range(i2 - i1 + 1): mp[i1 + k] = j1
        elif tag == "insert": mp[i1] = j1
        else:
            n = i2 - i1
            for k in range(n + 1): mp[i1 + k] = j1 + (j2 - j1) * k // n if n else j1
    return mp

def seams(surf, parts):
    pre = "".join(parts).lower(); s = surf.lower()
    sm = difflib.SequenceMatcher(None, pre, s, autojunk=False)
    mp = amap(pre, s, sm.get_opcodes())
    out = []; b = 0
    for i in range(len(parts) - 1):
        b += len(parts[i])
        if b <= 0 or b >= len(pre): continue
        j1, j2 = mp[b - 1], mp[b + 1]
        if j2 <= j1: continue
        left, right, seg = pre[b - 1], pre[b], s[j1:j2]
        out.append((left, right, seg))
    return out

# ── fallback：詞幹 + 屈折／兩階拆分（docs/sandhi-codebook.md §5.1）──
VOW = set("aāiīuūeo")
NASAL = {"k":"ṅ","kh":"ṅ","g":"ṅ","gh":"ṅ","ṅ":"ṅ",
         "c":"ñ","ch":"ñ","j":"ñ","jh":"ñ","ñ":"ñ",
         "ṭ":"ṇ","ṭh":"ṇ","ḍ":"ṇ","ḍh":"ṇ","ṇ":"ṇ",
         "t":"n","th":"n","d":"n","dh":"n","n":"n",
         "p":"m","ph":"m","b":"m","bh":"m","m":"m"}
ENDINGS = ["ānaṃ","assa","assā","āya","āyaṃ","esu","ehi","ebhi","smiṃ","smā","mhā",
           "āni","ena","ssa","to","ṃ","ā","ī","ū","e","o","a","i","u","s","ca","pi","ti","hi","su","naṃ","vā"]

def forms(stem, end):
    out = {stem + end}
    if not stem or not end: return out
    a, b = stem[-1], end[0]
    if a in VOW and b in VOW:
        out.add(stem[:-1] + end)
        out.add(stem[:-1] + "e" + end[1:])
        out.add(stem[:-1] + "o" + end[1:])
        out.add(stem[:-1] + "ā" + end[1:])
    if a == "ṃ" and b not in VOW:
        out.add(stem[:-1] + NASAL.get(b, "ṃ") + end)
    return out

def stem_cands(w):
    out = []
    for end in ENDINGS:
        if not w.endswith(end): continue
        raw = w[:-len(end)]
        if len(raw) < 2: continue
        cands = [raw]
        if raw[-1] not in VOW:
            cands += [raw + v for v in "aāiīuū"]
            cands.append(raw[:-1] + "ṃ")
        cands.append(raw + "ṃ")
        for c in cands:
            if c != w and c in keys and w in forms(c, end):
                out.append((c, end))
    return out

def compound_split(word, parts):
    cuts = []; acc = 0
    for p in parts[:-1]:
        acc += len(p); cuts.append(acc)
    if len(cuts) > 3: return None   # 避免 7^k 爆炸；只處理 ≤4 件
    for ds in itertools.product(range(-3, 4), repeat=len(cuts)):
        cs = [c + d for c, d in zip(cuts, ds)]
        if any(c <= 0 or c >= len(word) for c in cs): continue
        if any(cs[i] >= cs[i + 1] for i in range(len(cs) - 1)): continue
        segs = []; prev = 0; ok = True
        for c in cs + [len(word)]:
            seg = word[prev:c]; prev = c
            if len(seg) < 4 or seg not in keys:
                ok = False; break
            segs.append(seg)
        if ok: return segs
    return None

def fallback_pieces(word):
    """回傳可無損串接的表面片段，或 None。"""
    parts = pwa.get(word)
    if "-" in word:
        ps = word.split("-")
        if all(len(p) >= 3 and p in keys for p in ps):
            return ps
    if parts and len(parts) >= 3:
        c = compound_split(word, parts)
        if c: return c
    for stem, end in stem_cands(word):
        # 把 stem+end 轉成表面片段：找 stem 的最長前綴
        k = len(stem)
        while k >= 1 and not word.startswith(stem[:k]):
            k -= 1
        if k >= 1:
            pieces = [word[:k], word[k:]]
            if "".join(pieces) == word and all(pieces):
                return pieces
    if parts:
        c = compound_split(word, parts)
        if c: return c
    return None

def loose_split(word):
    """最後手段：找已知的長前綴（或長後綴），尾巴不要求是詞。"""
    n = len(word)
    if n < 8: return None
    need = max(4, int(n * 0.5))
    for i in range(n - 2, need - 1, -1):
        if word[:i] in keys:
            return [word[:i], word[i:]]
    for j in range(4, n - 2):
        if n - j >= need and word[j:] in keys:
            return [word[:j], word[j:]]
    return None

def run(book):
    xml = open(rf"D:/2026/sz/data/cs/{book}.xml", encoding="utf-8").read()
    words = re.findall(r"<[詞辭][^>]*>([^<]*)</[詞辭]>", xml)
    freq = collections.Counter(w.lower() for w in words)
    FREQ_MIN = int(os.environ.get("FREQ_MIN", "1000000000"))  # 預設不設門檻；FREQ_MIN=50 可保護高頻詞
    def loose(low):
        return None if freq[low] >= FREQ_MIN else loose_split(low)
    enc = 0; fb_enc = 0; partial = 0
    word_fb = 0; no_pwa = 0; seam_fb = 0; shape_fail = 0; seam_missing = 0
    seam_total = seam_esc = identity_total = 0
    digits = 0; orig_len = 0; text_len = 0
    tokens = 0
    code_use = collections.Counter()
    fail_ex = []
    for w in words:
        low = w.lower()
        orig_len += len(w)
        parts = pwa.get(low)
        # 0) 無 pwa 拆解：只有連字號才試 fallback；原子詞不硬拆
        if not parts:
            if "-" in low:
                fb = fallback_pieces(low)
                if fb and "".join(fb) == low:
                    fb_enc += 1; text_len += len("+".join(fb)); tokens += len(fb); continue
            ls = loose(low)
            if ls:
                partial += 1; text_len += len("+".join(ls)); tokens += len(ls); continue
            no_pwa += 1; word_fb += 1; text_len += len(w); tokens += 1; continue
        ss = seams(w, parts)
        if len(ss) != len(parts) - 1:
            fb = fallback_pieces(low)
            if fb and "".join(fb) == low:
                fb_enc += 1; text_len += len("+".join(fb)); tokens += len(fb); continue
            ls = loose(low)
            if ls:
                partial += 1; text_len += len("+".join(ls)); tokens += len(ls); continue
            seam_missing += 1; word_fb += 1; text_len += len(w); tokens += 1; continue
        codes = []
        esc = 0
        for l, r, seg in ss:
            seam_total += 1
            if seg == l + r:
                codes.append(0); identity_total += 1
            elif (l, r, seg) in by_pattern:
                codes.append(by_pattern[(l, r, seg)])
            else:
                esc += 1
        seam_esc += esc
        if esc:
            fb = fallback_pieces(low)
            if fb and "".join(fb) == low:
                fb_enc += 1; text_len += len("+".join(fb)); tokens += len(fb); continue
            ls = loose(low)
            if ls:
                partial += 1; text_len += len("+".join(ls)); tokens += len(ls); continue
            seam_fb += 1; word_fb += 1; text_len += len(w); tokens += 1; continue
        # 組字串
        s = parts[0]
        for c, p in zip(codes, parts[1:]):
            s += str(c) + p
        # 解碼驗證：接縫結果已包含左界字；中間詞件只取 interior
        out = parts[0][:-1]
        for i, c in enumerate(codes):
            left, right = parts[i][-1], parts[i + 1][0]
            neo = left + right if c == 0 else by_code[c][2]
            out += neo
            if i < len(parts) - 2:
                out += parts[i + 1][1:-1]
        out += parts[-1][1:]
        if out != low:
            fb = fallback_pieces(low)
            if fb and "".join(fb) == low:
                fb_enc += 1; text_len += len("+".join(fb)); tokens += len(fb); continue
            ls = loose(low)
            if ls:
                partial += 1; text_len += len("+".join(ls)); tokens += len(ls); continue
            shape_fail += 1; word_fb += 1; text_len += len(w); tokens += 1
            if len(fail_ex) < 5:
                fail_ex.append((w, parts, codes, out))
            continue
        enc += 1
        for c in codes: code_use[c] += 1
        digits += sum(len(str(c)) for c in codes)
        text_len += len(s); tokens += len(parts)
    changed = sum(n for c, n in code_use.items() if c != 0)
    print(f"\n{book}: <辭> {len(words):,} 詞次")
    print(f"  codebook 可編碼（lossless）{enc:,}（{enc/len(words)*100:.1f}%）")
    print(f"  fallback 救援（詞幹／兩階）{fb_enc:,}（{fb_enc/len(words)*100:.1f}%）")
    print(f"  部分切分（寬鬆前綴／後綴）{partial:,}（{partial/len(words)*100:.1f}%）")
    print(f"  合計有切 {enc+fb_enc+partial:,}（{(enc+fb_enc+partial)/len(words)*100:.1f}%）；"
          f"word fallback {word_fb:,}（{word_fb/len(words)*100:.1f}%）")
    print(f"    fallback 細分：無 pwa {no_pwa:,}；接縫 escape {seam_fb:,}；"
          f"詞幹尾巴不合 {shape_fail:,}；接縫抽取不完整 {seam_missing:,}")
    print(f"  接縫 {seam_total:,}；identity {identity_total:,}；escape {seam_esc:,}"
          f"（{seam_esc/max(seam_total,1)*100:.2f}%）；已編碼改寫 {changed:,}")
    print(f"  字數 {orig_len:,} → {text_len:,}（+{(text_len/orig_len-1)*100:.1f}%）；"
          f"數字 {digits:,}；token {tokens:,}（×{tokens/len(words):.2f}）")
    for x in fail_ex:
        print("    SHAPE FAIL", x)
    print("  code 使用：", dict(code_use.most_common(8)))

for b in (sys.argv[2:] or ["dn1", "mn1"]):
    run(b)
