/* ═══════════════════════════════════════════════════════════════
   anaview.js — 분석 화면

   차트는 하나를 깊이 본다. 이 화면은 여럿을 나란히 놓고 견준다.
   그 둘은 다른 일이다 — 삼성전자 차트를 아무리 오래 봐도 그것이
   코스피보다 더 흔들리는지는 알 수 없다.

   ── 여섯 판 ──
     1. 표        지켜보는 것 전부. 기간별 수익률, 위험 대비 수익,
                  베타, 낙폭, 한 해 폭 안의 자리
     2. 열지도    같이 움직이는 정도
     3. 위험 기여 비중은 10%인데 흔들림의 30%를 내는 것을 잡아낸다
     4. 투자선    비중을 무작위로 뽑아 (흔들림, 수익) 평면에 뿌린다
     5. 한 종목   월별 격자 · 수익률 분포 · 롤링 수익률
     6. 한 줄로   숫자를 사람의 말로

   ── 왜 정렬이 중요한가 ──
   숫자 열둘을 나란히 놓으면 사람은 그중 큰 것을 못 찾는다. 정렬을
   한 번 누르면 찾는다. 표에서 정렬은 장식이 아니라 본체다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, debounce } from '../core/dom.js';
import { on } from '../core/bus.js';
import { px, pct, num, dir, stamp } from '../core/fmt.js';
import * as store from '../core/store.js';
import {
  profile, describe, correlation,
  riskContribution, frontier, monthly, distribution, rolling,
} from './analysis.js';

/** 표의 줄들 — 무엇을 어떤 이름으로 보일지 */
const COLS = [
  { key: 'ko',      ko: '이름',   kind: 'name', w: 'minmax(140px, 1.4fr)' },
  { key: 'price',   ko: '값',     kind: 'px' },
  { key: 'r1m',     ko: '1달',    kind: 'pct' },
  { key: 'r3m',     ko: '3달',    kind: 'pct' },
  { key: 'r1y',     ko: '1년',    kind: 'pct' },
  { key: 'cagr',    ko: '연평균', kind: 'pct',   note: '이 구간을 연 단위로 편 수익률' },
  { key: 'vol1y',   ko: '흔들림', kind: 'plain', note: '한 해로 늘린 변동성. 클수록 값이 널뛴다.' },
  { key: 'sharpe',  ko: '샤프',   kind: 'ratio',
    note: '흔들림 한 단위마다 얼마를 벌었나. 1을 넘으면 좋은 편이다.' },
  { key: 'sortino', ko: '소르티노', kind: 'ratio',
    note: '아래로 흔들린 것만 위험으로 센다. 위로 튀는 것은 위험이 아니므로.' },
  { key: 'calmar',  ko: '칼마',   kind: 'ratio',
    note: '연평균 수익을 최대 낙폭으로 나눈 것. 견딜 수 있는지를 가장 정직하게 말한다.' },
  { key: 'beta',    ko: '베타',   kind: 'ratio',
    note: '기준이 1% 오를 때 이것이 몇 % 오르는 경향인가.' },
  { key: 'mdd',     ko: '최대 낙폭', kind: 'pct',
    note: '이 구간에서 꼭대기부터 가장 깊이 팠던 자리.' },
  { key: 'ddNow',   ko: '지금 낙폭', kind: 'dd',
    note: '꼭대기에서 지금 얼마나 내려와 있나. 괄호는 물속에 있은 달수.' },
  { key: 'roll1yWorst', ko: '최악의 1년', kind: 'pct',
    note: '아무 날에나 들어갔다면 겪었을 가장 나쁜 1년.' },
  { key: 'pos',     ko: '폭 안 자리', kind: 'bar',
    note: '한 해 폭에서 0은 바닥, 100은 꼭대기.' },
];

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export class AnalysisView {
  /** @param {{onSymbol:(sym:string)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#ana');
    this.stampEl = $('#anaStamp');
    this.profiles = [];
    this.series = [];
    this.sort = { key: 'r3m', dir: -1 };
    this.focus = null;                 // 깊이 볼 하나
    this.marketSym = store.get('anaMarket') || '^KS11';

    /* 캔버스는 그릴 때의 창 크기에 맞춰 굽는다. 그래서 창이 바뀌면 다시
       구워야 한다 — 안 그러면 넓힌 뒤에도 작은 그림이 늘어나 흐릿하다.

       화면이 숨어 있을 때 그려 두었다가 나중에 보이는 경우도 같다.
       그때는 잰 크기가 0이라 아예 안 보인다. */
    this.redraw = debounce(() => {
      if (this.host.offsetParent === null) return;    // 지금 안 보인다
      for (const fn of this.drawn || []) fn();
    }, 220);
    window.addEventListener('resize', this.redraw);
    on('view:shown', ({ view }) => { if (view === 'analysis') this.redraw(); });
  }

  loading() {
    clear(this.host);
    this.host.appendChild(el('p.ana__wait', { text: '두 해치를 부르는 중…' }));
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
    this.#recompute();
    if (at) this.stampEl.textContent = `${stamp(new Date(at))} 기준 · 두 해치`;
    this.paint();
  }

  #recompute() {
    const rf = Number(store.get('riskFree'));
    const mkt = this.series.find((q) => q.symbol === this.marketSym);
    this.profiles = this.series
      .map((q) => profile(q, {
        interval: '1d',
        rf: Number.isFinite(rf) ? rf : 3,
        market: mkt ? mkt.bars : null,
      }))
      .filter(Boolean);

    if (!this.focus || !this.profiles.some((p) => p.symbol === this.focus)) {
      this.focus = this.profiles[0]?.symbol || null;
    }
  }

  paint() {
    clear(this.host);
    if (!this.profiles.length) { this.failed(); return; }

    /* 캔버스는 판이 붙은 뒤에 그린다. 붙기 전에는 크기를 잴 수 없다.

       예전에는 그 일을 다음 그림 프레임으로 미뤘는데, 창이 뒤에 있거나
       최소화되어 있으면 그림 프레임이 오지 않아 캔버스가 300×150 인 채로
       남았다. 붙이는 일은 이미 끝났으니 지금 재도 된다 —
       getBoundingClientRect 는 그 자리에서 배치를 셈하게 한다. */
    this.later = [];

    this.host.append(
      this.#table(),
      this.#heat(),
      this.#risk(),
      this.#frontier(),
      this.#one(),
      this.#note(),
    );

    // 그리고, 나중에 창이 바뀌면 같은 일을 다시 하도록 들고 있는다
    this.drawn = this.later;
    this.later = null;
    for (const fn of this.drawn) fn();
  }

  /* ═══════════════ 1. 표 ═══════════════ */

  #table() {
    const rows = [...this.profiles].sort((a, b) => {
      const x = a[this.sort.key], y = b[this.sort.key];
      if (typeof x === 'string') return String(x).localeCompare(String(y), 'ko') * this.sort.dir;
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
      class: p.symbol === this.focus ? 'is-on' : '',
      title: p.symbol + ' — 눌러서 아래에서 깊이 보기 · 두 번 누르면 차트로',
      onclick: () => { this.focus = p.symbol; this.paint(); },
      ondblclick: () => this.hooks.onSymbol?.(p.symbol),
    }, COLS.map((c) => this.#cell(p, c)))));

    return el('section.ana__block', [
      el('div.ana__h', [
        el('span', { text: '지켜보는 것 전부' }),
        el('small', { text: '머리를 누르면 그 줄로 정렬 · 줄을 누르면 아래에서 깊이 본다' }),
        el('span.ana__spacer'),
        this.#marketPick(),
      ]),
      el('div.tbl', {
        style: { '--cols': COLS.map((c) => c.w || 'minmax(66px, 1fr)').join(' ') },
      }, [head, body]),
    ]);
  }

  /** 베타를 무엇에 대고 잴 것인가 */
  #marketPick() {
    const sel = el('select.sel.sel--sm', {
      title: '베타·알파의 기준',
      onchange: () => {
        this.marketSym = sel.value;
        store.set('anaMarket', sel.value);
        this.#recompute();
        this.paint();
      },
    }, this.series.map((q) => el('option', {
      value: q.symbol,
      text: q.ko || q.symbol,
      selected: q.symbol === this.marketSym,
    })));

    return el('label.ana__pick', [el('span', { text: '베타 기준' }), sel]);
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
      // 이름을 on 으로 두면 bus 의 on() 을 가린다
      const has = Number.isFinite(v);
      return el('div.tbl__c.num', [
        el('span.posbar', [
          el('i', { style: { left: `${has ? Math.max(0, Math.min(100, v)) : 0}%` } }),
        ]),
        el('span.posbar__v', { text: has ? Math.round(v) : '—' }),
      ]);
    }
    if (c.kind === 'ratio') {
      // 비율은 부호가 뜻을 가진다. 샤프가 음수면 위험을 지고 잃은 것이다.
      return el('div.tbl__c.num', {
        class: Number.isFinite(v) ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '',
        text: Number.isFinite(v) ? num(v, 2) : '—',
        title: c.key === 'beta' && Number.isFinite(p.r2)
          ? `설명력 ${(p.r2 * 100).toFixed(0)}%` + (p.r2 < 0.3 ? ' — 낮아서 믿기 어렵다' : '')
          : '',
      });
    }
    if (c.kind === 'dd') {
      // 깊이만 말하면 절반이다. 얼마나 오래였는지를 괄호로 붙인다.
      const months = Number.isFinite(p.uwDays) && p.uwDays > 40
        ? ` (${Math.round(p.uwDays / 21)}달)` : '';
      return el('div.tbl__c.num', {
        class: Number.isFinite(v) ? dir(v) : '',
        text: Number.isFinite(v) ? pct(v, 1) + months : '—',
      });
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

  /* ═══════════════ 2. 열지도 ═══════════════ */

  #heat() {
    const list = this.profiles.slice(0, 12);
    if (list.length < 3) return el('div');

    const cells = [el('div.heat__c.heat__corner')];
    for (const b of list) cells.push(el('div.heat__c.heat__top', { text: short(b.ko), title: b.ko }));

    for (const a of list) {
      cells.push(el('div.heat__c.heat__side', { text: short(a.ko), title: a.ko }));
      for (const b of list) {
        if (a === b) { cells.push(el('div.heat__c.is-self', { text: '·' })); continue; }
        const r = correlation(a.bars, b.bars);
        cells.push(el('div.heat__c', {
          style: { background: heatColor(r) },
          title: r == null
            ? `${a.ko} · ${b.ko} — 겹치는 날이 모자랍니다`
            : `${a.ko} · ${b.ko} — ${r.toFixed(2)}`,
          text: r == null ? '' : r.toFixed(1).replace('0.', '.'),
        }));
      }
    }

    return el('section.ana__block', [
      el('div.ana__h', [
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

  /* ═══════════════ 3. 위험 기여도 ═══════════════ */

  #risk() {
    const items = this.profiles.slice(0, 12);
    if (items.length < 2) return el('div');

    // 비중을 따로 적어 두지 않았으므로 고르게 담은 것으로 본다.
    const got = riskContribution(items, null);
    if (!got) return el('div');

    const rows = [...got.rows].sort((a, b) => b.risk - a.risk);

    return el('section.ana__block', [
      el('div.ana__h', [
        el('span', { text: '위험을 누가 내는가' }),
        el('small', { text: `고르게 담았다고 볼 때 · 전체 흔들림 ${got.vol.toFixed(1)}%` }),
      ]),
      el('p.ana__why', {
        text: '열지도가 "둘이 붙어 있다"까지 말한다면, 이것은 "그래서 전체 '
            + '흔들림의 몇 퍼센트를 이것이 낸다"를 말합니다. 비중은 같은데 '
            + '내는 위험이 세 배인 것이 흔합니다.',
      }),
      el('div.rc', rows.map((r) => {
        const over = r.risk / (r.weight || 1);
        return el('div.rc__row', {
          title: `${r.ko} — 비중 ${r.weight.toFixed(1)}% · 위험 ${r.risk.toFixed(1)}% · 혼자서는 ${r.own.toFixed(0)}%`,
          onclick: () => this.hooks.onSymbol?.(r.symbol),
        }, [
          el('span.rc__ko', { text: r.ko }),
          el('span.rc__bar', [
            el('i.rc__w', { style: { width: Math.min(100, r.weight) + '%' } }),
            el('i.rc__r', {
              class: over > 1.35 ? 'is-over' : over < 0.7 ? 'is-under' : '',
              style: { width: Math.min(100, r.risk) + '%' },
            }),
          ]),
          el('span.rc__n', {
            class: over > 1.35 ? 'up' : over < 0.7 ? 'down' : '',
            text: r.risk.toFixed(1) + '%',
          }),
        ]);
      })),
      el('div.rc__legend', [
        el('span', [el('i.rc__key.rc__key--w'), '비중']),
        el('span', [el('i.rc__key.rc__key--r'), '내는 위험']),
        el('span', { text: '· 아래 막대가 위 막대보다 길면 제 몫보다 많이 흔든다' }),
      ]),
    ]);
  }

  /* ═══════════════ 4. 효율적 투자선 ═══════════════ */

  #frontier() {
    const items = this.profiles.slice(0, 10);
    if (items.length < 3) return el('div');

    const cv = el('canvas.fr__cv');
    const say = el('p.fr__say');

    /* 사천 번 뽑는 일을 창 크기가 바뀔 때마다 다시 할 까닭은 없다.
       한 번 뽑아 두고 그리기만 다시 한다. */
    let got = null;
    this.later.push(() => {
      if (!got) {
        const rf = Number(store.get('riskFree'));
        got = frontier(items, { draws: 4000, rf: Number.isFinite(rf) ? rf : 3 });
      }
      if (!got) { say.textContent = '겹치는 날이 모자라 그리지 못했습니다.'; return; }
      drawFrontier(cv, got, items);

      const b = got.bestSharpe;
      const top = b.w
        .map((w, i) => ({ w, ko: items[i].ko }))
        .sort((x, y) => y.w - x.w)
        .slice(0, 3)
        .map((x) => `${x.ko} ${(x.w * 100).toFixed(0)}%`)
        .join(' · ');
      say.textContent =
        `가장 효율이 좋았던 비중은 ${top} 쪽이었습니다. `
        + `다만 이것은 지나간 한 해에 맞춘 값이라, 다음 해에도 그러리라는 뜻이 아닙니다.`;
    });

    return el('section.ana__block', [
      el('div.ana__h', [
        el('span', { text: '흔들림과 수익' }),
        el('small', { text: '비중을 무작위로 사천 번 뽑아 뿌린 것' }),
      ]),
      el('p.ana__why', {
        text: '구름의 왼쪽 위 모서리가 "같은 흔들림으로 가장 많이 번" 자리입니다. '
            + '고르게 담은 점이 그 모서리에서 얼마나 떨어져 있는지가 이 그림의 값이고, '
            + '대개는 생각보다 가깝습니다.',
      }),
      el('div.fr', [cv]),
      say,
    ]);
  }

  /* ═══════════════ 5. 한 종목 깊이 보기 ═══════════════ */

  #one() {
    const p = this.profiles.find((x) => x.symbol === this.focus) || this.profiles[0];
    if (!p) return el('div');

    const sel = el('select.sel.sel--sm', {
      onchange: () => { this.focus = sel.value; this.paint(); },
    }, this.profiles.map((x) => el('option', {
      value: x.symbol, text: x.ko, selected: x.symbol === p.symbol,
    })));

    return el('section.ana__block', [
      el('div.ana__h', [
        el('span', { text: '하나만 깊이' }),
        el('span.ana__spacer'),
        el('label.ana__pick', [el('span', { text: '종목' }), sel]),
      ]),
      this.#monthly(p),
      this.#dist(p),
      this.#rolling(p),
    ]);
  }

  /* ── 월별 격자 ── */

  #monthly(p) {
    const m = monthly(p.bars);
    if (!m || !m.years.length) return el('div');

    const head = [el('div.mg__c.mg__corner')];
    for (const name of MONTHS) head.push(el('div.mg__c.mg__top', { text: name.replace('월', '') }));
    head.push(el('div.mg__c.mg__top.mg__year', { text: '해' }));

    const body = [];
    for (const y of m.years) {
      body.push(el('div.mg__c.mg__side', { text: String(y).slice(2) + '년' }));
      for (let i = 0; i < 12; i++) {
        const v = m.rows.get(y)[i];
        body.push(el('div.mg__c', {
          style: { background: retColor(v) },
          class: v == null ? 'is-empty' : '',
          title: v == null ? '' : `${y}년 ${MONTHS[i]} ${pct(v, 1)}`,
          text: v == null ? '' : v.toFixed(0),
        }));
      }
      const yr = m.yearly.get(y);
      body.push(el('div.mg__c.mg__year', {
        class: Number.isFinite(yr) ? dir(yr) : '',
        text: Number.isFinite(yr) ? pct(yr, 0) : '',
      }));
    }

    // 달마다의 평균 — 세로줄이 있나 없나
    const foot = [el('div.mg__c.mg__side', { text: '평균' })];
    for (const b of m.byMonth) {
      foot.push(el('div.mg__c.mg__avg', {
        class: b ? dir(b.avg) : '',
        title: b ? `${b.n}해 중 ${b.up}해가 올랐다` : '',
        text: b ? b.avg.toFixed(1) : '',
      }));
    }
    foot.push(el('div.mg__c.mg__year'));

    return el('div.ana__sub', [
      el('h4', [el('span', { text: '월별 수익률' }),
        el('small', { text: '세로줄이 보이면 계절성, 얼룩이면 없는 것' })]),
      el('div.mgwrap', [
        el('div.mg', { style: { gridTemplateColumns: 'auto repeat(12, minmax(0,1fr)) auto' } },
          [...head, ...body, ...foot]),
      ]),
    ]);
  }

  /* ── 분포 ── */

  #dist(p) {
    const d = distribution(p.bars);
    if (!d) return el('div');

    const cv = el('canvas.dist__cv');
    this.later.push(() => drawDist(cv, d));

    const ratio = d.tail3.expected > 0 ? d.tail3.actual / d.tail3.expected : 0;

    return el('div.ana__sub', [
      el('h4', [el('span', { text: '하루 수익률의 분포' }),
        el('small', { text: '막대가 실제, 줄이 같은 평균·표준편차의 정규분포' })]),
      el('div.dist', [cv]),
      el('div.dist__stats', [
        stat('왜도', d.skew.toFixed(2), d.skew < 0 ? '아래로 쏠렸다' : '위로 쏠렸다'),
        stat('초과첨도', d.kurt.toFixed(1), '정규분포는 0. 클수록 꼬리가 두껍다'),
        stat('3시그마 밖', `${d.tail3.actual}일`,
          `정규분포라면 ${d.tail3.expected.toFixed(1)}일이어야 했다` +
          (ratio > 2 ? ` — ${ratio.toFixed(0)}배` : '')),
        stat('최악의 하루', pct(d.worst[0], 1), ''),
        stat('VaR 95%', pct(d.var95, 1), '스무 날에 한 번은 이보다 나쁘다'),
        stat('CVaR 95%', pct(d.cvar95, 1), '그 나쁜 날들의 평균'),
      ]),
      el('p.ana__why', {
        text: '"흔들림 ' + (Number.isFinite(p.vol1y) ? p.vol1y.toFixed(0) : '—')
            + '%"라는 숫자는 정규분포를 가정한 말입니다. 겹쳐 놓으면 가운데는 더 '
            + '뾰족하고 양 끝은 더 두껍다는 것이 보입니다. 사람을 망하게 하는 '
            + '것은 그 두꺼운 꼬리 쪽입니다.',
      }),
    ]);
  }

  /* ── 롤링 ── */

  #rolling(p) {
    const rows = [
      ['1년', rolling(p.bars, 252)],
      ['6달', rolling(p.bars, 126)],
      ['3달', rolling(p.bars, 63)],
    ].filter(([, r]) => r);

    if (!rows.length) return el('div');

    return el('div.ana__sub', [
      el('h4', [el('span', { text: '아무 날에나 들어갔다면' }),
        el('small', { text: '받아 둔 구간 안의 모든 시작점으로 셈한 것' })]),
      el('div.roll', rows.map(([label, r]) => el('div.roll__row', [
        el('span.roll__k', { text: label + ' 뒤' }),
        el('span.roll__scale', [
          el('i.roll__span', {
            style: spanStyle(r.worst, r.best, r.p25, r.p75),
          }),
          el('i.roll__med', { style: { left: posOf(r.worst, r.best, r.median) + '%' } }),
          el('i.roll__zero', {
            hidden: !(r.worst < 0 && r.best > 0),
            style: { left: posOf(r.worst, r.best, 0) + '%' },
          }),
        ]),
        el('span.roll__n', [
          el('b', { class: dir(r.worst), text: pct(r.worst, 0) }),
          el('span', { text: '…' }),
          el('b', { class: dir(r.median), text: pct(r.median, 0) }),
          el('span', { text: '…' }),
          el('b', { class: dir(r.best), text: pct(r.best, 0) }),
        ]),
        el('span.roll__neg', {
          title: '이 기간 뒤에 손실이었던 시작점의 비율',
          text: r.negative.toFixed(0) + '% 손실',
        }),
      ]))),
      el('p.ana__why', {
        text: '한 시점의 1년 수익률은 그 시점 이야기입니다. 이것은 아무 날에나 '
            + '들어간 사람의 이야기이고, 실제로 나에게 벌어지는 일에 더 가깝습니다.',
      }),
    ]);
  }

  /* ═══════════════ 6. 한 줄로 ═══════════════ */

  #note() {
    const lines = this.profiles
      .map((p) => ({ p, text: describe(p) }))
      .filter((x) => x.text);

    return el('section.ana__block', [
      el('div.ana__h', [el('span', { text: '한 줄로' })]),
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

/* ═══════════════════ 조각 ═══════════════════ */

const short = (s) => (s.length > 4 ? s.slice(0, 4) : s);

const stat = (k, v, note) => el('div.dstat', { title: note || '' }, [
  el('span.dstat__k', { text: k }),
  el('span.dstat__v', { text: v }),
]);

const posOf = (lo, hi, v) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50);

function spanStyle(lo, hi, a, b) {
  const l = posOf(lo, hi, a);
  const r = posOf(lo, hi, b);
  return { left: l + '%', width: Math.max(1, r - l) + '%' };
}

/** −1 … +1 을 색으로. 붙어 있으면 따뜻하게, 반대면 차갑게. */
function heatColor(r) {
  if (r == null) return 'transparent';
  const a = Math.min(0.62, Math.abs(r) * 0.62);
  return r >= 0
    ? `rgba(240, 85, 77, ${a.toFixed(3)})`
    : `rgba(63, 138, 224, ${a.toFixed(3)})`;
}

/** 월별 격자의 칸 색. ±10% 에서 가장 짙어진다. */
function retColor(v) {
  if (v == null) return 'transparent';
  const a = Math.min(0.6, (Math.abs(v) / 10) * 0.6);
  return v >= 0
    ? `rgba(240, 85, 77, ${a.toFixed(3)})`
    : `rgba(63, 138, 224, ${a.toFixed(3)})`;
}

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** 캔버스를 제 크기에 맞춘다. 안 맞추면 흐릿하게 늘어난다. */
function fitCanvas(cv, h) {
  const r = cv.getBoundingClientRect();
  const w = r.width || cv.parentElement?.clientWidth || 600;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}

/* ─────────────── 투자선 그리기 ─────────────── */

function drawFrontier(cv, got, items) {
  const H = 260;
  const { g, w, h } = fitCanvas(cv, H);
  const pad = { l: 46, r: 14, t: 14, b: 30 };

  const xs = got.pts.map((p) => p.x);
  const ys = got.pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padX = (x1 - x0) * 0.08 || 1;
  const padY = (y1 - y0) * 0.08 || 1;

  const X = (v) => pad.l + ((v - (x0 - padX)) / ((x1 + padX) - (x0 - padX))) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - (y0 - padY)) / ((y1 + padY) - (y0 - padY))) * (h - pad.t - pad.b);

  const line = cssVar('--line-soft', 'rgba(255,255,255,.045)');
  const text = cssVar('--tx-500', '#4e586a');

  g.clearRect(0, 0, w, h);
  g.font = '10px "IBM Plex Mono", monospace';
  g.textBaseline = 'middle';

  // 눈금
  for (let i = 0; i <= 4; i++) {
    const v = (y0 - padY) + (((y1 + padY) - (y0 - padY)) * i) / 4;
    const y = Math.round(Y(v)) + 0.5;
    g.strokeStyle = line;
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
    g.fillStyle = text;
    g.textAlign = 'right';
    g.fillText(v.toFixed(0) + '%', pad.l - 6, y);
  }
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let i = 0; i <= 4; i++) {
    const v = (x0 - padX) + (((x1 + padX) - (x0 - padX)) * i) / 4;
    g.fillStyle = text;
    g.fillText(v.toFixed(0) + '%', X(v), h - pad.b + 7);
  }

  // 구름 — 샤프가 높을수록 진하게
  const shs = got.pts.map((p) => p.sharpe).filter(Number.isFinite);
  const sLo = Math.min(...shs), sHi = Math.max(...shs);
  for (const p of got.pts) {
    const t = sHi > sLo ? (p.sharpe - sLo) / (sHi - sLo) : 0.5;
    g.fillStyle = `rgba(41, 98, 255, ${(0.06 + t * 0.5).toFixed(3)})`;
    g.beginPath();
    g.arc(X(p.x), Y(p.y), 1.6, 0, Math.PI * 2);
    g.fill();
  }

  // 낱개 종목 — 구름 밖에 있는 것이 보통이다
  g.font = '10px "Noto Sans KR", sans-serif';
  for (const it of items) {
    if (!Number.isFinite(it.vol1y) || !Number.isFinite(it.cagr)) continue;
    const x = X(it.vol1y), y = Y(it.cagr);
    if (x < pad.l || x > w - pad.r || y < pad.t || y > h - pad.b) continue;
    g.fillStyle = cssVar('--tx-400', '#6b7688');
    g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
    g.textAlign = 'left';
    g.fillText(short(it.ko), x + 5, y - 6);
  }

  // 짚어 둘 점 셋
  const mark = (pt, color, label) => {
    if (!pt) return;
    const x = X(pt.x), y = Y(pt.y);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = color;
    g.font = '600 10px "Noto Sans KR", sans-serif';
    g.textAlign = 'left';
    g.fillText(label, x + 9, y);
  };
  g.textBaseline = 'middle';
  mark(got.bestSharpe, cssVar('--ok', '#26a69a'), '가장 효율적');
  mark(got.minVol, cssVar('--key-300', '#6b9bff'), '가장 덜 흔들림');
  mark(got.equal, cssVar('--warn', '#e8a33d'), '고르게 담기');
}

