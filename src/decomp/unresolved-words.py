#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 codebook 接不回的詞收集起來，按詞頻與長度分別排序。

用法：
  python src/decomp/unresolved-words.py            # dn1 + mn1
  python src/decomp/unresolved-words.py dn1
"""
import sqlite3, difflib, collections, csv, re, os, sys

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
PAT = r"D:/2026/sz/data/cs-decomp/sandhi-patterns-11.tsv"
OUT = r"D:/2026/sz/data/cs-decomp"
N = 500

rows = list(csv.DictReader(open(PAT, encoding="utf-8"), delimiter="\t"))
by_pattern = {}
by_code = {}
for r in rows:
    code = int(r["code"])
    if code > N: continue
    by_pattern[(r["left"], r["right"], r["result"])] = code
    by_code[code] = (r["left"], r["right"], r["result"])

con = sqlite3.connect(DB)
pwa = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    h = str(c).split("(")[0].strip()
    if "-" in h:
        p = [x for x in h.split("-") if x]
        if len(p) >= 2: pwa[str(k).lower()] = p

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

def classify(w):
    """回傳 (reason, None) 或 (None, encoded_string)。"""
    parts = pwa.get(w.lower())
    if not parts: return "no_pwa", None
    ss = seams(w, parts)
    if len(ss) != len(parts) - 1: return "seam_missing", None
    codes = []
    for l, r, seg in ss:
        if seg == l + r:
            codes.append(0)
        elif (l, r, seg) in by_pattern:
            codes.append(by_pattern[(l, r, seg)])
        else:
            return "seam_escape", None
    # decode
    out = parts[0][:-1]
    for i, c in enumerate(codes):
        left, right = parts[i][-1], parts[i + 1][0]
        neo = left + right if c == 0 else by_code[c][2]
        out += neo
        if i < len(parts) - 2: out += parts[i + 1][1:-1]
    out += parts[-1][1:]
    if out != w.lower(): return "shape_fail", None
    return None, None

books = sys.argv[1:] or ["dn1", "mn1"]
agg = {}  # lower -> dict
for book in books:
    xml = open(rf"D:/2026/sz/data/cs/{book}.xml", encoding="utf-8").read()
    words = re.findall(r"<[詞辭][^>]*>([^<]*)</[詞辭]>", xml)
    for w in words:
        reason, _ = classify(w)
        if not reason: continue
        k = w.lower()
        d = agg.get(k)
        if not d:
            d = {"word": w, "count": 0, "length": len(w), "reasons": set(), "books": set()}
            agg[k] = d
        d["count"] += 1
        d["reasons"].add(reason)
        d["books"].add(book)

items = list(agg.values())
reason_count = collections.Counter()
for d in items:
    for r in d["reasons"]: reason_count[r] += 1
print(f"books={books}；無法編碼的詞形 {len(items):,}；依原因（詞形數）：{dict(reason_count)}")

def write(path, seq, title):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["rank", "word", "count", "length", "reasons", "books"])
        for i, d in enumerate(seq, 1):
            w.writerow([i, d["word"], d["count"], d["length"],
                        ",".join(sorted(d["reasons"])), ",".join(sorted(d["books"]))])
    print(f"  {title} → {path}")

by_freq = sorted(items, key=lambda d: (-d["count"], -d["length"], d["word"].lower()))
by_len = sorted(items, key=lambda d: (-d["length"], -d["count"], d["word"].lower()))
write(os.path.join(OUT, "unresolved-words-by-freq.tsv"), by_freq, "by frequency")
write(os.path.join(OUT, "unresolved-words-by-length.tsv"), by_len, "by length")

print("\n按詞頻前 20：")
for d in by_freq[:20]:
    print(f"  {d['count']:5}  len={d['length']:2}  {d['word']}  [{','.join(sorted(d['reasons']))}]")
print("\n按長度前 20：")
for d in by_len[:20]:
    print(f"  len={d['length']:2}  {d['count']:5}  {d['word']}  [{','.join(sorted(d['reasons']))}]")

# 只列「有 pwa 拆但接不回」的，另外排一份
hard = [d for d in items if d["reasons"] - {"no_pwa"}]
hard_freq = sorted(hard, key=lambda d: (-d["count"], -d["length"], d["word"].lower()))
hard_len = sorted(hard, key=lambda d: (-d["length"], -d["count"], d["word"].lower()))
write(os.path.join(OUT, "unresolved-hard-by-freq.tsv"), hard_freq, "hard by frequency")
write(os.path.join(OUT, "unresolved-hard-by-length.tsv"), hard_len, "hard by length")
print(f"\n其中「有 pwa 拆但接不回」的詞形 {len(hard):,}；前 10（詞頻）：")
for d in hard_freq[:10]:
    print(f"  {d['count']:5}  len={d['length']:2}  {d['word']}  [{','.join(sorted(d['reasons']))}]")
