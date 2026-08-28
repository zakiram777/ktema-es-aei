/* ═══════════════════════════════════════════════════════════════
   extras4.js — 분봉이 열어 준 것들, 그리고 흐르는 화면

     하루 안        갭·시간대·VWAP·체결 강도
     열지도         지켜보는 것 전부를 한 판에
     이상 랭킹      오늘 제 흔들림에서 가장 벗어난 것
     브라우저 알림  탭이 열려 있을 때만 — 그 한계를 숨기지 않는다
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { px, pct, num, dir, big } from '../core/fmt.js';
import * as store from '../core/store.js';
import * as intraday from '../market/intraday.js';

/* ═══════════════════ 하루 안 ═══════════════════ */

export class IntraPanel {
  /** @param {{fetchBars:(sym, range, interval)=>Promise<object>}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#intraBody');
    this.box = $('#intra');
    this.symbol = null;
  }

  toggle(symbol) {
    if (!this.box) return;
    this.box.hidden = !this.box.hidden;
    if (!this.box.hidden) {
      this.box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.load(symbol);
    }
  }

  async load(symbol) {
    if (!this.host || symbol === this.symbol) return;
    this.symbol = symbol;

    clear(this.host);
    this.host.appendChild(el('p.ana__wait', { text: '분봉과 일봉을 부르는 중…' }));

    try {
      // 갭과 시간대는 서로 다른 눈금이 필요하다. 갭은 여러 날의 시가와
      // 종가면 되고, 시간대는 하루를 잘게 쪼갠 것이어야 한다.
      const [fine, daily] = await Promise.all([
        this.hooks.fetchBars(symbol, '5d', '5m'),
        this.hooks.fetchBars(symbol, '1y', '1d'),
      ]);
      clear(this.host);
      this.#paint(fine?.bars || [], daily?.bars || []);
    } catch (err) {
      clear(this.host);
      this.host.appendChild(el('p.ana__wait.is-bad', { text: '받지 못했습니다: ' + err.message }));
      this.symbol = null;
    }
  }

  #paint(fine, daily) {
    const later = [];
    const g = intraday.gaps(daily);
    const h = intraday.byHour(fine);
    const vw = intraday.vwap(fine);
    const strength = intraday.pressureNow(fine, 30);

    const lastPx = fine.length ? fine[fine.length - 1].c : null;
    const lastVwap = vw.length ? vw[vw.length - 1] : null;

    this.host.append(
      // ── VWAP ──
      lastVwap != null ? el('div.ana__sub', [
        el('h4', [el('span', { text: '오늘 사고판 평균값 (VWAP)' }),
          el('small', { text: '거래량으로 무게를 준 평균 — 기관의 체결가는 종가보다 여기에 가깝다' })]),
        el('div.bt__stats', [
          stat('지금 값', lastPx != null ? px(lastPx) : '—', ''),
          stat('VWAP', px(lastVwap), ''),
          stat('그 차이',
            lastPx != null ? pct((lastPx / lastVwap - 1) * 100, 2) : '—',
            lastPx != null ? dir(lastPx - lastVwap) : ''),
          stat('체결 강도',
            strength != null ? (strength > 0 ? '+' : '') + strength.toFixed(0) : '—',
            strength == null ? '' : strength > 15 ? 'up' : strength < -15 ? 'down' : ''),
        ]),
        el('p.ana__why', {
          text: lastPx != null && lastVwap != null
            ? (lastPx > lastVwap
              ? '지금 값이 오늘 산 사람들 평균보다 위입니다. 오늘 산 사람 대부분이 이익 중이라는 뜻입니다.'
              : '지금 값이 오늘 산 사람들 평균보다 아래입니다. 오늘 산 사람 대부분이 물려 있다는 뜻입니다.')
            : '',
        }),
        el('p.ana__why', {
          text: '체결 강도는 봉 안에서 값이 위쪽에 붙어 끝났는지 아래쪽에 붙어 '
              + '끝났는지를 거래량으로 무게 준 것입니다. +100에 가까우면 내내 '
              + '사려는 쪽이 밀어 올린 것이고, −100이면 반대입니다.',
        }),
      ]) : null,

      // ── 갭 ──
      g ? el('div.ana__sub', [
        el('h4', [el('span', { text: '갭으로 열린 날' }),
          el('small', { text: `${g.days}거래일 중 ${g.n}번 · 0.3% 넘는 것만` })]),
        el('div.gap__two', [
          this.#gapSide('위로 열린 갭', g.up, true),
          this.#gapSide('아래로 열린 갭', g.down, false),
        ]),
        this.#gapVerdict(g),
      ]) : null,

      // ── 시간대 ──
      h ? el('div.ana__sub', [
        el('h4', [el('span', { text: '언제 움직이나' }),
          el('small', { text: `최근 ${h.days}거래일 · 30분 단위 · 방향이 아니라 크기` })]),
        canvas('hour__cv', (cv) => later.push(() => drawHours(cv, h))),
        el('p.ana__why', {
          text: `가장 크게 움직이는 때는 ${h.busiest.slot} (하루 움직임의 `
              + `${h.busiest.share.toFixed(0)}%), 가장 잠잠한 때는 ${h.quietest.slot} 입니다. `
              + '장 시작 삼십 분에 하루 폭의 절반이 나는 종목이 흔한데, 그것을 알면 '
              + '언제 손대지 말아야 할지가 정해집니다.',
        }),
      ]) : null,

      !g && !h && lastVwap == null
        ? el('p.ana__wait', { text: '분봉이 모자라 셈하지 못했습니다.' })
        : null,
    );

    for (const fn of later) fn();
  }

  #gapSide(label, s, up) {
    if (!s) return el('div.gap__side', [el('span.gap__k', { text: label }), el('span.flow__n.is-thin', { text: '표본 부족' })]);
    return el('div.gap__side', { class: up ? 'is-up' : 'is-down' }, [
      el('span.gap__k', { text: `${label} · ${s.n}번` }),
      el('div.gap__rows', [
        gapRow('메운 비율', s.filled.toFixed(0) + '%', s.filled > 60 ? (up ? 'down' : 'up') : ''),
        gapRow('평균 갭', pct(s.avgGap, 2), up ? 'up' : 'down'),
        gapRow('시가→종가', pct(s.avgIntraday, 2), dir(s.avgIntraday)),
        gapRow('갭 방향 유지', s.followed.toFixed(0) + '%', ''),
      ]),
    ]);
  }

  #gapVerdict(g) {
    const u = g.up, d = g.down;
    if (!u && !d) return null;

    // 메우는 비율이 높으면 갭을 따라 사는 것은 대개 손해다
    const worst = [u, d].filter(Boolean).sort((a, b) => b.filled - a.filled)[0];
    const which = worst === u ? '위로' : '아래로';

    return el('div.mix__verdict', { class: worst.filled > 65 ? 'is-bad' : '' }, [
      el('b', { text: `${which} 열린 갭은 ${worst.filled.toFixed(0)}%가 그날 안에 메워졌습니다` }),
      el('span', {
        text: worst.filled > 65
          ? '갭을 따라 들어가는 것은 이 종목에서 대개 손해였습니다. 열리자마자 '
            + '쫓는 대신 메우는 자리를 기다리는 편이 나았다는 뜻입니다.'
          : '갭이 그대로 이어진 날이 많습니다. 다만 표본이 적으니 두 계절쯤 '
            + '더 쌓인 뒤에 다시 보십시오.',
      }),
    ]);
  }
}

const gapRow = (k, v, tone) => el('div.gap__row', [
  el('span', { text: k }),
  el('b', { class: tone, text: v }),
]);

/* ═══════════════════ 열지도 ═══════════════════

   지켜보는 것 전부를 한 판에. 칸의 크기는 같게 두고 색만 등락으로
   칠한다 — 시가총액으로 크기를 나누는 방식(트리맵)도 흔하지만, 여기서는
   지켜보는 것들의 시가총액을 모르고 지수와 원자재가 섞여 있어 뜻이 없다.

   흐르는 시세가 들어오면 그 자리에서 색이 바뀐다. */

export class Heatmap {
  /** @param {{onSymbol:(sym)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#heat');
    this.cells = new Map();
  }

  set(quotes) {
    if (!this.host) return;
    const rows = (quotes || []).filter((q) => q.ok && Number.isFinite(q.changePct));
    if (!rows.length) { clear(this.host); this.cells.clear(); return; }

    const same = rows.length === this.cells.size && rows.every((q) => this.cells.has(q.symbol));
    if (!same) { this.#build(rows); return; }
    for (const q of rows) this.#update(q);
  }

  #build(rows) {
    clear(this.host);
    this.cells.clear();
    for (const q of rows) {
      const pctEl = el('span.hm__pct');
      const node = el('button.hm__cell', {
        type: 'button',
        title: q.symbol,
        onclick: () => this.hooks.onSymbol?.(q.symbol),
      }, [
        el('span.hm__ko', { text: q.ko || q.symbol }),
        pctEl,
      ]);
      this.host.appendChild(node);
      this.cells.set(q.symbol, { node, pctEl });
      this.#update(q);
    }
  }

  #update(q) {
    const c = this.cells.get(q.symbol);
    if (!c) return;
    c.pctEl.textContent = pct(q.changePct, 2);
    c.node.style.background = heatColor(q.changePct);
    c.node.classList.toggle('is-strong', Math.abs(q.changePct) > 2);
  }
}

/* ±3% 에서 가장 짙어진다. 그보다 큰 것은 더 짙어져 봐야 못 가른다. */
function heatColor(v) {
  const a = Math.min(0.62, (Math.abs(v) / 3) * 0.62);
  return v >= 0
    ? `rgba(240, 85, 77, ${a.toFixed(3)})`
    : `rgba(63, 138, 224, ${a.toFixed(3)})`;
}

/* ═══════════════════ 오늘 이상한 것 ═══════════════════

   등락률로 줄 세우면 늘 비트코인이 위에 있다. 그것은 소식이 아니다.
   제 평소 흔들림으로 나눠 세우면 "그 종목에게 드문 일" 이 위로 온다. */

export class Odd {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#odd');
  }

