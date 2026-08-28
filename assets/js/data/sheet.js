/* ═══════════════════════════════════════════════════════════════
   sheet.js — 남이 만든 표를 읽는다

   이 사이트의 다른 모든 숫자는 야후나 거래소에서 온다. 그런데 정작
   자기 돈이 어디 있는지는 대개 다른 곳에 적혀 있다 — 퇴직연금 명세서,
   펀드 기준가 이력, 증권사가 내려 준 거래내역, 손으로 적은 엑셀.

   그것들을 여기로 들여올 수 있으면, 지금까지 만들어 둔 분석 기계를
   그대로 자기 숫자에 걸 수 있다.

   ── 무엇을 읽나 ──
     .csv .tsv .txt   글자 그대로
     .json            배열이거나 {열: [값]}
     .xlsx            엑셀 (2007 이후)

   ── .xls 는 왜 안 읽나 ──
   옛 엑셀은 완전히 다른 이진 형식이고, 그것을 읽으려면 라이브러리가
   필요하다. 이 사이트에는 빌드 도구가 없어 라이브러리를 넣을 수 없다.
   엑셀에서 '다른 이름으로 저장 → xlsx' 한 번이면 되므로, 못 읽는다고
   또렷이 말하고 그 길을 알려 주는 편이 낫다.

   ── xlsx 는 어떻게 라이브러리 없이 읽나 ──
   xlsx 는 사실 zip 이고, 안에 든 것은 XML 이다. 브라우저에 압축을 푸는
   기계가 이미 들어 있다 (DecompressionStream). zip 의 목차를 손으로
   읽고, 꺼낸 XML 은 DOMParser 로 읽는다. 그러면 아무것도 안 받아도 된다.

   ── 이 파일은 바깥으로 아무것도 보내지 않는다 ──
   올린 파일은 브라우저 안에서만 열린다. 서버가 없으니 보낼 곳도 없다.
   퇴직연금 명세서를 올려도 그 숫자는 이 컴퓨터를 떠나지 않는다.
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════ 들머리 ═══════════════════ */

/**
 * 파일 하나를 표로 읽는다.
 * @returns {Promise<{sheets:{name:string, rows:any[][]}[], kind:string}>}
 */
export async function read(file) {
  const name = (file.name || '').toLowerCase();

  if (/\.xlsx$/.test(name)) return { kind: 'xlsx', sheets: await readXlsx(file) };
  if (/\.xls$/.test(name)) {
    throw new Error(
      '옛 엑셀(.xls)은 읽지 못합니다. 엑셀에서 열고 '
      + '「다른 이름으로 저장 → Excel 통합 문서(.xlsx)」 또는 「CSV」로 바꿔 주십시오.');
  }
  if (/\.json$/.test(name)) {
    return { kind: 'json', sheets: [{ name: '자료', rows: readJson(await file.text()) }] };
  }

  const text = await readText(file);
  return { kind: 'text', sheets: [{ name: file.name || '자료', rows: readDelimited(text) }] };
}

/* ═══════════════════ 글자 파일 ═══════════════════

   ── 한글이 깨지는 문제 ──
   국내 증권사가 내려 주는 CSV 는 아직도 EUC-KR 인 것이 많다. UTF-8 로
   읽으면 종목명이 통째로 깨진다.

   먼저 UTF-8 로 읽어 보고, 깨진 글자가 눈에 띄게 섞이면 EUC-KR 로 다시
   읽어 견준다. 어느 쪽이 덜 깨졌는지를 보고 고른다. */
async function readText(file) {
  const buf = await file.arrayBuffer();

  const utf8 = new TextDecoder('utf-8').decode(buf);
  const broken = (utf8.match(/�/g) || []).length;
  if (broken === 0) return utf8;

  // 깨진 것이 전체의 0.1% 도 안 되면 그냥 이상한 글자 하나였던 것이다
  if (broken / Math.max(utf8.length, 1) < 0.001) return utf8;

  try {
    const kr = new TextDecoder('euc-kr').decode(buf);
    if ((kr.match(/�/g) || []).length < broken) return kr;
  } catch (e) { /* 이 브라우저는 euc-kr 을 모른다 */ }

  return utf8;
}

