#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""四部 Nikaya：只算已知詞（碎片不算 token）的 unique 與頭痛率。"""
import sys, re, collections

sys.argv = ["x", "500"]
src = open(r"D:/2026/sz/src/decomp/sandhi-codebook.py", encoding="utf-8").read()
head = src.split("for b in (sys.argv[2:]")[0]
exec(head, globals())

VOW = set("aāiīuūeo")
def syl(s):
    return sum(1 for c in s.lower() if c in VOW)

def units_for(w, freq):
    low = w.lower(); parts = pwa.get(low)
    if parts:
        ss = seams(w, parts)
        if len(ss) == len(parts) - 1:
            codes = []; ok = True
            for l, r, seg in ss:
                if seg == l + r: codes.append(0)
                elif (l, r, seg) in by_pattern: codes.append(by_pattern[(l, r, seg)])
                else: ok = False; break
            if ok:
                out = parts[0][:-1]
                for i, c in enumerate(codes):
                    left, right = parts[i][-1], parts[i + 1][0]
                    neo = left + right if c == 0 else by_code[c][2]
                    out += neo
                    if i < len(parts) - 2: out += parts[i + 1][1:-1]
                out += parts[-1][1:]
                if out == low: return parts
        fb = fallback_pieces(low)
        if fb: return fb
        ls = loose_split(low)
        if ls: return ls
        return [w]
    if "-" in low:
        fb = fallback_pieces(low)
        if fb: return fb
    ls = loose_split(low)
    if ls: return ls
    return [w]

CACHE = {}
def units_cached(w, freq):
    if w not in CACHE:
        CACHE[w] = units_for(w, freq)
    return CACHE[w]

def median(dist):
    n = sum(dist.values()); acc = 0
    for k in sorted(dist):
        acc += dist[k]
        if acc >= n / 2: return k
    return 0

def stats(seq):
    dist = collections.Counter()
    for u in seq: dist[syl(u)] += 1
    n = sum(dist.values())
    over3 = sum(v for k, v in dist.items() if k > 3)
    return n, median(dist), over3 / n * 100, sum(k * v for k, v in dist.items()) / n

GROUPS = [
    ("dn", ["dn1", "dn2", "dn3"]),
    ("mn", ["mn1", "mn2", "mn3"]),
    ("sn", ["sn1", "sn2", "sn3", "sn4", "sn5"]),
    ("an", [f"an{i}" for i in range(1, 12)]),
]

cumW = set(); cumU = set(); cum_units = 0; cum_words = 0
for name, books in GROUPS:
    words = []
    units = []
    for book in books:
        xml = open(rf"D:/2026/sz/data/cs/{book}.xml", encoding="utf-8").read()
        text = re.sub(r"<[^>]*>", " ", xml)
        ws = re.findall(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+", text)
        words.extend(ws)
        freq = collections.Counter(w.lower() for w in ws)
        for w, c in freq.items():
            us = [u for u in units_cached(w, freq) if u.lower() in keys]
            units.extend(us * c)
    base = [w for w in words if w.lower() in keys]
    b = stats(base); s = stats(units)
    W = set(w.lower() for w in base); U = set(u.lower() for u in units)
    cumW |= W; cumU |= U
    cum_units += len(units); cum_words += len(words)
    print(f"{name}: 詞 {len(words):,}（已知 {len(base):,}）｜未拆 中位 {b[1]} 頭痛 {b[2]:.1f}% ｜ "
          f"切後 units {len(units):,} 中位 {s[1]} 頭痛 {s[2]:.1f}% 平均 {s[3]:.2f} ｜ "
          f"unique {len(W):,} → {len(U):,} ｜ 累計 unique {len(cumW):,} → {len(cumU):,}")
