#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全藏：查不到字典、又拆不開的長詞 → unsplittable.tsv。"""
import re, glob, sqlite3, collections, gzip, csv

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
LEMMA = r"D:/2026/sz/out/lemma-pwa.tsv"
KMJ = r"D:/2026/sz/data/kmj-grammar/tokens.tsv.gz"
OUT = r"D:/2026/sz/unsplittable.tsv"

con = sqlite3.connect(DB)
pwa_keys = set(); units_map = {}
for k, c in con.execute("select dict_key, dict_content from pwa"):
    k = str(k).lower(); pwa_keys.add(k)
    s = str(c)
    if "-" in s:
        p = [x.split("(")[0].strip() for x in s.split("-")]
        p = [x for x in p if x]
        if len(p) >= 2: units_map[k] = p
    elif "(" in s:
        par = s[s.find("(") + 1:s.rfind(")")]
        p = [x.strip() for x in par.split(",") if x.strip()]
        if len(p) >= 2: units_map[k] = p

dpd = {}
for k, c in con.execute("select dict_key, dict_content from dpd"):
    k = str(k).lower(); best = None
    for line in str(c).splitlines():
        if " + " not in line: continue
        parts = [re.sub(r"[^A-Za-z\u00C0-\u024F\u1E00-\u1EFF]", "", x.strip()) for x in line.split("+")]
        parts = [x for x in parts if x]
        if len(parts) >= 2 and (best is None or len(parts) > len(best)):
            best = parts
    if best: dpd[k] = best

pmd = {}
pat = re.compile(r"\[([^\]]+)\]")
for k, c in con.execute("select dict_key, dict_content from pm12e"):
    k = str(k).lower(); best = None
    for m in pat.finditer(str(c)):
        body = m.group(1)
        alts = [x for x in re.split(r"\(\d+\)", body) if x.strip()]
        body = (alts[0] if alts else body).strip(" .")
        parts = []
        for seg in body.split("+"):
            mm = re.search(r"[A-Za-zĀāĪīŪūṂṃṄṅÑñṬṭḌḍṆṇḶḷ]+", seg)
            if mm: parts.append(mm.group(0).lower())
        if len(parts) >= 2 and (best is None or len(parts) > len(best)):
            best = parts
    if best: pmd[k] = best

lemma_forms = set()
for row in csv.DictReader(open(LEMMA, encoding="utf-8"), delimiter="\t"):
    lemma_forms.add(row["form"].lower())
kmj_forms = set()
with gzip.open(KMJ, "rt", encoding="utf-8") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        if row.get("form"): kmj_forms.add(row["form"].lower())
print(f"pwa {len(pwa_keys):,}；dpd {len(dpd):,}；pmd {len(pmd):,}；lemma {len(lemma_forms):,}；kmj {len(kmj_forms):,}")

split_keys = pwa_keys | set(dpd) | set(pmd)
def pmd_lookup(u):
    p = pmd.get(u)
    if p: return p
    if u and u[-1] in "āīū":
        return pmd.get(u[:-1] + {"ā": "a", "ī": "i", "ū": "u"}[u[-1]])
    return None
def loose(w):
    n = len(w)
    if n < 8: return None
    need = max(4, int(n * 0.5))
    for i in range(n - 2, need - 1, -1):
        if w[:i] in split_keys: return [w[:i], w[i:]]
    for j in range(4, n - 2):
        if n - j >= need and w[j:] in split_keys: return [w[:j], w[j:]]
    return None

def segment_known(w, max_parts=30):
    n = len(w)
    if n < 12: return None
    dp = [None] * (n + 1); dp[0] = []
    for i in range(1, n + 1):
        for j in range(max(0, i - 30), i):
            if dp[j] is None: continue
            seg = w[j:i]
            if len(seg) < 3 or seg not in split_keys: continue
            cand = dp[j] + [seg]
            if len(cand) > max_parts: continue
            if dp[i] is None or len(cand) < len(dp[i]):
                dp[i] = cand
    return dp[n] if dp[n] and len(dp[n]) >= 2 else None

def split_once(w):
    return (units_map.get(w) or pmd_lookup(w) or (dpd.get(w) if len(w) >= 8 else None)
            or segment_known(w) or loose(w))

freq = collections.Counter()
files = [p for p in glob.glob(r"D:/2026/sz/data/cs/*.xml") if not p.endswith("00.xml")]
for p in files:
    t = re.sub(r"<[^>]*>", " ", open(p, encoding="utf-8").read())
    for w in re.findall(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+", t):
        freq[w.lower()] += 1

known = pwa_keys | set(dpd) | set(pmd) | lemma_forms | kmj_forms
rows = []
for w, c in freq.items():
    if w in known: continue
    if split_once(w): continue
    if len(w) < 12: continue
    rows.append((w, c, len(w)))
rows.sort(key=lambda r: (-r[2], -r[1], r[0]))
VOW = set("aāiīuūeo")
with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write("rank\tword\tcount\tlength\tsyllables\n")
    for i, (w, c, n) in enumerate(rows, 1):
        f.write(f"{i}\t{w}\t{c}\t{n}\t{sum(1 for ch in w if ch in VOW)}\n")
print(f"unsplittable long words {len(rows):,}；occurrences {sum(c for _, c, _ in rows):,} → {OUT}")
for w, c, n in rows[:20]:
    print(f"{w}\t{c}\t{n}")
