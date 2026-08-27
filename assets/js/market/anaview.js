/* ═══════════════════════════════════════════════════════════════
   anaview.js — 분석 화면

   차트는 하나를 깊이 본다. 이 화면은 여럿을 나란히 놓고 견준다.
   그 둘은 다른 일이다 — 삼성전자 차트를 아무리 오래 봐도 그것이
   코스피보다 더 흔들리는지는 알 수 없다.

   ── 세 판 ──
     1. 표      지켜보는 것 전부. 기간별 수익률, 흔들림, 판 깊이,
                한 해 폭 안의 자리. 머리를 누르면 그 줄로 정렬한다.
     2. 열지도  같이 움직이는 정도. 붙어 있는 것끼리 색이 진하다.
     3. 한 줄   고른 것 하나를 말로 풀어 준다.

   ── 왜 정렬이 중요한가 ──
   숫자 열둘을 나란히 놓으면 사람은 그중 큰 것을 못 찾는다. 정렬을
   한 번 누르면 찾는다. 표에서 정렬은 장식이 아니라 본체다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { px, pct, dir, stamp } from '../core/fmt.js';
import { profile, describe, correlation } from './analysis.js';

/** 표의 줄들 — 무엇을 어떤 이름으로 보일지 */
const COLS = [
  { key: 'ko',     ko: '이름',   kind: 'name', w: '1fr' },
  { key: 'price',  ko: '값',     kind: 'px' },
  { key: 'r1w',    ko: '1주',    kind: 'pct' },
  { key: 'r1m',    ko: '1달',    kind: 'pct' },
  { key: 'r3m',    ko: '3달',    kind: 'pct' },
  { key: 'r6m',    ko: '6달',    kind: 'pct' },
  { key: 'r1y',    ko: '1년',    kind: 'pct' },
  { key: 'vol1y',  ko: '흔들림', kind: 'plain', note: '한 해로 늘린 변동성. 클수록 값이 널뛴다.' },
  { key: 'mdd',    ko: '최대 낙폭', kind: 'pct', note: '이 구간에서 꼭대기부터 가장 깊이 팠던 자리.' },
  { key: 'ddNow',  ko: '지금 낙폭', kind: 'pct', note: '꼭대기에서 지금 얼마나 내려와 있나.' },
  { key: 'pos',    ko: '폭 안 자리', kind: 'bar', note: '한 해 폭에서 0은 바닥, 100은 꼭대기.' },
];

export class AnalysisView {
  /**
   * @param {{onSymbol:(sym:string)=>void}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#ana');
    this.stampEl = $('#anaStamp');
    this.profiles = [];
    this.sort = { key: 'r3m', dir: -1 };
  }

  loading() {
    clear(this.host);
    this.host.appendChild(el('p.ana__wait', { text: '한 해치를 부르는 중…' }));
  }

  failed(why) {
    clear(this.host);
    this.host.appendChild(el('p.ana__wait.is-bad', {
      text: why || '시세를 받지 못했습니다. 잠시 뒤에 다시 열어 보십시오.',
    }));
  }

  /** @param {Array} series fetchSeries 가 준 것 */
  set(series, at) {
    this.series = series;
    this.profiles = series.map((q) => profile(q, '1d')).filter(Boolean);
    if (at) this.stampEl.textContent = `${stamp(new Date(at))} 기준 · 한 해치`;
    this.paint();
  }

