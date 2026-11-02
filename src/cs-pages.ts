#!/usr/bin/env bun
/**
 * 把紙本頁碼外部化成 `data/cs-index/pages.tsv`（正文裡沒有 `<pb>`，閱讀時不需要）。
 *
 *   bun run src/cs-pages.ts
 *
 * 來源：`D:\2023\cs\books\<書>.xml` 的 `<pb t="m1.1;v1.1;p1.1;t1.1"/>`
 *      （`backmovepb` 已把頁界移到該頁第一個詞之前，所以「頁界 → 段」是可靠的）
 * 輸出：`書 \t 段 \t m \t v \t p \t t`——只記「頁碼有變」的那些段，
 *      也就是每一頁的起點；用段號查，就能知道那一段從哪一頁開始。
 *
 * 為什麼不放正文：頁碼是紙本屬性，換版本就變；定位用 `塊.段[:句]`，頁碼只在
 * 「我要翻紙本」時才查這張表（作者 2026-11-02：紙本頁碼最好也外部化）。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profiles";

const BOOKS = join("D:/2023/cs/books");
const OUT = join(ROOT, "data", "cs-index");

const files = readdirSync(BOOKS).filter((f) => f.endsWith(".xml")).sort();
const rows: string[] = ["book\tseg\tsentence\tm\tv\tp\tt"];
let pages = 0;

for (const f of files) {
  const book = f.replace(".xml", "");
  const text = readFileSync(join(BOOKS, f), "utf8");
  // 依序列出 <pb …/> 與 <p pn="…"> 兩種事件
  const ev = [...text.matchAll(/<pb t="([^"]*)"\/>|<p pn="([^"]+)"/g)];
  let cur: Record<string, string> = { m: "", v: "", p: "", t: "" };
  let recorded = "";
  for (const m of ev) {
    if (m[1] !== undefined) {
      for (const part of m[1].split(";")) {
        const mm = /^([a-z])(.+)$/.exec(part);
        if (mm) cur[mm[1]] = mm[2];
      }
      continue;
    }
    const seg = m[2];
    const key = `${cur.m};${cur.v};${cur.p};${cur.t}`;
    if (key === recorded) continue; // 同一頁裡的多個段，只記頁首
    recorded = key;
    pages++;
    rows.push([book, seg, "", cur.m, cur.v, cur.p, cur.t].join("\t"));
  }
}

// 由 TEI 產生的 117 冊：out/cs-pages.tsv 已經帶句號（books2off 算好的）
const gen = join(ROOT, "out", "cs-pages.tsv");
let genRows = 0;
if (existsSync(gen)) {
  for (const line of readFileSync(gen, "utf8").trimEnd().split("\n").slice(1)) {
    if (!line) continue;
    rows.push(line);
    genRows++;
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "pages.tsv"), rows.join("\n") + "\n", "utf8");
console.log(`pages.tsv  ${pages + genRows} 列（books/ ${pages}、TEI ${genRows}） → ${join(OUT, "pages.tsv")}`);
