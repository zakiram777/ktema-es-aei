/* ═══════════════════════════════════════════════════════════════
   formula.js — 손으로 쓴 수식을 줄로 바꾼다

   틀에 박힌 지표만으로는 하고 싶은 셈이 늘 남는다. "종가를 20일
   평균으로 나눈 값" 이라든가, "고가와 저가의 차이를 종가로 나눈
   것" 이라든가. 그런 것을 직접 적을 수 있게 했다.

       (close - ma(close, 20)) / ma(close, 20) * 100

   ── 왜 eval 을 쓰지 않는가 ──
   한 줄이면 될 일이다. 그런데 eval 은 적힌 것을 그대로 실행한다 —
   수식이 아니라 무엇이든. 이 사이트는 설정을 파일로 주고받고, 그
   파일에는 수식도 담긴다. 남이 준 파일 한 장이 이 페이지에서
   아무 코드나 돌릴 수 있게 되는 것이다. 그래서 직접 읽는다.

   여기서 읽는 것은 숫자, 이름, 괄호, 사칙연산, 그리고 미리 정해 둔
   함수뿐이다. 그 밖의 글자를 만나면 어디가 잘못됐는지 알려 주고
   멈춘다. 함수 표에 없는 이름은 부를 수 없다.

   ── 어떻게 도나 ──
   수식은 봉 하나가 아니라 '줄 전체' 를 다룬다. close 는 종가 하나가
   아니라 종가의 줄이고, ma(close, 20) 은 그 줄의 이동평균 줄이다.
   더하고 빼는 것도 줄끼리 자리를 맞춰 한다. 그래서 한 번 적으면
   모든 날에 대해 한꺼번에 셈해진다.
   ═══════════════════════════════════════════════════════════════ */

import { sma, ema, rsi } from './indicators.js';

/* ═══════════════════ 읽기 (파서) ═══════════════════ */

const NUM = /[0-9]/;
const NAME_HEAD = /[A-Za-z_]/;
const NAME_BODY = /[A-Za-z0-9_]/;

/** 적힌 글을 낱개로 자른다 */
function lex(src) {
  const out = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i += 1; continue; }

    if (NUM.test(c) || (c === '.' && NUM.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && (NUM.test(src[j]) || src[j] === '.')) j += 1;
      const raw = src.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new FormulaError('숫자를 알아볼 수 없습니다: ' + raw, i);
      out.push({ t: 'num', v, at: i });
      i = j;
      continue;
    }

    if (NAME_HEAD.test(c)) {
      let j = i;
      while (j < src.length && NAME_BODY.test(src[j])) j += 1;
      out.push({ t: 'name', v: src.slice(i, j), at: i });
      i = j;
      continue;
    }

    if ('+-*/%^(),'.includes(c)) {
      out.push({ t: c, at: i });
      i += 1;
      continue;
    }

    throw new FormulaError('쓸 수 없는 글자입니다: ' + c, i);
  }

  out.push({ t: 'end', at: src.length });
  return out;
}

/**
 * 낱개를 나무로 엮는다 (재귀 하강).
 *
 *   식    := 항 (('+'|'-') 항)*
 *   항    := 거듭 (('*'|'/'|'%') 거듭)*
 *   거듭  := 홑 ('^' 거듭)?          — 오른쪽으로 묶인다 (2^3^2 = 2^9)
 *   홑    := 숫자 | 이름 | 이름'(' 인자들 ')' | '(' 식 ')' | '-' 홑
 */
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (t) => {
    if (tokens[p].t !== t) {
      throw new FormulaError('여기에는 ' + human(t) + ' 이(가) 있어야 합니다', tokens[p].at);
    }
    return tokens[p++];
  };

  function expr() {
    let left = term();
    while (peek().t === '+' || peek().t === '-') {
      const op = tokens[p++].t;
      left = { k: 'bin', op, a: left, b: term() };
    }
    return left;
  }

  function term() {
    let left = power();
    while (peek().t === '*' || peek().t === '/' || peek().t === '%') {
      const op = tokens[p++].t;
      left = { k: 'bin', op, a: left, b: power() };
    }
    return left;
  }

  function power() {
    const base = unary();
    if (peek().t === '^') {
      p += 1;
      return { k: 'bin', op: '^', a: base, b: power() };
    }
    return base;
  }

  function unary() {
    if (peek().t === '-') { p += 1; return { k: 'neg', a: unary() }; }
    if (peek().t === '+') { p += 1; return unary(); }
    return atom();
  }

  function atom() {
    const tok = peek();

    if (tok.t === 'num') { p += 1; return { k: 'num', v: tok.v }; }

    if (tok.t === '(') {
      p += 1;
      const inner = expr();
      eat(')');
      return inner;
    }

    if (tok.t === 'name') {
      p += 1;
      if (peek().t === '(') {
        p += 1;
        const args = [];
        if (peek().t !== ')') {
          args.push(expr());
          while (peek().t === ',') { p += 1; args.push(expr()); }
        }
        eat(')');
        return { k: 'call', name: tok.v, args, at: tok.at };
      }
      return { k: 'ref', name: tok.v, at: tok.at };
    }

    throw new FormulaError('여기에서 수식이 끊겼습니다', tok.at);
  }

  const tree = expr();
  if (peek().t !== 'end') {
    throw new FormulaError('여기부터는 읽을 수 없습니다', peek().at);
  }
  return tree;
}