  set(quotes, sd) {
    if (!this.host) return;
    clear(this.host);

    const rows = (quotes || [])
      .filter((q) => q.ok && Number.isFinite(q.changePct) && sd.get(q.symbol))
      .map((q) => ({ ...q, sigma: q.changePct / sd.get(q.symbol), sd: sd.get(q.symbol) }))
      .sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma))
      .slice(0, 8);

    if (!rows.length) {
      this.host.appendChild(el('p.ana__why', { text: '평소 흔들림을 아직 재지 못했습니다.' }));
      return;
    }

    this.host.append(
      ...rows.map((q) => el('button.odd__row', {
        type: 'button',
        title: `평소 하루 ${q.sd.toFixed(2)}% · 오늘 ${pct(q.changePct, 2)}`,
        onclick: () => this.hooks.onSymbol?.(q.symbol),
      }, [
        el('span.odd__ko', { text: q.ko || q.symbol }),
        el('span.odd__bar', [
          el('i', {
            class: q.sigma > 0 ? 'up' : 'down',
            style: { width: Math.min(100, Math.abs(q.sigma) * 24) + '%' },
          }),
        ]),
        el('span.odd__n', { class: dir(q.changePct), text: pct(q.changePct, 2) }),
        el('span.odd__s', {
          class: Math.abs(q.sigma) >= 3 ? 'is-odd' : '',
          text: (q.sigma > 0 ? '+' : '') + q.sigma.toFixed(1) + 'σ',
        }),
      ])),
      el('p.ana__why', {
        text: '등락률이 아니라 그 종목의 평소 흔들림으로 나눠 세운 것입니다. '
            + '비트코인의 3%와 코스피의 3%는 다른 일이라, 그냥 줄 세우면 늘 '
            + '같은 것이 위에 옵니다. 3σ 를 넘으면 그 종목에게 드문 날입니다.',
      }),
    );
  }
}

