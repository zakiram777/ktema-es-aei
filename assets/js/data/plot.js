/* ═══════════════════════════════════════════════════════════════
   plot.js — 올린 표를 그린다

   chart.js 는 시세를 그린다 — 봉이 있고, 굴려 당길 수 있고, 지표를
   얹는다. 여기서 필요한 것은 그런 것이 아니다. 아무 숫자나 받아 선·
   막대·점·칸으로 그리기만 하면 된다.

   ── 왜 따로 두나 ──
   chart.js 에 '이건 봉이 아니라 그냥 숫자다' 를 끼워 넣으면, 앞으로
   봉을 고칠 때마다 이쪽이 깨지는지 같이 봐야 한다. 서로 모르는 편이
   싸다.

   ── 모든 그림이 지키는 것 ──
   · 눈금 숫자를 사람이 읽는 자리에서 끊는다 (1·2·5의 배수)
   · 창 크기와 화면 밀도를 그릴 때마다 다시 잰다 — 숨어 있는 동안에
     들어온 자료 때문에 빈 칸이 남는 일을 여기서 끝낸다
   · 값이 하나도 없으면 빈 판이 아니라 그 사실을 적는다
   ═══════════════════════════════════════════════════════════════ */

const CSS = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/* 여러 줄을 겹칠 때 쓰는 빛깔. 색맹을 생각해 밝기도 같이 벌린다 —
   색만 다르면 여덟 줄째부터는 아무도 못 가린다. */
export const SERIES = [
  '#2962ff', '#e8a33d', '#26a69a', '#f0554d',
  '#9b7ede', '#4fc3f7', '#c0ca33', '#ff8a65',
];

/** 캔버스를 지금 크기·밀도에 맞춘다. 그릴 수 없으면 false. */
function fit(cv) {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  return { g, w: r.width, h: r.height };
}

function empty(cv, msg) {
  const s = fit(cv);
  if (!s) return;
  s.g.fillStyle = CSS('--tx-500', '#4e586a');
  s.g.font = '13px system-ui, sans-serif';
  s.g.textAlign = 'center';
  s.g.fillText(msg, s.w / 2, s.h / 2);
}

/* 눈금을 사람이 읽는 자리에서 끊는다.
   7013.4 같은 숫자를 눈금에 적으면 읽는 데 시간이 걸리고, 눈금은
   읽으라고 있는 것이 아니라 가늠하라고 있는 것이다. */
