/* ═══════════════════════════════════════════════════════════════
   yuria.js — 부르지 않으면 나타나지 않는 것

   유리아는 한 번 걷어 냈다. 그때 걷어 낸 것은 '비서' 였다 — 늘 곁에
   있으면서 묻지도 않은 것을 말하고, 화면의 주인공 자리를 숫자에게서
   빼앗던 것. 그 판단은 지금도 옳다.

   여기서 되살린 것은 규칙이 하나다.

     스스로 나타나지 않는다. 부를 일이 생겼을 때만 나타난다.

   ── 부를 일 넷 ──
     surge   시장이 갑자기 크게 움직였다
     rule    내가 걸어 둔 규칙이 오늘 걸렸다
     filing  급한 공시가 떴다
     open    하루의 첫 방문 — 간밤에 무슨 일이 있었나

   넷 다 "내가 미리 정해 두었거나, 정말로 드문 일" 이다. 그 밖의
   것으로는 나타나지 않는다.

   ── 왜 사람 모양이어야 하나 ──
   숫자로 띄우면 사람은 안 본다. 이 화면은 이미 숫자로 가득하고, 숫자
   하나가 더 켜지는 것은 배경이 된다. 움직이는 사람 모양은 곁눈에도
   걸린다 — 그것이 이 그림이 여기서 하는 유일한 일이다.

   ── 네모가 없어야 한다 ──
   원본은 흰 종이에 그린 먹이라 그대로 얹으면 흰 판이 뜬다. 그러면
   '사람이 나타난 것' 이 아니라 '그림이 뜬 것' 이 되고, 그 순간 이
   장치가 하려던 일이 통째로 무너진다.

   그래서 SVG 필터(#yuriaCut)로 진짜로 오려 낸다. 밝기를 뒤집어 알파로
   삼으면 먹만 남고 종이는 비어 버린다. 색은 옅은 청백으로 고정한다 —
   화면이 어두우므로 먹빛 그대로 두면 어둠에 묻힌다.

   판도 테두리도 없다. 글자는 그림 곁에 떠 있고, 그 뒤에는 아주 옅은
   빛만 깐다. 읽히되 상자가 되지 않을 만큼만.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, calmly } from '../core/dom.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';
import { pct } from '../core/fmt.js';

const MEDIA = 'assets/media/ink/';
const CALM = Array.from({ length: 12 }, (_, i) => `calm-${String(i + 1).padStart(2, '0')}`);
const WILD = Array.from({ length: 12 }, (_, i) => `wild-${String(i + 1).padStart(2, '0')}`);

/** 부를 일마다의 결 */
export const KINDS = {
  surge:  { ko: '갑자기 움직였습니다', wild: true,  cool: 60 * 60_000 },
  rule:   { ko: '걸어 두신 규칙입니다', wild: false, cool: 12 * 60 * 60_000 },
  filing: { ko: '공시가 떴습니다',      wild: true,  cool: 6 * 60 * 60_000 },
  open:   { ko: '간밤에',              wild: false, cool: 20 * 60 * 60_000 },
};

/** 머무는 시간 — 부를 일마다 다르다. 읽을 것이 길면 오래 둔다. */
const LIVE_MS = { surge: 7000, rule: 9000, filing: 9000, open: 11_000 };

