#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pwa 接縫統計：前後 1/2 字的四種窗口，context → sandhi 結果，按頻次排列。

用法：
  python src/decomp/sandhi-stats.py            # 全量（預設 8 進程）
  python src/decomp/sandhi-stats.py --limit 20000
"""
import sqlite3, difflib, collections, sys, os, json, argparse
from multiprocessing import Pool

DB = r"C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db"
OUT = r"D:/2026/sz/data/cs-decomp"
SHAPES = [(1, 1), (2, 2), (2, 1), (1, 2)]

# ---------- 對齊 ----------
def amap(pre, s, ops):
    mp = [0] * (len(pre) + 1)
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            for k in range(i2 - i1 + 1): mp[i1 + k] = j1 + k
        elif tag == "delete":
            for k in range(i2 - i1 + 1): mp[i1 + k] = j1
        elif tag == "insert":
            mp[i1] = j1
        else:
            n = i2 - i1
            for k in range(n + 1):
                mp[i1 + k] = j1 + (j2 - j1) * k // n if n else j1
    return mp

def process(chunk):
    """chunk: [(surface, parts)]；回傳每個 shape 的 (total, identity, Counter, multi)。"""
    res = {sh: {"total": 0, "identity": 0, "dropped": 0, "pat": collections.Counter(),
                "ctx": collections.defaultdict(collections.Counter)} for sh in SHAPES}
    for surf, parts in chunk:
        pre = "".join(parts).lower(); s = surf.lower()
        sm = difflib.SequenceMatcher(None, pre, s, autojunk=False)
        mp = amap(pre, s, sm.get_opcodes())
        b = 0
        for i in range(len(parts) - 1):
            b += len(parts[i])
            for L, R in SHAPES:
                if b < L or b + R > len(pre): continue
                j1, j2 = mp[b - L], mp[b + R]
                if j2 <= j1: continue
                left, right, seg = pre[b - L:b], pre[b:b + R], s[j1:j2]
                d = res[(L, R)]
                d["total"] += 1
                # 連音結果最多只比 context 多一個字；更長的是 pwa 拆分／對齊錯，丟掉
                if not (1 <= len(seg) <= L + R + 1):
                    d["dropped"] += 1
                    continue
                if seg == left + right:
                    d["identity"] += 1
                else:
                    d["pat"][(left, right, seg)] += 1
                d["ctx"][left + right][seg] += 1
    return res

def merge(a, b):
    for sh in SHAPES:
        a[sh]["total"] += b[sh]["total"]
        a[sh]["identity"] += b[sh]["identity"]
        a[sh]["dropped"] += b[sh]["dropped"]
        a[sh]["pat"].update(b[sh]["pat"])
        for k, c in b[sh]["ctx"].items():
            a[sh]["ctx"][k].update(c)
    return a

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1))
    args = ap.parse_args()

    con = sqlite3.connect(DB)
    rows = []
    for k, c in con.execute("select dict_key, dict_content from pwa"):
        h = str(c).split("(")[0].strip()
        if "-" not in h: continue
        p = [x for x in h.split("-") if x]
        if len(p) >= 2: rows.append((str(k), p))
    if args.limit:
        rows = rows[:args.limit]
    print(f"pwa 有拆解 {len(rows):,} 條；窗口 {SHAPES}；進程 {args.workers}", flush=True)

    chunks = [rows[i::args.workers] for i in range(args.workers)]
    with Pool(args.workers) as pool:
        parts = pool.map(process, chunks)
    total = {sh: {"total": 0, "identity": 0, "dropped": 0, "pat": collections.Counter(),
                  "ctx": collections.defaultdict(collections.Counter)} for sh in SHAPES}
    for p in parts:
        merge(total, p)

    summary = []
    for sh in SHAPES:
        L, R = sh
        d = total[sh]
        pats = sorted(d["pat"].items(), key=lambda kv: (-kv[1], kv[0]))
        changed = d["total"] - d["identity"] - d["dropped"]
        cum = 0
        lines = []
        for rank, ((left, right, seg), n) in enumerate(pats, 1):
            cum += n
            lines.append("\t".join([
                str(rank), str(rank), str(L), str(R), left, right,
                left + right, seg, str(n), f"{n/changed*100:.4f}", f"{cum/changed*100:.4f}"
            ]))
        header = "rank\tcode\tL\tR\tleft\tright\tcontext\tresult\tcount\tshare%\tcum%\n"
        path = os.path.join(OUT, f"sandhi-patterns-{L}{R}.tsv")
        with open(path, "w", encoding="utf-8") as f:
            f.write(header + "\n".join(lines) + "\n")

        ctxs = d["ctx"]
        multi = {k: v for k, v in ctxs.items() if len(v) > 1}
        top_share = 0.0
        if ctxs:
            top_share = sum(c.most_common(1)[0][1] for c in ctxs.values()) / d["total"] * 100
        summary.append({
            "shape": f"{L}+{R}", "seams": d["total"], "identity": d["identity"],
            "dropped": d["dropped"], "changed": changed, "patterns": len(pats),
            "contexts": len(ctxs), "multi_contexts": len(multi), "top_share": top_share,
            "paths": path,
            "cov": {n: sum(v for _, v in pats[:n]) / changed * 100 for n in (1, 5, 10, 20, 50, 100, 200, 500, 1000)},
        })
        print(f"{L}+{R}: seams {d['total']:,}；identity {d['identity']:,}；"
              f"dropped {d['dropped']:,}；changed {changed:,}；patterns {len(pats):,}；"
              f"contexts {len(ctxs):,}；multi {len(multi):,}", flush=True)

    # 摘要
    with open(os.path.join(OUT, "sandhi-summary.tsv"), "w", encoding="utf-8") as f:
        f.write("shape\tseams\tidentity\tdropped\tchanged\tpatterns\tcontexts\tmulti_contexts\ttop_context_share%\n")
        for s in summary:
            f.write(f"{s['shape']}\t{s['seams']}\t{s['identity']}\t{s['dropped']}\t{s['changed']}\t"
                    f"{s['patterns']}\t{s['contexts']}\t{s['multi_contexts']}\t{s['top_share']:.2f}\n")

    print("\n覆蓋率（changed seams）：")
    for s in summary:
        cov = "  ".join(f"前{n}={v:.1f}%" for n, v in s["cov"].items())
        print(f"  {s['shape']}: {cov}")
    print("\n檔：")
    for s in summary:
        print("  " + s["paths"])

if __name__ == "__main__":
    main()
