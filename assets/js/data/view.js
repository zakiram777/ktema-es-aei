/* ═══════════════════════════════════════════════════════════════
   view.js — 자료 화면 (Πίναξ)

   올린 표를 보여 주고, 그리고, 센다.

   ── 이 화면이 왜 필요한가 ──
   이 사이트의 다른 모든 숫자는 야후나 거래소에서 온다. 그런데 정작
   자기 돈은 대개 다른 곳에 적혀 있다 — 퇴직연금 명세서, 펀드 기준가,
   증권사가 내려 준 거래내역, 손으로 적어 둔 엑셀.

   그것을 여기로 들이면, 이미 만들어 둔 분석 기계를 그대로 자기 숫자에
   걸 수 있다. 새로 만드는 것이 아니라, 있는 것에 문을 하나 내는 일이다.

   ── 네 칸 ──
     표     읽은 것을 그대로 보여 준다. 무엇으로 읽혔는지(날짜·숫자·글)
            를 함께 적는다. 여기서 틀린 것이 보이면 아래는 전부 틀린다.
     그림   선·막대·점
     셈     요약 · 분포 · 상관 · 회귀
     시계열 날짜 열이 있으면 시세와 똑같이 다룬다

   ── 지킨 것 ──
   올린 파일은 이 브라우저를 떠나지 않는다. 서버가 없으니 보낼 곳도
   없다. 그 사실을 화면에 적어 둔다 — 명세서를 올리라고 하면서 그
   말이 없으면 아무도 올리지 않는다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, throttle } from '../core/dom.js';
import { num, pct, josa } from '../core/fmt.js';
import { on } from '../core/bus.js';
import * as sheet from './sheet.js';
import * as st from './stats.js';
import * as plot from './plot.js';
import { cagr, drawdown, underwater as uw, logReturns, stdev, mean as amean } from '../market/analysis.js';

const TABS = [
  { id: 'table', gr: 'Πίναξ', ko: '표' },
  { id: 'plot', gr: 'Γραφή', ko: '그림' },
  { id: 'stat', gr: 'Λόγος', ko: '셈' },
  { id: 'time', gr: 'Χρόνος', ko: '시계열' },
];

const MAX_ROWS = 200;          // 표에 실제로 그리는 줄. 그 아래로는 세기만 한다.

export class DataView {
  constructor() {
    this.host = $('#dataBody');
    this.drop = $('#dataDrop');
    this.input = $('#dataFile');
    this.tabsEl = $('#dataTabs');
    this.stampEl = $('#dataStamp');

    this.sheets = [];
    this.active = 0;
    this.table = null;          // {cols, n, hasHeader}
    this.tab = 'table';
    this.header = 'auto';
    this.canvases = [];         // 보일 때 다시 그릴 것들

    this.#bindDrop();
    this.#buildTabs();

    on('view:shown', ({ view }) => { if (view === 'data') this.redraw(); });
    window.addEventListener('resize', throttle(() => this.redraw(), 200));
  }

  redraw() { for (const f of this.canvases) { try { f(); } catch (e) { /* 그림 하나가 전부를 막지 않는다 */ } } }

  /* ─────────────── 파일 받기 ─────────────── */

  #bindDrop() {
    if (!this.drop) return;

    this.drop.addEventListener('click', () => this.input?.click());
    this.input?.addEventListener('change', () => {
      const f = this.input.files?.[0];
      if (f) this.load(f);
      this.input.value = '';         // 같은 파일을 두 번 고를 수 있게
    });

    for (const ev of ['dragenter', 'dragover']) {
      this.drop.addEventListener(ev, (e) => {
        e.preventDefault();
        this.drop.classList.add('is-over');
      });
    }
    for (const ev of ['dragleave', 'drop']) {
      this.drop.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === 'dragleave' && this.drop.contains(e.relatedTarget)) return;
        this.drop.classList.remove('is-over');
      });
    }
    this.drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f) this.load(f);
    });
  }

  async load(file) {
    this.#say('읽는 중… (' + file.name + ')');
    try {
      const t0 = performance.now();
      const { sheets, kind } = await sheet.read(file);
      this.sheets = sheets;
      this.active = 0;
      this.header = 'auto';
      this.fileName = file.name;
      this.fileKind = kind;
      this.ms = Math.round(performance.now() - t0);
      this.#shape();
      this.tab = 'table';
      this.#buildTabs();
      this.render();
    } catch (err) {
      this.sheets = [];
      this.table = null;
      this.#fail(err);
    }
  }

  #shape() {
    const s = this.sheets[this.active];
    this.table = s ? sheet.shape(s.rows, { header: this.header }) : null;
    // 고른 열을 기억해 두면 장을 바꿀 때 엉뚱한 열이 남는다. 새로 정한다.
    this.picked = null;
  }

  #say(msg) {
    if (this.stampEl) this.stampEl.textContent = msg;
  }

  #fail(err) {
    this.#say('');
    clear(this.host);
    this.host.appendChild(el('div.dv__fail', [
      el('div.dv__failh', { text: '읽지 못했습니다' }),
      el('p', { text: String(err?.message || err) }),
      el('p.dv__failwhy', {
        text: '엑셀이라면 「다른 이름으로 저장 → CSV(쉼표로 분리)」로 한 번 바꿔 보십시오. '
            + '그 길은 거의 언제나 열립니다.',
      }),
    ]));
    if (this.tabsEl) clear(this.tabsEl);
  }

  /* ─────────────── 칸 ─────────────── */

  #buildTabs() {
    if (!this.tabsEl) return;
    clear(this.tabsEl);
    if (!this.table) return;

    for (const t of TABS) {
      // 날짜 열이 없으면 시계열 칸은 아예 만들지 않는다. 눌러 봐야
      // "날짜가 없습니다" 만 나오는 칸은 있으나 마나다.
      if (t.id === 'time' && !this.#dateCols().length) continue;

      this.tabsEl.appendChild(el('button.tab', {
        class: this.tab === t.id ? 'is-on' : '',
        type: 'button',
        onclick: () => { this.tab = t.id; this.#buildTabs(); this.render(); },
      }, [
        el('span.tab__gr', { text: t.gr }),
        el('span.tab__ko', { text: t.ko }),
      ]));
    }
  }

  #numCols() { return (this.table?.cols || []).filter((c) => c.type === 'number'); }
  #dateCols() { return (this.table?.cols || []).filter((c) => c.type === 'date'); }

  /* ─────────────── 그리기 ─────────────── */

  render() {
    clear(this.host);
    this.canvases = [];
    if (!this.table) { this.#say(''); return; }

    const s = this.sheets[this.active];
    this.#say(`${this.fileName} · ${this.table.n.toLocaleString('ko-KR')}줄 · ${this.table.cols.length}열 · ${this.ms}ms`);

    // 장이 여럿이면 고를 수 있게 (엑셀은 대개 여럿이다)
    if (this.sheets.length > 1) {
      this.host.appendChild(el('div.dv__sheets', this.sheets.map((sh, i) =>
        el('button.chip', {
          class: i === this.active ? 'is-on' : '', type: 'button',
          onclick: () => { this.active = i; this.#shape(); this.#buildTabs(); this.render(); },
        }, [sh.name + ' · ' + Math.max(0, sh.rows.length - 1) + '줄']))));
    }

    if (this.tab === 'table') this.#renderTable();
    else if (this.tab === 'plot') this.#renderPlot();
    else if (this.tab === 'stat') this.#renderStat();
    else if (this.tab === 'time') this.#renderTime();

    this.redraw();
  }

  /* ═══ 표 ═══ */

  #renderTable() {
    const t = this.table;

    this.host.appendChild(el('div.dv__bar', [
      el('button.btn.btn--ghost.btn--tiny', {
        type: 'button',
        onclick: () => {
          this.header = !(this.header === true || (this.header === 'auto' && t.hasHeader));
          this.#shape();
          this.render();
        },
      }, [el('span.btn__label', {
        text: t.hasHeader ? '첫 줄을 이름으로 보는 중 — 값으로 되돌린다' : '첫 줄을 이름으로 본다',
      })]),
      el('span.dv__hint', {
        text: t.n > MAX_ROWS ? `앞 ${MAX_ROWS}줄만 보입니다. 셈은 ${t.n.toLocaleString('ko-KR')}줄 모두로 합니다.` : '',
      }),
    ]));

    // 무엇으로 읽혔나 — 여기가 틀리면 아래가 전부 틀린다
    this.host.appendChild(el('div.dv__cols', t.cols.map((c) => el('div.dv__col', [
      el('span.dv__colname', { text: c.name }),
      el('span.dv__type', { class: 'is-' + c.type, text: KIND[c.type] || c.type }),
      el('span.dv__fill', { text: fillOf(c) }),
    ]))));

    const head = el('tr', t.cols.map((c) => el('th', { text: c.name })));
    const body = [];
    for (let i = 0; i < Math.min(t.n, MAX_ROWS); i++) {
      body.push(el('tr', t.cols.map((c) => {
        const v = c.values[i];
        const raw = c.raw[i];
        if (c.type === 'number') {
          return el('td.is-num', { class: v == null ? 'is-empty' : '', text: v == null ? (String(raw) || '—') : num(v, guessDigits(v)) });
        }
        if (c.type === 'date') {
          return el('td', { class: v ? '' : 'is-empty', text: v ? v.toISOString().slice(0, 10) : (String(raw) || '—') });
        }
        return el('td', { text: String(raw ?? '') });
      })));
    }

    this.host.appendChild(el('div.dv__scroll', [
      el('table.dv__table', [el('thead', [head]), el('tbody', body)]),
    ]));
  }

  /* ═══ 그림 ═══ */

  #renderPlot() {
    const t = this.table;
    const nums = this.#numCols();
    if (!nums.length) return this.host.appendChild(note('숫자로 읽힌 열이 없습니다. 표 칸에서 어떻게 읽혔는지 보십시오.'));

    const state = this.plotState ||= {
      kind: 'line',
      x: (this.#dateCols()[0] || t.cols.find((c) => c.type === 'text') || null)?.name || null,
      ys: [nums[0].name],
    };

    const cv = el('canvas.dv__cv');
    const draw = () => {
      const xCol = t.cols.find((c) => c.name === state.x);
      const ys = nums.filter((c) => state.ys.includes(c.name));

      if (state.kind === 'scatter') {
        const xNum = nums.find((c) => c.name === state.x) || nums[0];
        const yNum = ys[0] || nums.find((c) => c !== xNum) || nums[0];
        const fitLine = st.regress(xNum.values, yNum.values);
        plot.scatter(cv, {
          xs: xNum.values, ys: yNum.values,
          xName: xNum.name, yName: yNum.name, fit: fitLine,
        });
        return;
      }

      const labels = xCol
        ? xCol.values.map((v) => (v instanceof Date ? v.toISOString().slice(2, 10) : String(v)))
        : t.cols[0].values.map((_, i) => String(i + 1));

      plot.lines(cv, {
        labels,
        kind: state.kind,
        series: ys.map((c) => ({ name: c.name, values: c.values })),
      });
    };
    this.canvases.push(draw);

    const rerender = () => { this.render(); };

    this.host.appendChild(el('div.dv__bar', [
      pills(['line', 'bar', 'scatter'], state.kind, (k) => { state.kind = k; rerender(); },
        { line: '선', bar: '막대', scatter: '점' }),

      el('label.dv__pick', [
        el('span', { text: state.kind === 'scatter' ? '가로축' : '가로 이름표' }),
        select(
          (state.kind === 'scatter' ? nums : t.cols).map((c) => c.name),
          state.x, (v) => { state.x = v; rerender(); }),
      ]),
    ]));

    // 세로축 — 선·막대는 여럿, 점은 하나
    this.host.appendChild(el('div.dv__ypick', [
      el('span.dv__pickh', { text: state.kind === 'scatter' ? '세로축' : '그릴 열' }),
      el('div.dv__chips', nums.map((c) => el('button.chip', {
        class: state.ys.includes(c.name) ? 'is-on' : '', type: 'button',
        onclick: () => {
          if (state.kind === 'scatter') state.ys = [c.name];
          else if (state.ys.includes(c.name)) state.ys = state.ys.filter((n) => n !== c.name);
          else state.ys = [...state.ys, c.name];
          if (!state.ys.length) state.ys = [c.name];
          rerender();
        },
      }, [c.name]))),
    ]));

    this.host.appendChild(el('div.dv__plot', [cv]));

    if (state.kind !== 'scatter' && state.ys.length > 1) {
      this.host.appendChild(el('div.dv__legend', state.ys.map((name, i) => el('span.dv__key', [
        el('i', { style: { background: plot.SERIES[i % plot.SERIES.length] } }),
        name,
      ]))));
      this.host.appendChild(note(
        '단위가 다른 열을 한 판에 겹치면 작은 쪽이 바닥에 눌려 안 보입니다. '
        + '그럴 때는 한 번에 하나씩 보십시오 — 이 화면은 축을 둘로 나누지 않습니다.'));
    }

    if (state.kind === 'scatter') {
      const xNum = nums.find((c) => c.name === state.x) || nums[0];
      const yNum = nums.find((c) => state.ys.includes(c.name)) || nums[0];
      const r = st.regress(xNum.values, yNum.values);
      if (r) this.host.appendChild(regressBlock(r, xNum.name, yNum.name));
    }
  }

  /* ═══ 셈 ═══ */

  #renderStat() {
    const nums = this.#numCols();
    if (!nums.length) return this.host.appendChild(note('숫자로 읽힌 열이 없습니다.'));

    /* ── 요약 ── */
    this.host.appendChild(el('h3.dv__h', { text: '요약' }));
    const rows = nums.map((c) => ({ c, d: st.describe(c.values) }));
    this.host.appendChild(el('div.dv__scroll', [
      el('table.dv__table.dv__table--stat', [
        el('thead', [el('tr', ['열', '개수', '빠짐', '평균', '표준편차', '최소', '1사분위', '중앙값', '3사분위', '최대', '비뚤어짐', '뾰족함']
          .map((h) => el('th', { text: h })))]),
        el('tbody', rows.map(({ c, d }) => el('tr', [
          el('td', { text: c.name }),
          ...[d.n, d.missing].map((v) => el('td.is-num', { text: String(v ?? 0) })),
          ...['mean', 'sd', 'min', 'q1', 'median', 'q3', 'max'].map((k) =>
            el('td.is-num', { text: d.n ? num(d[k], guessDigits(d[k])) : '—' })),
          el('td.is-num', { text: d.n ? num(d.skew, 2) : '—' }),
          el('td.is-num', { text: d.n ? num(d.kurt, 2) : '—' }),
        ]))),
      ]),
    ]));
    this.host.appendChild(note(
      '비뚤어짐이 0보다 크면 오른쪽으로 긴 꼬리(드물게 크게 버는 모양), '
      + '뾰족함이 0보다 크면 정규분포보다 꼬리가 두껍다는 뜻입니다. '
      + '수익률은 거의 언제나 뾰족함이 0보다 큽니다 — 그래서 "평균 ± 표준편차" 로 '
      + '최악을 어림하면 늘 모자랍니다.'));

    /* ── 분포 ── */
    const dstate = this.distState ||= { col: nums[0].name };
    this.host.appendChild(el('h3.dv__h', { text: '분포' }));
    this.host.appendChild(el('div.dv__bar', [
      el('label.dv__pick', [
        el('span', { text: '열' }),
        select(nums.map((c) => c.name), dstate.col, (v) => { dstate.col = v; this.render(); }),
      ]),
    ]));

    const dcol = nums.find((c) => c.name === dstate.col) || nums[0];
    const cvH = el('canvas.dv__cv.dv__cv--short');
    this.canvases.push(() => plot.hist(cvH, st.histogram(dcol.values)));
    this.host.appendChild(el('div.dv__plot.dv__plot--short', [cvH]));

    const nrm = st.normality(dcol.values);
    if (nrm) {
      this.host.appendChild(el('div.dv__verdict', [
        el('b', { text: nrm.normal ? '정규분포로 보아도 크게 틀리지 않습니다' : '정규분포가 아닙니다' }),
        el('span', {
          text: nrm.normal
            ? ` (Jarque–Bera p ${num(nrm.p, 3)}). 평균과 표준편차로 어림해도 됩니다.`
            : ` (Jarque–Bera p ${nrm.p < 0.001 ? '< 0.001' : num(nrm.p, 3)}). `
              + '샤프 지수나 신뢰구간처럼 정규분포를 깔고 있는 숫자들은 이 열에서 실제보다 낙관적입니다.',
        }),
      ]));
    }

    /* ── 상관 ── */
    if (nums.length >= 2) {
      const cstate = this.corrState ||= { kind: 'pearson' };
      this.host.appendChild(el('h3.dv__h', { text: '상관' }));
      this.host.appendChild(el('div.dv__bar', [
        pills(['pearson', 'spearman'], cstate.kind, (k) => { cstate.kind = k; this.render(); },
          { pearson: '값으로', spearman: '순위로' }),
      ]));

      const use = nums.slice(0, 16);
      const cv = el('canvas.dv__cv');
      this.canvases.push(() => plot.heat(cv, st.corrMatrix(use, { kind: cstate.kind })));
      this.host.appendChild(el('div.dv__plot', [cv]));

      if (nums.length > 16) this.host.appendChild(note('숫자 열이 열여섯 개를 넘어 앞의 열여섯만 그렸습니다.'));

      // 가장 센 짝 몇을 글로도 적는다 — 칸만 보면 어디를 봐야 할지 모른다
      const pairs = [];
      for (let i = 0; i < use.length; i++) {
        for (let j = i + 1; j < use.length; j++) {
          const r = st.pearson(use[i].values, use[j].values);
          if (r.r != null && r.n >= 5) pairs.push({ a: use[i].name, b: use[j].name, ...r });
        }
      }
      pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
      if (pairs.length) {
        this.host.appendChild(el('ul.dv__list', pairs.slice(0, 5).map((p) => el('li', [
          el('b', { text: p.a + ' ↔ ' + p.b }),
          el('span', {
            text: `  ${p.r >= 0 ? '같이' : '반대로'} 움직입니다 · r ${num(p.r, 2)} · `
                + `표본 ${p.n}${p.p != null ? ' · p ' + (p.p < 0.001 ? '< 0.001' : num(p.p, 3)) : ''}`,
          }),
        ]))));
        this.host.appendChild(note(
          '상관은 "같이 움직인다" 이지 "하나가 다른 하나를 움직인다" 가 아닙니다. '
          + '표본이 적으면 아무 관계도 없는 두 열이 우연히 0.8을 넘기는 일이 흔합니다.'));
      }
    }

    /* ── 회귀 ── */
    if (nums.length >= 2) {
      const rstate = this.regState ||= { x: nums[0].name, y: nums[1].name };
      this.host.appendChild(el('h3.dv__h', { text: '회귀' }));
      this.host.appendChild(el('div.dv__bar', [
        el('label.dv__pick', [el('span', { text: '설명하는 것' }),
          select(nums.map((c) => c.name), rstate.x, (v) => { rstate.x = v; this.render(); })]),
        el('label.dv__pick', [el('span', { text: '설명되는 것' }),
          select(nums.map((c) => c.name), rstate.y, (v) => { rstate.y = v; this.render(); })]),
      ]));

      const xc = nums.find((c) => c.name === rstate.x) || nums[0];
      const yc = nums.find((c) => c.name === rstate.y) || nums[1];
      const r = st.regress(xc.values, yc.values);

      const cv = el('canvas.dv__cv');
      this.canvases.push(() => plot.scatter(cv, {
        xs: xc.values, ys: yc.values, xName: xc.name, yName: yc.name, fit: r,
      }));
      this.host.appendChild(el('div.dv__plot', [cv]));

      if (r) this.host.appendChild(regressBlock(r, xc.name, yc.name));
      else this.host.appendChild(note('두 열이 함께 값을 가진 줄이 세 줄이 안 됩니다.'));
    }
  }

  /* ═══ 시계열 ═══ */

  #renderTime() {
    const dates = this.#dateCols();
    const nums = this.#numCols();
    if (!dates.length || !nums.length) {
      return this.host.appendChild(note('날짜 열과 숫자 열이 하나씩 있어야 합니다.'));
    }

    const state = this.timeState ||= { d: dates[0].name, v: nums[0].name };
    this.host.appendChild(el('div.dv__bar', [
      el('label.dv__pick', [el('span', { text: '날짜' }),
        select(dates.map((c) => c.name), state.d, (v) => { state.d = v; this.render(); })]),
      el('label.dv__pick', [el('span', { text: '값' }),
        select(nums.map((c) => c.name), state.v, (v) => { state.v = v; this.render(); })]),
    ]));

    const dc = dates.find((c) => c.name === state.d) || dates[0];
    const vc = nums.find((c) => c.name === state.v) || nums[0];
    const bars = st.asBars(dc.values, vc.values);

    if (bars.length < 3) return this.host.appendChild(note('날짜와 값이 함께 있는 줄이 세 줄이 안 됩니다.'));

    const first = new Date(bars[0].t), last = new Date(bars[bars.length - 1].t);
    const years = (last - first) / (365.25 * 86_400_000);

    // 줄 간격을 재어 무엇으로 셈할지 정한다. 월말 자료에 252를 쓰면
    // 흔들림이 네 배 넘게 부풀어 나온다.
    const gaps = [];
    for (let i = 1; i < bars.length; i++) gaps.push((bars[i].t - bars[i - 1].t) / 86_400_000);
    gaps.sort((a, b) => a - b);
    const medGap = gaps[Math.floor(gaps.length / 2)] || 1;
    const perYear = medGap <= 4 ? 252 : medGap <= 10 ? 52 : medGap <= 45 ? 12 : medGap <= 120 ? 4 : 1;
    const grain = { 252: '일', 52: '주', 12: '달', 4: '분기', 1: '해' }[perYear];
    // '오른 일 52%' 는 말이 안 된다. 세는 말은 따로 둔다.
    const unit = { 252: '날', 52: '주', 12: '달', 4: '분기', 1: '해' }[perYear];

    const labels = bars.map((b) => new Date(b.t).toISOString().slice(2, 10));

    const cv = el('canvas.dv__cv');
    this.canvases.push(() => plot.lines(cv, {
      labels, series: [{ name: vc.name, values: bars.map((b) => b.c) }],
    }));
    this.host.appendChild(el('div.dv__plot', [cv]));

    const neg = bars.some((b) => b.c <= 0);
    const dd = drawdown(bars);
    const cg = neg ? null : cagr(bars);

    /* 흔들림과 샤프는 여기서 직접 센다.

       analysis.js 의 vol()·sharpe() 는 시세를 다루므로 하루·주·달만 안다.
       올라오는 표는 분기나 해 단위인 일이 흔하고, 그때 252를 쓰면
       흔들림이 열 배 넘게 부풀어 나온다. 위에서 잰 간격을 그대로 쓴다. */
    const rs = neg ? [] : logReturns(bars);
    const vv = rs.length >= 5 ? stdev(rs) * Math.sqrt(perYear) * 100 : null;
    const sh = rs.length >= 20 && vv > 0
      ? (amean(rs) * perYear - Math.log(1.03)) / (stdev(rs) * Math.sqrt(perYear))
      : null;

    this.host.appendChild(el('div.dv__stats', [
      stat('처음 → 마지막', bars.length + '줄', labels[0] + ' … ' + labels[labels.length - 1]),
      stat('한 줄 간격', grain, medGap.toFixed(0) + '일쯤'),
      neg ? stat('총 변화', num(bars[bars.length - 1].c - bars[0].c, 2), '0 이하가 있어 비율로 못 셉니다')
          : stat('총 수익', pct((bars[bars.length - 1].c / bars[0].c - 1) * 100), years.toFixed(1) + '년'),
      cg != null ? stat('연평균', pct(cg), '복리') : null,
      vv != null ? stat('흔들림', pct(vv), grain + '값을 해로 폈다') : null,
      dd ? stat('최대 낙폭', pct(dd.mdd), '꼭대기에서 여기까지') : null,
    ].filter(Boolean)));

    if (neg) {
      this.host.appendChild(note(
        '값에 0 이하가 있어 수익률로 셈하지 않았습니다. '
        + '손익 금액을 그대로 올린 경우입니다 — 잔고나 기준가처럼 늘 0보다 큰 값이라야 '
        + '연평균·흔들림·낙폭을 셀 수 있습니다.'));
    }

    const under = uw(bars);
    if (under?.values?.some((v) => v < 0)) {
      const cv2 = el('canvas.dv__cv.dv__cv--short');
      this.canvases.push(() => plot.underwater(cv2, { labels, values: under.values }));
      this.host.appendChild(el('h3.dv__h', { text: '물 아래' }));
      this.host.appendChild(el('div.dv__plot.dv__plot--short', [cv2]));
    }

    // 한 줄에서 다음 줄로 가는 변화의 분포
    const rets = [];
    for (let i = 1; i < bars.length; i++) {
      if (bars[i - 1].c > 0) rets.push((bars[i].c / bars[i - 1].c - 1) * 100);
    }
    if (rets.length >= 8) {
      const cv3 = el('canvas.dv__cv.dv__cv--short');
      this.canvases.push(() => plot.hist(cv3, st.histogram(rets)));
      this.host.appendChild(el('h3.dv__h', { text: unit + '마다의 변화' }));
      this.host.appendChild(el('div.dv__plot.dv__plot--short', [cv3]));

      const d = st.describe(rets);
      this.host.appendChild(el('div.dv__stats', [
        stat('가운데', pct(d.median), '중앙값'),
        stat('오른 ' + unit, Math.round(rets.filter((r) => r > 0).length / rets.length * 100) + '%', rets.length + '번 중'),
        stat('가장 나쁜 ' + unit, pct(d.min), ''),
        stat('가장 좋은 ' + unit, pct(d.max), ''),
        sh != null ? stat('샤프', num(sh, 2), '흔들림 한 몫당 수익') : null,
      ].filter(Boolean)));
    }

    this.host.appendChild(note(
      '이 숫자들은 올려 주신 값만 보고 셈한 것입니다. '
      + '명세서가 입금·출금을 값에 섞어 적어 두었다면 수익률이 아니라 잔고 변화를 잰 것이 됩니다 — '
      + '그때는 장부 화면(Κτῆσις)의 TWR 이 맞는 자리입니다.'));
  }
}

