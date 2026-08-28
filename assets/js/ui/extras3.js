/* ═══════════════════════════════════════════════════════════════
   extras3.js — 투자주체 판과 짜 놓은 전략 고르개
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { px, pct, num, dir, big, dayStamp } from '../core/fmt.js';
import * as flows from '../market/flows.js';
import { PLAYS, TAGS, playById } from '../backtest/playbook.js';

/* ═══════════════════ 투자주체 ═══════════════════ */

export class FlowPanel {
  /**
   * @param {{dailyOf:(sym)=>Promise<Array>}} hooks
   *
   * 반드시 일봉이어야 한다. 투자주체 자료는 하루에 한 줄이라, 분봉과
   * 날짜로 짝지으면 하나도 안 맞는다 — 실제로 그렇게 되어 표본 0 이
   * 나왔었다.
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#flowsBody');
    this.box = $('#flows');
    this.btn = $('#btnFlows');
    this.symbol = null;
  }

  /** 국내 것일 때만 단추를 보인다 — 쓸 수 없는 단추는 두지 않는다 */
  mark(symbol) {
    if (this.btn) this.btn.hidden = !flows.isKorean(symbol);
    if (!flows.isKorean(symbol) && this.box) this.box.hidden = true;
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
    this.host.appendChild(el('p.ana__wait', { text: symbol + ' 의 투자주체별 매매를 부르는 중…' }));

    try {
      const [got, bars] = await Promise.all([
        flows.history(symbol, { days: 60 }),
        Promise.resolve(this.hooks.dailyOf?.(symbol)).catch(() => []),
      ]);
      clear(this.host);
      if (!got.ok) { this.host.appendChild(el('p.ana__wait', { text: got.why })); return; }
      this.#paint(got, bars || []);
    } catch (err) {
      clear(this.host);
      this.host.appendChild(el('p.ana__wait.is-bad', { text: '받지 못했습니다: ' + err.message }));
      this.symbol = null;
    }
  }

  #paint(f, bars) {
    const fwd = bars.length ? flows.forward(f, bars) : null;
    const align = flows.alignment(f, bars);

    const later = [];
    clear(this.host);

    this.host.append(
      // 요즘 누가 사고 있나
      el('div.bt__stats', flows.ACTORS.flatMap((a) => {
        const s = f.streaks[a.id] || { days: 0, dir: 0 };
        return [
          stat(a.ko + ' 20일', big(f.recent.d20[a.id]) + f.unit, dir(f.recent.d20[a.id])),
          stat(a.ko + ' 이어짐',
            s.days > 1 ? `${s.days}일 ${s.dir > 0 ? '순매수' : '순매도'}` : '—',
            s.days > 2 ? (s.dir > 0 ? 'up' : 'down') : ''),
        ];
      })),

      f.holdPct != null ? el('p.ana__why', {
        text: `외국인 보유율 ${f.holdPct.toFixed(2)}%`
            + (f.holdChange != null
              ? ` — ${f.days}일 동안 ${f.holdChange > 0 ? '+' : ''}${f.holdChange.toFixed(2)}%p ${f.holdChange > 0 ? '늘었습니다' : '줄었습니다'}.`
              : '.'),
      }) : null,

      // 누적 — 누가 모으고 있나
      el('div.ana__sub', [
        el('h4', [el('span', { text: '쌓인 순매수' }),
          el('small', { text: `최근 ${f.days}거래일 · 단위 ${f.unit}` })]),
        canvas('flow__cv', (cv) => { later.push(() => drawCum(cv, f)); }),
        el('div.flow__legend', flows.ACTORS.map((a) => el('span', [
          el('i', { style: { background: `var(${a.color})` } }),
          a.ko,
        ]))),
      ]),

      // 다음 날은 어땠나 — 이 판의 알맹이
      fwd ? this.#forward(fwd, align, f) : null,
    );

