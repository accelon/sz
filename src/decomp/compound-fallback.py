#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""hard 詞的 2–3 件拆分（有品質閘：每件 >=4 字、排除純尾巴）。"""
import sqlite3, csv

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
HARD = r"D:/2026/sz/data/cs-decomp/unresolved-hard-by-freq.tsv"
SUFFIX = {"cca","tta","ppa","ssa","ttha","ṇṇa","mma","naṃ","smā","mhā","ehi","ebhi",
          "ānaṃ","assa","āya","esu","smiṃ","ena","āni","ti","hi","su","ca","pi","vā"}

con = sqlite3.connect(DB)
keys = set()
for (k,) in con.execute("select dict_key from pwa"):
    keys.add(str(k).lower())

def splits(w, maxp=3):
    out = []
    def rec(start, parts):
        if len(parts) == maxp:
            tail = w[start:]
            if len(tail) >= 3 and tail in keys and tail not in SUFFIX:
                out.append(parts + [tail])
            return
        for end in range(start + 4, len(w) - 2):
            pre = w[start:end]
            if pre in keys and pre not in SUFFIX:
                rec(end, parts + [pre])
    rec(0, [])
    # 至少兩件；分數：最短件越長越好，其次件數少
    out = [p for p in out if len(p) >= 2]
    out.sort(key=lambda p: (-min(len(x) for x in p), len(p), -sum(len(x) for x in p)))
    return out

rows = list(csv.DictReader(open(HARD, encoding="utf-8"), delimiter="\t"))
ok = 0; occ = 0; total = 0; ex = []
for r in rows:
    w = r["word"].lower(); n = int(r["count"]); total += n
    if "-" in w:
        ps = w.split("-")
        good = all(len(p) >= 3 and p in keys for p in ps)
        cand = [ps] if good else []
    else:
        cand = splits(w)
    if cand:
        ok += 1; occ += n
        if len(ex) < 25: ex.append((r["word"], n, cand[0]))
print(f"hard {len(rows)} 詞形／{total:,} 次；有品質拆分 {ok}（{ok/len(rows)*100:.1f}%），"
      f"覆蓋 {occ:,} 次（{occ/total*100:.1f}%）")
for w, n, s in ex:
    print(f"  {w} ×{n} → {s}")
