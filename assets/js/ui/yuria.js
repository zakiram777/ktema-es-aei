/* ═══════════════════════════════════════════════════════════════
   yuria.js — 급변할 때만 나타나는 것

   유리아는 한 번 걷어 냈다. 그때 걷어 낸 것은 '비서' 였다 — 늘 곁에
   있으면서 묻지도 않은 것을 말하고, 화면의 주인공 자리를 숫자에게서
   빼앗던 것. 그 판단은 지금도 옳다.

   여기서 되살리는 것은 다른 것이다. 하는 일이 하나뿐이다.

     시장이 갑자기 크게 움직이면 차트 위에 나타나 그것을 알린다.

   ── 왜 사람 모양이어야 하나 ──
   숫자로 띄우면 사람은 안 본다. 이 화면은 이미 숫자로 가득하고, 숫자
   하나가 더 켜지는 것은 배경이 된다. 움직이는 사람 모양은 곁눈에도
   걸린다 — 그것이 이 그림이 여기서 하는 유일한 일이다.

   ── 그래서 인색해야 한다 ──
   자주 나타나면 그때부터 안 보게 되고, 안 보게 되면 정작 필요할 때도
   못 본다. 그래서 문턱을 높이 두고 다음 규칙을 지킨다.

     · 같은 종목으로 한 시간에 한 번까지
     · 화면에 머무는 것은 여섯 초
     · 누르면 곧바로 사라진다
     · 설정에서 통째로 끌 수 있다
     · 장이 닫혀 있으면 나타나지 않는다

   ── 무엇을 급변으로 보나 ──
   그냥 몇 퍼센트로 자르지 않는다. 코스피가 3% 움직이는 것과 비트코인이
   3% 움직이는 것은 전혀 다른 일이다. 그래서 그 종목이 평소 얼마나
   흔들렸는지로 나눈다 — 제 흔들림의 몇 배인가로 본다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, calmly } from '../core/dom.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';
import { pct } from '../core/fmt.js';

const MEDIA = 'assets/media/ink/';
const CALM = Array.from({ length: 12 }, (_, i) => `calm-${String(i + 1).padStart(2, '0')}`);
const WILD = Array.from({ length: 12 }, (_, i) => `wild-${String(i + 1).padStart(2, '0')}`);

/** 같은 종목으로 다시 나타나기까지 */
const COOLDOWN = 60 * 60_000;
/** 머무는 시간 */
const LIVE_MS = 6000;

