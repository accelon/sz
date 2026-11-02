#!/usr/bin/env bun
/**
 * 檢查 adb 的目錄樹（`<樹 t=…>`）能不能建起來、有幾層、名字長什麼樣。
 *
 *   bun run src/toc-check.ts                 # accelon26/*.adb 全部
 *   bun run src/toc-check.ts sc              # 只檢查一個
 *
 * 目的：`s=` 不在時搜尋是空的（沒有 tokens），但目錄樹要照樣可用；
 * 這支直接呼叫閱讀器的 `loadTrees`／`loadTree`／`buildTree`，不開瀏覽器。
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AdbReader, SyncIO } from '../../adb-converter/ts/src/accelon26/adb';
import { VaPaMapper, parseAttrs } from '../../adb-converter/ts/src/accelon26/vapa';
import { loadTrees, loadTree, buildTree, flattenTree } from '../../adb-converter/ts/src/accelon26/search';
import { ROOT } from './profiles';

const DIR = join(ROOT, 'accelon26');
const only = process.argv[2];
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.adb'))
  .filter((f) => !only || f === `${only}.adb`);

if (!files.length) {
  console.error(`找不到 ${DIR} 裡的 adb`);
  process.exit(2);
}

for (const file of files) {
  const path = join(DIR, file);
  const reader = await AdbReader.open(new SyncIO(path));
  const mapper = new VaPaMapper(reader);
  await mapper.init();
  const trees = await loadTrees(reader);
  console.log(`\n=== ${file}  行 ${reader.header.lineCount.toLocaleString('en-US')} ===`);
  for (const t of trees) {
    console.log(
      `  <樹> s="${t.scope}" t="${t.tiers.join(',')}"${t.terminalTier >= 0 ? '（末層）' : ''}  ${t.fullText ? '全文' : ''}`,
    );
  }
  if (!trees.length) {
    console.log('  ✗ 沒有 <樹> 宣告');
    continue;
  }
  const tree = trees.find((t) => t.tiers.length) ?? trees[0];
  const instances = await loadTree(reader, tree, {
    attrsAt: async (va) => {
      const el = await mapper.elementAt(va);
      return el ? parseAttrs(el.element.text) : {};
    },
    label: (va, vaEnd) => mapper.nodeLabel(va, vaEnd),
  });
  const roots = buildTree(instances);
  const flat = flattenTree(roots, () => true).map((f) => f.node);
  const byDepth = new Map<number, number>();
  for (const n of flat) byDepth.set(n.depth, (byDepth.get(n.depth) ?? 0) + 1);
  const levels = [...byDepth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, c]) => `L${d + 1}=${c}`)
    .join(' ');
  const tagged = [...new Set(instances.map((i) => i.tag))].join('／');
  console.log(`  節點 ${flat.length.toLocaleString('en-US')}（${levels}；標籤 ${tagged}）`);
  // 抽樣：前幾棵根與它們的第一個子節點
  const sample = roots.slice(0, 4).map((r) => {
    const kid = r.children[0];
    return `${r.label || '(無名)'}${kid ? ` → ${kid.label || '(無名)'}` : ''}`;
  });
  console.log('  樣本：' + sample.join(' ｜ '));
  const unnamed = flat.filter((n) => !n.label).length;
  console.log(`  沒有名字的節點：${unnamed}`);
}
