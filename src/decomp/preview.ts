#!/usr/bin/env bun
/**
 * 預覽：把 `data/cs-decomp/splits.tsv` 套到 `data/cs/<書>.xml` 的**副本**上，
 * 產生 `<辭 b j>`（舊資料是 `<詞>`；2026-11-06 起 cs 詞譜用 `<辭>`）已經補好的 XML，放在 `out/cs-decomp-preview/`。
 *
 *   bun run src/decomp/preview.ts            # 預設 dn1
 *   bun run src/decomp/preview.ts mn1 an1    # 指定書
 *
 * 這一步**不改 data/cs**，只是證明「表套得上去、文字一個字都沒變」，
 * 讓人可以直接看新拆法在上下文裡長什麼樣。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseIAST, verifies, toOrth, joinFormula } from './sandhi';
import { PREVIEW_DIR, inventory, OUT_DIR } from './sources';

const TOKEN_G = /<[詞辭] ([^>]*)>([^<]*)<\/[詞辭]>|<[^>]*>|([^<]+)/g;
const WORD_G = /[\p{L}\p{M}]+/gu;

interface Row {
  word: string;
  b: string;
  j: string;
  depth: number;
}

const loadTable = (): Map<string, Row> => {
  const lines = readFileSync(join(OUT_DIR, 'splits.tsv'), 'utf8').trimEnd().split('\n').slice(1);
  const out = new Map<string, Row>();
  for (const line of lines) {
    const [word, b, j, , , depth] = line.split('\t');
    out.set(word, { word, b, j, depth: Number(depth) || 1 });
  }
  return out;
};

const strip = (xml: string): string => xml.replace(/<[^>]*>/g, '');

const main = (): void => {
  const books = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const list = books.length ? books : ['dn1'];
  const table = loadTable();
  const inv = inventory();

  mkdirSync(PREVIEW_DIR, { recursive: true });
  const rows: string[] = ['book\tbefore\tafter\ttokens\tadded'];
  for (const book of list) {
    const src = readFileSync(join('D:/2026/sz/data/cs', `${book}.xml`), 'utf8');
    let before = 0;
    let after = 0;
    let tokens = 0;
    let added = 0;
    const out = src.replace(TOKEN_G, (whole, attrs: string | undefined, display: string | undefined, text: string | undefined) => {
      if (/^<[詞辭] /.test(whole)) {
        before++;
        after++;
        return whole;
      }
      if (!text) return whole;
      return text.replace(WORD_G, (w) => {
        tokens++;
        const hit = table.get(w);
        if (!hit) return w;
        const orth = toOrth(w);
        if (!orth || !verifies(joinFormula(hit.b, hit.j), orth)) return w;
        after++;
        added++;
        return `<辭 b="${hit.b}" j="${hit.j}">${w}</辭>`;
      });
    });
    void inv;
    // 驗證：去掉標籤後，文字必須一字不差
    const same = strip(src) === strip(out);
    if (!same) throw new Error(`${book}：套表後文字變了（不應該發生）`);
    mkdirSync(PREVIEW_DIR, { recursive: true });
    writeFileSync(join(PREVIEW_DIR, `${book}.xml`), out, 'utf8');
    rows.push(`${book}\t${before}\t${after}\t${tokens}\t${added}`);
    console.log(
      `${book}: 詞譜 ${before} → ${after}（+${added}），詞 ${tokens}，` +
        `${((after / tokens) * 100).toFixed(1)}%，文字不變 ✓`,
    );
  }
  void baseIAST;
  writeFileSync(join(PREVIEW_DIR, 'summary.tsv'), rows.join('\n') + '\n', 'utf8');
  console.log(`\n預覽：${PREVIEW_DIR}`);
};

main();
