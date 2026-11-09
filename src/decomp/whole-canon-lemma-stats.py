#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全藏：切完後再用 pwa lemma／dpd／komyoji root 做 lemma 化，量 unique 與頭痛。"""
import re, glob, sqlite3, collections, gzip, csv, json

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
LEMMA = r"D:/2026/sz/out/lemma-pwa.tsv"
KMJ = r"D:/2026/sz/data/kmj-grammar/tokens.tsv.gz"

con = sqlite3.connect(DB)
keys = set(); units_map = {}; dpd = {}
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
print(f"pwa units {len(units_map):,}；dpd {len(dpd):,}；pmd {len(pmd):,}")
ped_keys = set()
for item in json.load(open(r"D:/2026/sz/data/sc-dict/pli2en_pts.json", encoding="utf-8")):
    w = str(item.get("word", "")).strip().lower()
    if w: ped_keys.add(w)
known_keys = keys | ped_keys
print(f"PED 詞頭 {len(ped_keys):,}；known keys {len(known_keys):,}")
split_keys = known_keys | set(dpd) | set(pmd)

def pmd_lookup(u):
    p = pmd.get(u)
    if p: return p
    if u and u[-1] in "āīū":
        return pmd.get(u[:-1] + {"ā": "a", "ī": "i", "ū": "u"}[u[-1]])
    return None

lemma = {}
for row in csv.DictReader(open(LEMMA, encoding="utf-8"), delimiter="\t"):
    lemma[row["form"].lower()] = row["lemma"]
print(f"lemma-pwa {len(lemma):,}")
for w in ped_keys:
    lemma.setdefault(w, w)
print(f"lemma + PED 詞頭 {len(lemma):,}")

kmj_root = {}
with gzip.open(KMJ, "rt", encoding="utf-8") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        form = (row.get("form") or "").lower()
        root = (row.get("root") or "").strip()
        if form and root: kmj_root.setdefault(form, root)
print(f"komyoji roots {len(kmj_root):,}")

VOW = set("aāiīuūeo")
def syl(s): return sum(1 for c in s.lower() if c in VOW)
def loose(w):
    n = len(w)
    if n < 8: return None
    need = max(4, int(n * 0.5))
    for i in range(n - 2, need - 1, -1):
        if w[:i] in split_keys: return [w[:i], w[i:]]
    for j in range(4, n - 2):
        if n - j >= need and w[j:] in split_keys: return [w[:j], w[j:]]
    return None
def expand(u, depth=0, seen=None):
    if seen is None: seen = set()
    if depth >= 10 or u in seen: return [u]
    p = units_map.get(u) or (pmd_lookup(u) if len(u) >= 8 else None) or (dpd.get(u) if len(u) >= 12 else None)
    if p and len(p) >= 2:
        seen = seen | {u}
        return [x for part in p for x in expand(part, depth + 1, seen)]
    if len(u) >= 8:
        ls = loose(u)
        if ls:
            seen = seen | {u}
            return [x for part in ls for x in expand(part, depth + 1, seen)]
    return [u]

freq = collections.Counter()
files = [p for p in glob.glob(r"D:/2026/sz/data/cs/*.xml") if not p.endswith("00.xml")]
for p in files:
    t = re.sub(r"<[^>]*>", " ", open(p, encoding="utf-8").read())
    for w in re.findall(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+", t):
        freq[w.lower()] += 1

base_dist = collections.Counter(); unit_dist = collections.Counter()
U = set(); Uk = set(); units_total = 0
lem_count = collections.Counter()
src = collections.Counter()
for w, c in freq.items():
    base_dist[syl(w)] += c
    base = units_map.get(w) or (pmd_lookup(w) if len(w) >= 8 else None) or (dpd.get(w) if len(w) >= 12 else None) or loose(w) or [w]
    units = [x for u in base for x in expand(u)]
    for u in units:
        if u in lemma:
            lem = lemma[u]; src["pwa"] += c
        elif u in kmj_root:
            lem = kmj_root[u]; src["kmj"] += c
        else:
            lem = u; src["none"] += c
        parts = [x.strip() for x in lem.split(",")] if "," in lem else [lem]
        for p in parts:
            if not p: continue
            for q in expand(p):
                units_total += c
                unit_dist[syl(q)] += c
                U.add(q)
                lem_count[q] += c
                if q in known_keys: Uk.add(q)
print("lemma 來源（詞次）：", dict(src))

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
print(f"lemma 後：units {units_total:,}（×{units_total/sum(freq.values()):.2f}），中位 {median(unit_dist)}，"
      f"頭痛 {u_rate:.1f}%，平均 {u_avg:.2f}")
print(f"unique all：{len(freq):,} → {len(U):,}（{len(U)/len(freq)*100:.1f}%）")
print(f"unique known：{len({w for w in freq if w in known_keys}):,} → {len(Uk):,}")

items = sorted(lem_count.items(), key=lambda kv: (-kv[1], kv[0]))
with open(r"D:/2026/sz/unique-lemmas.tsv", "w", encoding="utf-8", newline="") as f:
    f.write("rank\tlemma\tcount\tknown\tlength\tsyllables\n")
    for i, (p, c) in enumerate(items, 1):
        f.write(f"{i}\t{p}\t{c}\t{1 if p in known_keys else 0}\t{len(p)}\t{syl(p)}\n")
print(f"unique-lemmas.tsv: {len(items):,} 列")
