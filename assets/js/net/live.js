/* ═══════════════════════════════════════════════════════════════
   live.js — 진짜로 흐르는 시세

   지금까지 이 사이트는 90초마다 다시 물었다. 그것이 정적 사이트가
   낼 수 있는 정직한 최선이라고 적어 두었는데, 틀렸다.

   웹소켓은 CORS 를 타지 않는다. 브라우저가 남의 서버에 곧바로 소켓을
   열 수 있고, 야후는 그 소켓으로 시세를 밀어 준다. 서버도 열쇠도
   필요 없다. 한국 종목도 온다 — 장중에 2초에 한 번씩.

   ── 받는 모양 ──
   {"type":"pricing","message":"<base64 protobuf>"}

   protobuf 라이브러리를 들이지 않는다. 읽어야 할 것이 열 몇 필드라
   직접 푸는 편이 가볍고, 이 사이트의 방침이기도 하다.

     1  기호        2  값(float32)     z3 시각(sint64, 지그재그)
     4  통화        5  거래소          8  등락률
     z9 거래량      10 고가            11 저가
     12 등락폭      15 시가            16 전일 종가

   ── 왜 이것이 조심스러운가 ──
   흐르는 숫자는 사람을 붙든다. 그래서 값이 바뀔 때마다 화면을 흔들지
   않는다. 들어오는 것은 다 받되 화면은 초에 한 번만 고친다. 그리고
   장이 닫혀 있으면 아무것도 오지 않으므로, 안 온다고 고장이 아니다.
   ═══════════════════════════════════════════════════════════════ */

import { emit } from '../core/bus.js';

const URL = 'wss://streamer.finance.yahoo.com/?version=2';

/** 화면을 얼마나 자주 고칠 것인가. 들어오는 것은 다 받는다. */
const PAINT_MS = 1000;

/** 끊겼을 때 다시 붙기까지 — 늘려 가며 기다린다 */
const BACKOFF = [1000, 3000, 8000, 20_000, 60_000];

export class Live {
  constructor() {
    this.ws = null;
    this.want = new Set();      // 지켜보기로 한 기호
    this.last = new Map();      // 기호 → 마지막으로 받은 것
    this.dirty = new Set();     // 그새 바뀐 것
    this.tries = 0;
    this.on = false;
    this.timer = 0;
    this.at = 0;                // 마지막으로 무언가 받은 때
  }

  /* ─────────────── 열고 닫기 ─────────────── */

  start(symbols = []) {
    this.on = true;
    for (const s of symbols) this.want.add(s);
    this.#connect();
    this.#paintLoop();
  }

  stop() {
    this.on = false;
    clearTimeout(this.timer);
    clearInterval(this.painter);
    try { this.ws?.close(); } catch { /* 이미 닫혔다 */ }
    this.ws = null;
    emit('live:state', { state: 'off' });
  }

  /** 지켜볼 것을 갈아 끼운다 */
  watch(symbols) {
    const next = new Set(symbols);
    const add = [...next].filter((s) => !this.want.has(s));
    const drop = [...this.want].filter((s) => !next.has(s));
    this.want = next;

    if (this.ws?.readyState !== 1) return;
    if (drop.length) this.ws.send(JSON.stringify({ unsubscribe: drop }));
    if (add.length) this.ws.send(JSON.stringify({ subscribe: add }));
  }

  #connect() {
    if (!this.on) return;
    try { this.ws?.close(); } catch { /* 무시 */ }

    emit('live:state', { state: 'connecting' });

    let ws;
    try { ws = new WebSocket(URL); } catch { this.#retry(); return; }
    this.ws = ws;

    ws.onopen = () => {
      this.tries = 0;
      if (this.want.size) ws.send(JSON.stringify({ subscribe: [...this.want] }));
      emit('live:state', { state: 'open' });
    };

    ws.onmessage = (e) => {
      let j;
      try { j = JSON.parse(e.data); } catch { return; }
      if (j.type !== 'pricing' || !j.message) return;

      const q = parse(j.message);
      if (!q?.symbol) return;

      // 오래된 것이 뒤늦게 오는 일이 있다. 뒤로 가지 않는다.
      const prev = this.last.get(q.symbol);
      if (prev && q.at && prev.at && q.at < prev.at) return;

      this.last.set(q.symbol, { ...prev, ...q });
      this.dirty.add(q.symbol);
      this.at = Date.now();
    };

    ws.onclose = () => { if (this.on) this.#retry(); };
    ws.onerror = () => { /* onclose 가 따라온다 */ };
  }

  #retry() {
    if (!this.on) return;
    emit('live:state', { state: 'retry', tries: this.tries });
    const wait = BACKOFF[Math.min(this.tries, BACKOFF.length - 1)];
    this.tries += 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.#connect(), wait);
  }