export class Yuria {
  /** @param {{onOpen:(ev)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#yuria');
    this.said = new Map();      // 열쇠 → 마지막으로 나타난 때
    this.timer = 0;
  }

  get enabled() { return store.get('yuria') !== false; }

  /**
   * 나타난다.
   *
   * @param {{
   *   kind: 'surge'|'rule'|'filing'|'open',
   *   symbol?: string, ko?: string,
   *   head: string,           굵게 뜨는 한 줄
   *   why?: string,           그 아래 설명
   *   hint?: string,          눌렀을 때 무슨 일이 나는지
   *   sigma?: number,
   *   tone?: 'up'|'down'|''
   * }} ev
   */
  show(ev) {
    if (!this.enabled || !this.host || !ev?.head) return false;

    const kind = KINDS[ev.kind] || KINDS.surge;
    const key = ev.kind + '|' + (ev.symbol || '');
    const last = this.said.get(key) || 0;
    if (Date.now() - last < kind.cool) return false;
    this.said.set(key, Date.now());

    // 이미 하나 떠 있으면 밀어내고 새것을 건다. 둘이 겹치면 어느 쪽을
    // 말하는지 알 수 없다.
    this.hide(true);

    /* 격한 쪽(wild)은 정말 드물 때만. 늘 격하면 격한 것이 예사가 되고,
       예사가 되면 알림이 아니라 무늬가 된다. */
    const wild = kind.wild && Math.abs(ev.sigma || 0) >= 4;
    const clip = pick(wild ? WILD : CALM);

    const film = el('video.yuria__film', {
      muted: true, playsinline: true, loop: true,
      preload: 'auto', disablepictureinpicture: true,
      poster: `${MEDIA}poster/${clip}.jpg`,
      src: `${MEDIA}${clip}.mp4`,
    });

    const tone = ev.tone || '';
    const node = el('div.yuria', {
      class: [tone ? 'is-' + tone : '', wild ? 'is-wild' : '', 'is-' + ev.kind]
        .filter(Boolean).join(' '),
      role: 'alert',
      onclick: () => { this.hooks.onOpen?.(ev); this.hide(); },
    }, [
      /* 판도 테두리도 없다. 오려 낸 그림 하나가 떠 있을 뿐이다.

         잔잔한 쪽(calm)은 세로 236×314, 격한 쪽(wild)은 가로 314×236 이다.
         격자를 자를 때 행과 열이 달랐기 때문인데, 한 틀에 우겨 넣으면
         cover 가 옆을 잘라 사람이 반쪽이 된다. 틀을 그림에 맞춘다. */
      el('div.yuria__art', { class: wild ? 'is-wide' : '' }, [film]),
      el('div.yuria__say', [
        el('span.yuria__kind', { text: kind.ko }),
        el('b.yuria__head', { text: ev.head }),
        ev.why ? el('span.yuria__why', { text: ev.why }) : null,
        el('span.yuria__hint', { text: ev.hint || '눌러서 보기' }),
      ]),
      el('button.yuria__x', {
        type: 'button', 'aria-label': '닫기',
        onclick: (e) => { e.stopPropagation(); this.hide(); },
      }, '×'),
    ]);

    this.host.appendChild(node);
    this.node = node;

    // 다음 그림 프레임이 아니라 시간으로 켠다 — 창이 뒤에 있으면
    // 그림 프레임이 오지 않아 스민 채로 멈춘다
    setTimeout(() => node.classList.add('is-in'), 20);
    film.play?.().catch(() => { /* 자동 재생을 막는 브라우저 — 포스터만 */ });

    emit('yuria:shown', ev);

    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), LIVE_MS[ev.kind] || 7000);
    return true;
  }

  hide(now = false) {
    clearTimeout(this.timer);
    const node = this.node;
    if (!node) return;
    this.node = null;

    if (now || calmly()) { node.remove(); return; }
    node.classList.remove('is-in');
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 900);
  }

  get showing() { return !!this.node; }

  forget() { this.said.clear(); }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ═══════════════════ 무엇을 급변으로 보나 ═══════════════════

   그냥 "3% 넘으면" 으로 자르지 않는다. 코스피가 3% 움직이는 것과
   비트코인이 3% 움직이는 것은 전혀 다른 일이다. 코스피에게 3% 는
   한 해에 몇 번이고, 비트코인에게는 화요일이다.

   그래서 그 종목이 평소 하루에 얼마나 흔들렸는지(표준편차)로 나눈다.

   ── 왜 최근 것만 보나 ──
   두 해치로 재면 요즘 잠잠해진 것이 안 잡힌다. 최근 예순 날로 재야
   "요즘 기준으로 드문가" 를 묻게 되고, 그것이 사람이 실제로 느끼는
   놀람에 가깝다.

   ── 하루치와 순간치를 따로 본다 ──
   장중에 오는 값은 '오늘 여기까지' 의 등락이다. 그것이 큰 것과 방금
   몇 분 사이에 튄 것은 다른 일이다. 앞엣것만 보면 아침에 한 번 벌어진
   일로 종일 알린다.
*/

export class Watchdog {
  constructor(cfg = {}) {
    this.sigmaAt = cfg.sigma ?? 3;
    this.minPct = cfg.minPct ?? 1.2;
    this.jumpAt = cfg.jumpSigma ?? 3.5;
    this.sd = new Map();
    this.seen = new Map();
  }

  learn(series) {
    for (const s of series || []) {
      const bars = s.bars;
      if (!bars || bars.length < 25) continue;
      const use = bars.slice(-60);
      const rs = [];
      for (let i = 1; i < use.length; i++) {
        if (use[i - 1].c > 0) rs.push((use[i].c / use[i - 1].c - 1) * 100);
      }
      if (rs.length < 20) continue;
      const m = rs.reduce((a, b) => a + b, 0) / rs.length;
      const sd = Math.sqrt(rs.reduce((a, r) => a + (r - m) ** 2, 0) / (rs.length - 1));
      if (sd > 0) this.sd.set(s.symbol, sd);
    }
  }