const human = (t) => ({ ')': '닫는 괄호', '(': '여는 괄호', ',': '쉼표' }[t] || t);

export class FormulaError extends Error {
  constructor(msg, at) {
    super(msg);
    this.name = 'FormulaError';
    this.at = at;
  }
}

/* ═══════════════════ 줄끼리의 셈 ═══════════════════

   값 하나와 줄 하나를 같이 다룰 수 있어야 한다. close * 2 에서
   close 는 줄이고 2 는 값이다. 그래서 모든 셈을 '자리마다' 한다.
   어느 한쪽이라도 그 자리에 값이 없으면(null) 결과도 없다 —
   0 으로 채우면 이동평균이 시작되기 전 구간이 0 으로 뚝 떨어져
   차트가 엉망이 된다. */

const isSeries = (x) => Array.isArray(x);

function zip(a, b, fn) {
  if (!isSeries(a) && !isSeries(b)) return fn(a, b);
  const n = Math.max(isSeries(a) ? a.length : 0, isSeries(b) ? b.length : 0);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = isSeries(a) ? a[i] : a;
    const y = isSeries(b) ? b[i] : b;
    out[i] = (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y))
      ? null
      : fn(x, y);
  }
  return out;
}

const map1 = (a, fn) => (isSeries(a)
  ? a.map((v) => (v == null || !Number.isFinite(v) ? null : fn(v)))
  : (Number.isFinite(a) ? fn(a) : null));

/* ═══════════════════ 부를 수 있는 것들 ═══════════════════ */

/** 이름 하나가 가리키는 줄 */
function refs(bars) {
  return {
    close: bars.map((b) => b.c),
    open: bars.map((b) => b.o),
    high: bars.map((b) => b.h),
    low: bars.map((b) => b.l),
    volume: bars.map((b) => b.v || 0),
    hl2: bars.map((b) => (b.h + b.l) / 2),
    hlc3: bars.map((b) => (b.h + b.l + b.c) / 3),
    ohlc4: bars.map((b) => (b.o + b.h + b.l + b.c) / 4),
    range: bars.map((b) => b.h - b.l),
    body: bars.map((b) => b.c - b.o),
    n: bars.length,
    pi: Math.PI,
    e: Math.E,
  };
}