/* 무엇으로 나뉘어 있나 — 쉼표인가 탭인가 세로줄인가.

   첫 몇 줄에서 각 후보가 몇 번 나오는지 세고, 줄마다 개수가 가장
   고른 것을 고른다. 개수만 보면 글 안에 든 쉼표에 속는다. */
function sniff(lines) {
  const cands = [',', '\t', ';', '|'];
  let best = ',', bestScore = -Infinity;

  for (const d of cands) {
    const counts = lines.map((l) => l.split(d).length - 1).filter((n) => n > 0);
    if (!counts.length) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const spread = counts.reduce((a, b) => a + Math.abs(b - avg), 0) / counts.length;
    // 많이 나오되 줄마다 고른 것
    const score = avg - spread * 3;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/**
 * 쉼표로 나뉜 글을 표로.
 * 따옴표 안의 쉼표와 줄바꿈을 지킨다 — 이것을 안 하면 종목명이나
 * 적요가 든 칸에서 표가 통째로 어긋난다.
 */
export function readDelimited(text, delim) {
  const clean = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const d = delim || sniff(clean.split('\n').slice(0, 20).filter(Boolean));

  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];

    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++; }   // "" 는 따옴표 하나
        else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"' && cell === '') { quoted = true; continue; }
    if (c === d) { row.push(cell); cell = ''; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  // 끝의 빈 줄을 턴다
  while (rows.length && rows[rows.length - 1].every((x) => !String(x).trim())) rows.pop();
  return rows.map((r) => r.map((x) => x.trim()));
}

/* ═══════════════════ JSON ═══════════════════ */

function readJson(text) {
  const data = JSON.parse(text);

  // [{a:1,b:2}, …] — 가장 흔한 모양
  if (Array.isArray(data) && data.length && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    const keys = [...new Set(data.flatMap((o) => Object.keys(o || {})))];
    return [keys, ...data.map((o) => keys.map((k) => o?.[k] ?? ''))];
  }
  // [[…], […]] — 이미 표다
  if (Array.isArray(data) && Array.isArray(data[0])) return data;

  // {a:[…], b:[…]} — 열마다 배열
  if (data && typeof data === 'object') {
    const keys = Object.keys(data).filter((k) => Array.isArray(data[k]));
    if (keys.length) {
      const n = Math.max(...keys.map((k) => data[k].length));
      const rows = [keys];
      for (let i = 0; i < n; i++) rows.push(keys.map((k) => data[k][i] ?? ''));
      return rows;
    }
  }
  throw new Error('이 JSON 은 표로 펼 수 없습니다. 배열이거나 {열 이름: [값들]} 이어야 합니다.');
}

/* ═══════════════════ zip ═══════════════════

   xlsx 는 zip 이다. 목차(central directory)를 뒤에서부터 찾아 읽고,
   필요한 파일만 꺼낸다.

   ── 왜 목차를 뒤에서 찾나 ──
   zip 은 끝에 목차의 위치를 적어 둔다. 앞에서부터 훑으면 파일마다
   머리를 읽어야 하는데, 그러면 압축된 몸통 길이를 미리 알 수 없는
   경우(스트리밍으로 쓴 zip)에 걸려 넘어진다. 엑셀이 그렇게 쓴다. */

async function unzip(file, want) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);

  // 끝 기록(EOCD)을 뒤에서 찾는다. 주석이 붙을 수 있어 조금 거슬러 올라간다.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('엑셀 파일로 보이지 않습니다 (zip 이 아닙니다).');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);       // 목차가 시작하는 자리

  const found = new Map();
  const dec = new TextDecoder('utf-8');

  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));

    if (want(name)) found.set(name, { method, csize, local });
    p += 46 + nameLen + extraLen + cmtLen;
  }

  const out = new Map();
  for (const [name, e] of found) {
    // 몸통은 지역 머리 뒤에 온다. 지역 머리의 이름·덤 길이는 목차의 것과
    // 다를 수 있으므로 반드시 여기서 다시 읽는다.
    const nameLen = dv.getUint16(e.local + 26, true);
    const extraLen = dv.getUint16(e.local + 28, true);
    const start = e.local + 30 + nameLen + extraLen;
    const body = buf.subarray(start, start + e.csize);

    if (e.method === 0) { out.set(name, dec.decode(body)); continue; }
    if (e.method !== 8) throw new Error('압축 방식을 모릅니다 (' + e.method + ').');

    if (typeof DecompressionStream !== 'function') {
      throw new Error('이 브라우저는 압축을 풀지 못합니다. CSV 로 바꿔 올려 주십시오.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([body]).stream().pipeThrough(ds);
    out.set(name, await new Response(stream).text());
  }
  return out;
}

/* ═══════════════════ xlsx ═══════════════════ */

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');

/* 엑셀은 날짜를 숫자로 적는다 (2026-08-28 → 46262). 그 숫자가 날짜인지는
   서식(styles.xml)을 봐야만 안다. 이것을 안 보면 명세서의 날짜 열이
   통째로 다섯 자리 숫자로 나오고, 그러면 시계열 분석을 걸 수 없다.

   14~22, 45~47 은 엑셀이 미리 정해 둔 날짜·시각 서식이다. 그 밖의
   것은 서식 글자에 y·m·d 가 들어 있는지로 가린다. */
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function dateStyles(stylesXml) {
  const set = new Set();
  if (!stylesXml) return set;
  const doc = xml(stylesXml);

  const custom = new Set();
  for (const f of doc.getElementsByTagName('numFmt')) {
    const id = +f.getAttribute('numFmtId');
    // 대괄호 안(색·조건)과 따옴표 안(붙박이 글자)은 서식이 아니다
    const code = (f.getAttribute('formatCode') || '').replace(/\[[^\]]*\]|"[^"]*"/g, '');
    if (/[ymd]/i.test(code)) custom.add(id);
  }

  const xfs = doc.getElementsByTagName('cellXfs')[0];
  if (!xfs) return set;
  let i = 0;
  for (const xf of xfs.getElementsByTagName('xf')) {
    const id = +xf.getAttribute('numFmtId');
    if (BUILTIN_DATE.has(id) || custom.has(id)) set.add(i);
    i++;
  }
  return set;
}