export class Yuria {
  /** @param {{onOpen:(symbol)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#yuria');
    this.said = new Map();      // symbol → 마지막으로 나타난 때
    this.timer = 0;
    this.showing = false;
  }

  get enabled() { return store.get('yuria') !== false; }

  /**
   * 급변을 알린다.
   * @param {{symbol, ko, changePct, sigma, price, why}} ev
   */
  show(ev) {
    if (!this.enabled || !this.host) return;

    const last = this.said.get(ev.symbol) || 0;
    if (Date.now() - last < COOLDOWN) return;
    this.said.set(ev.symbol, Date.now());

    // 이미 하나 떠 있으면 그것을 밀어내고 새것을 건다. 둘이 겹치면
    // 어느 쪽을 말하는지 알 수 없다.
    this.hide(true);

    const up = ev.changePct > 0;
    const wild = Math.abs(ev.sigma || 0) >= 4;

    /* 격한 쪽(wild)은 정말 드물 때만 쓴다. 늘 격하면 격한 것이 예사가
       되고, 예사가 되면 알림이 아니라 무늬가 된다. */
    const clip = pick(wild ? WILD : CALM);

    const film = el('video.yuria__film', {
      muted: true, playsinline: true, loop: true,
      preload: 'auto', disablepictureinpicture: true,
      poster: `${MEDIA}poster/${clip}.jpg`,
      src: `${MEDIA}${clip}.mp4`,
    });

    const node = el('div.yuria', {
      class: [up ? 'is-up' : 'is-down', wild ? 'is-wild' : ''].filter(Boolean).join(' '),
      role: 'alert',
      onclick: () => { this.hooks.onOpen?.(ev.symbol); this.hide(); },
    }, [
      el('div.yuria__art', [film]),
      el('div.yuria__say', [
        el('span.yuria__kind', { text: wild ? '크게 움직였습니다' : '갑자기 움직였습니다' }),
        el('b.yuria__what', { text: `${ev.ko || ev.symbol} ${pct(ev.changePct, 2)}` }),
        el('span.yuria__why', { text: ev.why || '' }),
        el('span.yuria__hint', { text: '눌러서 차트로' }),
      ]),
      el('button.yuria__x', {
        type: 'button', 'aria-label': '닫기',
        onclick: (e) => { e.stopPropagation(); this.hide(); },
      }, '×'),
    ]);

    this.host.appendChild(node);
    this.node = node;
    this.showing = true;

    // 다음 그림 프레임이 아니라 시간으로 켠다 — 창이 뒤에 있으면
    // 그림 프레임이 오지 않아 스민 채로 멈춘다
    setTimeout(() => node.classList.add('is-in'), 20);
    film.play?.().catch(() => { /* 자동 재생을 막는 브라우저 — 포스터만 */ });

    emit('yuria:shown', ev);

    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), LIVE_MS);
  }

  hide(now = false) {
    clearTimeout(this.timer);
    const node = this.node;
    if (!node) return;
    this.node = null;
    this.showing = false;

    if (now || calmly()) { node.remove(); return; }
    node.classList.remove('is-in');
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 700);
  }

  /** 설정에서 껐을 때 */
  forget() { this.said.clear(); }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ═══════════════════ 무엇을 급변으로 보나 ═══════════════════

   그냥 "3% 넘으면" 으로 자르지 않는다. 코스피가 3% 움직이는 것과
   비트코인이 3% 움직이는 것은 전혀 다른 일이다. 코스피에게 3% 는
   한 해에 몇 번이고, 비트코인에게는 화요일이다.

   그래서 그 종목이 평소 하루에 얼마나 흔들렸는지(표준편차)로 나눈다.
   제 흔들림의 세 배를 넘으면 그 종목에게 드문 일이 벌어진 것이다.

   ── 왜 최근 것만 보나 ──
   두 해치 표준편차로 재면 요즘 잠잠해진 것이 안 잡힌다. 최근 예순 날로
   재야 "요즘 기준으로 드문가" 를 묻게 되고, 그것이 사람이 실제로
   느끼는 놀람에 가깝다.

   ── 하루치와 순간치를 따로 본다 ──
   장중에 실시간으로 오는 값은 '오늘 여기까지' 의 등락이다. 그것이 큰
   것과, 방금 몇 분 사이에 튄 것은 다른 일이다. 앞엣것만 보면 아침에
   한 번 벌어진 일로 종일 알린다.
*/

export class Watchdog {
  /**
   * @param {{sigma?:number, minPct?:number, jumpSigma?:number}} cfg
   */
  constructor(cfg = {}) {
    this.sigmaAt = cfg.sigma ?? 3;
    this.minPct = cfg.minPct ?? 1.2;      // 이보다 작으면 아무리 드물어도 안 알린다
    this.jumpAt = cfg.jumpSigma ?? 3.5;
    this.sd = new Map();                  // symbol → 하루 표준편차 %
    this.seen = new Map();                // symbol → 마지막으로 본 값
  }

  /** 봉으로 평소 흔들림을 재 둔다 (분석이나 시세를 받을 때 한 번) */
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

  /**
   * 들어온 시세 하나가 알릴 만한가.
   * @returns {null | {symbol, ko, changePct, sigma, jump, why}}
   */
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
        symbol: q.symbol, ko, changePct: q.changePct, sigma,
        price: q.price,
        why: `평소 하루 흔들림(${sd.toFixed(1)}%)의 ${Math.abs(sigma).toFixed(1)}배입니다.`,
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
          symbol: q.symbol, ko, changePct: q.changePct, sigma, jump,
          price: q.price,
          why: `${Math.round(mins)}분 사이에 ${pct(jump, 2)} 움직였습니다.`,
        };
      }
    }

    return null;
  }
}