/* ═══════════════════ 브라우저 알림 ═══════════════════

   탭이 열려 있을 때만 울린다. 서버가 없으니 푸시는 못 한다 — 그 한계를
   숨기지 않고 그대로 적는다. 숨기면 "왜 안 울렸지" 를 묻게 되고, 그때
   사이트 전체를 덜 믿게 된다.

   그래도 쓸모가 있다. 이 화면을 둘째 모니터에 띄워 두는 사람에게는
   탭이 늘 열려 있기 때문이다. */

export const notify = {
  get can() { return 'Notification' in window; },
  get granted() { return this.can && Notification.permission === 'granted'; },
  get denied() { return this.can && Notification.permission === 'denied'; },

  async ask() {
    if (!this.can || this.granted) return this.granted;
    try {
      const got = await Notification.requestPermission();
      return got === 'granted';
    } catch { return false; }
  },

  /** 창을 보고 있으면 띄우지 않는다 — 이미 화면에서 봤을 것이다 */
  send(ev) {
    if (!this.granted || !store.get('notify')) return;
    if (!document.hidden) return;

    try {
      const n = new Notification(ev.head, {
        body: ev.why || '',
        tag: ev.kind + '|' + (ev.symbol || ''),   // 같은 것은 덮어쓴다
        icon: 'assets/media/sigil.svg',
        silent: false,
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 12_000);
    } catch { /* 못 띄워도 화면에는 이미 떴다 */ }
  },
};

/* ═══════════════════ 조각 ═══════════════════ */

const stat = (k, v, tone) => el('div.bt__stat', { data: { tone: tone || '' } }, [
  el('span.bt__statk', { text: k }),
  el('span.bt__statval', { text: v }),
]);

function canvas(cls, hold) {
  const cv = el('canvas.' + cls);
  hold(cv);
  return el('div.cvbox', [cv]);
}

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/* ─────────────── 시간대 막대 ─────────────── */

function drawHours(cv, h) {
  const rect = cv.getBoundingClientRect();
  const w = rect.width || cv.parentElement?.clientWidth || 600;
  const H = 170;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, H);

  const rows = h.rows;
  const max = Math.max(...rows.map((r) => r.move));
  if (!(max > 0)) return;

  const P = { l: 8, r: 8, t: 12, b: 26 };
  const bw = (w - P.l - P.r) / rows.length;
  const Y = (v) => H - P.b - (v / max) * (H - P.t - P.b);

  const key = cssVar('--key-500', '#2962ff');
  const lit = cssVar('--key-300', '#6b9bff');

  rows.forEach((r, i) => {
    const x = P.l + i * bw;
    const y = Y(r.move);
    g.fillStyle = r === h.busiest ? lit : key;
    g.globalAlpha = r === h.busiest ? 0.9 : 0.45;
    g.fillRect(x + 1, y, Math.max(1, bw - 2), H - P.b - y);
  });
  g.globalAlpha = 1;

  // 아래 시각 — 칸이 많으면 걸러 적는다
  g.font = '9px "IBM Plex Mono", monospace';
  g.fillStyle = cssVar('--tx-500', '#4e586a');
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const step = Math.ceil(rows.length / 8);
  rows.forEach((r, i) => {
    if (i % step) return;
    g.fillText(r.slot, P.l + i * bw + bw / 2, H - P.b + 6);
  });

  // 가장 바쁜 때를 짚어 준다
  const bi = rows.indexOf(h.busiest);
  if (bi >= 0) {
    g.fillStyle = lit;
    g.font = '600 10px "Noto Sans KR", sans-serif';
    g.textBaseline = 'bottom';
    g.fillText(h.busiest.share.toFixed(0) + '%',
      Math.max(20, Math.min(w - 20, P.l + bi * bw + bw / 2)), Y(h.busiest.move) - 3);
  }
}