    for (const fn of later) fn();
  }

  #forward(fwd, align, f) {
    const H = [1, 5, 20];

    const rows = flows.ACTORS.map((a) => {
      const cells = H.map((h) => {
        const g = fwd[a.id]?.[h];
        if (!g || g.thin) return el('span.flow__n.is-thin', { text: `표본 ${g?.nBuy ?? 0}` });
        return el('span.flow__n', {
          class: dir(g.gap),
          title: `산 날 뒤 ${pct(g.buy, 2)} · 판 날 뒤 ${pct(g.sell, 2)} (${g.nBuy}일 / ${g.nSell}일)`,
          text: pct(g.gap, 2),
        });
      });

      const c = align?.[a.id];
      return el('div.flow__row', [
        el('span.flow__ko', [
          el('i', { style: { background: `var(${a.color})` } }),
          a.ko,
        ]),
        ...cells,
        el('span.flow__n', {
          class: c == null ? 'is-thin' : '',
          title: '그날 순매수와 그날 수익률의 상관',
          text: c == null ? '—' : c.toFixed(2),
        }),
      ]);
    });

    // 가장 앞서 보인 주체 하나를 짚어 준다
    const best = flows.ACTORS
      .map((a) => ({ a, g: fwd[a.id]?.[5] }))
      .filter((x) => x.g && !x.g.thin)
      .sort((x, y) => Math.abs(y.g.gap) - Math.abs(x.g.gap))[0];

    return el('div.ana__sub', [
      el('h4', [el('span', { text: '산 날 다음은 어땠나' }),
        el('small', { text: '순매수한 날과 순매도한 날 뒤의 수익률 차이' })]),

      el('div.flow__tbl', [
        el('div.flow__head', [
          el('span', { text: '주체' }),
          ...H.map((h) => el('span', { text: h + '일 뒤' })),
          el('span', { text: '같은 쪽' }),
        ]),
        ...rows,
      ]),

      best ? el('div.mix__verdict', {
        class: Math.abs(best.g.gap) > 0.5 ? 'is-good' : '',
      }, [
        el('b', {
          text: `${best.a.ko}이 산 날은 닷새 뒤가 판 날보다 ${pct(best.g.gap, 2)} 좋았습니다`,
        }),
        el('span', {
          text: Math.abs(best.g.gap) > 0.5
            ? `산 날 ${best.g.nBuy}번 중 ${best.g.buyWin.toFixed(0)}%가 올랐습니다. `
              + '다만 이것은 지난 예순 날의 이야기이고, 표본이 그만큼 적습니다.'
            : '셋 다 다음 날과 뚜렷한 관계가 없습니다. 흔한 결과입니다 — '
              + '"누가 사면 오른다" 는 말이 대개 맞지 않는 까닭입니다.',
        }),
      ]) : null,

      el('p.ana__why', {
        text: "'기관' 은 한 덩이가 아닙니다. 연기금과 사모펀드와 증권사 자기매매가 "
            + "다 거기 들어 있고 서로 반대로 움직이는 날이 흔합니다. '외국인' 도 "
            + '진짜 외국 돈만은 아닙니다 — 외국에 등록해 둔 국내 자금이 섞입니다. '
            + '그래서 여기서는 판단을 적지 않고 셈한 값만 냅니다.',
      }),
    ]);
  }
}

/* ═══════════════════ 짜 놓은 전략 ═══════════════════ */