/** 부를 수 있는 함수 표. 여기 없는 이름은 부를 수 없다. */
const FUNCS = {
  ma: { args: 2, fn: (v, n) => sma(asSeries(v), asInt(n, 'ma')) },
  sma: { args: 2, fn: (v, n) => sma(asSeries(v), asInt(n, 'sma')) },
  ema: { args: 2, fn: (v, n) => ema(asSeries(v), asInt(n, 'ema')) },
  rsi: { args: 2, fn: (v, n) => rsi(asSeries(v), asInt(n, 'rsi')) },

  /** 그날 값에서 n 날 전 값을 뺀다 — 변화량 */
  diff: { args: 2, fn: (v, n) => shiftBy(asSeries(v), asInt(n, 'diff'), (now, then) => now - then) },
  /** 몇 퍼센트 움직였나 */
  pct: { args: 2, fn: (v, n) => shiftBy(asSeries(v), asInt(n, 'pct'), (now, then) => (then ? (now / then - 1) * 100 : null)) },
  /** n 날 전의 값 */
  prev: { args: 2, fn: (v, n) => shiftBy(asSeries(v), asInt(n, 'prev'), (now, then) => then) },

  /** 지난 n 날 중 가장 높았던 값 / 낮았던 값 */
  highest: { args: 2, fn: (v, n) => window(asSeries(v), asInt(n, 'highest'), Math.max) },
  lowest: { args: 2, fn: (v, n) => window(asSeries(v), asInt(n, 'lowest'), Math.min) },
  /** 지난 n 날의 표준편차 */
  stdev: { args: 2, fn: (v, n) => stdevOf(asSeries(v), asInt(n, 'stdev')) },
  /** 지난 n 날의 합 */
  sum: { args: 2, fn: (v, n) => window(asSeries(v), asInt(n, 'sum'), (a, b) => a + b, 0) },

  abs: { args: 1, fn: (v) => map1(v, Math.abs) },
  sqrt: { args: 1, fn: (v) => map1(v, (x) => (x < 0 ? null : Math.sqrt(x))) },
  log: { args: 1, fn: (v) => map1(v, (x) => (x <= 0 ? null : Math.log(x))) },
  min: { args: 2, fn: (a, b) => zip(a, b, Math.min) },
  max: { args: 2, fn: (a, b) => zip(a, b, Math.max) },
  round: { args: 1, fn: (v) => map1(v, Math.round) },
  clamp: { args: 3, fn: (v, lo, hi) => zip(zip(v, lo, Math.max), hi, Math.min) },
};

/** 사람이 볼 도움말 — 화면에 그대로 뿌린다 */
export const HELP = {
  refs: [
    ['close', '종가'], ['open', '시가'], ['high', '고가'], ['low', '저가'],
    ['volume', '거래량'], ['hl2', '(고가+저가)/2'], ['hlc3', '(고+저+종)/3'],
    ['ohlc4', '네 값의 평균'], ['range', '고가−저가'], ['body', '종가−시가'],
  ],
  funcs: [
    ['ma(x, n)', 'n일 단순이동평균'],
    ['ema(x, n)', 'n일 지수이동평균'],
    ['rsi(x, n)', 'n일 상대강도'],
    ['diff(x, n)', 'n일 전과의 차'],
    ['pct(x, n)', 'n일 전 대비 %'],
    ['prev(x, n)', 'n일 전의 값'],
    ['highest(x, n)', 'n일 중 최고'],
    ['lowest(x, n)', 'n일 중 최저'],
    ['stdev(x, n)', 'n일 표준편차'],
    ['sum(x, n)', 'n일 합'],
    ['abs · sqrt · log · round', '한 값씩'],
    ['min(a,b) · max(a,b) · clamp(x,lo,hi)', '견주기'],
  ],
  samples: [
    ['(close - ma(close, 20)) / ma(close, 20) * 100', '20일선에서 몇 % 떨어져 있나'],
    ['(close - lowest(low, 14)) / (highest(high, 14) - lowest(low, 14)) * 100', '스토캐스틱 %K'],
    ['ma(close, 5) - ma(close, 20)', '단기선과 장기선의 간격'],
    ['stdev(close, 20) / ma(close, 20) * 100', '요즘 얼마나 흔들리나'],
    ['volume / ma(volume, 20)', '거래량이 평소의 몇 배인가'],
    ['pct(close, 1)', '하루 등락률'],
  ],
};

/* ── 함수를 돕는 것들 ── */

function asSeries(v) {
  if (isSeries(v)) return v.map((x) => (Number.isFinite(x) ? x : null));
  return [v];
}

function asInt(v, who) {
  const n = isSeries(v) ? v[v.length - 1] : v;
  const k = Math.round(Number(n));
  if (!Number.isFinite(k) || k < 1 || k > 2000) {
    throw new FormulaError(who + ' 의 날수는 1 에서 2000 사이여야 합니다');
  }
  return k;
}

function shiftBy(vals, n, fn) {
  const out = new Array(vals.length).fill(null);
  for (let i = n; i < vals.length; i++) {
    const now = vals[i];
    const then = vals[i - n];
    if (now == null || then == null) continue;
    const got = fn(now, then);
    out[i] = Number.isFinite(got) ? got : null;
  }
  return out;
}