  paint() {
    clear(this.host);
    if (!this.profiles.length) { this.failed(); return; }

    this.host.appendChild(this.#table());
    this.host.appendChild(this.#heat());
    this.host.appendChild(this.#note());
  }

  /* ─────────────── 표 ─────────────── */

  #table() {
    const rows = [...this.profiles].sort((a, b) => {
      const x = a[this.sort.key], y = b[this.sort.key];
      if (typeof x === 'string') return x.localeCompare(y, 'ko') * this.sort.dir;
      const nx = Number.isFinite(x) ? x : -Infinity;
      const ny = Number.isFinite(y) ? y : -Infinity;
      return (nx - ny) * this.sort.dir;
    });

    const head = el('div.tbl__head', COLS.map((c) => el('button.tbl__h', {
      type: 'button',
      class: [
        c.kind === 'name' ? 'is-left' : '',
        this.sort.key === c.key ? 'is-on' : '',
      ].filter(Boolean).join(' '),
      title: c.note || '눌러서 이 줄로 정렬',
      onclick: () => {
        if (this.sort.key === c.key) this.sort.dir *= -1;
        else this.sort = { key: c.key, dir: c.kind === 'name' ? 1 : -1 };
        this.paint();
      },
    }, [
      el('span', { text: c.ko }),
      this.sort.key === c.key
        ? el('i.tbl__arr', { text: this.sort.dir < 0 ? '▾' : '▴' })
        : null,
    ])));

    const body = el('div.tbl__body', rows.map((p) => el('div.tbl__row', {
      title: p.symbol + ' — 눌러서 차트로',
      onclick: () => this.hooks.onSymbol?.(p.symbol),
    }, COLS.map((c) => this.#cell(p, c)))));

    return el('div.tbl', { style: { '--cols': COLS.map((c) => c.w || 'minmax(0,1fr)').join(' ') } },
      [head, body]);
  }

  #cell(p, c) {
    const v = p[c.key];

    if (c.kind === 'name') {
      return el('div.tbl__c.is-left', [
        el('b', { text: p.ko }),
        el('code', { text: p.symbol }),
      ]);
    }
    if (c.kind === 'px') {
      return el('div.tbl__c.num', { text: Number.isFinite(v) ? px(v) : '—' });
    }
    if (c.kind === 'bar') {
      const on = Number.isFinite(v);
      return el('div.tbl__c.num', [
        el('span.posbar', [
          el('i', { style: { left: `${on ? Math.max(0, Math.min(100, v)) : 0}%` } }),
        ]),
        el('span.posbar__v', { text: on ? Math.round(v) : '—' }),
      ]);
    }
    if (c.kind === 'pct') {
      return el('div.tbl__c.num', {
        class: Number.isFinite(v) ? dir(v) : '',
        text: Number.isFinite(v) ? pct(v, 1) : '—',
      });
    }
    return el('div.tbl__c.num', {
      text: Number.isFinite(v) ? v.toFixed(1) + '%' : '—',
    });
  }

  /* ─────────────── 열지도 ───────────────

     열둘을 견주면 칸이 백마흔넷이다. 숫자를 다 적으면 아무도 읽지
     않으므로 색으로 칠하고, 마우스를 얹은 것만 숫자로 말한다. */

  #heat() {
    const list = this.profiles.slice(0, 12);
    if (list.length < 3) return el('div');

    const cells = [];
    // 왼쪽 위 빈칸
    cells.push(el('div.heat__c.heat__corner'));
    for (const b of list) cells.push(el('div.heat__c.heat__top', { text: short(b.ko) }));

    for (const a of list) {
      cells.push(el('div.heat__c.heat__side', { text: short(a.ko), title: a.ko }));
      for (const b of list) {
        if (a === b) { cells.push(el('div.heat__c.is-self', { text: '·' })); continue; }
        const r = correlation(a.bars, b.bars);
        cells.push(el('div.heat__c', {
          style: { background: heatColor(r) },
          title: r == null ? `${a.ko} · ${b.ko} — 겹치는 날이 모자랍니다`
            : `${a.ko} · ${b.ko} — ${r.toFixed(2)}`,
          text: r == null ? '' : r.toFixed(1).replace('0.', '.'),
        }));
      }
    }

    return el('section.ana__block', [
      el('h3.ana__h', [
        el('span', { text: '같이 움직이는 정도' }),
        el('small', { text: '+1 늘 같은 쪽 · 0 상관없이 · −1 늘 반대쪽' }),
      ]),
      el('p.ana__why', {
        text: '열 가지를 지켜본다면서 열 가지가 다 붙어 있다면, 사실은 한 '
            + '가지를 열 번 들고 있는 것입니다. 나눠 담았다고 믿을 때 여기를 '
            + '먼저 봅니다.',
      }),
      el('div.heat', {
        style: { gridTemplateColumns: `auto repeat(${list.length}, minmax(0, 1fr))` },
      }, cells),
    ]);
  }

  /* ─────────────── 한 줄 ─────────────── */

  #note() {
    const lines = this.profiles
      .map((p) => ({ p, text: describe(p) }))
      .filter((x) => x.text);

    return el('section.ana__block', [
      el('h3.ana__h', [el('span', { text: '한 줄로' })]),
      el('div.ana__lines', lines.map(({ p, text }) => el('button.ana__line', {
        type: 'button',
        onclick: () => this.hooks.onSymbol?.(p.symbol),
      }, [
        el('b', { text: p.ko }),
        el('span', { text }),
      ]))),
      el('p.ana__why', {
        text: '전부 지나간 값에서 곧바로 나온 숫자입니다. 앞으로 어떻게 될지는 '
            + '여기에 없습니다 — 그것을 셈해 주는 숫자는 없습니다.',
      }),
    ]);
  }
}

const short = (s) => (s.length > 4 ? s.slice(0, 4) : s);

/** −1 … +1 을 색으로. 붙어 있으면 따뜻하게, 반대면 차갑게. */
function heatColor(r) {
  if (r == null) return 'transparent';
  const a = Math.min(0.62, Math.abs(r) * 0.62);
  return r >= 0
    ? `rgba(240, 85, 77, ${a.toFixed(3)})`
    : `rgba(63, 138, 224, ${a.toFixed(3)})`;
}
