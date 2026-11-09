#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PED → 機器可讀 JSON（給 vedic 等外部工作區用）。

- out/ped-export.json：16,781 筆，含結構化書證（PTS 原文＋cs 位址）。
- out/ped-export-sample.json：spec 指定的 10 個抽查詞。
- out/ped-citations.tsv：一列一筆書證（raw / source / cs / sc / confidence）。

書證欄位沿用 docs/ped-todo.md 與 d:/2026/vedic/docs/ped-spec.md 的格式：
  raw, source, kind, vol/page/verse, sc (SC 段), cst4 {book, block, seg}
"""
import csv, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(r"D:/2026/sz")
RECORDS = ROOT / "out/ped-records.json"
REFS = ROOT / "out/ped-refs.tsv"
BLOCKS = ROOT / "out/ped-blocks.tsv"
OUT = ROOT / "out/ped-export.json"
SAMPLE = ROOT / "out/ped-export-sample.json"
TSV = ROOT / "out/ped-citations.tsv"

SAMPLE_WORDS = ["Sukha", "Dukkha", "Brahma", "Brahma & Brahmā", "Upanisā", "Upanisa", "Yañña", "Yajati", "A-", "Nibbāna"]


def fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", s)


def sk_forms(ety):
    out = []
    for t in ety:
        for m in re.finditer(r"(?:Vedic|Sk\.|Skt\.|cp\.|=)\s+([A-Za-zāīūṛṝḷṃḥśṣṭḍṇñṅĀĪŪṚḶṂḤŚṢṬḌṆÑṄ\u0300-\u036f]+)", t):
            w = m.group(1).strip(".,;()[]")
            f = fold(w)
            if len(f) >= 2 and f not in out:
                out.append(f)
    return out


def main():
    recs = json.load(open(RECORDS, encoding="utf-8"))
    refs = {}
    with open(REFS, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            refs[row["raw"]] = row

    # build 的塊 id（若已跑過 build-ped-adb.ts 就會有）
    ids = {}
    if BLOCKS.exists():
        for line in open(BLOCKS, encoding="utf-8"):
            p = line.rstrip("\n").split("\t")
            if len(p) >= 3:
                ids[(p[0], p[1])] = p[2]
    else:
        for i, r in enumerate(sorted(recs, key=lambda x: (x["word"], x["homograph"])), 1):
            ids[(r["word"], r["homograph"])] = "p%06d" % i

    out = []
    cite_rows = []
    for r in recs:
        word = r["word"]
        variants = [word]
        if " & " in word:
            variants = [x.strip() for x in word.split(" & ") if x.strip()]
        elif "," in word:
            variants = [x.strip() for x in word.split(",") if x.strip()]
        entry_type = "prefix" if word.endswith("-") or word.startswith("-") else "main"
        cits = []
        for c in r["citations"]:
            row = refs.get(c["raw"], {})
            raw = c["raw"]
            cit = {
                "raw": raw,
                "source": row.get("source", ""),
                "kind": row.get("kind", ""),
            }
            if row.get("vol"):
                cit["vol"] = int(row["vol"])
            if row.get("kind") == "verse":
                cit["verse"] = int(row["value"]) if row.get("value") else None
            elif row.get("kind") == "page":
                cit["page"] = int(row["value"]) if row.get("value") else None
            elif row.get("value"):
                cit["value"] = int(row["value"])
            if row.get("sc_seg"):
                cit["sc"] = row["sc_seg"]
            if row.get("cst_block") and row.get("cst_seg"):
                cit["cst4"] = {"book": row.get("cst_book", ""), "block": row["cst_block"], "seg": row["cst_seg"]}
                cit["cs"] = f"cs?{row['cst_block']}.{row['cst_seg']}"
                cit["confidence"] = row.get("confidence", "")
            cits.append(cit)
            cite_rows.append([
                ids.get((word, r["homograph"]), ""), word, raw, cit.get("source", ""),
                cit.get("kind", ""), cit.get("vol", ""), cit.get("page", cit.get("verse", cit.get("value", ""))),
                cit.get("sc", ""), cit.get("cst4", {}).get("book", ""),
                cit.get("cst4", {}).get("block", ""), cit.get("cst4", {}).get("seg", ""),
                cit.get("confidence", ""),
            ])
        item = {
            "id": ids.get((word, r["homograph"]), ""),
            "headword": word,
            "variants": variants,
            "entry_type": entry_type,
            "pos": "; ".join(r.get("grammar", [])),
            "etymology": " ".join(r.get("ety", [])),
            "sk_forms": sk_forms(r.get("ety", [])),
            "definition": " ".join(r.get("senses", [])),
            "examples": [],
            "citations": cits,
            "xrefs": r.get("xr", []),
            "terms": r.get("terms", []),
            "homograph": r.get("homograph", ""),
            "source": "PTS PED · sc-data d8545188",
            "version": "d8545188",
        }
        out.append(item)

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    # 抽查：用 headword 開頭比對
    sample = []
    for w in SAMPLE_WORDS:
        hit = next((x for x in out if x["headword"] == w), None)
        if not hit:
            hit = next((x for x in out if x["headword"].lower().startswith(w.lower())), None)
        if hit:
            sample.append(hit)
    SAMPLE.write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(TSV, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["id", "headword", "raw", "source", "kind", "vol", "value", "sc", "cst_book", "cst_block", "cst_seg", "confidence"])
        w.writerows(cite_rows)
    n_cit = sum(len(x["citations"]) for x in out)
    n_cs = sum(1 for x in out for c in x["citations"] if "cs" in c)
    print(f"records {len(out):,}；citations {n_cit:,}；有 cs {n_cs:,}（{n_cs/max(1,n_cit):.1%}）")
    print(f"→ {OUT}\n→ {SAMPLE}（{len(sample)} 筆）\n→ {TSV}")


if __name__ == "__main__":
    main()
