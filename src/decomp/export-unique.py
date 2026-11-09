#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全藏切後「已知詞」unique 與頻次 → unique-known.tsv（含 pwa 括號詞幹、遞迴展開）。"""
import re, glob, sqlite3, collections

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
OUT = r"D:/2026/sz/unique-known.tsv"
con = sqlite3.connect(DB)
keys = set(); units_map = {}; dpd = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    s = str(c); head = s.split("(")[0].strip()
    if "-" in head:
        p = [x for x in head.split("-") if x]
        if len(p) >= 2: units_map[k] = p
    elif "(" in s:
        par = s[s.find("(") + 1:s.rfind(")")]
        p = [x.strip() for x in par.split(",") if x.strip()]
        if len(p) >= 2: units_map[k] = p
for k, c in con.execute("select dict_key, dict_content from dpd"):
    k = str(k).lower(); best = None
    for line in str(c).splitlines():
        if " + " not in line: continue
        parts = [re.sub(r"[^A-Za-z\u00C0-\u024F\u1E00-\u1EFF]", "", x.strip()) for x in line.split("+")]
        parts = [x for x in parts if x]
        if len(parts) >= 2 and (best is None or len(parts) > len(best)):
            best = parts
    if best: dpd[k] = best

def expand(u, depth=0, seen=None):
    if seen is None: seen = set()
    if depth >= 10 or u in seen: return [u]
    p = units_map.get(u) or (dpd.get(u) if len(u) >= 12 else None)
    if p and len(p) >= 2:
        seen = seen | {u}
        out = []
        for x in p:
            out.extend(expand(x, depth + 1, seen))
        return out
    return [u]

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

unit_count = collections.Counter()
for w, c in freq.items():
    base = units_map.get(w) or (dpd.get(w) if len(w) >= 12 else None) or loose(w) or [w]
    units = [x for u in base for x in expand(u)]
    for u in units:
        if u in keys:
            unit_count[u] += c

items = sorted(unit_count.items(), key=lambda kv: (-kv[1], kv[0]))
VOW = set("aāiīuūeo")
with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write("rank\tunit\tcount\tlength\tsyllables\n")
    for i, (u, c) in enumerate(items, 1):
        f.write(f"{i}\t{u}\t{c}\t{len(u)}\t{sum(1 for ch in u if ch in VOW)}\n")
print(f"unique known {len(items):,}；occurrences {sum(c for _, c in items):,} → {OUT}")
print("top 10:", items[:10])