/* 엑셀의 날짜 셈은 1899-12-30 을 0일로 잡는다.
   (1900년을 윤년으로 잘못 아는 옛 버그 때문에 12-31 이 아니라 12-30 이다) */
const XL_EPOCH = Date.UTC(1899, 11, 30);
const fromSerial = (n) => new Date(XL_EPOCH + Math.round(n * 86_400_000));

/** A1 → {col:0, row:0} */
function cellRef(r) {
  const m = /^([A-Z]+)(\d+)$/.exec(r || '');
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: +m[2] - 1 };
}

async function readXlsx(file) {
  const files = await unzip(file, (n) =>
    n === 'xl/sharedStrings.xml' || n === 'xl/styles.xml' || n === 'xl/workbook.xml'
    || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));

  // 공유 문자열 — 엑셀은 같은 글자를 한 번만 적고 번호로 가리킨다
  const shared = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) {
    for (const si of xml(ss).getElementsByTagName('si')) {
      // <si> 안에 <t> 가 여럿일 수 있다 (글자마다 서식이 다를 때)
      shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
    }
  }

  const dates = dateStyles(files.get('xl/styles.xml'));

  // 장 이름
  const names = new Map();
  const wb = files.get('xl/workbook.xml');
  if (wb) {
    let i = 1;
    for (const sh of xml(wb).getElementsByTagName('sheet')) {
      names.set('xl/worksheets/sheet' + i + '.xml', sh.getAttribute('name') || ('장 ' + i));
      i++;
    }
  }

  const sheets = [];
  const paths = [...files.keys()]
    .filter((n) => /worksheets/.test(n))
    .sort((a, b) => (+a.match(/(\d+)/)[1]) - (+b.match(/(\d+)/)[1]));

  for (const path of paths) {
    const doc = xml(files.get(path));
    const rows = [];

    for (const row of doc.getElementsByTagName('row')) {
      const out = [];
      for (const c of row.getElementsByTagName('c')) {
        const at = cellRef(c.getAttribute('r'));
        const t = c.getAttribute('t');
        const vEl = c.getElementsByTagName('v')[0];
        let v = '';

        if (t === 'inlineStr') {
          v = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
        } else if (t === 's') {
          v = shared[+(vEl?.textContent || 0)] ?? '';
        } else if (t === 'e') {
          v = '';                                  // #N/A 같은 것 — 빈 칸으로 둔다
        } else if (vEl) {
          const raw = vEl.textContent;
          const s = +(c.getAttribute('s') || 0);
          v = (dates.has(s) && raw !== '' && isFinite(+raw) && +raw > 1)
            ? fromSerial(+raw).toISOString().slice(0, 10)
            : raw;
        }

        if (at) { while (out.length < at.col) out.push(''); out[at.col] = v; }
        else out.push(v);
      }
      rows.push(out);
    }

    // 통째로 빈 줄은 턴다 (엑셀은 손댄 적 있는 줄을 다 적어 둔다)
    while (rows.length && rows[rows.length - 1].every((x) => x === '' || x == null)) rows.pop();
    if (rows.length) sheets.push({ name: names.get(path) || path, rows });
  }

  if (!sheets.length) throw new Error('빈 엑셀 파일입니다.');
  return sheets;
}

