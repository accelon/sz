#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""寬鬆切分 v2：前綴本身可以是「已知詞少一個字」（tathāgat ← tathāgata）。"""
import sqlite3, csv

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
FILES = [r"D:/2026/sz/data/cs-decomp/unresolved-words-by-freq.tsv"]

con = sqlite3.connect(DB)
keys = set(str(k).lower() for (k,) in con.execute("select dict_key from pwa"))
VOW = "aāiīuūe oṃ".replace(" ", "")

def prefix_ok(pre):
    if pre in keys: return "exact"
    for v in VOW:
        if pre + v in keys: return "stem"
    return None

def best(w):
    n = len(w)
    for i in range(n - 2, 3, -1):
        pre = w[:i]
        kind = prefix_ok(pre)
        if kind:
            return (kind, pre, w[i:], i / n)
    return None

rows = list(csv.DictReader(open(FILES[0], encoding="utf-8"), delimiter="\t"))
total = sum(int(r["count"]) for r in rows)
for th in (0.0, 0.5, 0.6, 0.7):
    ok = 0; occ = 0; ex = []
    for r in rows:
        w = r["word"].lower(); n = int(r["count"])
        b = best(w)
        if b and b[3] >= th:
            ok += 1; occ += n
            if len(ex) < 10: ex.append((r["word"], n, b))
    print(f"前綴門檻 {th:.1f}：可切 {ok}（{ok/len(rows)*100:.1f}%），覆蓋 {occ:,} 次（{occ/total*100:.1f}%）")
    for w, n, b in ex:
        print(f"   {w} ×{n} → {b}")
    print()