/* ═══════════════════ 조각들 ═══════════════════ */

const KIND = { date: '날짜', number: '숫자', text: '글', empty: '빔' };

function fillOf(c) {
  const filled = c.values.filter((v) => v != null && v !== '').length;
  const n = c.values.length;
  if (!n) return '';
  const p = Math.round((filled / n) * 100);
  return p === 100 ? '' : p + '% 참';
}

// 소수점을 몇 자리나 — 큰 값에 소수점 둘을 붙이면 읽기만 나쁘다
function guessDigits(v) {
  const a = Math.abs(v ?? 0);
  if (!isFinite(a)) return 0;
  if (a >= 1000) return 0;
  if (a >= 10) return 2;
  if (a >= 0.01) return 4;
  return 6;
}

const note = (text) => el('p.dv__note', { text });

const stat = (label, value, why) => el('div.dv__stat', [
  el('span.dv__statl', { text: label }),
  el('b.dv__statv', { text: value }),
  why ? el('span.dv__statw', { text: why }) : null,
].filter(Boolean));

function pills(ids, current, onPick, labels) {
  return el('div.dv__pills', ids.map((id) => el('button.chip', {
    class: id === current ? 'is-on' : '', type: 'button',
    onclick: () => onPick(id),
  }, [labels?.[id] || id])));
}

