#!/usr/bin/env bun
/**
 * 打包 `accelon26/cs-lex.adb`：只含 DN 經文的 cs，加一份「不在目錄樹上」的詞庫。
 *
 *   bun run src/build-cs-lex.ts
 *
 * - 經文：`data/cs/dn1–dn3`（區／書／塊／段 與 cs 相同，目錄樹 = 經文的樹）
 * - 詞庫：用 `<條 w="lemma">` 標記（**不在** `<樹 t="區,書,塊.">` 裡），
 *   緊接著幾行 `sc-en：…／yh：…／kmj：…`；查詞掃 tags 的 `條.w` 屬性。
 * 只讀 data/ 與 out/，只寫 accelon26/。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authorAdb } from '../../adb-converter/ts/src/adbauthor';
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
import { ROOT } from './profiles';

const DBS = ['sc-en', 'yh', 'kmj'] as const;
const BOOKS = ['dn1', 'dn2', 'dn3'];

// 只收 DN 出現過的 lemma
const lemmaOf = new Map<string, string>();
for (const l of readFileSync(join(ROOT, 'out', 'lemma-pwa.tsv'), 'utf8').split('\n').slice(1)) {
  const [f, k] = l.split('\t');
  if (f && k) lemmaOf.set(f.toLowerCase(), k.toLowerCase());
}
const dnLemmas = new Set<string>();
for (const b of BOOKS) {
  const t = readFileSync(join(ROOT, 'data', 'cs', b + '.xml'), 'utf8').replace(/<[^>]*>/g, ' ');
  for (const m of t.match(/[\p{L}\p{M}]+/gu) ?? []) dnLemmas.add(lemmaOf.get(m.toLowerCase()) ?? m.toLowerCase());
}

const byLemma = new Map<string, Map<string, string[]>>();
for (const db of DBS) {
  const p = join(ROOT, 'out', `lexicon-mined-${db}.tsv`);
  if (!existsSync(p)) {
    console.error(`缺少 ${p}`);
    process.exit(2);
  }
  for (const line of readFileSync(p, 'utf8').split('\n').slice(1)) {
    const [lemma, target] = line.split('\t');
    if (!lemma || !target) continue;
    if (!/^[\p{L}\p{M}]+$/u.test(lemma)) continue;
    if (!dnLemmas.has(lemma)) continue;
    const ok = db === 'sc-en' ? target.length >= 3 : [...target].length >= 2;
    if (!ok) continue;
    const m = byLemma.get(lemma) ?? new Map<string, string[]>();
    const arr = m.get(db) ?? [];
    if (!arr.includes(target)) arr.push(target);
    m.set(db, arr);
    byLemma.set(lemma, m);
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lines: string[] = ['<檔 n="cs-lex"><集>巴利三藏（VRI／CST4，DN 測試）</集><英文名>Pali Tipitaka (DN test)</英文名></檔>'];
lines.push('<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>');

// 1) 經文（目錄樹就是這個）
for (const b of BOOKS) {
  const t = readFileSync(join(ROOT, 'data', 'cs', b + '.xml'), 'utf8').replace(/\r\n?/g, '\n').trimEnd();
  for (const l of t.split('\n')) if (l.trim()) lines.push(l);
}

// 2) 詞庫：用 `<條>`（不在樹上）
const lemmas = [...byLemma.keys()].sort((a, b) => a.localeCompare(b, 'pi'));
let n = 0;
for (const lemma of lemmas) {
  n++;
  // `iast` 給閱讀器的 ruby／詞卡用（作者 2026-11-03）；`w` 仍是查詞鍵。
  // 目前 lemma 本身就是 IAST，所以兩者相同；日後若 `w` 改成折疊鍵，iast 才是顯示形。
  const shown = esc(lemma);
  lines.push(`<條 id="l${String(n).padStart(6, '0')}" w="${shown}" iast="${shown}">(${shown})</條>`);
  const m = byLemma.get(lemma)!;
  for (const db of DBS) {
    const arr = m.get(db);
    if (arr && arr.length) lines.push(`${db}：${arr.map(esc).join('、')}`);
  }
}

mkdirSync(join(ROOT, 'accelon26'), { recursive: true });
const out = join(ROOT, 'accelon26', 'cs-lex.adb');
const res = await authorAdb({ dbname: 'cs-lex', dbcname: '巴利三藏（DN 測試）', lines, fullTextIndex: false, log: (x: string) => console.log('  ' + x) });
const buf = Buffer.from(res.file);
buf.writeUInt32LE(0, 100);
writeFileSync(out + '.new', buf);
renameSync(out + '.new', out);
console.log(`詞 ${n}、行 ${lines.length} → ${out}（${(buf.length / 1048576).toFixed(2)} MiB）`);

const r = await AdbReader.open(new SyncIO(out));
console.log(`驗證：行數 ${r.header.lineCount}（預期 ${lines.length}）、容器 ${[...r.containers.keys()].join(',')}`);
const src = r.containers.get('source')!;
let all = '';
for (let i = 0; i < src.count; i++) all += await r.sourceText(i);
console.log(`段 ${(all.match(/<段 /g) ?? []).length}、詞條 ${(all.match(/<條 /g) ?? []).length}`);
