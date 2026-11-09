#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""對 hard（有 pwa 拆但接不回）的詞，試找「詞幹 + 屈折尾巴」。"""
import sqlite3, csv, sys, difflib

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
HARD = r"D:/2026/sz/data/cs-decomp/unresolved-hard-by-freq.tsv"
PAT = r"D:/2026/sz/data/cs-decomp/sandhi-patterns-11.tsv"
VOW = set("aāiīuūeo")
NASAL = {"k":"ṅ","kh":"ṅ","g":"ṅ","gh":"ṅ","ṅ":"ṅ",
         "c":"ñ","ch":"ñ","j":"ñ","jh":"ñ","ñ":"ñ",
         "ṭ":"ṇ","ṭh":"ṇ","ḍ":"ṇ","ḍh":"ṇ","ṇ":"ṇ",
         "t":"n","th":"n","d":"n","dh":"n","n":"n",
         "p":"m","ph":"m","b":"m","bh":"m","m":"m"}
ENDINGS = ["ānaṃ","assa","assā","āya","āyaṃ","esu","ehi","ebhi","smiṃ","smā","mhā",
           "āni","ena","ssa","to","ṃ","ā","ī","ū","e","o","a","i","u","s",
           "ca","pi","ti","hi","su","naṃ","vā"]

con = sqlite3.connect(DB)
keys = set()
pwa = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); keys.add(k)
    h = str(c).split("(")[0].strip()
    if "-" in h:
        p = [x for x in h.split("-") if x]
        if len(p) >= 2: pwa[k] = p
print("pwa keys", len(keys))

# codebook 0 + top 500
cb = {}
for r in csv.DictReader(open(PAT, encoding="utf-8"), delimiter="\t"):
    code = int(r["code"])
    if code <= 500:
        cb[(r["left"], r["right"], r["result"])] = code
by_code = {v: k for k, v in cb.items()}

def amap(pre, s, ops):
    mp = [0] * (len(pre) + 1)
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            for k in range(i2 - i1 + 1): mp[i1 + k] = j1 + k
        elif tag == "delete":
            for k in range(i2 - i1 + 1): mp[i1 + k] = j1
        elif tag == "insert": mp[i1] = j1
        else:
            n = i2 - i1
            for k in range(n + 1): mp[i1 + k] = j1 + (j2 - j1) * k // n if n else j1
    return mp

def seams(surf, parts):
    pre = "".join(parts).lower(); s = surf.lower()
    sm = difflib.SequenceMatcher(None, pre, s, autojunk=False)
    mp = amap(pre, s, sm.get_opcodes())
    out = []; b = 0
    for i in range(len(parts) - 1):
        b += len(parts[i])
        if b <= 0 or b >= len(pre): continue
        j1, j2 = mp[b - 1], mp[b + 1]
        if j2 <= j1: continue
        out.append((pre[b - 1], pre[b], s[j1:j2]))
    return out

def encode_ok(word):
    """這個詞幹能不能用 codebook 0..500 無損編碼？原子詞直接算 True。"""
    if word not in keys: return False
    parts = pwa.get(word)
    if not parts: return True
    ss = seams(word, parts)
    if len(ss) != len(parts) - 1: return False
    codes = []
    for l, r, seg in ss:
        if seg == l + r: codes.append(0)
        elif (l, r, seg) in cb: codes.append(cb[(l, r, seg)])
        else: return False
    out = parts[0][:-1]
    for i, c in enumerate(codes):
        left, right = parts[i][-1], parts[i + 1][0]
        neo = left + right if c == 0 else by_code[c][2]
        out += neo
        if i < len(parts) - 2: out += parts[i + 1][1:-1]
    out += parts[-1][1:]
    return out == word

def forms(stem, end):
    """詞幹 + 屈折尾巴的可能表面形（含簡單 sandhi）。"""
    out = {stem + end}
    if not stem or not end:
        return out
    a, b = stem[-1], end[0]
    if a in VOW and b in VOW:
        out.add(stem[:-1] + end)                 # a+o→o、a+e→e、a+ā→ā
        out.add(stem[:-1] + "e" + end[1:])       # a+i→e
        out.add(stem[:-1] + "o" + end[1:])       # a+u→o
        out.add(stem[:-1] + "ā" + end[1:])       # a+a/ā→ā
    if a == "ṃ" and b not in VOW:
        out.add(stem[:-1] + NASAL.get(b, "ṃ") + end)   # ṃ+c→ñc
    return out

def candidates(w):
    out = []
    for end in ENDINGS:
        if not w.endswith(end): continue
        raw = w[:-len(end)]
        if len(raw) < 2: continue
        cands = [raw]
        if raw[-1] not in VOW:
            cands += [raw + v for v in "aāiīuū"]
            cands.append(raw[:-1] + "ṃ")   # ñ/ṇ/n + 子音 → ṃ + 子音
        cands.append(raw + "ṃ")
        for c in cands:
            if c == w: continue
            if c in keys and w in forms(c, end):
                out.append((c, end, len(c), c + end == w))
    out.sort(key=lambda x: (not x[3], -x[2], len(x[1])))
    return out

rows = list(csv.DictReader(open(HARD, encoding="utf-8"), delimiter="\t"))
fixed = 0; exact_n = 0; examples = []; unfixed = []
fixed_occ = 0; hard_occ = 0; fixed_enc = 0; fixed_enc_occ = 0
outrows = []
for r in rows:
    w = r["word"].lower(); n = int(r["count"])
    hard_occ += n
    c = candidates(w)
    if c:
        fixed += 1; fixed_occ += n
        if c[0][3]: exact_n += 1
        enc_ok = any(encode_ok(x[0]) for x in c)
        if enc_ok:
            fixed_enc += 1; fixed_enc_occ += n
        best = c[0]
        outrows.append([r["word"], n, best[0], best[1], len(r["word"]),
                        "yes" if best[3] else "sandhi",
                        "yes" if enc_ok else "no"])
        if len(examples) < 20:
            examples.append((r["word"], r["count"], c[:3]))
    elif len(unfixed) < 20:
        unfixed.append((r["word"], r["count"]))
with open(r"D:/2026/sz/data/cs-decomp/stem-fallback.tsv", "w", encoding="utf-8", newline="") as f:
    wr = csv.writer(f, delimiter="\t")
    wr.writerow(["word", "count", "stem", "suffix", "length", "direct", "codebook_ok"])
    wr.writerows(outrows)
print(f"hard {len(rows)} 詞形／{hard_occ:,} 次；找到詞幹 {fixed}（{fixed/len(rows)*100:.1f}%），"
      f"覆蓋 {fixed_occ:,} 次（{fixed_occ/hard_occ*100:.1f}%），直接接回 {exact_n}")
print(f"詞幹本身可用 codebook 無損編碼：{fixed_enc} 詞形（{fixed_enc/len(rows)*100:.1f}% of hard），"
      f"覆蓋 {fixed_enc_occ:,} 次（{fixed_enc_occ/hard_occ*100:.1f}%）")
for w, n, c in examples:
    print(f"  {w} ×{n} → {c}")
print("找不到詞幹的前 20：")
for w, n in unfixed:
    print(f"  {w} ×{n}")