export class PlayPicker {
  /** @param {{onPick:(strategy, play)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#plays');
  }

  toggle() {
    if (!this.host) return;
    this.host.hidden = !this.host.hidden;
    if (!this.host.hidden) { this.paint(); this.host.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  paint() {
    clear(this.host);
    this.host.append(
      el('p.inds__note', {
        text: '흔히 쓰이는 것들을 미리 짜 두었습니다. 좋은 전략이라는 뜻이 아니라 '
            + '흔한 전략이라는 뜻입니다 — 그대로 두면 대개 그냥 사서 들고 있는 것을 '
            + '못 이깁니다. 무엇을 믿는 전략인지와 어디서 무너지는지를 함께 적었습니다.',
      }),
      ...TAGS.map((t) => {
        const mine = PLAYS.filter((p) => p.tag === t.id);
        if (!mine.length) return null;
        return el('div.plays__group', [
          el('h5.plays__tag', [
            el('span', { text: t.id }),
            el('small', { text: t.note }),
          ]),
          el('div.plays__grid', mine.map((p) => this.#card(p))),
        ]);
      }).filter(Boolean),
    );
  }

  #card(p) {
    return el('button.play', {
      type: 'button',
      onclick: () => {
        this.hooks.onPick?.(p.make(), p);
        this.host.hidden = true;
      },
    }, [
      el('div.play__head', [
        el('span.play__gr', { text: p.gr }),
        el('b.play__ko', { text: p.ko }),
      ]),
      el('p.play__belief', { text: p.belief }),
      el('p.play__breaks', [
        el('span', { text: '무너지는 자리' }),
        p.breaks,
      ]),
    ]);
  }
}

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

/* ─────────────── 쌓인 순매수 ───────────────

   날마다의 숫자를 막대로 그리면 들쭉날쭉해서 아무 말도 안 한다.
   더해 가며 그리면 '누가 모으고 누가 덜어 내고 있나' 가 결로 보인다.
   셋을 합하면 0에 가깝다 — 누가 산 만큼 누가 팔았으므로. */

function drawCum(cv, f) {
  const rect = cv.getBoundingClientRect();
  const w = rect.width || cv.parentElement?.clientWidth || 600;
  const h = 200;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const rows = f.cum;
  if (rows.length < 2) return;

  const all = rows.flatMap((r) => [r.indiv, r.inst, r.foreign]);
  let lo = Math.min(...all, 0), hi = Math.max(...all, 0);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;

  const P = { l: 8, r: 74, t: 12, b: 22 };
  const X = (i) => P.l + (i / (rows.length - 1)) * (w - P.l - P.r);
  const Y = (v) => h - P.b - ((v - lo) / (hi - lo)) * (h - P.t - P.b);

  g.font = '10px "IBM Plex Mono", monospace';
  g.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    const y = Math.round(Y(v)) + 0.5;
    g.strokeStyle = cssVar('--line-soft', 'rgba(255,255,255,.045)');
    g.beginPath(); g.moveTo(P.l, y); g.lineTo(w - P.r, y); g.stroke();
    g.fillStyle = cssVar('--tx-500', '#4e586a');
    g.textAlign = 'left';
    g.fillText(big(v), w - P.r + 6, y);
  }

  // 0선 — 여기 위에 있으면 그동안 모은 것이고 아래면 덜어 낸 것이다
  if (lo < 0 && hi > 0) {
    const y0 = Math.round(Y(0)) + 0.5;
    g.strokeStyle = cssVar('--line-hard', 'rgba(255,255,255,.13)');
    g.beginPath(); g.moveTo(P.l, y0); g.lineTo(w - P.r, y0); g.stroke();
  }

  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let i = 0; i < 4; i++) {
    const idx = Math.round((rows.length - 1) * (i / 3));
    g.fillStyle = cssVar('--tx-500', '#4e586a');
    g.fillText(
      new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(rows[idx].t)),
      Math.max(22, Math.min(w - P.r - 22, X(idx))), h - P.b + 5,
    );
  }

  for (const a of flows.ACTORS) {
    g.strokeStyle = cssVar(a.color, '#6b9bff');
    g.lineWidth = 1.8;
    g.lineJoin = 'round';
    g.beginPath();
    rows.forEach((r, i) => { const p = [X(i), Y(r[a.id])]; i ? g.lineTo(...p) : g.moveTo(...p); });
    g.stroke();

    const last = rows[rows.length - 1][a.id];
    g.fillStyle = cssVar(a.color, '#6b9bff');
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = '600 10px "IBM Plex Mono", monospace';
    g.fillText(big(last), w - P.r + 6, Y(last));
  }
}
