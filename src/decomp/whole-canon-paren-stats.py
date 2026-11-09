#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全藏：pwa 沒有連字號、但括號裡有 ≥2 個詞幹的條目，也用括號詞幹拆。"""
import re, glob, sqlite3, collections

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
con = sqlite3.connect(DB)
keys = set(); units_map = {}
paren_n = 0
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    s = str(c); head = s.split("(")[0].strip()
    if "-" in head:
        p = [x for x in head.split("-") if x]
        if len(p) >= 2: units_map[k] = p
    elif "(" in s:
        par = s[s.find("(") + 1:s.rfind(")")]
        p = [x.strip() for x in par.split(",") if x.strip()]
        if len(p) >= 2:
            units_map[k] = p; paren_n += 1
print(f"keys {len(keys):,}；units_map {len(units_map):,}（其中 paren-only {paren_n:,}）")

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

def expand(u, depth=0, seen=None):
    if seen is None: seen = set()
    if depth >= 10 or u in seen: return [u]
    p = units_map.get(u)
    if p and len(p) >= 2:
        seen = seen | {u}
        return [x for part in p for x in expand(part, depth + 1, seen)]
    return [u]

base_dist = collections.Counter(); unit_dist = collections.Counter()
W = set(freq); Wk = {w for w in W if w in keys}
U = set(); Uk = set(); units_total = 0
for w, c in freq.items():
    base_dist[syl(w)] += c
    base = units_map.get(w) or loose(w) or [w]
    units = [x for u in base for x in expand(u)]
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
print(f"切後：units {units_total:,}（×{units_total/sum(freq.values()):.2f}），中位 {median(unit_dist)}，"
      f"頭痛 {u_rate:.1f}%，平均 {u_avg:.2f}")
print(f"unique all：{len(W):,} → {len(U):,}（{len(U)/len(W)*100:.1f}%）")
print(f"unique known：{len(Wk):,} → {len(Uk):,}（{len(Uk)/len(Wk)*100:.1f}%，−{100-len(Uk)/len(Wk)*100:.1f}%）")
demo = "uttarimanussadhammapeyyālanīlacakkapeyyālādivavatthāpanavasena"
print("demo:", demo, "→", units_map.get(demo))