function ticks(lo, hi, want = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / want;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

const fmtTick = (v) => {
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(1) + '조';
  if (a >= 1e8) return (v / 1e8).toFixed(1) + '억';
  if (a >= 1e4) return (v / 1e4).toFixed(1) + '만';
  if (a >= 100) return Math.round(v).toLocaleString('ko-KR');
  if (a >= 1) return (Math.round(v * 100) / 100).toString();
  if (a === 0) return '0';
  return v.toPrecision(2);
};

const PAD = { l: 62, r: 14, t: 14, b: 30 };

/* 뼈대 하나 — 축, 눈금, 격자. 모든 그림이 이것을 먼저 부른다. */
function frame(g, w, h, { xLo, xHi, yLo, yHi, xLabels, yFmt = fmtTick }) {
  const iw = w - PAD.l - PAD.r;
  const ih = h - PAD.t - PAD.b;

  const X = (v) => PAD.l + (xHi === xLo ? iw / 2 : ((v - xLo) / (xHi - xLo)) * iw);
  const Y = (v) => PAD.t + ih - (yHi === yLo ? ih / 2 : ((v - yLo) / (yHi - yLo)) * ih);

  g.strokeStyle = CSS('--line', 'rgba(255,255,255,.07)');
  g.fillStyle = CSS('--tx-400', '#6b7688');
  g.font = '11px system-ui, sans-serif';
  g.lineWidth = 1;

  // 가로 눈금
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (const v of ticks(yLo, yHi)) {
    const y = Math.round(Y(v)) + 0.5;
    g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(w - PAD.r, y); g.stroke();
    g.fillText(yFmt(v), PAD.l - 8, y);
  }

  // 세로 눈금
  g.textAlign = 'center';
  g.textBaseline = 'top';
  if (xLabels) {
    // 칸이 좁으면 건너뛴다 — 겹쳐 적으면 하나도 못 읽는다
    const every = Math.max(1, Math.ceil(xLabels.length / Math.max(2, Math.floor(iw / 74))));
    xLabels.forEach((lab, i) => {
      if (i % every) return;
      const x = X(i);
      g.fillText(String(lab).slice(0, 12), x, h - PAD.b + 8);
    });
  } else {
    for (const v of ticks(xLo, xHi, 6)) {
      const x = Math.round(X(v)) + 0.5;
      g.strokeStyle = CSS('--line-soft', 'rgba(255,255,255,.04)');
      g.beginPath(); g.moveTo(x, PAD.t); g.lineTo(x, h - PAD.b); g.stroke();
      g.fillText(fmtTick(v), x, h - PAD.b + 8);
    }
  }

  return { X, Y, iw, ih };
}

const finite = (v) => typeof v === 'number' && isFinite(v);

function span(vals) {
  const xs = vals.filter(finite);
  if (!xs.length) return null;
  let lo = Math.min(...xs), hi = Math.max(...xs);
  if (lo === hi) { lo -= Math.abs(lo || 1) * 0.05; hi += Math.abs(hi || 1) * 0.05; }
  // 위아래로 조금 여유를 둔다 — 선이 테두리에 붙으면 읽기 나쁘다
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

/* ═══════════════════ 선 · 막대 ═══════════════════

   x 는 자리(0,1,2…)로 두고 이름표만 따로 적는다.

   ── 왜 날짜를 실제 간격으로 안 그리나 ──
   그리고 싶었지만, 올라오는 표는 대개 간격이 고르지 않다 (월말만,
   분기말만, 빠진 달). 실제 간격으로 그리면 빈 곳이 생기고 사람들은
   그것을 '값이 0인 구간' 으로 읽는다. 자리로 두면 그 오해가 없다.
   대신 이름표에 날짜를 그대로 적어 둔다. */
export function lines(cv, { labels, series, kind = 'line' }) {
  const live = (series || []).filter((s) => s.values.some(finite));
  if (!live.length) return empty(cv, '그릴 숫자가 없습니다');

  const s = fit(cv);
  if (!s) return;
  const { g, w, h } = s;

  const all = live.flatMap((x) => x.values);
  const yr = span(all);
  if (!yr) return empty(cv, '그릴 숫자가 없습니다');

  // 0 이 범위 안에 있으면 반드시 넣는다 — 막대는 0에서 자라야 한다
  if (kind === 'bar') { yr[0] = Math.min(yr[0], 0); yr[1] = Math.max(yr[1], 0); }

  const n = Math.max(...live.map((x) => x.values.length));
  const { X, Y } = frame(g, w, h, {
    xLo: 0, xHi: Math.max(1, n - 1), yLo: yr[0], yHi: yr[1], xLabels: labels,
  });

  // 0 줄은 굵게 — 손익을 그릴 때 여기가 가장 중요한 줄이다
  if (yr[0] < 0 && yr[1] > 0) {
    g.strokeStyle = CSS('--line-hard', 'rgba(255,255,255,.13)');
    g.beginPath(); g.moveTo(PAD.l, Math.round(Y(0)) + 0.5); g.lineTo(w - PAD.r, Math.round(Y(0)) + 0.5); g.stroke();
  }

  live.forEach((ser, si) => {
    const col = ser.color || SERIES[si % SERIES.length];

    if (kind === 'bar') {
      const slot = (w - PAD.l - PAD.r) / Math.max(1, n);
      const bw = Math.max(1, (slot * 0.72) / live.length);
      g.fillStyle = col;
      ser.values.forEach((v, i) => {
        if (!finite(v)) return;
        const x = X(i) - (bw * live.length) / 2 + si * bw;
        const y0 = Y(0), y1 = Y(v);
        g.fillRect(x, Math.min(y0, y1), bw, Math.max(1, Math.abs(y1 - y0)));
      });
      return;
    }

    g.strokeStyle = col;
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.beginPath();
    let down = true;                     // 붓을 떼고 있나 — 빈 값에서 선을 끊는다
    ser.values.forEach((v, i) => {
      if (!finite(v)) { down = true; return; }
      const x = X(i), y = Y(v);
      if (down) { g.moveTo(x, y); down = false; } else g.lineTo(x, y);
    });
    g.stroke();
  });
}

/* ═══════════════════ 점 ═══════════════════

   두 열의 관계를 볼 때. 회귀선을 같이 받으면 얹어 그린다. */
export function scatter(cv, { xs, ys, xName, yName, fit: line }) {
  const s = fit(cv);
  if (!s) return;
  const { g, w, h } = s;

  const xr = span(xs), yr = span(ys);
  if (!xr || !yr) return empty(cv, '그릴 숫자가 없습니다');

  const { X, Y } = frame(g, w, h, { xLo: xr[0], xHi: xr[1], yLo: yr[0], yHi: yr[1] });

  g.fillStyle = CSS('--key-500', '#2962ff');
  g.globalAlpha = xs.length > 400 ? 0.35 : 0.68;
  for (let i = 0; i < xs.length; i++) {
    if (!finite(xs[i]) || !finite(ys[i])) continue;
    g.beginPath();
    g.arc(X(xs[i]), Y(ys[i]), 2.6, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  if (line) {
    g.strokeStyle = CSS('--warn', '#e8a33d');
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(X(xr[0]), Y(line.at(xr[0])));
    g.lineTo(X(xr[1]), Y(line.at(xr[1])));
    g.stroke();
  }

  // 축 이름
  g.fillStyle = CSS('--tx-500', '#4e586a');
  g.font = '11px system-ui, sans-serif';
  g.textAlign = 'right'; g.textBaseline = 'bottom';
  if (xName) g.fillText(xName, w - PAD.r, h - 2);
  if (yName) {
    g.save();
    g.translate(11, PAD.t);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'right';
    g.fillText(yName, 0, 0);
    g.restore();
  }
}

/* ═══════════════════ 분포 ═══════════════════ */
export function hist(cv, h0) {
  if (!h0?.bins?.length) return empty(cv, '분포를 그릴 값이 모자랍니다');

  const s = fit(cv);
  if (!s) return;
  const { g, w, h } = s;

  const maxN = Math.max(...h0.bins.map((b) => b.n));
  const { X, Y } = frame(g, w, h, {
    xLo: h0.lo, xHi: h0.hi, yLo: 0, yHi: maxN * 1.06, yFmt: (v) => String(Math.round(v)),
  });

  for (const b of h0.bins) {
    const x0 = X(b.from), x1 = X(b.to);
    const y = Y(b.n), y0 = Y(0);
    // 음수 쪽은 붉게, 양수 쪽은 푸르게 — 수익률 분포일 때 바로 읽힌다
    g.fillStyle = b.to <= 0 ? CSS('--down-soft', 'rgba(63,138,224,.16)') : CSS('--up-soft', 'rgba(240,85,77,.16)');
    g.fillRect(x0, y, Math.max(1, x1 - x0 - 1), y0 - y);
    g.strokeStyle = b.to <= 0 ? CSS('--down-line', 'rgba(63,138,224,.38)') : CSS('--up-line', 'rgba(240,85,77,.38)');
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y + 0.5, Math.max(1, x1 - x0 - 1), y0 - y);
  }

  // 0 을 지나는 세로줄
  if (h0.lo < 0 && h0.hi > 0) {
    g.strokeStyle = CSS('--line-hard', 'rgba(255,255,255,.13)');
    g.beginPath();
    g.moveTo(Math.round(X(0)) + 0.5, PAD.t);
    g.lineTo(Math.round(X(0)) + 0.5, h - PAD.b);
    g.stroke();
  }
}

/* ═══════════════════ 상관 칸 ═══════════════════

   ── 왜 색을 두 갈래로만 쓰나 ──
   무지개로 칠하면 예쁘지만 어느 쪽이 큰지 알 수 없다. 0을 가운데 두고
   양쪽으로만 짙어지게 하면, 부호와 세기가 한눈에 같이 읽힌다. */
export function heat(cv, { m, names, counts }) {
  const n = names.length;
  if (!n) return empty(cv, '고른 열이 없습니다');

  const s = fit(cv);
  if (!s) return;
  const { g, w, h } = s;

  const left = Math.min(150, Math.max(70, w * 0.22));
  const top = 26;
  const cw = (w - left - 8) / n;
  const ch = (h - top - 8) / n;
  if (cw < 6 || ch < 6) return empty(cv, '열이 너무 많아 그릴 수 없습니다');

  g.font = '10px system-ui, sans-serif';

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = m[i][j];
      const x = left + j * cw, y = top + i * ch;

      if (r == null) {
        g.fillStyle = CSS('--bg-200', '#1c2231');
      } else {
        const a = Math.min(0.85, Math.abs(r) * 0.85 + 0.05);
        g.fillStyle = r >= 0
          ? `rgba(240, 85, 77, ${a})`        // 같이 간다
          : `rgba(63, 138, 224, ${a})`;      // 반대로 간다
      }
      g.fillRect(x, y, cw - 1, ch - 1);

      if (cw > 34 && ch > 18 && r != null) {
        g.fillStyle = Math.abs(r) > 0.45 ? '#fff' : CSS('--tx-300', '#97a2b4');
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(r.toFixed(2), x + cw / 2, y + ch / 2);
      }
    }
  }

  g.fillStyle = CSS('--tx-300', '#97a2b4');
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    g.fillText(String(names[i]).slice(0, 16), left - 6, top + i * ch + ch / 2);
  }
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (let j = 0; j < n; j++) {
    if (cw < 26) break;
    g.fillText(String(names[j]).slice(0, 7), left + j * cw + cw / 2, top - 6);
  }
}

