#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""切完後的頭痛率：用 codebook/fallback/部分切分的 units 數音節。"""
import sys, re, collections, os

ARGS = sys.argv[1:]
sys.argv = ["x", "500"]
FREQ = int(os.environ.get("FREQ_MIN", "1000000000"))  # 預設不設門檻
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
        if freq[low] < FREQ:
            ls = loose_split(low)
            if ls: return ls
        return [w]
    if "-" in low:
        fb = fallback_pieces(low)
        if fb: return fb
    if freq[low] < FREQ:
        ls = loose_split(low)
        if ls: return ls
    return [w]

def median(dist):
    n = sum(dist.values()); acc = 0
    for k in sorted(dist):
        acc += dist[k]
        if acc >= n / 2: return k
    return 0

def stats(seq):
    dist = collections.Counter()
    for u in seq:
        dist[syl(u)] += 1
    n = sum(dist.values())
    over3 = sum(v for k, v in dist.items() if k > 3)
    return n, median(dist), over3 / n * 100, sum(k * v for k, v in dist.items()) / n

books = ARGS or ["dn1", "dn2", "dn3", "mn1"]
agg_base = []; agg_split = []
for book in books:
    xml = open(rf"D:/2026/sz/data/cs/{book}.xml", encoding="utf-8").read()
    text = re.sub(r"<[^>]*>", " ", xml)
    words = re.findall(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+", text)
    freq = collections.Counter(w.lower() for w in words)
    units = []
    for w, c in freq.items():
        u = units_for(w, freq)
        units.extend(u * c)
    b = stats(words)          # 未拆：一個詞一個單位
    s = stats(units)          # 切完：詞件／片段
    ub = len(set(w.lower() for w in words)); us = len(set(u.lower() for u in units))
    W = set(w.lower() for w in words); U = set(u.lower() for u in units)
    KU = set(u.lower() for u in units if u.lower() in keys)
    UU = set(u.lower() for u in units if u.lower() not in keys)
    agg_base.extend(words); agg_split.extend(units)
    print(f"{book}: 詞 {len(words):,}；未拆 中位 {b[1]} 頭痛 {b[2]:.1f}% 平均 {b[3]:.2f} ｜ "
          f"切後 units {s[0]:,} 中位 {s[1]} 頭痛 {s[2]:.1f}% 平均 {s[3]:.2f} ｜ "
          f"unique {ub:,} → {us:,}（{us/ub*100:.1f}%；消失 {len(W-U):,}、新增 {len(U-W):,}；"
          f"known {len(KU):,}／unknown {len(UU):,}）")

if len(books) > 1:
    b = stats(agg_base); s = stats(agg_split)
    W = set(w.lower() for w in agg_base); U = set(u.lower() for u in agg_split)
    KU = set(u.lower() for u in agg_split if u.lower() in keys)
    UU = set(u.lower() for u in agg_split if u.lower() not in keys)
    print(f"合計: 詞 {len(agg_base):,}；未拆 中位 {b[1]} 頭痛 {b[2]:.1f}% 平均 {b[3]:.2f} ｜ "
          f"切後 units {s[0]:,} 中位 {s[1]} 頭痛 {s[2]:.1f}% 平均 {s[3]:.2f} ｜ "
          f"unique {len(W):,} → {len(U):,}（{len(U)/len(W)*100:.1f}%；消失 {len(W-U):,}、新增 {len(U-W):,}；"
          f"known {len(KU):,}／unknown {len(UU):,}）")
