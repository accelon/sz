#!/usr/bin/env bun
/**
 * 實驗用小 UI：讀 `data/cs-split-digit/<book>.xml`。
 *
 *   bun run src/split-ui.ts            # http://127.0.0.1:8765
 *
 * - hover：長詞在**本文裡直接分開**（詞元之間拉開、淡底），不用浮動提示
 * - 點擊：查本地 OpenTipitaka 詞典（pwa 分析、dpd 英文、opentipitaka 中文）
 *
 * 只讀資料、不改 accelon26。
 */
import { Database } from 'bun:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './profiles';

const PORT = Number(process.env.PORT ?? 8765);
const BOOKS = ['dn1', 'dn2', 'dn3'];
const DICT = 'C:/Users/yapch/AppData/Roaming/Sunanda/OpenTipitaka/openTipitaka/databases/dictionaries.db';
const db = existsSync(DICT) ? new Database(DICT, { readonly: true }) : null;
const get = (table: string, k: string) =>
  db ? (db.query(`SELECT dict_content FROM ${table} WHERE dict_key = ? LIMIT 1`).get(k) as { dict_content: string } | null)?.dict_content ?? '' : '';

function parseBook(book: string): { seg: string; lines: string[] }[] {
  const path = join(ROOT, 'data', 'cs-split-digit', `${book}.xml`);
  if (!existsSync(path)) return [];
  const out: { seg: string; lines: string[] }[] = [];
  let cur: { seg: string; lines: string[] } | null = null;
  for (const l of readFileSync(path, 'utf8').replace(/\r\n?/g, '\n').split('\n')) {
    if (!l.trim()) continue;
    const m = /<段[^>]*\bn="([^"]+)"/.exec(l);
    if (m) { cur = { seg: m[1]!, lines: [] }; out.push(cur); }
    const text = l.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) (cur ?? (cur = { seg: '0', lines: [] }, out.push(cur), cur)).lines.push(text);
  }
  return out;
}
const cache = new Map<string, { seg: string; lines: string[] }[]>();
const bookOf = (b: string) => { if (!cache.has(b)) cache.set(b, parseBook(b)); return cache.get(b)!; };

const HTML = `<!doctype html><meta charset="utf-8"><title>拆詞實驗</title>
<style>
 body{font:16px/1.9 system-ui,"Noto Serif",serif;margin:0;display:flex;height:100vh;background:#141414;color:#ddd}
 #main{flex:1;overflow:auto;padding:1.2rem 2rem}
 #side{width:340px;border-left:1px solid #333;padding:1rem;overflow:auto;background:#1b1b1b}
 .seg{margin:.3rem 0 .1rem;color:#888;font-size:.8rem}
 p{margin:.15rem 0;text-indent:1.5em}
 .w{cursor:pointer}
 .part{transition:margin-left .12s ease,background .12s ease;border-radius:2px}
 .w.open .part{background:#2a2f3a}
 .w.open .part + .part{margin-left:.35em}
 .rule{display:none;font-size:.55em;color:#f0a6c8;vertical-align:super;margin:0 .1em}
 .w.open .rule{display:inline}
 .w.hl .part{background:#4a3b12}
 #side h3{margin:.4rem 0;font-size:.95rem}
 #side .entry{border-top:1px solid #333;padding:.45rem 0;white-space:pre-wrap;font-size:.85rem}
 #side .src{color:#888;font-size:.75rem;margin-top:.3rem}
 select{margin-bottom:.6rem;background:#1b1b1b;color:#ddd;border:1px solid #444;padding:.2rem}
</style>
<div id="main"><select id="book">${BOOKS.map((b) => `<option>${b}</option>`).join('')}</select><div id="text"></div></div>
<div id="side"><h3>詞條</h3><div id="entry" class="entry">點一個詞看看。</div></div>
<script>
function render(book){
  fetch('/api/text?book='+book).then(r=>r.json()).then(segs=>{
    const box = document.getElementById('text'); box.innerHTML='';
    for (const s of segs){
      const d = document.createElement('div'); d.className='seg'; d.textContent='段 '+s.seg; box.appendChild(d);
      for (const line of s.lines){
        const p = document.createElement('p');
        for (const tok of line.split(' ')){
          if (!tok) continue;
          if (!/\\d/.test(tok)){ p.appendChild(document.createTextNode(tok+' ')); continue; }
          const parts = tok.split(/\\d/); const rules = tok.match(/\\d/g)||[];
          const w = document.createElement('span'); w.className='w';
          parts.forEach((part,i)=>{
            const sp = document.createElement('span'); sp.className='part'; sp.textContent=part; sp.dataset.part=part;
            w.appendChild(sp);
            if (i<parts.length-1){ const r=document.createElement('span'); r.className='rule'; r.textContent=rules[i]; w.appendChild(r); }
          });
          w.addEventListener('mouseenter', ()=> w.classList.add('open'));
          w.addEventListener('mouseleave', ()=> w.classList.remove('open'));
          w.addEventListener('click', (ev)=>{
            document.querySelectorAll('.hl').forEach(x=>x.classList.remove('hl'));
            w.classList.add('hl');
            const t = ev.target; const part = (t && t.dataset && t.dataset.part) || parts[0];
            lookup(part);
          });
          p.appendChild(w); p.appendChild(document.createTextNode(' '));
        }
        box.appendChild(p);
      }
    }
  });
}
async function lookup(w){
  const j = await (await fetch('/api/lookup?w='+encodeURIComponent(w))).json();
  const el = document.getElementById('entry');
  el.innerHTML = '<b>'+w+'</b>' + (j.lemma? ' → <b>'+j.lemma+'</b>':'') +
    '<div class="src">pwa</div>' + (j.pwa? '<div>'+esc(j.pwa)+'</div>':'<div>（無）</div>') +
    '<div class="src">dpd</div>' + (j.dpd? '<div>'+esc(j.dpd)+'</div>':'<div>（無）</div>') +
    '<div class="src">中文</div>' + (j.zh? '<div>'+esc(j.zh)+'</div>':'<div>（無）</div>');
}
function esc(s){ return String(s).replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
document.getElementById('book').addEventListener('change', e=> render(e.target.value));
render('dn1');
</script>`;

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (url.pathname === '/api/text') {
      const b = url.searchParams.get('book') ?? 'dn1';
      return Response.json(bookOf(BOOKS.includes(b) ? b : 'dn1'));
    }
    if (url.pathname === '/api/lookup') {
      const w = (url.searchParams.get('w') ?? '').toLowerCase();
      const p = get('pwa', w);
      return Response.json({ w, lemma: /\(([^)]+)\)\s*$/.exec(p)?.[1] ?? '', pwa: p, dpd: get('dpd', w), zh: get('opentipitaka_dict_zh', w) });
    }
    return new Response('not found', { status: 404 });
  },
});
console.log(`split-ui: http://127.0.0.1:${PORT}/`);