function select(options, value, onPick) {
  const s = el('select.dv__select', {
    onchange: (e) => onPick(e.target.value),
  }, options.map((o) => el('option', { value: o, selected: o === value }, [o])));
  s.value = value;
  return s;
}

function regressBlock(r, xName, yName) {
  const strong = r.p != null && r.p < 0.05;
  return el('div.dv__reg', [
    el('div.dv__stats', [
      stat('기울기', num(r.slope, guessDigits(r.slope)), josa(xName, '이/가') + ' 1 오를 때 ' + yName),
      stat('절편', num(r.intercept, guessDigits(r.intercept)), josa(xName, '이/가') + ' 0일 때'),
      stat('R²', num(r.r2, 3), '흩어짐의 ' + Math.round(r.r2 * 100) + '% 를 설명'),
      stat('p', r.p == null ? '—' : (r.p < 0.001 ? '< 0.001' : num(r.p, 3)), '표본 ' + r.n),
      stat('대개 벗어남', num(r.resid, guessDigits(r.resid)), '선에서 이만큼'),
    ]),
    el('p.dv__note', {
      text: strong
        ? `우연으로 보기 어려운 관계입니다(p ${r.p < 0.001 ? '< 0.001' : num(r.p, 3)}). `
          + `다만 R² 가 ${num(r.r2, 2)} 이므로, 나머지 ${Math.round((1 - r.r2) * 100)}% 는 여전히 다른 것이 정합니다.`
        : `우연이라고 해도 이상하지 않은 관계입니다(p ${r.p == null ? '—' : num(r.p, 3)}). `
          + '점이 흩어진 모양을 눈으로 보고 판단하십시오 — 이 선은 값이 없어도 언제나 그려집니다.',
    }),
  ]);
}
