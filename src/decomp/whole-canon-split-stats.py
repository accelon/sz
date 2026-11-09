#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全藏：用 pwa 詞件直接拆（不再跑 codebook），量 unique 與頭痛率。"""
import re, glob, sqlite3, collections, os

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
con = sqlite3.connect(DB)
keys = set(); pwa = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    h = str(c).split("(")[0].strip()
    if "-" in h:
        p = [x for x in h.split("-") if x]
        if len(p) >= 2: pwa[k] = p
print(f"pwa keys {len(keys):,}；有拆解 {len(pwa):,}")

VOW = set("aāiīuūeo")
def syl(s): return sum(1 for c in s.lower() if c in VOW)

def loose(w):
    n = len(w)
    if n < 8: return None
    need = max(4, int(n * 0.5))
    for i in range(n - 2, need - 1, -1):
        if w[:i] in keys: return [w[:i], w[i:]]
    for j in range(4, n - 2):
        if n - j >= need and w[j:] in keys: return [w[:j], w[j:]]
    return None

freq = collections.Counter()
files = [p for p in glob.glob(r"D:/2026/sz/data/cs/*.xml") if not p.endswith("00.xml")]
for p in files:
    t = re.sub(r"<[^>]*>", " ", open(p, encoding="utf-8").read())
    for w in re.findall(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+", t):
        freq[w.lower()] += 1
print(f"files {len(files)}；詞 {sum(freq.values()):,}；unique {len(freq):,}")

base_dist = collections.Counter()
unit_dist = collections.Counter()
W = set(freq); Wk = {w for w in W if w in keys}
U = set(); Uk = set()
units_total = 0
for w, c in freq.items():
    base_dist[syl(w)] += c
    parts = pwa.get(w)
    if parts:
        units = parts
    else:
        ls = loose(w)
        units = ls if ls else [w]
    units_total += len(units) * c
    for u in units:
        unit_dist[syl(u)] += c
        U.add(u)
        if u in keys: Uk.add(u)

def median(dist):
    n = sum(dist.values()); acc = 0
    for k in sorted(dist):
        acc += dist[k]
        if acc >= n / 2: return k
    return 0

def rate(dist, th):
    n = sum(dist.values()); over = sum(v for k, v in dist.items() if k > th)
    return over / n * 100, sum(k * v for k, v in dist.items()) / n

mb = median(base_dist)
b_rate, b_avg = rate(base_dist, mb)
u_rate, u_avg = rate(unit_dist, mb)
print(f"未拆：中位 {mb}，頭痛 {b_rate:.1f}%，平均 {b_avg:.2f}")
print(f"切後：units {units_total:,}（×{units_total/sum(freq.values()):.2f}），中位 {median(unit_dist)}，"
      f"頭痛 {u_rate:.1f}%，平均 {u_avg:.2f}")
print(f"unique all：{len(W):,} → {len(U):,}（{len(U)/len(W)*100:.1f}%，−{100-len(U)/len(W)*100:.1f}%）")
print(f"unique known：{len(Wk):,} → {len(Uk):,}（{len(Uk)/len(Wk)*100:.1f}%，−{100-len(Uk)/len(Wk)*100:.1f}%）")