function window(vals, n, fold, seed) {
  const out = new Array(vals.length).fill(null);
  for (let i = n - 1; i < vals.length; i++) {
    let acc = seed;
    let ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      const v = vals[j];
      if (v == null) { ok = false; break; }
      acc = acc === undefined ? v : fold(acc, v);
    }
    if (ok && Number.isFinite(acc)) out[i] = acc;
  }
  return out;
}

function stdevOf(vals, n) {
  const out = new Array(vals.length).fill(null);
  for (let i = n - 1; i < vals.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      if (vals[j] == null) { ok = false; break; }
      sum += vals[j];
    }
    if (!ok) continue;
    const m = sum / n;
    let acc = 0;
    for (let j = i - n + 1; j <= i; j++) acc += (vals[j] - m) ** 2;
    out[i] = Math.sqrt(acc / n);
  }
  return out;
}

/* ═══════════════════ 셈하기 ═══════════════════ */

function run(node, env) {
  switch (node.k) {
    case 'num': return node.v;

    case 'ref': {
      if (!(node.name in env)) {
        throw new FormulaError('모르는 이름입니다: ' + node.name, node.at);
      }
      return env[node.name];
    }

    case 'neg': return map1(run(node.a, env), (x) => -x);

    case 'bin': {
      const a = run(node.a, env);
      const b = run(node.b, env);
      switch (node.op) {
        case '+': return zip(a, b, (x, y) => x + y);
        case '-': return zip(a, b, (x, y) => x - y);
        case '*': return zip(a, b, (x, y) => x * y);
        // 0 으로 나눈 자리는 없는 것으로 둔다. Infinity 를 그리면 차트가 죽는다.
        case '/': return zip(a, b, (x, y) => (y === 0 ? null : x / y));
        case '%': return zip(a, b, (x, y) => (y === 0 ? null : x % y));
        case '^': return zip(a, b, (x, y) => {
          const r = Math.pow(x, y);
          return Number.isFinite(r) ? r : null;
        });
        default: throw new FormulaError('모르는 셈입니다: ' + node.op);
      }
    }

    case 'call': {
      const f = FUNCS[node.name];
      if (!f) throw new FormulaError('모르는 함수입니다: ' + node.name, node.at);
      if (node.args.length !== f.args) {
        throw new FormulaError(
          node.name + ' 은(는) 값이 ' + f.args + '개 있어야 합니다 (' + node.args.length + '개를 주셨습니다)',
          node.at,
        );
      }
      return f.fn(...node.args.map((a) => run(a, env)));
    }

    default: throw new FormulaError('알 수 없는 수식입니다');
  }
}

/* ═══════════════════ 바깥으로 ═══════════════════ */

/**
 * 적어 둔 것이 말이 되는지만 본다 (봉이 없어도 된다).
 * @returns {{ok:true}|{ok:false, why:string, at?:number}}
 */
export function check(src) {
  try {
    parse(lex(String(src || '')));
    return { ok: true };
  } catch (err) {
    return { ok: false, why: err.message, at: err.at };
  }
}

/**
 * 수식을 봉에 대고 셈한다.
 * @param {string} src
 * @param {object[]} bars
 * @returns {{ok:true, values:number[]}|{ok:false, why:string, at?:number}}
 */
export function evaluate(src, bars) {
  if (!bars || !bars.length) return { ok: false, why: '봉이 없습니다' };

  try {
    const tree = parse(lex(String(src || '')));
    const got = run(tree, refs(bars));

    // 값 하나만 나왔으면 줄로 편다 — 차트는 줄만 그릴 줄 안다
    const values = isSeries(got)
      ? got.slice(0, bars.length)
      : new Array(bars.length).fill(Number.isFinite(got) ? got : null);

    while (values.length < bars.length) values.push(null);

    const live = values.filter((v) => v != null).length;
    if (!live) return { ok: false, why: '어느 날에도 값이 나오지 않았습니다. 날수가 봉보다 긴지 보십시오.' };

    return { ok: true, values, live };
  } catch (err) {
    if (err instanceof FormulaError) return { ok: false, why: err.message, at: err.at };
    return { ok: false, why: String(err?.message || err) };
  }
}

/** 부를 수 있는 이름들 — 도움말과 자동완성에 쓴다 */
export const NAMES = [
  ...Object.keys(refs([])).filter((k) => k !== 'n'),
  ...Object.keys(FUNCS),
];
