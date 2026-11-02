#!/usr/bin/env bun
/**
 * 從 OpenTipitaka 抽出兩張小對照表（給 cs 的 SC naming／書名用）。
 *
 *   bun run src/otp-index.ts
 *
 * 來源（另一支 App 的資料，只讀）：
 *   %APPDATA%\Sunanda\OpenTipitaka\openTipitaka\databases\tipitaka-translation-data.db
 *   安裝目錄\data\flutter_assets\shared\sutta_index.json、tipitaka_index.json
 *
 * 產出（小檔，可進版控）：
 *   data/cs-index/tables.tsv   表 → 書 id／層級／書名（pali、zh、en）／列數／段數
 *   data/cs-index/suttas.tsv   經 → 表＋列範圍 → sc_uid → 編號（6,368 筆）
 *
 * 見 docs/opentitaka.md。
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cst4rename } from "D:/2023/cs/src/cst4rename.js";
import { ROOT } from "./profiles";

const APP = "C:/Program Files/WindowsApps/BhanteSunanda.OpenTipitaka_7.0.0.0_x64__rgdt2xn07hd18/data/flutter_assets/shared";
const DB = "C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/tipitaka-translation-data.db";
const OUT = join(ROOT, "data", "cs-index");

const suttaIndex = JSON.parse(readFileSync(join(APP, "sutta_index.json"), "utf8"));
const tipitakaIndex = JSON.parse(readFileSync(join(APP, "tipitaka_index.json"), "utf8"));
const db = new Database(DB, { readonly: true });

/** table（s0101m_mul）→ CST 檔名（s0101m.mul.xml）→ 書 id（dn1） */
const bookOf = new Map<string, string>();
for (const f of readdirSync("D:/2023/cs/ro").filter((f) => f.endsWith(".xml"))) {
  const bk = cst4rename(f);
  if (bk) bookOf.set(f.replace(".xml", "").replace(".", "_"), bk);
}

const layerOf = (table: string): string => table.slice(table.lastIndexOf("_") + 1);
const LAYER: Record<string, string> = { mul: "根本", att: "義注", tik: "複注", nrf: "其他" };

const titles = tipitakaIndex.translations as Record<string, Record<string, string>>;
const tableNames = [...db.query(`select name from sqlite_master where type='table'`).all()]
  .map((r: any) => r.name as string)
  .filter((n) => /_(mul|att|tik|nrf)$/.test(n))
  .sort();

mkdirSync(OUT, { recursive: true });

const tRows = ["table\tbook\tlayer\ttitle_pali\ttitle_zh\ttitle_en\trows\tparas"];
for (const table of tableNames) {
  const t = titles[table] ?? {};
  const s = db.query(`select count(*) rows, count(distinct nullif(paranum,'')) paras from "${table}"`).get() as any;
  tRows.push(
    [table, bookOf.get(table) ?? "", LAYER[layerOf(table)] ?? layerOf(table),
      t.pali ?? "", t.zh ?? "", t.en ?? "", s.rows, s.paras].join("\t"),
  );
}
writeFileSync(join(OUT, "tables.tsv"), tRows.join("\n") + "\n", "utf8");

const sRows = ["table\tbook\tstart_row\tend_row\tpali_title\tsource_paranum\tsc_uid\tdisplay_reference\tnumber_start\tnumber_end\tmapping_kind"];
for (const e of suttaIndex.entries as any[]) {
  sRows.push([
    e.table_name, bookOf.get(e.table_name) ?? "", e.start_row_id, e.end_row_id,
    e.pali_title, e.source_paranum, e.sc_uid ?? "", e.display_reference ?? "",
    e.number_start ?? "", e.number_end ?? "", e.mapping_kind,
  ].join("\t"));
}
writeFileSync(join(OUT, "suttas.tsv"), sRows.join("\n") + "\n", "utf8");

const byLayer: Record<string, number> = {};
for (const table of tableNames) byLayer[LAYER[layerOf(table)] ?? "?"] = (byLayer[LAYER[layerOf(table)]] ?? 0) + 1;
console.log(`tables.tsv  ${tableNames.length} 張表`, byLayer);
console.log(`suttas.tsv  ${suttaIndex.entries.length} 筆經`);
console.log(`輸出 ${OUT}`);
