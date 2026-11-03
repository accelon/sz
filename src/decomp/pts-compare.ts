#!/usr/bin/env bun
/**
 * 比對 sc-data 的 PTS 精修版與本地 pe3（未修版）。
 *
 *   bun run src/decomp/pts-compare.ts
 *
 * 量：
 *   1. 兩邊各有幾個詞頭、交集多少
 *   2. 同一個詞的內容長度差（精修版多半更長：補義、修引）
 *   3. dīpa 這類「合流詞」兩邊怎麼寫
 */
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';

const SRC = 'D:/2026/sz/data/sc-dict/pli2en_pts.json';
type Entry = { word: string; text: string };
const list = JSON.parse(readFileSync(SRC, 'utf8')) as Entry[];
console.log(`sc-data PTS：${list.length.toLocaleString()} 條`);

const strip = (s: string): string => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const sc = new Map<string, string>();
for (const e of list) if (e.word && !sc.has(e.word)) sc.set(e.word, e.text);
console.log(`唯一詞頭 ${sc.size.toLocaleString()}；平均長度 ${( [...sc.values()].reduce((a, t) => a + strip(t).length, 0) / sc.size).toFixed(0)} 字`);

const db = new Database('C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db', { readonly: true });
const pe3 = new Map<string, string>();
for (const r of db.query('select dict_key, dict_content from pe3').all() as { dict_key: string; dict_content: string }[]) {
  if (!pe3.has(r.dict_key)) pe3.set(r.dict_key, r.dict_content);
}
db.close();
console.log(`本地 pe3：${pe3.size.toLocaleString()} 條；平均長度 ${( [...pe3.values()].reduce((a, t) => a + strip(t).length, 0) / pe3.size).toFixed(0)} 字`);

let both = 0;
let onlySc = 0;
let onlyPe3 = 0;
for (const w of sc.keys()) {
  if (pe3.has(w)) both++;
  else onlySc++;
}
for (const w of pe3.keys()) if (!sc.has(w)) onlyPe3++;
console.log(`\n交集 ${both.toLocaleString()}；只有 sc-data ${onlySc.toLocaleString()}；只有 pe3 ${onlyPe3.toLocaleString()}`);

/* 交集裡長度差（sc 比 pe3 長多少） */
const diffs: number[] = [];
for (const [w, t] of sc) {
  const p = pe3.get(w);
  if (!p) continue;
  diffs.push(strip(t).length - strip(p).length);
}
diffs.sort((a, b) => a - b);
const q = (p: number): number => diffs[Math.floor(diffs.length * p)] ?? 0;
console.log(`交集 ${diffs.length.toLocaleString()} 條的長度差（sc − pe3）：中位數 ${q(0.5)}、10% ${q(0.1)}、90% ${q(0.9)}、最長 ${diffs[diffs.length - 1]}`);

/* 例子 */
const show = (w: string): void => {
  const a = sc.get(w);
  const b = pe3.get(w);
  console.log(`\n=== ${w} ===`);
  console.log('  sc-data：' + (a ? strip(a).slice(0, 160) : '（無）'));
  console.log('  pe3    ：' + (b ? strip(b).slice(0, 160) : '（無）'));
};
for (const w of ['dīpa', 'dhamma', 'te', 'bhagavant']) show(w);

/* pe3 的錯字偵測：內容裡出現 HTML 殘留或異常字元 */
let htmlJunk = 0;
for (const t of pe3.values()) if (/<[a-z]+>|&[a-z]+;/.test(t)) htmlJunk++;
console.log(`\npe3 內含未清理 HTML 標記的條目：${htmlJunk.toLocaleString()}`);
let scJunk = 0;
for (const t of sc.values()) if (!/<dl>/.test(t)) scJunk++;
console.log(`sc-data 不是 <dl> 格式的條目：${scJunk.toLocaleString()}`);
