#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""勇敢切：以「3–4 音節的已知詞」為切點，前後不確定的部分當碎片。"""
import re, glob, sqlite3, collections

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
con = sqlite3.connect(DB)
keys = set(str(k).lower() for (k,) in con.execute("select dict_key from pwa"))
VOW = set("aāiīuūeo")
def syl(s): return sum(1 for c in s.lower() if c in VOW)

def greedy(w, lo=2, hi=4):
    def rec(s):
        if not s: return []
        for j in range(min(len(s), 22), 0, -1):
            seg = s[:j]
            if seg in keys and lo <= syl(seg) <= hi:
                return [seg] + rec(s[j:])
        for j in range(max(0, len(s) - 22), len(s)):
            seg = s[j:]
            if seg in keys and lo <= syl(seg) <= hi:
                return rec(s[:j]) + [seg]
        return [s]
    return rec(w)

freq = collections.Counter()
files = [p for p in glob.glob(r"D:/2026/sz/data/cs/*.xml") if not p.endswith("00.xml")]
for p in files:
    t = re.sub(r"<[^>]*>", " ", open(p, encoding="utf-8").read())
    for w in re.findall(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+", t):
        freq[w.lower()] += 1

base_dist = collections.Counter(); unit_dist = collections.Counter()
W = set(freq); Wk = {w for w in W if w in keys}
U = set(); Uk = set(); units_total = 0
for w, c in freq.items():
    base_dist[syl(w)] += c
    units = greedy(w)
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

mb = median(base_dist); b_rate, b_avg = rate(base_dist, mb)
u_rate, u_avg = rate(unit_dist, mb)
print(f"未拆：中位 {mb}，頭痛 {b_rate:.1f}%，平均 {b_avg:.2f}")
print(f"3–4 音節切：units {units_total:,}（×{units_total/sum(freq.values()):.2f}），"
      f"中位 {median(unit_dist)}，頭痛 {u_rate:.1f}%，平均 {u_avg:.2f}")
print(f"unique all：{len(W):,} → {len(U):,}（{len(U)/len(W)*100:.1f}%）")
print(f"unique known：{len(Wk):,} → {len(Uk):,}（{len(Uk)/len(Wk)*100:.1f}%）")
for w in ["uttarimanussadhammapeyyālanīlacakkapeyyālādivavatthāpanavasena", "sāriputta", "bhagavato"]:
    print(w, "→", greedy(w.lower()))
