#!/usr/bin/env bun
/**
 * 為注疏產生「已修好塊 id」的來源副本 → `out/cs-src/`（不進版控）。
 *
 *   bun run src/cs-atta-normalize.ts
 *
 * 為什麼要副本：CST4 的注疏塊 id 是 `dNaN`／`mNaN`／`sNaN`（phandler 取冊號失敗），
 * 而且 `^cksn#NaNa` 這種 id 帶大寫，offtext 的標籤字元集只收小寫，解析時會被切斷。
 * 與其在轉換器裡做位置比對，不如先把 id 換掉，轉換器就回到「只加層綴」的單純情況。
 *
 * 做法：
 *   1. `out/atta-ids.tsv`（`src/cs-atta-ids.ts` 的試算）→ 每本書依序的新 id
 *   2. 逐行把 `^ck…`／`^ckan…`／`^cksn…` 的「名字＋id」換成新 id（括號與後面文字不動）
 *   3. 根本經用 hardlink（不佔空間），注疏寫副本
 */
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profiles";

const OFF = "D:/2023/cs/off";
const SRC = join(ROOT, "out", "cs-src");
const IDS = join(ROOT, "out", "atta-ids.tsv");

if (!existsSync(IDS)) {
  console.error("先跑 bun run src/cs-atta-ids.ts");
  process.exit(2);
}

/** 書名（data/cs-index/tables.tsv 的 	itle_pali）：補給沒有 ^bk 的書 */
const TITLES = new Map<string, string>();
{
  const f = join(ROOT, 'data', 'cs-index', 'tables.tsv');
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').trimEnd().split('\n').slice(1)) {
      const [table, book, , pali] = line.split('\t');
      if (!pali) continue;
      if (book) TITLES.set(book, pali);
      if (table) TITLES.set(`#${table}`, pali);
    }
  }
}

const newIds = new Map<string, string[]>();
for (const line of readFileSync(IDS, "utf8").trimEnd().split("\n").slice(1)) {
  const [book, , , id] = line.split("\t");
  if (!book || !id) continue;
  if (!newIds.has(book)) newIds.set(book, []);
  newIds.get(book)!.push(id);
}

rmSync(SRC, { recursive: true, force: true });
mkdirSync(SRC, { recursive: true });

let copied = 0, linked = 0, tags = 0;
for (const f of readdirSync(OFF).filter((x) => x.endsWith(".cs.off")).sort()) {
  const book = f.replace(".cs.off", "");
  const list = newIds.get(book);
  const dst = join(SRC, f);
  if (!list) {
    linkSync(join(OFF, f), dst); // 根本經：hardlink
    linked++;
    continue;
  }
  let k = 0;
  const text = readFileSync(join(OFF, f), "utf8");
  let out = text.replace(/\^(cksn|ckan|ck)#?([A-Za-z0-9_$\-]*)/g, (m, tag: string) => {
    const id = list[k++];
    if (!id) return m;
    tags++;
    return `^${tag}#${id}`;
  });
  // 有些注疏一檔裡有好幾個 `^bk`（例如 an2a 的三個五十集），會產生同一個書 id 的多個節點；
  // 只留第一個當「書」，其餘降成小節（標題文字不動）。
  let seenBk = false;
  out = out.replace(/\^bk/g, () => {
    if (!seenBk) { seenBk = true; return '^bk'; }
    return '^h';
  });
  // 有些書（`ja1`）整檔沒有 `^bk`：補一行書名，目錄才不會只有 id
  if (!seenBk) {
    const title = TITLES.get(book) ?? '';
    out = (title ? `^bk#${book}(${title})\n` : `^bk#${book}\n`) + out;
  }
  writeFileSync(dst, out, "utf8");
  copied++;
  if (k !== list.length) console.log(`  ! ${book}: 標籤 ${k} 個、表 ${list.length} 列`);
}
console.log(`cs-src：hardlink ${linked} 冊、改寫 ${copied} 冊（${tags} 個標籤）→ ${SRC}`);
