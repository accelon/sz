// cllk2accelon.ts — 朱拉隆功泰譯巴利三藏（84000.org / มจร.）html → Accelon XML
//
// 來源：D:\2023\cllk\html\<卷>-<siri>.html（scrap.js 抓的原始 html，UTF-8）
// 產出：data/cllk/*.xml（一行一個 adb 行），規格見母區 docs/adb/off-to-accelon.md
//
// 四部尼柯耶都在這裡轉。結構對照（細節見 docs/cllk.md）：
//   <center class=n> 版頭／南無                        → 丟掉
//   <center>……สูตร</center>（一經）                    → <塊 id="m51">……</塊>
//   <center>……สังยุต</center>（一相應）                → <塊 id="s12">……</塊>
//   <center>อังคุตตรนิกาย ……นิบาต</center>（一集）       → <塊 id="a2">……</塊>
//   <center>……วรรค／ปัณณาสก์</center>                  → <節>……</節>
//   <center>其他標題</center>                          → <項>……</項>
//   <p class=reftop> 每頁書眉                          → 丟掉（塊邊界靠它判斷）
//   [๑]<a name=1></a>                                  → <段 n="1"/>
//   <sup>๑-</sup>                                      → <註 n="1" pg="m1.1"/>
//   <small>@<sup>๑</sup> 注文</small>                  → <釋 n="1" pg="m1.1">注文</釋>（另一本檔）
//   <small class=foot2>{ที่มา … หน้า : ๑}</small>       → <pb n="1"/>
//
// 頁塊：網站每個 siri 檔在頁界切開，相鄰兩檔常重複一頁（後檔是前檔的子集）。
// 這裡按「卷＋頁碼」去重，只留第一次出現（實測 349 個重複頁全部是「後 ⊂ 前」）。

import fs from 'node:fs';

const SRC = 'D:/2023/cllk/html';
const OUT = 'D:/2026/sz/data/cllk';
const REPORT = 'D:/2026/sz/out/cllk-report.txt';

const TH = '๐๑๒๓๔๕๖๗๘๙';
const th2int = (s: string) => Number([...s].map((c) => TH.indexOf(c)).join(''));

type Kind = 'sutta' | 'samyutta' | 'nipata';

interface Range {
  vol: number;
  from: number;
  to: number;
}
interface BookSpec {
  id: string;
  zone: 'dn' | 'mn' | 'sn' | 'an';
  title: string; // 書名（品／相應品／集）
  ranges: Range[];
  kind: Kind;
  base: number; // 這一冊第一個塊的編號偏移（m1 起 = 0）
  count: number; // 這一冊應有幾個塊
  headerPick: 'bracket0' | 'line1'; // 書眉哪一行是塊名
  firstOfZone: boolean;
}

