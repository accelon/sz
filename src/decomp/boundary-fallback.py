#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""hard 詞的「邊界微調 + 詞幹/屈折」fallback：以 pwa 切點為中心，左右移 0–3 字。"""
import sqlite3, csv, difflib, itertools

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
HARD = r"D:/2026/sz/data/cs-decomp/unresolved-hard-by-freq.tsv"
PAT = r"D:/2026/sz/data/cs-decomp/sandhi-patterns-11.tsv"
VOW = set("aāiīuūeo")
NASAL = {"k":"ṅ","kh":"ṅ","g":"ṅ","gh":"ṅ","ṅ":"ṅ",
         "c":"ñ","ch":"ñ","j":"ñ","jh":"ñ","ñ":"ñ",
         "ṭ":"ṇ","ṭh":"ṇ","ḍ":"ṇ","ḍh":"ṇ","ṇ":"ṇ",
         "t":"n","th":"n","d":"n","dh":"n","n":"n",
         "p":"m","ph":"m","b":"m","bh":"m","m":"m"}
ENDINGS = ["ānaṃ","assa","assā","āya","āyaṃ","esu","ehi","ebhi","smiṃ","smā","mhā",
           "āni","ena","ssa","to","ṃ","ā","ī","ū","e","o","a","i","u","s","ca","pi","ti","hi","su","naṃ","vā"]

con = sqlite3.connect(DB)
keys = set(); pwa = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    h = str(c).split("(")[0].strip()
    if "-" in h:
        p = [x for x in h.split("-") if x]
        if len(p) >= 2: pwa[k] = p

cb = {}
for r in csv.DictReader(open(PAT, encoding="utf-8"), delimiter="\t"):
    code = int(r["code"])
    if code <= 500: cb[(r["left"], r["right"], r["result"])] = code
by_code = {v: k for k, v in cb.items()}

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
        out.append((pre[b - 1], pre[b], s[j1:j2]))
    return out

def encode_ok(word):
    if word not in keys: return False
    parts = pwa.get(word)
    if not parts: return True
    ss = seams(word, parts)
    if len(ss) != len(parts) - 1: return False
    codes = []
    for l, r, seg in ss:
        if seg == l + r: codes.append(0)
        elif (l, r, seg) in cb: codes.append(cb[(l, r, seg)])
        else: return False
    out = parts[0][:-1]
    for i, c in enumerate(codes):
        left, right = parts[i][-1], parts[i + 1][0]
        neo = left + right if c == 0 else by_code[c][2]
        out += neo
        if i < len(parts) - 2: out += parts[i + 1][1:-1]
    out += parts[-1][1:]
    return out == word

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
            cands.append(raw[:-1] + "ṃ")   # ñ/ṇ/n + 子音 → ṃ + 子音
        cands.append(raw + "ṃ")
        for c in cands:
            if c != w and c in keys and w in forms(c, end):
                out.append((c, end))
    return out

def compound_split(word, parts):
    cuts = []; acc = 0
    for p in parts[:-1]:
        acc += len(p); cuts.append(acc)
    for ds in itertools.product(range(-3, 4), repeat=len(cuts)):
        cs = [c + d for c, d in zip(cuts, ds)]
        if any(c <= 0 or c >= len(word) for c in cs): continue
        if any(cs[i] >= cs[i + 1] for i in range(len(cs) - 1)): continue
        segs = []; prev = 0; ok = True
        for c in cs + [len(word)]:
            seg = word[prev:c]; prev = c
            if len(seg) < 4 or seg not in keys:
                ok = False; break
            segs.append((seg, False, None))
        if ok: return segs
    return None

def try_word(word):
    """回傳 (kind, segments) 或 None。segments 是 [(text, is_suffix, stem)]。"""
    parts = pwa.get(word)
    # 1) 連字號：直接切
    if "-" in word:
        ps = word.split("-")
        if all(len(p) >= 3 and p in keys for p in ps):
            return ("hyphen", [(p, False, None) for p in ps])
    # 2) pwa 已經是三件以上：先試邊界微調的 compound
    if parts and len(parts) >= 3:
        c = compound_split(word, parts)
        if c: return ("compound", c)
    # 3) 詞幹 + 屈折（詞幹當 literal token）
    for stem, end in stem_cands(word):
        return ("stem", [(stem, True, stem), (end, True, None)])
    # 4) 最後才用 compound
    if parts:
        c = compound_split(word, parts)
        if c: return ("compound", c)
    return None

rows = list(csv.DictReader(open(HARD, encoding="utf-8"), delimiter="\t"))
ok = 0; occ = 0; total = 0; ex = []; bad = []; outrows = []
for r in rows:
    w = r["word"].lower(); n = int(r["count"]); total += n
    res = try_word(w)
    if res:
        ok += 1; occ += n
        outrows.append([r["word"], n, res[0], "|".join(s[0] for s in res[1])])
        if len(ex) < 20: ex.append((r["word"], n, res[0], res[1]))
    elif len(bad) < 15:
        bad.append((r["word"], n))
with open(r"D:/2026/sz/data/cs-decomp/hard-fallback.tsv", "w", encoding="utf-8", newline="") as f:
    wr = csv.writer(f, delimiter="\t")
    wr.writerow(["word", "count", "kind", "segments"])
    wr.writerows(outrows)
print(f"hard {len(rows)} 詞形／{total:,} 次；邊界微調可修 {ok}（{ok/len(rows)*100:.1f}%），"
      f"覆蓋 {occ:,} 次（{occ/total*100:.1f}%）")
for w, n, kind, segs in ex:
    print(f"  {w} ×{n} [{kind}] → {segs}")
print("作者例：")
for w in ["uttarimanussadhammā", "nevasaññānāsaññāyatana-upapattiyā"]:
    print(f"  {w} → {try_word(w.lower())}")
print("修不出的前 15：")
for w, n in bad: print(f"  {w} ×{n}")
