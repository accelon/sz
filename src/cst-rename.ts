/**
 * CST 檔名 → cs 書 id（`s0201m.mul.xml` → `mn1`）。
 *
 * 原檔案是作者的 `D:\2023\cs\src\cst4rename.js`＋`newname.js`，
 * 2026-11-03 改寫成 TS 放進 repo；行為與原本一致（含 an 拆冊、jātaka 注疏多卷的特例）。
 */
const NEWNAME: Record<string, string> = {
  "vin01m": "pj",
  "vin02m1": "pc",
  "vin02m2": "mv",
  "vin02m3": "cv",
  "vin02m4": "pvr",
  "s0501m": "kp",
  "s0502m": "dhp",
  "s0503m": "ud",
  "s0504m": "iti",
  "s0505m": "snp",
  "s0506m": "vv",
  "s0507m": "pv",
  "s0508m": "thag",
  "s0509m": "thig",
  "s0510m1": "thap",
  "s0510m2": "thip",
  "s0511m": "bv",
  "s0512m": "cp",
  "s0513m": "ja1",
  "s0514m": "ja2",
  "s0515m": "mnd",
  "s0516m": "cnd",
  "s0517m": "ps",
  "s0518m": "mil",
  "s0519m": "ne",
  "s0520m": "pe",
  "abh01m": "ds",
  "abh02m": "vb",
  "abh03m1": "dt",
  "abh03m2": "pp",
  "abh03m3": "kv",
  "abh03m4": "ya1",
  "abh03m5": "ya2",
  "abh03m6": "ya3",
  "abh03m7": "pt1",
  "abh03m8": "pt2",
  "abh03m9": "pt3",
  "abh03m10": "pt4",
  "abh03m11": "pt5",
  "e0101n": "vs",
  "e0102n": "vs",
  "vin01a": "pj0a",
  "vin02a1": "pc0a",
  "vin02a2": "mv0a",
  "vin02a3": "cv0a",
  "vin02a4": "pvr0a",
  "s0501a": "kp0a",
  "s0502a": "dhp0a",
  "s0503a": "ud0a",
  "s0504a": "iti0a",
  "s0505a": "snp0a",
  "s0506a": "vv0a",
  "s0507a": "pv0a",
  "s0508a1": "thag0a1",
  "s0508a2": "thig0a2",
  "s0509a": "thig0a",
  "s0510a": "thap0a",
  "s0511a": "bv0a",
  "s0512a": "cp0a",
  "s0513a4": "ja1a",
  "s0514a3": "ja2a",
  "s0515a": "mnd0a",
  "s0516a": "cnd0a",
  "s0517a": "ps0a",
  "s0519a": "ne0a",
  "abh01a": "ds0a",
  "abh02a": "vb0a",
  "abh03a1": "dt0a",
  "abh03a2": "pp0a",
  "abh03a3": "kv0a",
  "abh03a4": "ya0a",
  "abh03a": "pt0a",
  "e0103n": "vs0a",
  "e0104n": "vs0a",
  "vin01t1": "sd0t",
  "vin01t2": "pj0t",
  "vin02t1": "pc0t",
  "vin02t3": "mv0t",
  "vin02t4": "cv0t",
  "vin02t": "pvr0t",
  "s0104t": "dn1u1",
  "s0105t": "dn1u2",
  "s0501t": "ne0t",
  "s0519t": "ne0u",
  "abh01t": "ds0t",
  "abh02t1": "vb0t",
  "abh02t": "vb0u",
  "abh03t1": "dt0t",
  "abh03t2": "pp0t",
  "abh03t3": "kv0t",
  "abh03t4": "ya0t",
  "abh03t": "pt0t",
  "abh04t": "ds0u",
  "abh05t1": "dt0u",
  "abh05t2": "pp0u",
  "abh05t3": "kv0u",
  "abh05t4": "ya0u",
  "abh05t": "pt0u",
  "abh06t": "adv",
  "abh07t": "aas",
  "abh07t1": "aas0a",
  "abh08t": "aas0u",
  "abh09t": "aas0t",
  "e0105n": "vsnk",
  "e0201n": "ndn",
  "e0301n": "pmdp",
  "e0401n": "adn",
  "e0501n": "ptdp",
  "e0601n": "nmkr",
  "e0602n": "mhmp",
  "e0608n": "bggv",
  "e0701n": "cgv",
  "e0702n": "svpd",
  "e0703n": "mvp",
  "e0801n": "mglsp",
  "e0802n": "kcybk",
  "e0901n": "stp",
  "e1001n": "kvpn",
  "e1002n": "nmjr",
  "e1101n": "rsvh",
  "e1201n": "vtsm",
  "e1202n": "tpvs",
  "vin04t": "dmtp",
  "vin05t": "vinsg",
  "vin06t": "vbt",
  "vin07t": "vvt",
  "vin08t": "vlkt",
  "vin09t": "kvpt",
  "vin10t": "vncy",
  "vin11t": "vncy0a",
  "vin12t": "pcy",
  "vin13t": "ksms",
};

const NIKAYA: Record<string, string> = { '01': 'dn', '02': 'mn', '03': 'sn', '04': 'an' };
const AN: Record<string, number> = {
  '2-1': 2, '2-2': 3, '2-3': 4, '3-1': 5, '3-2': 6, '3-3': 7, '4-1': 8, '4-2': 9, '4-3': 10, '4-4': 11,
};

/** 認不出來回空字串（原本回 undefined，呼叫端一律 `|| ''`）。 */
export function cst4rename(fn?: string): string {
  if (!fn) return '';
  if (fn === 'sample.xml') return 'sample';
  if (fn.startsWith('s')) {
    const m = /^s(\d\d)(\d\d)([mat])/.exec(fn);
    if (m) {
      const nikaya = NIKAYA[m[1]!] ?? '';
      const vol = m[2]!;
      const mat = m[3]!;
      if (nikaya && fn.charAt(6) === '.') {
        const special = NEWNAME[fn.slice(0, 6)];
        if (special) return special; // s0105t 不符規則
        return nikaya + parseInt(vol, 10) + (mat === 'm' ? '' : mat);
      }
      if (nikaya === 'an') {
        // an 的根本經拆成好幾冊
        const m2 = /^s04(\d\d)m(\d)/.exec(fn);
        const k = m2 ? AN[m2[1]!.charAt(1) + '-' + m2[2]!] : undefined;
        if (k !== undefined) return 'an' + k;
      } else if (m[1] === '05' && (vol === '13' || vol === '14')) {
        // jātaka 注疏有多卷
        return 'ja' + (parseInt(vol, 10) - 12) + (mat !== 'm' ? mat : '') + fn.charAt(6).replace('.', '');
      }
    }
  }
  return NEWNAME[fn.slice(0, 8)] ?? NEWNAME[fn.slice(0, 7)] ?? NEWNAME[fn.slice(0, 6)] ?? '';
}