const BOOKS: BookSpec[] = [
  // ── 長部（ทีฆนิกาย）：MCU 卷 9／10／11
  { id: 'dn1', zone: 'dn', title: 'สีลขันธวรรค', kind: 'sutta', base: 0, count: 13, ranges: [{ vol: 9, from: 1, to: 13 }], headerPick: 'bracket0', firstOfZone: true },
  { id: 'dn2', zone: 'dn', title: 'มหาวรรค', kind: 'sutta', base: 13, count: 10, ranges: [{ vol: 10, from: 1, to: 10 }], headerPick: 'bracket0', firstOfZone: false },
  { id: 'dn3', zone: 'dn', title: 'ปาฏิกวรรค', kind: 'sutta', base: 23, count: 11, ranges: [{ vol: 11, from: 1, to: 11 }], headerPick: 'bracket0', firstOfZone: false },
  // ── 中部（มัชฌิมนิกาย）：卷 12／13／14（มูล／มัชฌิม／อุปริปัณณาสก์）
  { id: 'mn1', zone: 'mn', title: 'มูลปัณณาสก์', kind: 'sutta', base: 0, count: 50, ranges: [{ vol: 12, from: 1, to: 50 }], headerPick: 'line1', firstOfZone: true },
  { id: 'mn2', zone: 'mn', title: 'มัชฌิมปัณณาสก์', kind: 'sutta', base: 50, count: 50, ranges: [{ vol: 13, from: 1, to: 50 }], headerPick: 'line1', firstOfZone: false },
  { id: 'mn3', zone: 'mn', title: 'อุปริปัณณาสก์', kind: 'sutta', base: 100, count: 52, ranges: [{ vol: 14, from: 1, to: 52 }], headerPick: 'line1', firstOfZone: false },
  // ── 相應部（สังยุตตนิกาย）：卷 15–19（สคาถ／นิทาน／ขันธ／สฬายตน／มหาวรรค）
  { id: 'sn1', zone: 'sn', title: 'สคาถวรรค', kind: 'samyutta', base: 0, count: 11, ranges: [{ vol: 15, from: 1, to: 271 }], headerPick: 'bracket0', firstOfZone: true },
  { id: 'sn2', zone: 'sn', title: 'นิทานวรรค', kind: 'samyutta', base: 11, count: 10, ranges: [{ vol: 16, from: 1, to: 240 }], headerPick: 'bracket0', firstOfZone: false },
  { id: 'sn3', zone: 'sn', title: 'ขันธวารวรรค', kind: 'samyutta', base: 21, count: 13, ranges: [{ vol: 17, from: 1, to: 333 }], headerPick: 'bracket0', firstOfZone: false },
  { id: 'sn4', zone: 'sn', title: 'สฬายตนวรรค', kind: 'samyutta', base: 34, count: 10, ranges: [{ vol: 18, from: 1, to: 292 }], headerPick: 'bracket0', firstOfZone: false },
  { id: 'sn5', zone: 'sn', title: 'มหาวรรค', kind: 'samyutta', base: 44, count: 12, ranges: [{ vol: 19, from: 1, to: 444 }], headerPick: 'bracket0', firstOfZone: false },
  // ── 增支部（อังคุตตรนิกาย）：11 集，分在 MCU 卷 20–24
  { id: 'an1', zone: 'an', title: 'เอกนิบาต', kind: 'nipata', base: 0, count: 1, ranges: [{ vol: 20, from: 1, to: 28 }], headerPick: 'line1', firstOfZone: true },
  { id: 'an2', zone: 'an', title: 'ทุกนิบาต', kind: 'nipata', base: 1, count: 1, ranges: [{ vol: 20, from: 29, to: 44 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an3', zone: 'an', title: 'ติกนิบาต', kind: 'nipata', base: 2, count: 1, ranges: [{ vol: 20, from: 45, to: 201 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an4', zone: 'an', title: 'จตุกกนิบาต', kind: 'nipata', base: 3, count: 1, ranges: [{ vol: 21, from: 1, to: 144 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an5', zone: 'an', title: 'ปัญจกนิบาต', kind: 'nipata', base: 4, count: 1, ranges: [{ vol: 22, from: 1, to: 251 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an6', zone: 'an', title: 'ฉักกนิบาต', kind: 'nipata', base: 5, count: 1, ranges: [{ vol: 22, from: 252, to: 368 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an7', zone: 'an', title: 'สัตตกนิบาต', kind: 'nipata', base: 6, count: 1, ranges: [{ vol: 23, from: 1, to: 73 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an8', zone: 'an', title: 'อัฏฐกนิบาต', kind: 'nipata', base: 7, count: 1, ranges: [{ vol: 23, from: 74, to: 163 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an9', zone: 'an', title: 'นวกนิบาต', kind: 'nipata', base: 8, count: 1, ranges: [{ vol: 23, from: 164, to: 238 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an10', zone: 'an', title: 'ทสกนิบาต', kind: 'nipata', base: 9, count: 1, ranges: [{ vol: 24, from: 1, to: 196 }], headerPick: 'line1', firstOfZone: false },
  { id: 'an11', zone: 'an', title: 'เอกาทสกนิบาต', kind: 'nipata', base: 10, count: 1, ranges: [{ vol: 24, from: 197, to: 218 }], headerPick: 'line1', firstOfZone: false },
];

const ZONE_TITLE: Record<string, string> = {
  dn: 'ทีฆนิกาย',
  mn: 'มัชฌิมนิกาย',
  sn: 'สังยุตตนิกาย',
  an: 'อังคุตตรนิกาย',
};

// ── 文字處理 ────────────────────────────────────────────────
const ENT: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s: string): string {
  return s
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e: string) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : m;
      }
      return ENT[e] ?? m;
    })
    .replace(/%20/g, ' ')
    .replace(/\u00a0/g, ' ');
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const noNote = (s: string) => s.replace(/[๐-๙]+-/g, '').trim(); // 去掉註號「๑-」
const thaiLetters = (s: string) => (s.match(/[\u0E01-\u0E4E]/g) || []).length;

// ── html → 內容區 ───────────────────────────────────────────
function contentPre(html: string): string {
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const re = /<pre[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const s = m.index + m[0].length;
    // 這批 html 的 <pre> 沒有收尾標籤：內容到 </body> 或下一個 <pre> 為止
    let e = html.indexOf('</body>', s);
    const nx = html.indexOf('<pre', s);
    if (nx >= 0 && (e < 0 || nx < e)) e = nx;
    if (e < 0) e = html.length;
    const head = html.slice(s, s + 800);
    if (/class="?reftop"?/.test(head) || /<center class="?n"?>/.test(head) || /<center>/.test(head)) {
      let body = html.slice(s, e);
      // 每個 siri 檔最後一頁之後還有引用區（「เนื้อความ…」「http://…」），到最後一個頁腳為止
      const k = body.lastIndexOf('<small class=foot2>');
      if (k >= 0) {
        const z = body.indexOf('</small>', k);
        if (z > 0) body = body.slice(0, z + '</small>'.length);
      }
      return body;
    }
  }
  return '';
}

// ── token ──────────────────────────────────────────────────
type Tok =
  | { k: 'ctr'; cls: string; s: string }
  | { k: 'pb'; n: number }
  | { k: 'fn'; s: string }
  | { k: 'fnh' }
  | { k: 'ref' }
  | { k: 'note'; n: number }
  | { k: 'hr' }
  | { k: 'tag' }
  | { k: 'text'; s: string };

const TOKEN_SRC = [
  '<center([^>]*)>([\\s\\S]*?)</center>',
  '<small class="?foot2"?>\\{ที่มา[^}]*?หน้า\\s*:\\s*([๐-๙]+)\\}\\s*(?:&nbsp;)?\\s*</small>',
  '<small class="?atta"?>@เชิงอรรถ\\s*:</small>',
  '<small>@([\\s\\S]*?)</small>',
  '<p class="?reftop"?>[^<]*', // 有些頁的書眉 <p> 沒收尾，不能吃到下一個 </p>（會吞掉段號）
  '<sup>([๐-๙]+)-</sup>',
  '<hr>',
  '<[^>]*>',
  '([^<]+)',
].join('|');

// [๑]<a name=1></a> 先換成哨兵 \u0001數字\u0002，否則上面那條 [^<]+ 會把「[๑]」吃掉
const SEG_SRC = /\[([๐-๙]+)\]<a name="?(\d+)"?><\/a>/g;
const SEG_SPLIT = /\u0001(\d+)\u0002/g;

function* tokens(bodyRaw: string): Generator<Tok> {
  const body = bodyRaw.replace(SEG_SRC, (_m, _th: string, ar: string) => `\u0001${ar}\u0002`);
  const re = new RegExp(TOKEN_SRC, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[2] !== undefined) yield { k: 'ctr', cls: m[1] || '', s: m[2] };
    else if (m[3] !== undefined) yield { k: 'pb', n: th2int(m[3]) };
    else if (m[4] !== undefined) yield { k: 'fn', s: m[4] };
    else if (m[5] !== undefined) yield { k: 'note', n: th2int(m[5]) };
    else if (m[0] === '<hr>') yield { k: 'hr' };
    else if (m[0].startsWith('<small class=atta')) yield { k: 'fnh' };
    else if (m[0].startsWith('<p class=reftop')) yield { k: 'ref' };
    else if (m[0].startsWith('<')) yield { k: 'tag' };
    else yield { k: 'text', s: m[0] };
  }
}

function splitSeg(s: string): (string | number)[] {
  const out: (string | number)[] = [];
  let last = 0;
  SEG_SPLIT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEG_SPLIT.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(Number(m[1]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// ── 頁塊 ───────────────────────────────────────────────────
const FOOT = /<small class="?foot2"?>[^<]*หน้า\s*:\s*([๐-๙]+)[^<]*<\/small>/g;
function pageBlocks(body: string): { pg: number; html: string }[] {
  const out: { pg: number; html: string }[] = [];
  let last = 0;
  FOOT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FOOT.exec(body))) {
    out.push({ pg: th2int(m[1]), html: body.slice(last, m.index + m[0].length) });
    last = m.index + m[0].length;
  }
  return out;
}
const normHtml = (s: string) => squash(stripTags(decode(s)));
const seenPages = new Map<string, string>(); // 卷:頁 → 已收錄的頁塊（去重用）

// ── 書眉 ───────────────────────────────────────────────────
function headerLines(html: string): string[] {
  const out: string[] = [];
  const re = /<p class="?reftop"?>([^<]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(squash(decode(m[1])));
  return out;
}
function headerTitle(heads: string[], pick: 'bracket0' | 'line1'): { num: number | null; title: string } | null {
  if (pick === 'line1' && heads[1]) {
    const m = /^([๐-๙]+)\.\s*(.+)$/.exec(noNote(heads[1]));
    return m ? { num: th2int(m[1]), title: m[2] } : { num: null, title: noNote(heads[1]) };
  }
  const h = heads[0] ?? '';
  const m = /\[([๐-๙]+)\.\s*([^\]]+)\]/.exec(h);
  return m ? { num: th2int(m[1]), title: noNote(m[2]) } : null;
}

// ── 塊標題（center）──────────────────────────────────────────
const CHUNK_RE: Record<Kind, RegExp> = {
  sutta: /^([๐-๙]+)\.\s*(.+สูตร)$/,
  samyutta: /^([๐-๙]+)\.\s*(.+สังยุต)$/,
  nipata: /^อังคุตตรนิกาย\s*(.+นิบาต)$/,
};
function chunkTitleOf(kind: Kind, raw: string): { num: number | null; title: string } | null {
  const txt = noNote(squash(stripTags(decode(raw))));
  const m = CHUNK_RE[kind].exec(txt);
  if (!m) return null;
  return { num: m.length > 2 ? th2int(m[1]) : null, title: m[m.length - 1].trim() };
}

// ── 一冊的轉換狀態 ─────────────────────────────────────────
class Book {
  lines: string[] = [];
  notes: string[] = [];
  cur = '';
  block = '';
  seg = 0;
  page = 0;
  pageNotes = new Map<number, string>(); // 這一頁的註號 → pg
  prevNotes = new Map<number, string>(); // 上一頁的（注文排到下一頁時用）
  chunk = 0; // 已開的塊數（0 起算）
  curLocal: number | null = null; // 目前塊在來源裡的編號（相應部的 N，用來擋重複開塊）
  warns: string[] = [];
  nSeg = 0;
  nNote = 0;
  nFn = 0;
  pages = 0;
  lastNote = -1;
  noteRefs: string[] = [];
  noteDefs = new Set<string>();
  firstSegs = new Map<string, number>();
  segsByBlock = new Map<string, number[]>();
  srcText = '';

  pg() {
    return `${this.block}.${this.seg || 1}`;
  }
  newline() {
    const s = this.cur.replace(/[ \t]+$/, '');
    if (s.trim()) this.lines.push(s);
    this.cur = '';
  }
  pushLine(s: string) {
    if (this.cur.trim()) this.newline();
    this.lines.push(s);
  }
  append(s: string) {
    this.cur += s;
  }
  inline(src: string): string {
    let out = '';
    for (const t of tokens(src)) {
      if (t.k === 'text') {
        for (const piece of splitSeg(decode(t.s))) out += typeof piece === 'number' ? `<段 n="${piece}"/>` : esc(piece);
      } else if (t.k === 'note') {
        this.nNote++;
        this.pageNotes.set(t.n, this.pg());
        this.noteRefs.push(`${t.n}@${this.pg()}`);
        out += `<註 n="${t.n}" pg="${this.pg()}"/>`;
      }
    }
    return out;
  }
}

// ── 和緬譯對帳 ─────────────────────────────────────────────
function csmmSegs(book: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const p = `D:/2026/sz/data/cs-mm/${book}.xml`;
  if (!fs.existsSync(p)) return out;
  let cur = '';
  for (const ln of fs.readFileSync(p, 'utf8').split('\n')) {
    const b = /<塊 id="([^"]+)"/.exec(ln);
    if (b) {
      cur = b[1];
      out.set(cur, []);
    }
    if (!cur) continue;
    for (const m of ln.matchAll(/<段 n="([^"]+)"/g)) out.get(cur)!.push(...expandSeg(m[1]));
  }
  return out;
}
// cs-mm 的段號可能是範圍（`102-109`），攤平成逐號
function expandSeg(v: string): number[] {
  const m = /^(\d+)-(\d+)$/.exec(v);
  if (!m) return [Number(v)];
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// ── 輸出檢查 ───────────────────────────────────────────────
const HTML_LEFT = /<\/?(small|center|p|sup|a|font|u|b|br|hr|img|div|span)\b/i;
function lint(lines: string[], tag: string): string[] {
  const issues: string[] = [];
  lines.forEach((ln, i) => {
    const at = `${tag}:${i + 1}`;
    if (HTML_LEFT.test(ln)) issues.push(`${at} html 殘留`);
    for (const m of ln.matchAll(/&/g)) {
      if (!/^&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/.test(ln.slice(m.index))) {
        issues.push(`${at} 裸 &`);
        break;
      }
    }
    if (/[<>]/.test(ln.replace(/<[^>]*>/g, ''))) issues.push(`${at} 正文有 <>`);
    if (ln.length > 4000) issues.push(`${at} 行太長 ${ln.length}`);
    if (/[\u0001\u0002]/.test(ln)) issues.push(`${at} 哨兵殘留`);
  });
  return issues;
}

// ── 轉一本書 ───────────────────────────────────────────────
function convertBook(spec: BookSpec) {
  const bk = new Book();
  const zoneTag = spec.firstOfZone ? `<區 id="${spec.zone}" t="書." n="${ZONE_TITLE[spec.zone]}">${ZONE_TITLE[spec.zone]}</區>` : '';
  bk.lines.push(`${zoneTag}<書 id="${spec.id}" t="塊." n="${spec.title}">${spec.title}</書>`);

  const openChunk = (title: string, local: number | null = null) => {
    bk.chunk++;
    const num = spec.base + bk.chunk;
    bk.block = `${spec.zone[0]}${num}`;
    bk.seg = 0;
    bk.curLocal = local;
    // 目錄要一眼看到經號：`(14) มหาปทานสูตร`（號碼用跨庫的 m/d/s/a 編號，不是泰譯冊內號）
    bk.pushLine(`<塊 id="${bk.block}">(${num}) ${esc(title)}</塊>`);
  };

  // 增支部一本書＝一集＝一個塊：直接在開頭開塊（集名用 profiles 的 spec.title）
  if (spec.kind === 'nipata') openChunk(spec.title);

  for (const r of spec.ranges) {
    const files = fs
      .readdirSync(SRC)
      .filter((f) => new RegExp(`^0?${r.vol}-\\d+\\.html$`).test(f))
      .sort((a, b) => Number(a.match(/-(\d+)\.html$/)![1]) - Number(b.match(/-(\d+)\.html$/)![1]))
      .slice(r.from - 1, r.to);
    for (const f of files) {
      const html = fs.readFileSync(`${SRC}/${f}`, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      const body = contentPre(html);
      if (!body) {
        bk.warns.push(`${f}: 找不到內容區`);
        continue;
      }
      for (const blk of pageBlocks(body)) {
        const key = `${r.vol}:${blk.pg}`;
        const prev = seenPages.get(key);
        const text = normHtml(blk.html);
        if (prev !== undefined) {
          if (!text.includes(prev) && !prev.includes(text)) {
            bk.warns.push(`${f}: 頁 ${blk.pg} 重複但內容不同（保留先出現的）`);
          }
          continue;
        }
        seenPages.set(key, text);
        // 註號對照表一頁一份：上一頁的留著，讓排到下一頁的注文還找得到 pg
        bk.prevNotes = bk.pageNotes;
        bk.pageNotes = new Map();

        // 塊邊界：先看這一頁裡有沒有塊標題；沒有才退回書眉（只有相應部需要，
        // 因為它有幾相的標題頁在來源裡缺了。中部／長部的書眉第二行有時是「วรรค」，
        // 拿它當塊名會多開塊，所以不用。）
        const heads = headerLines(blk.html);
        const hasTitle = [...tokens(blk.html)].some((t) => t.k === 'ctr' && chunkTitleOf(spec.kind, t.s));
        if (!hasTitle && spec.kind === 'samyutta') {
          const hm = headerTitle(heads, spec.headerPick);
          if (hm && /สังยุต$/.test(hm.title) && hm.num !== bk.curLocal) openChunk(hm.title, hm.num);
        }

        for (const t of tokens(blk.html)) {
          switch (t.k) {
            case 'text': {
              for (const piece of splitSeg(decode(t.s))) {
                if (typeof piece === 'number') {
                  bk.seg = piece;
                  bk.nSeg++;
                  if (bk.block && !bk.firstSegs.has(bk.block)) bk.firstSegs.set(bk.block, piece);
                  if (bk.block) {
                    const arr = bk.segsByBlock.get(bk.block) ?? [];
                    arr.push(piece);
                    bk.segsByBlock.set(bk.block, arr);
                  }
                  if (/^\s*$/.test(bk.cur)) bk.cur = '';
                  bk.append(`<段 n="${piece}"/>`);
                } else {
                  bk.srcText += piece;
                  const parts = piece.split('\n');
                  parts.forEach((p, i) => {
                    if (i > 0) bk.newline();
                    bk.append(esc(p));
                  });
                }
              }
              break;
            }
            case 'ctr': {
              const inner = squash(stripTags(decode(t.s)));
              if (t.cls.includes('n')) break; // 版頭
              if (!inner || /^_+$/.test(inner)) break;
              const ct = chunkTitleOf(spec.kind, t.s);
              if (ct) {
                // 增支部的集名頁（อังคุตตริกาย Xนิบาต）只是一再重複書名，塊已開好，略過
                if (spec.kind === 'nipata') break;
                bk.srcText += noNote(inner);
                openChunk(ct.title, ct.num);
                break;
              }
              bk.srcText += inner;
              const tag = /วรรค$|ปัณณาสก์$/.test(inner) ? '節' : '項';
              bk.pushLine(`<${tag}>${bk.inline(squash(t.s))}</${tag}>`);
              break;
            }
            case 'note': {
              bk.nNote++;
              bk.pageNotes.set(t.n, bk.pg());
              bk.noteRefs.push(`${t.n}@${bk.pg()}`);
              bk.append(`<註 n="${t.n}" pg="${bk.pg()}"/>`);
              break;
            }
            case 'pb': {
              bk.page = t.n;
              bk.pages++;
              const i = bk.lines.length - 1;
              if (bk.cur.trim()) bk.append(`<pb n="${t.n}"/>`);
              else if (i >= 0) bk.lines[i] += `<pb n="${t.n}"/>`;
              else bk.pushLine(`<pb n="${t.n}"/>`);
              break;
            }
            case 'fn': {
              // 注文號可能是單號「๑」、帶「-」的「๑-」，或範圍「๑-๔」（一條注文管 4 個號）
              const m = /^<sup>([๐-๙]+)(?:-([๐-๙]+))?<\/sup>/.exec(t.s);
              const nums: number[] = [];
              let text = t.s;
              if (m) {
                text = t.s.slice(m[0].length);
                const a = th2int(m[1]);
                const b = m[2] ? th2int(m[2]) : a;
                for (let k = a; k <= b && k - a < 50; k++) nums.push(k);
                bk.nFn += nums.length;
              }
              const clean = squash(stripTags(decode(text))).replace(/^@\s*/, '');
              if (!clean) break;
              if (nums.length) {
                const base = bk.pageNotes.get(nums[0]) ?? bk.prevNotes.get(nums[0]) ?? bk.pg();
                for (const num of nums) {
                  const pg = bk.pageNotes.get(num) ?? bk.prevNotes.get(num) ?? base;
                  bk.notes.push(`<釋 n="${num}" pg="${pg}">${esc(clean)}</釋>`);
                  bk.noteDefs.add(`${num}@${pg}`);
                }
                bk.lastNote = bk.notes.length - 1;
              } else if (bk.lastNote >= 0) {
                const i = bk.lastNote;
                bk.notes[i] = bk.notes[i].replace(/<\/釋>$/, ` ${esc(clean)}</釋>`);
              } else {
                bk.warns.push(`${f}: 注文續行找不到上一條注（${clean.slice(0, 30)}）`);
              }
              break;
            }
            case 'ref':
            case 'fnh':
            case 'hr':
            case 'tag':
              break;
          }
        }
        bk.newline();
      }
    }
  }
  if (bk.cur.trim()) bk.newline();

  // 塊開頭標題的註：pg 先落到 `<塊>.1`，這一塊若從別的段號起，改成它的第一段
  for (const [id, first] of bk.firstSegs) {
    if (first === 1) continue;
    const fix = (s: string) => s.split(`pg="${id}.1"`).join(`pg="${id}.${first}"`);
    for (let i = 0; i < bk.lines.length; i++) bk.lines[i] = fix(bk.lines[i]);
    for (let i = 0; i < bk.notes.length; i++) bk.notes[i] = fix(bk.notes[i]);
  }

  // 收尾：去空行、切長行
  const out: string[] = [];
  let cut = 0;
  for (let ln of bk.lines) {
    ln = ln.replace(/[ \t]+$/, '');
    if (!ln.trim()) continue;
    if (ln.length > 4000) {
      cut++;
      while (ln.length > 4000) {
        let p = ln.lastIndexOf(' ', 4000);
        if (p < 2000) p = 4000;
        out.push(ln.slice(0, p));
        ln = ln.slice(p).replace(/^\s+/, '');
      }
      if (ln) out.push(ln);
    } else out.push(ln);
  }

  const lintIssues = [...lint(out, spec.id), ...lint(bk.notes, `${spec.id}-fn`)];
  fs.writeFileSync(`${OUT}/${spec.id}.xml`, out.join('\n') + '\n', 'utf8');
  fs.writeFileSync(`${OUT}/${spec.id}-fn.xml`, bk.notes.join('\n') + (bk.notes.length ? '\n' : ''), 'utf8');

  // 段序列和 cs-mm 比對：整冊的段號序列（cs-mm 的塊 id 有幾處壞掉，逐塊比不可靠）
  const refAll = [...csmmSegs(spec.id).values()].flat();
  const mineAll = [...bk.segsByBlock.values()].flat();
  const refSet = new Set(refAll);
  const missing = refAll.filter((n) => !mineAll.includes(n));
  const extra = mineAll.filter((n) => !refSet.has(n));
  const sameOrder = mineAll.every((n, i) => i === 0 || n > mineAll[i - 1]);

  const orphan = bk.noteRefs.filter((k) => !bk.noteDefs.has(k));
  const outLetters = thaiLetters(stripTags(out.slice(1).join('\n')));
  return {
    spec,
    lines: out.length,
    cut,
    segs: bk.nSeg,
    notes: bk.nNote,
    fns: bk.nFn,
    pages: bk.pages,
    chunks: bk.chunk,
    srcLetters: thaiLetters(bk.srcText),
    outLetters,
    warns: bk.warns,
    orphan,
    seg: { mine: mineAll.length, ref: refAll.length, missing: missing.length, extra: extra.length, maxMine: mineAll.at(-1) ?? 0, maxRef: refAll.at(-1) ?? 0, sameOrder },
    lint: lintIssues,
  };
}

// ── 主程式 ─────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  `${OUT}/00.xml`,
  [
    '<檔 n="cllk"><集>泰譯巴利三藏（朱拉隆功大學）</集><英文名>Thai Tipitaka (MCU)</英文名></檔>',
    '<隱><樹 s="*" t="區,書,塊.">目錄</樹></隱>',
  ].join('\n') + '\n',
  'utf8',
);

const rep: string[] = ['cllk（朱拉隆功泰譯巴利三藏）轉換報告', ''];
const results = BOOKS.map(convertBook);
for (const r of results) {
  rep.push(
    `== ${r.spec.id}（${r.spec.title}）`,
    `   塊 ${r.chunks}/${r.spec.count}　行 ${r.lines}（切行 ${r.cut}）　段 ${r.segs}　頁 ${r.pages}　註 ${r.notes}／釋 ${r.fns}`,
    `   泰文字母 來源 ${r.srcLetters} / 輸出 ${r.outLetters}${r.srcLetters === r.outLetters ? '　✓' : `　Δ${r.outLetters - r.srcLetters}`}`,
    r.orphan.length ? `   註↛釋 ${r.orphan.length}：${r.orphan.slice(0, 8).join(' ')}` : '   註↛釋 0',
    `   段序列 vs cs-mm：泰 ${r.seg.mine} 段（1..${r.seg.maxMine}）／緬 ${r.seg.ref} 段（1..${r.seg.maxRef}）；泰缺 ${r.seg.missing}、多 ${r.seg.extra}${r.seg.sameOrder ? '；遞增 ✓' : '；順序有問題 ✗'}`,
    r.lint.length ? `   結構檢查 ${r.lint.length} 筆：${r.lint.slice(0, 4).join('；')}` : '   結構檢查 0 筆　✓',
  );
  for (const w of r.warns.slice(0, 8)) rep.push(`   ! ${w}`);
  if (r.warns.length > 8) rep.push(`   ! …還有 ${r.warns.length - 8} 條`);
}
fs.writeFileSync(REPORT, rep.join('\n') + '\n', 'utf8');
console.log(rep.join('\n'));

// 書眉 fallback 用：目前塊的標題（從最後一個 <塊> 行取）
function curTitle(bk: Book): string {
  for (let i = bk.lines.length - 1; i >= 0; i--) {
    const m = /<塊 id="[^"]*">([^<]*)<\/塊>/.exec(bk.lines[i]);
    if (m) return m[1];
  }
  return '';
}