/* ═══════════════════ 표를 열로 ═══════════════════

   읽어 온 것은 글자 격자일 뿐이다. 여기서 "이 열은 날짜, 저 열은 숫자"
   를 정한다. 그것이 정해져야 그릴 수 있고 셀 수 있다.

   ── 머리줄이 있나 없나 ──
   첫 줄이 죄다 글자이고 둘째 줄부터 숫자가 섞이면 머리줄로 본다.
   틀릴 수 있으므로 화면에서 손으로 뒤집을 수 있게 해 두었다. */

export function shape(rows, { header = 'auto' } = {}) {
  if (!rows?.length) return { cols: [], n: 0, hasHeader: false };

  const width = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => { const c = r.slice(); while (c.length < width) c.push(''); return c; });

  let hasHeader;
  if (header === 'auto') {
    const first = grid[0];
    const rest = grid.slice(1, 12);
    const firstNumeric = first.filter((x) => looksNumber(x)).length;
    const restNumeric = rest.length
      ? rest.reduce((a, r) => a + r.filter((x) => looksNumber(x)).length, 0) / rest.length
      : 0;
    hasHeader = grid.length > 1 && firstNumeric < restNumeric && firstNumeric <= width / 3;
  } else hasHeader = !!header;

  const names = hasHeader
    ? grid[0].map((x, i) => String(x).trim() || colName(i))
    : grid[0].map((_, i) => colName(i));
  const body = hasHeader ? grid.slice(1) : grid;

  const cols = names.map((name, i) => {
    const raw = body.map((r) => r[i]);
    const type = guessType(raw);
    return { name: dedupe(name, names, i), type, raw, values: cast(raw, type) };
  });

  return { cols, n: body.length, hasHeader };
}

const colName = (i) => {
  let s = '', n = i + 1;
  while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); }
  return s + '열';
};

// 이름이 겹치면 뒤엣것에 번호를 붙인다 — 안 그러면 열을 고를 때 헷갈린다
function dedupe(name, all, i) {
  const before = all.slice(0, i).filter((x) => x === name).length;
  return before ? name + ' (' + (before + 1) + ')' : name;
}

