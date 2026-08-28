/* ═══════════════════════════════════════════════════════════════
   playbook.js — 짜 놓은 전략들

   빈 화면에서 규칙을 처음부터 짜는 사람은 드물다. 대개는 어디선가 들은
   것을 흉내 내다가 그만둔다. 그래서 흔히 쓰이는 것들을 미리 짜 두고,
   각각이 무엇을 믿는 전략인지와 어디서 무너지는지를 함께 적었다.

   ── 왜 '어디서 무너지나' 를 같이 적나 ──
   전략은 시장을 맞히는 도구가 아니라 어떤 모양의 시장에 걸어 두는
   내기다. 추세추종은 방향이 이어질 때 벌고 오르내리기만 하면 잃는다.
   그 사실을 모르고 쓰면, 안 되는 구간에서 "전략이 틀렸다" 며 고치게
   되고 그때부터 지나간 우연을 외우기 시작한다.

   ── 여기 있는 것이 좋은 전략이라는 뜻이 아니다 ──
   흔한 전략이라는 뜻이다. 그대로 두면 대개 그냥 사서 들고 있는 것을
   못 이긴다. 지도 갈래에서 파라미터를 돌려 보고, 워크포워드로 뒤
   구간에서도 남는지 보고 나서야 쓸지 말지를 정할 일이다.
   ═══════════════════════════════════════════════════════════════ */

/**
 * 전략 하나는 이렇게 생겼다.
 *   id · ko · gr    이름
 *   belief          무엇을 믿는 전략인가
 *   breaks          어디서 무너지나
 *   make()          engine.js 가 아는 꼴로
 */
