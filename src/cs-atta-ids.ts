#!/usr/bin/env bun
/**
 * 注疏（義注／複注／再複注）的塊 id 重編：先做「試算表」，不動 adb。
 *
 *   bun run src/cs-atta-ids.ts        # 寫 out/atta-ids.tsv
 *
 * 背景：CST4 的注疏在 `phandler.js` 用 `bkid.substr(2)` 取冊號，`dn1a` 取到 `1a`
 * → 查表得 undefined → 塊 id 全變成 `dNaN`／`mNaN`／`sNaN`，而且同檔重複。
 *
 * 重編規則（與根本經的命名對齊）：
 *   塊（sutta／samyutta／vagga 第一層）＝ `<前綴><冊內序號 + 冊偏移>` + `-a`／`-t`／`-x`
 *   小塊（品）＝ `<前綴><所屬塊序號><a,b,c…>` + 層綴（和根本經的 `s1a` 一樣）
 *   `-` 是層綴分隔：增支部的塊 id 本來就是 `a1`，直接加 `a` 會撞到根本經的 `a1a`。
 *
 * 輸出：`書 舊id 標題 新id`，以及每本書的統計（撞號應為 0）。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./profiles";

const OFF = "D:/2023/cs/off";
const DN = { dn1: 0, dn2: 13, dn3: 23 } as Record<string, number>;
const MN = { mn1: 0, mn2: 50, mn3: 100 } as Record<string, number>;
const SN = { sn1: 0, sn2: 11, sn3: 21, sn4: 34, sn5: 44 } as Record<string, number>;

function classify(book: string): { prefix: string; offset: number; layer: string } | null {
  const m = /^([a-z]+)(\d+)([atu])(\d?)$/.exec(book);
  if (!m) return null;
  const [, pf, vol, mat] = m;
  const key = pf + vol;
  const layer = mat === "a" ? "-a" : mat === "t" ? "-t" : "-x";
  if (pf === "dn" && DN[key] != null) return { prefix: "d", offset: DN[key], layer };
  if (pf === "mn" && MN[key] != null) return { prefix: "m", offset: MN[key], layer };
  if (pf === "sn" && SN[key] != null) return { prefix: "s", offset: SN[key], layer };
  if (pf === "an") return { prefix: "a", offset: Number(vol), layer };
  return null;
}

/**
 * 其他書（aas0a／snp0a／vsnk／cv／ja1…）：不照冊偏移，直接用舊 id 裡的號碼。
 * `aas0a` 的 `aas1` → `aas1-a`；`ja1` 的 `m12` → `ja12`；`vsnk` 的 `7` → `vsnk7`。
 */
function classifyOther(book: string): { prefix: string; layer: string } | null {
  if (book === "vsnk") return { prefix: "vsnk", layer: "" };
  const m = /^(.*?)0?([atu])(\d?)$/.exec(book);
  if (m) return { prefix: m[1], layer: m[2] === "a" ? "-a" : m[2] === "t" ? "-t" : "-x" };
  return { prefix: book, layer: "" }; // cv、ja1 這種：書 id 本身就是前綴
}

const letters = (n: number): string => {
  // 0→a, 25→z, 26→aa…
  let s = "";
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/** 只有這幾本的塊 id 需要重編（沒有規則前綴或帶 NaN）。 */
const OTHER = new Set(["aas0a", "snp0a", "vsnk", "cv", "ja1"]);

const rows: string[] = ["book\told\ttitle\tnew"];
const stat: Record<string, { n: number; dup: number; ok: number }> = {};

for (const f of readdirSync(OFF).filter((x) => x.endsWith(".cs.off")).sort()) {
  const book = f.replace(".cs.off", "");
  const cls = classify(book);
  // 只有「id 壞掉／沒有前綴」的書要重編；根本經（d1／a6／aas1…）保持原樣
  const other = cls || !OTHER.has(book) ? null : classifyOther(book);
  if (!cls && !other) continue;
  const text = readFileSync(join(OFF, f), "utf8");
  const seen = new Set<string>();
  let blockNo = 0; // 冊內序號（塊）
  let subNo = 0; // 同一個塊底下的第幾個小塊
  let n = 0, dup = 0, ok = 0;
  for (const m of text.matchAll(/\^(ck|ckan|cksn)(?:#?)([A-Za-z0-9_$\-]*)[\[(]([^\]\)]*)/g)) {
    const tag = m[1];
    const old = m[2];
    const title = m[3].trim();
    let id: string;
    const titleNo = /^(\d+)\./.exec(title)?.[1];
    if (other) {
      // 其他書：用舊 id 裡的號碼（`aas1`→1、`m12`→12、`7`→7），沒有就用序號
      const oldNo = Number(/^\D*(\d+)/.exec(old)?.[1] ?? 0);
      if (tag === "ck") { blockNo++; subNo = 0; }
      id = `${other.prefix}${oldNo || blockNo}${other.layer}`;
    } else if (tag === "ck") {
      blockNo++;
      subNo = 0;
      // 標題號只在「比 running 大」時採用（dn1u2 從第 2 經開始；MN/SN 的標題會從 1 重數）
      const n = Math.max(blockNo, titleNo ? Number(titleNo) : 0);
      id = `${cls!.prefix}${n + cls!.offset}${cls!.layer}`;
    } else {
      id = `${cls!.prefix}${blockNo + cls!.offset}${letters(subNo++)}${cls!.layer}`;
    }
    if (seen.has(id)) { id = `${id}.${++dup}`; }
    seen.add(id);
    if (!/NaN/.test(id)) ok++;
    rows.push([book, old, title.slice(0, 40), id].join("\t"));
    n++;
  }
  stat[book] = { n, dup, ok };
}

mkdirSync(join(ROOT, "out"), { recursive: true });
writeFileSync(join(ROOT, "out", "atta-ids.tsv"), rows.join("\n") + "\n", "utf8");

const books = Object.keys(stat);
const tot = books.reduce((s, b) => s + stat[b].n, 0);
const dup = books.reduce((s, b) => s + stat[b].dup, 0);
console.log(`注疏 ${books.length} 冊、${tot} 個塊：重編成功 ${books.reduce((s, b) => s + stat[b].ok, 0)}、撞號補序 ${dup}`);
for (const b of books) console.log(`  ${b.padEnd(7)} ${String(stat[b].n).padStart(4)} 個${stat[b].dup ? `，補序 ${stat[b].dup}` : ""}`);
console.log(`→ ${join(ROOT, "out", "atta-ids.tsv")}`);