/* ═══════════════════ 물 아래 ═══════════════════

   꼭대기에서 얼마나 내려와 있나. 시계열로 볼 때만 쓴다.
   선이 아니라 채워진 면으로 그린다 — 낙폭은 '얼마나 오래' 가 '얼마나
   깊이' 만큼 아프기 때문이고, 면이라야 그 길이가 보인다. */
export function underwater(cv, { labels, values }) {
  if (!values?.some(finite)) return empty(cv, '그릴 숫자가 없습니다');

  const s = fit(cv);
  if (!s) return;
  const { g, w, h } = s;

  // 값은 퍼센트로 들어온다 (analysis.js 가 그렇게 낸다)
  const lo = Math.min(...values.filter(finite));
  const { X, Y } = frame(g, w, h, {
    xLo: 0, xHi: Math.max(1, values.length - 1), yLo: Math.min(lo * 1.08, -1), yHi: 0,
    xLabels: labels, yFmt: (v) => v.toFixed(0) + '%',
  });

  g.beginPath();
  g.moveTo(X(0), Y(0));
  values.forEach((v, i) => { if (finite(v)) g.lineTo(X(i), Y(v)); });
  g.lineTo(X(values.length - 1), Y(0));
  g.closePath();
  g.fillStyle = 'rgba(63, 138, 224, .22)';
  g.fill();

  g.strokeStyle = CSS('--down', '#3f8ae0');
  g.lineWidth = 1.4;
  g.beginPath();
  let down = true;
  values.forEach((v, i) => {
    if (!finite(v)) { down = true; return; }
    if (down) { g.moveTo(X(i), Y(v)); down = false; } else g.lineTo(X(i), Y(v));
  });
  g.stroke();
}