  /* ── 화면은 초에 한 번만 ──
     값이 바뀔 때마다 고치면 화면이 떨린다. 떨리는 화면은 읽히지 않고,
     읽히지 않는 숫자는 없는 숫자다. */
  #paintLoop() {
    clearInterval(this.painter);
    this.painter = setInterval(() => {
      if (!this.dirty.size) return;
      const rows = [...this.dirty].map((s) => this.last.get(s)).filter(Boolean);
      this.dirty.clear();
      emit('live:tick', { rows, at: this.at });
    }, PAINT_MS);
  }

  /** 지금 살아 있나 — 머리띠의 불빛이 이것을 본다 */
  get state() {
    if (!this.on) return 'off';
    if (this.ws?.readyState !== 1) return 'connecting';
    // 장이 닫혀 있으면 아무것도 안 온다. 그것은 고장이 아니다.
    if (!this.at) return 'quiet';
    return Date.now() - this.at < 90_000 ? 'live' : 'quiet';
  }

  get(symbol) { return this.last.get(symbol) || null; }
}

/* ═══════════════════ protobuf 풀기 ═══════════════════

   야후가 보내는 것은 PricingData 한 덩이다. 라이브러리를 들이지 않고
   필요한 필드만 읽는다 — 읽을 것이 열 몇이라 그 편이 가볍다.

   와이어 타입은 넷만 쓴다.
     0  varint (정수 · 지그재그 정수)
     1  64비트 (double)
     2  길이가 앞에 붙은 것 (문자열)
     5  32비트 (float)

   모르는 필드는 건너뛴다. 야후가 필드를 더해도 안 깨진다. */

export function parse(b64) {
  let bytes;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return null; }

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const f = {};
  let i = 0;

  const varint = () => {
    let r = 0n, s = 0n;
    while (i < bytes.length) {
      const b = bytes[i++];
      r |= BigInt(b & 0x7f) << s;
      if (!(b & 0x80)) break;
      s += 7n;
    }
    return r;
  };
  // 지그재그: 부호 있는 정수를 부호 없는 것으로 접어 보낸 것
  const zig = (v) => Number((v >> 1n) ^ -(v & 1n));

  while (i < bytes.length) {
    const key = Number(varint());
    const num = key >> 3;
    const wire = key & 7;

    if (wire === 0) {
      const raw = varint();
      f[num] = Number(raw);
      f['z' + num] = zig(raw);
    } else if (wire === 5) {
      if (i + 4 > bytes.length) break;
      f[num] = dv.getFloat32(i, true); i += 4;
    } else if (wire === 1) {
      if (i + 8 > bytes.length) break;
      f[num] = dv.getFloat64(i, true); i += 8;
    } else if (wire === 2) {
      const n = Number(varint());
      if (i + n > bytes.length) break;
      f[num] = new TextDecoder().decode(bytes.subarray(i, i + n)); i += n;
    } else {
      break;                      // 모르는 와이어 타입 — 여기서 멈춘다
    }
  }

  if (!f[1]) return null;

  return {
    symbol: f[1],
    price: num(f[2]),
    at: f.z3 || null,
    currency: f[4] || null,
    exchange: f[5] || null,
    changePct: num(f[8]),
    volume: f.z9 ?? null,
    dayHigh: num(f[10]),
    dayLow: num(f[11]),
    change: num(f[12]),
    open: num(f[15]),
    prev: num(f[16]),
    // 7 은 장중/장전/장후. 1이 정규장이다.
    session: f.z7 === -1 || f[7] === 1 ? 'regular' : 'other',
  };
}

const num = (v) => (Number.isFinite(v) ? v : null);
