#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""寬鬆切分：找最長的已知前綴／後綴，尾巴不要求是詞；量「部分可切」的比例。"""
import sqlite3, csv

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
FILES = [r"D:/2026/sz/data/cs-decomp/unresolved-words-by-freq.tsv"]

con = sqlite3.connect(DB)
keys = set(str(k).lower() for (k,) in con.execute("select dict_key from pwa"))

def best_split(w):
    n = len(w)
    best = None
    # 前綴
    for i in range(n - 1, 3, -1):
        pre = w[:i]
        if pre not in keys: continue
        # 後綴（可選）
        suf = ""
        for j in range(n - 1, i + 1, -1):
            if w[j:] in keys:
                suf = w[j:]; break
        known = len(pre) + len(suf)
        score = known / n
        cand = (score, pre, w[i:n - len(suf)] if suf else w[i:], suf)
        if best is None or cand[0] > best[0]:
            best = cand
    # 只有後綴
    for j in range(4, n - 1):
        if w[j:] in keys:
            score = (n - j) / n
            if best is None or score > best[0]:
                best = (score, "", w[:j], w[j:])
    return best

rows = []
for path in FILES:
    rows += list(csv.DictReader(open(path, encoding="utf-8"), delimiter="\t"))
print("fallback 詞形", len(rows))
for th in (0.5, 0.6, 0.7, 0.8):
    ok = 0; occ = 0; total = 0; ex = []
    for r in rows:
        w = r["word"].lower(); n = int(r["count"]); total += n
        b = best_split(w)
        if b and b[0] >= th:
            ok += 1; occ += n
            if len(ex) < 8: ex.append((r["word"], n, b))
    print(f"門檻 {th:.1f}：可切 {ok}（{ok/len(rows)*100:.1f}%），覆蓋 {occ:,} 次（{occ/total*100:.1f}%）")
    for w, n, b in ex:
        print(f"   {w} ×{n} → {b}")
    print()
