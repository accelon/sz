#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 sc-data 的 PED JSON 拆成結構化 records，供 build-ped-adb.ts 打包。

預設輸出「乾淨版」：所有欄位都做 entity 解碼、去 HTML 標籤、壓空白；
原始 `<dd>` HTML 只有加 `--raw` 才另存 out/ped-raw.json（不進主庫）。

    python -X utf8 src/decomp/ped-extract.py          # 乾淨版
    python -X utf8 src/decomp/ped-extract.py --raw    # 另存 raw
"""
import json, re, sys, html
from html.parser import HTMLParser
from pathlib import Path

SRC = Path(r"D:/2026/sz/data/sc-dict/pli2en_pts.json")
OUT = Path(r"D:/2026/sz/out/ped-records.json")
RAW = Path(r"D:/2026/sz/out/ped-raw.json")

VOID = {"br", "hr", "img", "meta", "link", "input", "area", "base", "col", "embed", "source", "track", "wbr"}
ZERO = dict.fromkeys(map(ord, "\u200b\u200c\u200d\ufeff"), None)


class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "text")
    def __init__(self, tag="", attrs=None, parent=None):
        self.tag = tag
        self.attrs = dict(attrs or [])
        self.children = []
        self.parent = parent
    def add(self, child):
        child.parent = self
        self.children.append(child)


class Dom(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        n = Node(tag.lower(), attrs, self.stack[-1])
        self.stack[-1].add(n)
        if n.tag not in VOID:
            self.stack.append(n)
    def handle_startendtag(self, tag, attrs):
        n = Node(tag.lower(), attrs, self.stack[-1])
        self.stack[-1].add(n)
    def handle_endtag(self, tag):
        tag = tag.lower()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return
    def handle_data(self, data):
        n = Node("#text", parent=self.stack[-1])
        n.text = data
        self.stack[-1].add(n)


def text(n):
    if n.tag == "#text":
        return getattr(n, "text", "")
    return "".join(text(c) for c in n.children)


def clean(s):
    """解 entity（含雙重 escape）、去殘留標籤、壓空白、去零寬。"""
    if not s:
        return ""
    s = html.unescape(html.unescape(s)).translate(ZERO)
    s = re.sub(r"<[^>]*>", "", s)
    s = s.replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def norm(s):
    return clean(s)


def walk(n, tag=None, cls=None):
    if (n.tag == tag) if tag else True:
        if cls is None or cls in n.attrs.get("class", "").split():
            yield n
    for c in n.children:
        yield from walk(c, tag, cls)


def to_html(n):
    if n.tag == "#text":
        return getattr(n, "text", "")
    attrs = "".join(f' {k}="{v}"' for k, v in n.attrs.items())
    if n.tag in VOID:
        return f"<{n.tag}{attrs}>"
    return f"<{n.tag}{attrs}>" + "".join(to_html(c) for c in n.children) + f"</{n.tag}>"


def first(n, tag=None, cls=None):
    for x in walk(n, tag, cls):
        return x
    return None


def iter_events(n):
    """依文件順序吐出 ("text", s) 或 ("ref", raw, href)。"""
    if n.tag == "#text":
        yield ("text", getattr(n, "text", ""))
        return
    cls = n.attrs.get("class", "").split()
    if (n.tag == "a" and "ref" in cls) or (n.tag == "span" and "ref" in cls):
        yield ("ref", text(n), n.attrs.get("href", ""))
        return
    for c in n.children:
        yield from iter_events(c)


def parse_dd(dd, keep_raw=False):
    grammar = []
    for s in walk(dd, "span", "grammar"):
        t = norm(text(s))
        if t and t not in grammar:
            grammar.append(t)

    ety = []
    for p in walk(dd, "p", "eti"):
        t = norm(text(p))
        if t and t not in ety:
            ety.append(t)

    terms = []
    for i in walk(dd, "i", "term"):
        t = norm(text(i))
        if t and t not in terms:
            terms.append(t)

    senses, compounds = [], []
    for ch in dd.children:
        if ch.tag == "p" and "eti" not in ch.attrs.get("class", "").split():
            t = norm(text(ch))
            if t:
                senses.append(t)
        elif ch.tag == "ol":
            for li in walk(ch, "li"):
                t = norm(text(li))
                if t:
                    senses.append(t)
        elif ch.tag == "ul":
            cls = ch.attrs.get("class", "")
            target = compounds if "compounds" in cls else senses
            for li in walk(ch, "li"):
                t = norm(text(li))
                if t:
                    target.append(t)

    citations = []
    before = ""
    for ev in iter_events(dd):
        if ev[0] == "text":
            before = (before + clean(ev[1]))[-240:]
        else:
            raw, href = norm(ev[1]), ev[2] or ""
            if not raw:
                continue
            citations.append({"raw": raw, "href": href, "before": before})
            before = ""

    xr = []
    for a in walk(dd, "a"):
        href = a.attrs.get("href", "")
        if href.startswith("/define/"):
            t = norm(text(a))
            if t and t not in xr:
                xr.append(t)
    raw = to_html(dd) if keep_raw else ""
    return grammar, senses, compounds, ety, citations, xr, terms, raw


def main():
    keep_raw = "--raw" in sys.argv[1:]
    data = json.loads(SRC.read_text(encoding="utf-8"))
    records = []
    raws = []
    for item in data:
        word = norm(item.get("word", ""))
        dom = Dom()
        dom.feed(item.get("text", ""))
        for dl in walk(dom.root, "dl"):
            cur = None
            for ch in dl.children:
                if ch.tag == "dt":
                    if cur:
                        records.append(cur)
                    dfn = first(ch, "dfn")
                    sup = first(ch, "sup")
                    cur = {
                        "word": norm(text(dfn)) if dfn else word,
                        "homograph": norm(text(sup)) if sup else "",
                        "grammar": [], "senses": [], "compounds": [],
                        "ety": [], "citations": [], "xr": [], "terms": [],
                    }
                elif ch.tag == "dd":
                    if cur is None:
                        cur = {"word": word, "homograph": "", "grammar": [], "senses": [],
                               "compounds": [], "ety": [], "citations": [], "xr": [], "terms": []}
                    g, s, c, e, ci, x, terms, raw = parse_dd(ch, keep_raw)
                    cur["grammar"] += [x for x in g if x not in cur["grammar"]]
                    cur["senses"] += s
                    cur["compounds"] += c
                    cur["ety"] += [x for x in e if x not in cur["ety"]]
                    for cite in ci:
                        key = (cite["raw"], cite["href"])
                        if not any((z["raw"], z["href"]) == key for z in cur["citations"]):
                            cur["citations"].append(cite)
                    cur["xr"] += [x for x in x if x not in cur["xr"]]
                    cur["terms"] += [x for x in terms if x not in cur["terms"]]
                    if keep_raw:
                        raws.append({"word": cur["word"], "homograph": cur["homograph"], "raw": raw})
            if cur:
                records.append(cur)

    # refs 仍是 unique raw 清單，供既有工具與 adb 建置使用
    for r in records:
        seen, refs = set(), []
        for c in r["citations"]:
            if c["raw"] not in seen:
                seen.add(c["raw"])
                refs.append(c["raw"])
        r["refs"] = refs

    OUT.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(f"entries {len(data):,} → records {len(records):,} → {OUT}")
    for key in ("grammar", "senses", "compounds", "ety", "refs", "xr", "terms", "citations"):
        print(f"  {key}: {sum(1 for r in records if r[key]):,}")
    print(f"  citations: {sum(len(r['citations']) for r in records):,}")
    if keep_raw:
        RAW.write_text(json.dumps(raws, ensure_ascii=False), encoding="utf-8")
        print(f"raw → {RAW}（{len(raws):,} blocks）")
    print("sample:", {k: records[0][k] for k in ("word", "homograph", "grammar", "senses", "ety")})


if __name__ == "__main__":
    main()