export const PLAYS = [
  {
    id: 'golden',
    ko: '골든크로스', gr: 'Σταυρός',
    tag: '추세',
    belief: '짧은 평균이 긴 평균을 넘으면 방향이 바뀐 것으로 본다. '
          + '가장 오래되고 가장 많이 쓰인 규칙이다.',
    breaks: '오르내리기만 하는 구간에서 계속 속는다. 넘었다 되돌리고 '
          + '다시 넘는 동안 수수료만 나간다.',
    make: () => ({
      indicators: [
        { id: 'fast', kind: 'sma', on: true, color: 'gold', cfg: { period: 20 } },
        { id: 'slow', kind: 'sma', on: true, color: 'jade', cfg: { period: 60 } },
      ],
      entry: [{ a: { src: 'ind', ind: 'fast', line: 'ma' }, op: 'cross_up', b: { src: 'ind', ind: 'slow', line: 'ma' } }],
      exit: [{ a: { src: 'ind', ind: 'fast', line: 'ma' }, op: 'cross_dn', b: { src: 'ind', ind: 'slow', line: 'ma' } }],
      entryMode: 'and', exitMode: 'and',
      stopPct: 0, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },

  {
    id: 'ma-guard',
    ko: '평균선 위에서만', gr: 'Φύλαξ',
    tag: '추세',
    belief: '값이 긴 평균 위에 있을 때만 들고 있는다. 무엇을 살지가 아니라 '
          + '언제 빠져 있을지를 정하는 규칙이다.',
    breaks: '큰 하락은 피하는 대신 바닥에서 늦게 들어간다. 되돌림이 빠른 '
          + '시장에서는 가장 좋은 며칠을 놓친다.',
    make: () => ({
      indicators: [{ id: 'trend', kind: 'sma', on: true, color: 'gold', cfg: { period: 200 } }],
      entry: [{ a: { src: 'price' }, op: 'gt', b: { src: 'ind', ind: 'trend', line: 'ma' } }],
      exit: [{ a: { src: 'price' }, op: 'lt', b: { src: 'ind', ind: 'trend', line: 'ma' } }],
      entryMode: 'and', exitMode: 'and',
      stopPct: 0, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },

  {
    id: 'rsi-back',
    ko: '되돌림 사기', gr: 'Ἐπάνοδος',
    tag: '되돌림',
    belief: '많이 내린 것은 되돌아온다. 상대강도가 낮을 때 사서 제자리로 '
          + '오면 판다.',
    breaks: '진짜로 무너지는 것과 잠깐 빠진 것을 못 가른다. 내리는 것을 '
          + '계속 사 모으다가 크게 다친다 — 그래서 손절을 함께 건다.',
    make: () => ({
      indicators: [{ id: 'rsi', kind: 'rsi', on: true, color: 'gold', cfg: { period: 14 } }],
      entry: [{ a: { src: 'ind', ind: 'rsi', line: 'rsi' }, op: 'lt', b: { src: 'const', value: 30 } }],
      exit: [{ a: { src: 'ind', ind: 'rsi', line: 'rsi' }, op: 'gt', b: { src: 'const', value: 55 } }],
      entryMode: 'and', exitMode: 'or',
      stopPct: 8, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },

  {
    id: 'boll-back',
    ko: '띠 밖에서 사기', gr: 'Ζώνη',
    tag: '되돌림',
    belief: '평균에서 표준편차 두 배 밖으로 나간 것은 드문 일이고, 드문 '
          + '것은 대개 제자리로 온다. 아래 띠를 뚫으면 사서 중심선에서 판다.',
    breaks: '추세가 강하면 띠를 타고 계속 내려간다. 그때 이 규칙은 '
          + '떨어지는 칼을 계속 받는다.',
    make: () => ({
      indicators: [{ id: 'bb', kind: 'boll', on: true, color: 'jade', cfg: { period: 20, mult: 2 } }],
      entry: [{ a: { src: 'price' }, op: 'lt', b: { src: 'ind', ind: 'bb', line: 'lo' } }],
      exit: [{ a: { src: 'price' }, op: 'gt', b: { src: 'ind', ind: 'bb', line: 'mid' } }],
      entryMode: 'and', exitMode: 'or',
      stopPct: 10, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },

  {
    id: 'macd',
    ko: 'MACD 신호', gr: 'Σύγκλισις',
    tag: '추세',
    belief: '빠른 평균과 느린 평균의 차이가 제 신호선을 넘으면 힘이 '
          + '실린 것으로 본다. 골든크로스보다 빨리 신호가 난다.',
    breaks: '빨리 나는 만큼 자주 틀린다. 거래가 잦아 수수료에 민감하다.',
    make: () => ({
      indicators: [{ id: 'macd', kind: 'macd', on: true, color: 'gold', cfg: { fast: 12, slow: 26, signal: 9 } }],
      entry: [{ a: { src: 'ind', ind: 'macd', line: 'macd' }, op: 'cross_up', b: { src: 'ind', ind: 'macd', line: 'signal' } }],
      exit: [{ a: { src: 'ind', ind: 'macd', line: 'macd' }, op: 'cross_dn', b: { src: 'ind', ind: 'macd', line: 'signal' } }],
      entryMode: 'and', exitMode: 'and',
      stopPct: 0, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },

  {
    id: 'breakout',
    ko: '전고점 뚫기', gr: 'Ῥῆξις',
    tag: '돌파',
    belief: '지난 스무 날의 가장 높은 값을 넘으면 새 구간이 열린 것으로 '
          + '본다. 터틀이라 불린 규칙의 뼈대다.',
    breaks: '뚫자마자 되돌아오는 가짜 돌파가 많다. 그래서 진폭의 몇 배로 '
          + '손절을 잡는다 — 잔잔한 것과 널뛰는 것에 같은 폭을 걸면 안 된다.',
    make: () => ({
      indicators: [
        { id: 'hi', kind: 'fx', on: true, color: 'gold', cfg: { expr: 'highest(high, 20)', label: '20일 고가' } },
        { id: 'lo', kind: 'fx', on: true, color: 'jade', cfg: { expr: 'lowest(low, 10)', label: '10일 저가' } },
      ],
      entry: [{ a: { src: 'price' }, op: 'gt', b: { src: 'ind', ind: 'hi', line: 'fx' } }],
      exit: [{ a: { src: 'price' }, op: 'lt', b: { src: 'ind', ind: 'lo', line: 'fx' } }],
      entryMode: 'and', exitMode: 'or',
      stopPct: 0, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },

  {
    id: 'gap',
    ko: '이격도', gr: 'Ἀπόστασις',
    tag: '되돌림',
    belief: '값이 이십일선에서 너무 멀어지면 당겨진 고무줄처럼 돌아온다. '
          + '아래로 멀어졌을 때 사서 제자리에서 판다.',
    breaks: '고무줄은 끊어지기도 한다. 회사에 진짜 문제가 생겼을 때 이 '
          + '규칙은 끝까지 산다.',
    make: () => ({
      indicators: [{
        id: 'gap', kind: 'fx', on: true, color: 'gold',
        cfg: { expr: '(close - ma(close, 20)) / ma(close, 20) * 100', label: '20일선 이격도', zero: true },
      }],
      entry: [{ a: { src: 'ind', ind: 'gap', line: 'fx' }, op: 'lt', b: { src: 'const', value: -8 } }],
      exit: [{ a: { src: 'ind', ind: 'gap', line: 'fx' }, op: 'gt', b: { src: 'const', value: 0 } }],
      entryMode: 'and', exitMode: 'or',
      stopPct: 12, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },

  {
    id: 'vol-break',
    ko: '변동성 돌파', gr: 'Ἔκρηξις',
    tag: '돌파',
    belief: '어제의 폭만큼 오늘 오르면 그날의 방향이 정해진 것으로 본다. '
          + '하루 안에 사고파는 규칙의 뼈대이고, 국내에서 많이 쓰인다.',
    breaks: '수수료와 슬리피지에 가장 약하다. 거래가 매일 일어나므로 '
          + '수수료를 조금만 올려도 성적이 뒤집힌다 — 그것을 직접 확인해 '
          + '보라고 넣어 두었다.',
    make: () => ({
      indicators: [{
        id: 'k', kind: 'fx', on: true, color: 'gold',
        cfg: { expr: 'open + (highest(high, 2) - lowest(low, 2)) * 0.5', label: '돌파선 (K=0.5)' },
      }],
      entry: [{ a: { src: 'price' }, op: 'gt', b: { src: 'ind', ind: 'k', line: 'fx' } }],
      exit: [{ a: { src: 'price' }, op: 'lt', b: { src: 'ind', ind: 'k', line: 'fx' } }],
      entryMode: 'and', exitMode: 'or',
      stopPct: 5, takePct: 0, feeBps: 30, cash: 10_000_000,
    }),
  },

  {
    id: 'dual',
    ko: '두 겹 거르기', gr: 'Διπλοῦς',
    tag: '섞음',
    belief: '큰 흐름이 위일 때만, 그 안에서 잠깐 눌린 것을 산다. 추세추종과 '
          + '되돌림을 겹쳐 서로의 약점을 덮으려는 것이다.',
    breaks: '조건이 둘이라 신호가 드물다. 오래 현금으로 앉아 있게 되고, '
          + '그동안 시장이 오르면 그대로 뒤처진다.',
    make: () => ({
      indicators: [
        { id: 'trend', kind: 'sma', on: true, color: 'jade', cfg: { period: 120 } },
        { id: 'rsi', kind: 'rsi', on: true, color: 'gold', cfg: { period: 14 } },
      ],
      entry: [
        { a: { src: 'price' }, op: 'gt', b: { src: 'ind', ind: 'trend', line: 'ma' } },
        { a: { src: 'ind', ind: 'rsi', line: 'rsi' }, op: 'lt', b: { src: 'const', value: 40 } },
      ],
      exit: [
        { a: { src: 'ind', ind: 'rsi', line: 'rsi' }, op: 'gt', b: { src: 'const', value: 65 } },
        { a: { src: 'price' }, op: 'lt', b: { src: 'ind', ind: 'trend', line: 'ma' } },
      ],
      entryMode: 'and', exitMode: 'or',
      stopPct: 10, takePct: 0, feeBps: 25, cash: 10_000_000,
    }),
  },
];

export const playById = (id) => PLAYS.find((p) => p.id === id) || null;

/** 갈래별로 묶어 보이기 좋게 */
export const TAGS = [
  { id: '추세', note: '방향이 이어진다는 데 건다' },
  { id: '되돌림', note: '벗어난 것은 돌아온다는 데 건다' },
  { id: '돌파', note: '새 구간이 열렸다는 데 건다' },
  { id: '섞음', note: '둘을 겹쳐 서로를 덮는다' },
];
