#!/usr/bin/env bun
/**
 * 把 SC 的經號補進 cs 的 `<塊>`／`<小塊>`：加一個 `sc="dn1"` 屬性（**不改 id**）。
 *
 *   bun run src/cs-sc.ts            # 就地改 data/cs/*.xml
 *   bun run src/cs-sc.ts --check    # 只報告覆蓋率，不寫檔
 *
 * 為什麼加屬性而不是改 id：`d1`／`a6` 這套 id 是八個譯本共用的定位鍵（`ck.n`），
 * 改了會全部斷掉；SC 經號另外存，等 reader 支援 `dn1.7` 這種寫法再切換。
 *
 * 對照方式：我們的塊從某一段開始 → 找 OpenTipitaka DB 裡該段的第一列 →
 * 用 `data/cs-index/suttas.tsv` 的 row 範圍查出 sc_uid。
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cst4rename } from './cst-rename';
import { ROOT } from "./profiles";

const INDEX = join(ROOT, "data", "cs-index");
const DATA = join(ROOT, "data", "cs");
const DB = "C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/tipitaka-translation-data.db";

/** suttas.tsv → 書 → [{start,end,sc}] */
function loadSuttas(): Map<string, { start: number; end: number; sc: string }[]> {
  const rows = readFileSync(join(INDEX, "suttas.tsv"), "utf8").trimEnd().split("\n").slice(1);
  const out = new Map<string, { start: number; end: number; sc: string }[]>();
  for (const r of rows) {
    const [, book, start, end, , , sc] = r.split("\t");
    if (!sc) continue;
    if (!out.has(book)) out.set(book, []);
    out.get(book)!.push({ start: +start, end: +end, sc });
  }
  return out;
}

/** ro 檔名 → 書 id（與 cs2accelon 的書清單一致） */
const bookOfTable = new Map<string, string>();
for (const f of readdirSync("D:/2023/cs/ro").filter((f) => f.endsWith(".xml"))) {
  const bk = cst4rename(f);
  if (bk) bookOfTable.set(f.replace(".xml", "").replace(".", "_"), bk);
}
const tableOfBook = new Map<string, string>();
for (const [t, b] of bookOfTable) if (!tableOfBook.has(b)) tableOfBook.set(b, t);

export function addScIds(checkOnly = false): { books: number; chunks: number; tagged: number; files: string[] } {
  const suttas = loadSuttas();
  const db = new Database(DB, { readonly: true });
  const files = readdirSync(DATA).filter((f) => f.endsWith(".xml") && f !== "00.xml");
  let chunks = 0;
  let tagged = 0;
  const touched: string[] = [];

  for (const f of files) {
    const book = f.replace(".xml", "");
    const table = tableOfBook.get(book);
    const list = suttas.get(book);
    if (!table || !list) continue;

    // 段號 → 第一列的 id
    const firstRow = new Map<string, number>();
    for (const r of db.query(`select id, paranum from "${table}" order by id`).all() as any[]) {
      if (r.paranum && !firstRow.has(r.paranum)) firstRow.set(r.paranum, r.id);
    }
    const scAtRow = (row: number): string => {
      const hit = list.find((s) => row >= s.start && row <= s.end);
      return hit ? hit.sc : "";
    };

    const path = join(DATA, f);
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");

    // 第一遍：每個塊的第一個段號（段可能在下一行）
    const firstSeg = new Map<string, string>();
    let curId = "";
    for (const line of lines) {
      for (const id of [...line.matchAll(/<(?:塊|小塊) id="([^"]+)"/g)].map((m) => m[1])) {
        curId = id;
        const n = /<段 n="([0-9]+)"/.exec(line);
        if (n && !firstSeg.has(id)) firstSeg.set(id, n[1]);
      }
      if (curId && !firstSeg.has(curId)) {
        const n = /<段 n="([0-9]+)"/.exec(line);
        if (n) firstSeg.set(curId, n[1]);
      }
    }
    const scOf = new Map<string, string>();
    for (const [id, pn] of firstSeg) {
      chunks++;
      const row = firstRow.get(pn);
      let sc = row != null ? scAtRow(row) : "";
      // 相應部的「塊」是整個相應（sn45），它的小塊才是品；把 sn45.1 收成 sn45
      if (sc && /^([a-z]+\d+)\.\d+$/.exec(sc) && !id.endsWith("-") && /^s\d+$/.test(id)) {
        sc = /^([a-z]+\d+)\.\d+$/.exec(sc)![1];
      }
      if (sc) {
        scOf.set(id, sc);
        tagged++;
      }
    }
    if (!scOf.size) continue;
    touched.push(book);
    if (checkOnly) continue;
    writeFileSync(
      path,
      lines
        .map((l) =>
          l.replace(/<(塊|小塊) id="([^"]+)"(?: sc="[^"]*")?/g, (m, tag, id) =>
            scOf.has(id) ? `<${tag} id="${id}" sc="${scOf.get(id)}"` : `<${tag} id="${id}"`,
          ),
        )
        .join("\n") + "\n",
      "utf8",
    );
  }
  return { books: files.length, chunks, tagged, files: touched };
}

if (import.meta.main) {
  const check = process.argv.includes("--check");
  if (!existsSync(join(INDEX, "suttas.tsv"))) {
    console.error("先跑 bun run src/otp-index.ts（要有 data/cs-index/suttas.tsv）");
    process.exit(2);
  }
  const r = addScIds(check);
  console.log(`${check ? "檢查" : "寫入"}：${r.books} 冊、${r.chunks} 個塊，補上 sc= 的 ${r.tagged} 個`);
  console.log(`有變動的書：${r.files.join(" ")}`);
}
