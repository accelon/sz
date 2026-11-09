#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全藏「未知詞」的 unique 與頻次 → unique.tsv；切出來的未知碎片另存 unique-fragments.tsv。"""
import re, glob, sqlite3, collections

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
OUT = r"D:/2026/sz/unique.tsv"
FRAG = r"D:/2026/sz/unique-fragments.tsv"
con = sqlite3.connect(DB)
keys = set(); pwa = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    h = str(c).split("(")[0].strip()
    if "-" in h:
        p = [x for x in h.split("-") if x]
        if len(p) >= 2: pwa[k] = p

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

unknown_words = [(w, c) for w, c in freq.items() if w not in keys]
frag = collections.Counter()
for w, c in freq.items():
    parts = pwa.get(w)
    units = parts if parts else (loose(w) or [w])
    for u in units:
        if u not in keys and u != w:
            frag[u] += c

VOW = set("aāiīuūeo")
unknown_words.sort(key=lambda kv: (-kv[1], kv[0]))
with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write("rank\tword\tcount\tlength\tsyllables\n")
    for i, (w, c) in enumerate(unknown_words, 1):
        f.write(f"{i}\t{w}\t{c}\t{len(w)}\t{sum(1 for ch in w if ch in VOW)}\n")

frag_items = sorted(frag.items(), key=lambda kv: (-kv[1], kv[0]))
with open(FRAG, "w", encoding="utf-8", newline="") as f:
    f.write("rank\tfragment\tcount\tlength\tsyllables\n")
    for i, (u, c) in enumerate(frag_items, 1):
        f.write(f"{i}\t{u}\t{c}\t{len(u)}\t{sum(1 for ch in u if ch in VOW)}\n")

print(f"unknown words {len(unknown_words):,}；occurrences {sum(c for _, c in unknown_words):,} → {OUT}")
print(f"unknown fragments {len(frag_items):,}；occurrences {sum(c for _, c in frag_items):,} → {FRAG}")
print("top words:", unknown_words[:12])
print("top fragments:", frag_items[:12])