/* ─────────────── 분포 그리기 ─────────────── */

function drawDist(cv, d) {
  const H = 200;
  const { g, w, h } = fitCanvas(cv, H);
  const pad = { l: 10, r: 10, t: 12, b: 26 };

  const n = d.counts.length;
  const maxC = Math.max(...d.counts, ...d.normal);
  const bw = (w - pad.l - pad.r) / n;
  const Y = (v) => h - pad.b - (v / maxC) * (h - pad.t - pad.b);
  const X = (i) => pad.l + i * bw;

  const up = cssVar('--up', '#f0554d');
  const down = cssVar('--down', '#3f8ae0');
  const text = cssVar('--tx-500', '#4e586a');

  g.clearRect(0, 0, w, h);

  // 막대 — 0 을 기준으로 오른쪽은 오름색, 왼쪽은 내림색
  for (let i = 0; i < n; i++) {
    const x = d.lo + d.width * (i + 0.5);
    g.fillStyle = x >= 0 ? up : down;
    g.globalAlpha = 0.55;
    const y = Y(d.counts[i]);
    g.fillRect(X(i), y, Math.max(1, bw - 1), h - pad.b - y);
  }
  g.globalAlpha = 1;

  // 정규곡선
  g.strokeStyle = cssVar('--tx-100', '#e6ebf2');
  g.lineWidth = 1.6;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = X(i) + bw / 2, y = Y(d.normal[i]);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();

  // 0선
  const zero = pad.l + ((0 - d.lo) / (d.hi - d.lo)) * (w - pad.l - pad.r);
  g.strokeStyle = cssVar('--line-hard', 'rgba(255,255,255,.13)');
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(Math.round(zero) + 0.5, pad.t);
  g.lineTo(Math.round(zero) + 0.5, h - pad.b);
  g.stroke();

  // 아래 눈금
  g.font = '10px "IBM Plex Mono", monospace';
  g.fillStyle = text;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let i = 0; i <= 4; i++) {
    const v = d.lo + ((d.hi - d.lo) * i) / 4;
    const x = pad.l + ((v - d.lo) / (d.hi - d.lo)) * (w - pad.l - pad.r);
    g.fillText((v > 0 ? '+' : '') + v.toFixed(1) + '%', x, h - pad.b + 7);
  }
}
