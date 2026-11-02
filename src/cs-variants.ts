#!/usr/bin/env bun
/**
 * 把異文（variant）外部化成 `data/cs-index/variants.tsv`。
 *
 *   bun run src/cs-variants.ts
 *
 * 來源：`D:\2023\cs\off\<書>.notes.json`＝`[{y, pin, val}]`
 *   y   數字 = 行號（0 起算，與 `data/cs/<書>.xml` 一行對一行）
 *       字串 = `段:小段`（這條註在斷句前就沒釘上，只知道落在哪一段）
 *   pin   字串 = 行內文字釘（可能帶 `:n`／`<n` 次數）；數字 = 當時的位移（沒釘上）
 *   val   異文（儉約巴利，VRI 原樣）
 *
 * 輸出：`書 kind 段 句 行 位移 釘 異文`
 *   kind = `line`（釘到某一行）｜`para`（只知道段，沒有行）
 *
 * 為什麼外部化：正文以 VRI 為準，異文只在「這一段有別本讀法」時才查；
 * 閱讀時不該看到校勘符號（作者 2026-11-02）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profiles";

const OFF = "D:/2023/cs/off";
const DATA = join(ROOT, "data", "cs");
const OUT = join(ROOT, "data", "cs-index");

const books = readdirSync(DATA).filter((f) => f.endsWith(".xml") && f !== "00.xml").map((f) => f.replace(".xml", ""));

/** 由 TEI 產生的書：`notes.json` 的行號對不上（來源不同），異文改用 `out/cs-notes.tsv` */
const generated = new Set<string>();
{
  const man = join(ROOT, "out", "books2off.tsv");
  if (existsSync(man)) {
    for (const line of readFileSync(man, "utf8").trimEnd().split("\n").slice(1)) {
      const b = line.split("\t")[0];
      if (b) generated.add(b);
    }
  }
}

const rows: string[] = ["book\tkind\tseg\tsentence\tline\toffset\tpin\tvariant"];
let lineKind = 0, paraKind = 0, paraSub = 0, booksWith = 0;

for (const book of books.sort()) {
  const nf = join(OFF, `${book}.notes.json`);
  if (!existsSync(nf)) continue;
  if (generated.has(book)) continue; // 這批的異文在 cs-notes.tsv（行號不同）
  const notes = JSON.parse(readFileSync(nf, "utf8")) as { y: number | string; pin: string | number; val: string }[];
  if (!notes.length) continue;
  booksWith++;
  const lines = readFileSync(join(OFF, `${book}.cs.off`), "utf8").split("\n");

  // 行 → (段, 句)
  const segAt: { seg: string; sentence: number }[] = [];
  let seg = "", sent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /\^n([0-9-]*)/.exec(lines[i]);
    if (m) { seg = m[1] || ""; sent = 1; } else if (seg) sent++;
    segAt.push({ seg, sentence: seg ? sent : 0 });
  }

  for (const n of notes) {
    const val = n.val ?? "";
    if (typeof n.y === "number") {
      const at = segAt[n.y] ?? { seg: "", sentence: 0 };
      const pin = typeof n.pin === "string" ? n.pin : "";
      rows.push([book, "line", at.seg, at.sentence, n.y, "", pin, val].join("\t"));
      lineKind++;
    } else {
      // y 是 `段:小段`、pin 是位移。位移的基準是「stripNotes 當時的段落文字」，
      // 和我們行的文字對不上（實測 40/40 落點都不在詞首），所以**不假裝**能定位到行。
      const [pn, sub] = String(n.y).split(":");
      const off = typeof n.pin === "number" ? String(n.pin) : "";
      rows.push([book, "para", pn ?? "", "", "", off, "", val].join("\t"));
      paraKind++;
      if (sub) paraSub++;
    }
  }
}

mkdirSync(OUT, { recursive: true });

// 由 TEI（books/／ro/）產生的 117 冊：`<note>` 收在 out/cs-notes.tsv（book 行 異文）
const NOTES = join(ROOT, "out", "cs-notes.tsv");
let noteKind = 0;
if (existsSync(NOTES)) {
  const byBook = new Map<string, string[]>();
  for (const line of readFileSync(NOTES, "utf8").trimEnd().split("\n").slice(1)) {
    const [book, y, text] = line.split("\t");
    if (!book || !text) continue;
    if (!byBook.has(book)) byBook.set(book, []);
    byBook.get(book)!.push(`${y}\t${text}`);
  }
  for (const [book, items] of byBook) {
    const off = join(ROOT, "out", "cs-src", `${book}.cs.off`);
    if (!existsSync(off)) continue;
    const lines = readFileSync(off, "utf8").split("\n");
    const segAt: { seg: string; sentence: number }[] = [];
    let seg = "", sent = 0;
    for (const l of lines) {
      const m = /\^n(\d+)/.exec(l);
      if (m) { seg = m[1]; sent = 1; } else if (seg) sent++;
      segAt.push({ seg, sentence: seg ? sent : 0 });
    }
    for (const item of items) {
      const [y, text] = item.split("\t");
      const at = segAt[Number(y)] ?? { seg: "", sentence: 0 };
      rows.push([book, "note", at.seg, at.sentence, y, "", "", text].join("\t"));
      noteKind++;
    }
  }
}

writeFileSync(join(OUT, "variants.tsv"), rows.join("\n") + "\n", "utf8");
console.log(`variants.tsv  ${lineKind + paraKind + noteKind} 條（${booksWith} 冊）：line ${lineKind}、para ${paraKind}（其中 ${paraSub} 條有 VRI 的小段號）、note ${noteKind}`);
console.log(`→ ${join(OUT, "variants.tsv")}`);