  check(q, ko) {
    if (!q?.symbol || !Number.isFinite(q.changePct)) return null;

    const sd = this.sd.get(q.symbol);
    const prev = this.seen.get(q.symbol);
    this.seen.set(q.symbol, { price: q.price, changePct: q.changePct, at: Date.now() });

    // 평소를 모르면 알리지 않는다. 기준 없이 "크다" 고 말할 수는 없다.
    if (!sd) return null;

    const sigma = q.changePct / sd;

    // ① 오늘 하루가 드물게 컸나
    if (Math.abs(sigma) >= this.sigmaAt && Math.abs(q.changePct) >= this.minPct) {
      return {
        kind: 'surge',
        symbol: q.symbol, ko,
        head: `${ko} ${pct(q.changePct, 2)}`,
        why: `평소 하루 흔들림(${sd.toFixed(1)}%)의 ${Math.abs(sigma).toFixed(1)}배입니다.`,
        hint: '눌러서 차트로',
        sigma, tone: q.changePct > 0 ? 'up' : 'down',
        changePct: q.changePct,
      };
    }

    // ② 방금 몇 분 사이에 튀었나
    if (prev && Number.isFinite(prev.changePct)) {
      const jump = q.changePct - prev.changePct;
      const mins = Math.max(1, (Date.now() - prev.at) / 60_000);
      // 짧은 사이일수록 같은 폭이 더 놀랍다. 시간의 제곱근으로 나눈다.
      const jSigma = jump / (sd * Math.sqrt(mins / 390));
      if (Math.abs(jSigma) >= this.jumpAt && Math.abs(jump) >= this.minPct / 2) {
        return {
          kind: 'surge',
          symbol: q.symbol, ko,
          head: `${ko} ${pct(q.changePct, 2)}`,
          why: `${Math.round(mins)}분 사이에 ${pct(jump, 2)} 움직였습니다.`,
          hint: '눌러서 차트로',
          sigma, jump, tone: jump > 0 ? 'up' : 'down',
          changePct: q.changePct,
        };
      }
    }

    return null;
  }
}

/* ═══════════════════ 간밤에 ═══════════════════

   하루에 딱 한 번, 그날 처음 왔을 때만. 이 '딱 한 번' 이 지켜져야
   성립하는 장치다 — 두 번째부터는 안내가 아니라 잔소리다.

   장이 열리기 전에 알고 싶은 것은 딱 셋이다. 간밤에 뉴욕이 어땠나,
   환율이 어디로 갔나, 그리고 내가 든 것 중 크게 움직인 것이 있나.
*/

const OPEN_KEY = 'ktema.yuria.open';

/** 오늘 아직 인사하지 않았나 */
export function firstToday() {
  try {
    const last = localStorage.getItem(OPEN_KEY);
    return last !== new Date().toDateString();
  } catch { return false; }
}

export function markToday() {
  try { localStorage.setItem(OPEN_KEY, new Date().toDateString()); } catch { /* 무시 */ }
}

/**
 * 간밤에 무슨 일이 있었나 — 한 줄로.
 * @param {Array} quotes 지금 받아 둔 시세
 */
export function overnight(quotes) {
  const by = (sym) => quotes.find((q) => q.symbol === sym && q.ok);

  const bits = [];
  const us = by('^GSPC') || by('^IXIC');
  if (us && Number.isFinite(us.changePct)) {
    bits.push(`${us.ko || '미국'} ${pct(us.changePct, 2)}`);
  }
  const fx = by('KRW=X');
  if (fx && Number.isFinite(fx.change)) {
    bits.push(`원달러 ${fx.change > 0 ? '+' : ''}${Math.round(fx.change)}원`);
  }

  if (!bits.length) return null;

  // 크게 움직인 것 하나를 곁들인다
  const moved = quotes
    .filter((q) => q.ok && Number.isFinite(q.changePct))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];

  const why = moved && Math.abs(moved.changePct) > 1.5
    ? `가장 크게 움직인 것은 ${moved.ko || moved.symbol} ${pct(moved.changePct, 1)} 입니다.`
    : '지켜보시는 것들은 대체로 잠잠합니다.';

  return {
    kind: 'open',
    head: bits.join(' · '),
    why,
    hint: '눌러서 시세로',
    tone: us && us.changePct > 0 ? 'up' : us ? 'down' : '',
  };
}