/* 숫자로 보이나.

   국내 자료에는 천 단위 쉼표, 원화 기호, 괄호 음수(회계에서 쓴다),
   퍼센트가 흔하다. 그것들을 벗겨 내고도 숫자면 숫자로 본다. */
export function toNumber(x) {
  if (typeof x === 'number') return isFinite(x) ? x : null;
  let s = String(x ?? '').trim();
  if (!s) return null;

  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }        // (1,234) 은 −1234

  s = s.replace(/[,\s₩$€£¥%]/g, '').replace(/원$/, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;

  return parseFloat(s) * sign;
}

const looksNumber = (x) => toNumber(x) != null;

/* 날짜로 보이나.

   Date 하나만 믿으면 안 된다 — new Date('3') 도 통과한다. 모양을 먼저
   보고, 그 다음에 실제로 읽는다.

   ── 구분자를 왜 둘 다 따지나 ──
   처음에는 구분자를 각각 있어도 되고 없어도 되게 두었다. 그랬더니
   기준가 1002.53 이 '1002년 5월 3일' 로 읽혔다 — 1002 · . · 5 · (없음)
   · 3 으로 갈라진 것이다. 그 열은 통째로 날짜가 되어 그래프에서 사라졌다.

   날짜는 구분자를 섞어 쓰지 않는다. 그러니 첫 번째와 두 번째가 같아야
   하고(\2), 아니면 아예 여덟 자리로 붙어 있어야 한다. 값이 소수점을
   가진 숫자면 이 두 문에 걸리지 않는다.

   ── 해를 왜 가두나 ──
   1002년이나 9999년짜리 명세서는 없다. 가둬 두면 남은 오해가 줄어든다. */

const okYear = (y) => y >= 1900 && y <= 2200;
const okMD = (mo, da) => mo >= 1 && mo <= 12 && da >= 1 && da <= 31;

export function toDate(x) {
  if (x instanceof Date) return isFinite(+x) ? x : null;
  const s = String(x ?? '').trim();
  if (!s) return null;

  // 2026-08-28 · 2026/08/28 · 2026.08.28 — 구분자가 둘 다 같아야 한다
  let m = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?!\d)/.exec(s);
  if (m && okYear(+m[1]) && okMD(+m[3], +m[4])) {
    return new Date(Date.UTC(+m[1], +m[3] - 1, +m[4]));
  }
  // 20260828 — 붙여 쓴 것은 여덟 자리 딱 그것뿐
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m && okYear(+m[1]) && okMD(+m[2], +m[3])) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  // 08/28/2026 — 미국식. 앞이 12를 넘으면 일·월로 뒤집어 본다.
  m = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})(?!\d)/.exec(s);
  if (m && okYear(+m[4])) {
    let mo = +m[1], da = +m[3];
    if (mo > 12 && da <= 12) { const t = mo; mo = da; da = t; }
    if (okMD(mo, da)) return new Date(Date.UTC(+m[4], mo - 1, da));
  }
  // 2026년 8월 28일
  m = /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(s);
  if (m && okYear(+m[1]) && okMD(+m[2], +m[3])) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }

  return null;
}

function guessType(raw) {
  const seen = raw.filter((x) => String(x ?? '').trim() !== '');
  if (!seen.length) return 'empty';

  const nums = seen.filter(looksNumber).length;
  const dates = seen.filter((x) => toDate(x)).length;

  // 날짜를 먼저 본다 — 20260828 은 숫자로도 읽히기 때문이다
  if (dates / seen.length >= 0.8) return 'date';
  if (nums / seen.length >= 0.8) return 'number';
  return 'text';
}

function cast(raw, type) {
  if (type === 'number') return raw.map(toNumber);
  if (type === 'date') return raw.map((x) => toDate(x));
  return raw.map((x) => (x == null ? '' : String(x)));
}
