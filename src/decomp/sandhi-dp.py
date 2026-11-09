#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sandhi-aware DP：允許邊界重疊一字（a+ā→ā、a+u→u 這類），把長詞切成已知詞。"""
import re, sqlite3, csv, collections

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
IN = r"D:/2026/sz/unsplittable.tsv"
OUT = r"D:/2026/sz/sandhi-split.tsv"
LEFT = r"D:/2026/sz/unsplittable2.tsv"

con = sqlite3.connect(DB)
keys = set(); units_map = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    s = str(c)
    if "-" in s:
        p = [x.split("(")[0].strip() for x in s.split("-")]
        p = [x for x in p if x]
        if len(p) >= 2: units_map[k] = p
    elif "(" in s:
        par = s[s.find("(") + 1:s.rfind(")")]
        p = [x.strip() for x in par.split(",") if x.strip()]
        if len(p) >= 2: units_map[k] = p
for (k,) in con.execute("select dict_key from dpd"): keys.add(str(k).lower())
for (k,) in con.execute("select dict_key from pm12e"): keys.add(str(k).lower())
print(f"keys {len(keys):,}；pwa units {len(units_map):,}")

def dp_segment(S, maxlen=60, force_split=False, depth=0, allow_short=True):
    n = len(S)
    INF = 10 ** 9
    dp = [INF] * (n + 1); back = [None] * (n + 1); dp[0] = 0
    VOW = "aāiīuūeo"
    def relax(j, pi, w, ov, extra=1):
        nc = dp[pi] + extra
        if nc < dp[j] or (nc == dp[j] and (back[j] is None or len(w) > len(back[j][1]))):
            dp[j] = nc; back[j] = (pi, w, ov)
    for i in range(n + 1):
        if dp[i] >= INF: continue
        # 開頭允許 2 字短助詞（ti、na、ca、pi、vā）
        if allow_short and i == 0 and S[:2] in ("ti", "na", "ca", "pi", "vā"):
            if S[:2] in keys:
                relax(2, 0, S[:2], False, 2)
        # 邊界重複輔音：跳過一個重複字（maṇḍala + paṭicchādana → ...lappaṭ...）
        if i + 1 < n and S[i] == S[i + 1]:
            if dp[i] + 1 < dp[i + 1]:
                dp[i + 1] = dp[i] + 1; back[i + 1] = (i, "", False)
        for L in range(3, min(maxlen, n - i) + 1):
            if force_split and i == 0 and L == n:
                continue
            piece = S[i:i + L]
            if piece in keys:
                relax(i + L, i, piece, False, 1)
            else:
                stem = piece[:-1]
                for v in VOW:
                    if stem + v in keys:
                        relax(i + L, i, stem + v, False, 2)
                        break
                else:
                    for ch in "ṃmnñṅṇ":
                        if stem + ch in keys:
                            relax(i + L, i, stem + ch, False, 2)
                            break
        if i > 0:
            for L in range(3, min(maxlen, n - i + 1) + 1):
                cand = S[i - 1] + S[i:i + L - 1]
                if len(cand) >= 3 and cand in keys:
                    j = i + L - 1
                    if j <= n: relax(j, i, cand, True, 1)
        # 允許結尾 1–2 字的屈折尾巴；同分時偏好較短的尾巴
        if i < n and n - i <= 2 and S[i:] in keys:
            nc = dp[i] + 1
            if nc < dp[n] or (nc == dp[n] and (back[n] is None or len(S[i:]) < len(back[n][1]))):
                dp[n] = nc; back[n] = (i, S[i:], False)
    if dp[n] >= INF: return None
    out = []; j = n
    while j > 0:
        prev, word, overlap = back[j]
        out.append(word); j = prev
    out = out[::-1]
    def expand_strong(p, seen=None):
        if seen is None: seen = set()
        if p in seen: return [p]
        parts = units_map.get(p)
        if not parts and p and p[-1] in "āīū":
            parts = units_map.get(p[:-1] + {"ā": "a", "ī": "i", "ū": "u"}[p[-1]])
        if parts and len(parts) >= 2 and all(len(x) >= 3 for x in parts):
            seen = seen | {p}
            out2 = []
            for x in parts:
                out2.extend(expand_strong(x, seen))
            return out2
        return [p]
    clean = []
    def exact_split(p, minlen=4):
        m = len(p)
        if m <= 15: return None
        d = [-1] * (m + 1); b = [None] * (m + 1); d[0] = 0
        for x in range(m + 1):
            if d[x] < 0: continue
            for L in range(minlen, min(60, m - x) + 1):
                if x == 0 and L == m: continue   # 強制至少兩件
                if p[x:x + L] in keys and d[x] + L * L > d[x + L]:
                    d[x + L] = d[x] + L * L; b[x + L] = (x, p[x:x + L])
            if 0 < m - x <= 2 and p[x:] in keys and d[x] + 4 > d[m]:
                d[m] = d[x] + 4; b[m] = (x, p[x:])
        if d[m] < 0: return None
        out3 = []; y = m
        while y > 0:
            x, w = b[y]; out3.append(w); y = x
        return out3[::-1] if len(out3) >= 2 else None
    for p in out:
        if not p:
            continue
        if len(p) > 15:
            es = exact_split(p)
            if es:
                for q in es:
                    clean.extend(expand_strong(q))
                continue
        clean.extend(expand_strong(p))
    return clean

rows = list(csv.DictReader(open(IN, encoding="utf-8"), delimiter="\t"))
print(f"input {len(rows):,}")
split = []; left = []
for r in rows:
    w = r["word"]
    seg = None
    # 明顯的雙母音錯字：收成一個再拆
    norm = re.sub(r"([aāiīuūeēoō])\1+", r"\1", w)
    if norm != w:
        seg = dp_segment(norm, allow_short=False)
    if w.startswith("ti") and len(w) > 10 and not seg:
        rest = dp_segment(w[2:], force_split=True, allow_short=False)
        if rest and len(rest) >= 2:
            seg = ["ti"] + rest
    if seg is None:
        seg = dp_segment(w)
    if seg and len(seg) >= 2:
        split.append((w, int(r["count"]), seg))
    else:
        left.append(r)

with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write("rank\tword\tcount\tparts\tn_parts\n")
    for i, (w, c, seg) in enumerate(sorted(split, key=lambda x: (-len(x[0]), -x[1])), 1):
        f.write(f"{i}\t{w}\t{c}\t{'|'.join(seg)}\t{len(seg)}\n")
with open(LEFT, "w", encoding="utf-8", newline="") as f:
    f.write("rank\tword\tcount\tlength\tsyllables\n")
    for i, r in enumerate(left, 1):
        f.write(f"{i}\t{r['word']}\t{r['count']}\t{r['length']}\t{r['syllables']}\n")
print(f"split {len(split):,}；left {len(left):,}")
for w, c, seg in split[:8]:
    print(len(seg), w)
    print("   ", " | ".join(seg))
