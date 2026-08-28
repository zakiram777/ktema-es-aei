/* ═══════════════════════════════════════════════════════════════
   world.js — 세계 주식시장 열지도

   TradingView 의 열지도가 하는 일을 여기서 한다. 칸 넓이는 시가총액,
   칸 색은 등락, 묶음은 업종이다.

   ── 왜 칸 넓이를 시가총액으로 두나 ──
   시세 화면의 열지도는 칸을 모두 같게 둔다. 거기에는 지수와 원자재와
   환율이 섞여 있어 '크기' 라는 것이 아예 없기 때문이다.

   여기는 다르다. 전부 한 시장의 주식이고, 애플이 1% 내리는 것과 작은
   회사가 1% 내리는 것은 지수에 미치는 무게가 백 배 넘게 다르다. 그
   무게를 칸 넓이로 보여 주지 않으면 "오늘 시장이 왜 내렸나" 를 이
   그림에서 읽을 수 없다.

   ── 왜 상위 종목만 담나 ──
   S&P 500 을 다 담으려면 오백 종목의 시세를 받아야 하고, 그것은 남의
   프록시로 할 일이 아니다. 지수 움직임의 대부분은 위쪽 몇십 개가
   만든다 — 그것만 담고, 담았다는 사실을 화면에 적는다.

   ── 시가총액은 어디서 오나 ──
   야후가 quote 문에서 준다. 다만 그 길은 자주 막히므로, 여기 적어 둔
   어림값을 밑바탕으로 깔고 받아지면 갈아 끼운다. 어림값은 2026년 중반
   기준이고 정확할 필요가 없다 — 칸의 크기를 정하는 데만 쓰므로 순서가
   맞으면 된다.
   ═══════════════════════════════════════════════════════════════ */

/* 업종 — 화면에 한글로 적는다 */
export const SECTORS = {
  tech: '기술',
  semi: '반도체',
  fin: '금융',
  health: '헬스케어',
  cons: '소비재',
  ind: '산업재',
  energy: '에너지',
  comm: '통신·미디어',
  mat: '소재',
  util: '유틸리티',
  reit: '부동산',
};

/* [기호, 이름, 업종, 시가총액 어림(십억 달러 또는 조 원)] */
const US = [
  ['NVDA', '엔비디아', 'semi', 4400], ['AAPL', '애플', 'tech', 3600],
  ['MSFT', '마이크로소프트', 'tech', 3500], ['GOOGL', '알파벳', 'comm', 2400],
  ['AMZN', '아마존', 'cons', 2300], ['META', '메타', 'comm', 1600],
  ['AVGO', '브로드컴', 'semi', 1500], ['TSLA', '테슬라', 'cons', 1300],
  ['BRK-B', '버크셔 해서웨이', 'fin', 1050], ['TSM', 'TSMC', 'semi', 1000],
  ['LLY', '일라이 릴리', 'health', 800], ['JPM', 'JP모건', 'fin', 780],
  ['WMT', '월마트', 'cons', 720], ['V', '비자', 'fin', 680],
  ['XOM', '엑슨모빌', 'energy', 540], ['ORCL', '오라클', 'tech', 530],
  ['MA', '마스터카드', 'fin', 510], ['UNH', '유나이티드헬스', 'health', 470],
  ['COST', '코스트코', 'cons', 440], ['JNJ', '존슨앤드존슨', 'health', 400],
  ['HD', '홈디포', 'cons', 390], ['PG', 'P&G', 'cons', 380],
  ['NFLX', '넷플릭스', 'comm', 370], ['ABBV', '애브비', 'health', 340],
  ['BAC', '뱅크오브아메리카', 'fin', 330], ['AMD', 'AMD', 'semi', 320],
  ['CRM', '세일즈포스', 'tech', 300], ['CVX', '셰브런', 'energy', 290],
  ['KO', '코카콜라', 'cons', 280], ['MRK', '머크', 'health', 270],
  ['ADBE', '어도비', 'tech', 250], ['PEP', '펩시코', 'cons', 240],
  ['LIN', '린데', 'mat', 230], ['TMO', '서모피셔', 'health', 220],
  ['CSCO', '시스코', 'tech', 210], ['ACN', '액센츄어', 'tech', 200],
  ['MCD', '맥도날드', 'cons', 200], ['ABT', '애보트', 'health', 195],
  ['GE', 'GE 에어로스페이스', 'ind', 190], ['CAT', '캐터필러', 'ind', 185],
  ['QCOM', '퀄컴', 'semi', 180], ['INTU', '인튜이트', 'tech', 175],
  ['TXN', '텍사스인스트루먼트', 'semi', 170], ['VZ', '버라이즌', 'comm', 165],
  ['DIS', '디즈니', 'comm', 160], ['AMAT', '어플라이드머티리얼즈', 'semi', 155],
  ['BA', '보잉', 'ind', 150], ['NEE', '넥스트에라', 'util', 145],
  ['HON', '하니웰', 'ind', 140], ['PLTR', '팔란티어', 'tech', 300],
];

const KR = [
  ['005930.KS', '삼성전자', 'semi', 460], ['000660.KS', 'SK하이닉스', 'semi', 200],
  ['373220.KS', 'LG에너지솔루션', 'ind', 90], ['207940.KS', '삼성바이오로직스', 'health', 70],
  ['005380.KS', '현대차', 'cons', 55], ['005935.KS', '삼성전자우', 'semi', 50],
  ['000270.KS', '기아', 'cons', 45], ['068270.KS', '셀트리온', 'health', 40],
  ['105560.KS', 'KB금융', 'fin', 38], ['329180.KS', 'HD현대중공업', 'ind', 36],
  ['012330.KS', '현대모비스', 'cons', 30], ['055550.KS', '신한지주', 'fin', 29],
  ['035420.KS', 'NAVER', 'comm', 28], ['051910.KS', 'LG화학', 'mat', 26],
  ['028260.KS', '삼성물산', 'ind', 25], ['006400.KS', '삼성SDI', 'ind', 24],
  ['086790.KS', '하나금융지주', 'fin', 23], ['015760.KS', '한국전력', 'util', 22],
  ['009540.KS', 'HD한국조선해양', 'ind', 21], ['259960.KS', '크래프톤', 'comm', 20],
  ['032830.KS', '삼성생명', 'fin', 19], ['035720.KS', '카카오', 'comm', 18],
  ['003670.KS', '포스코퓨처엠', 'mat', 17], ['138040.KS', '메리츠금융지주', 'fin', 17],
  ['011200.KS', 'HMM', 'ind', 16], ['316140.KS', '우리금융지주', 'fin', 15],
  ['010130.KS', '고려아연', 'mat', 15], ['034020.KS', '두산에너빌리티', 'ind', 14],
  ['267260.KS', 'HD현대일렉트릭', 'ind', 14], ['096770.KS', 'SK이노베이션', 'energy', 13],
  ['017670.KS', 'SK텔레콤', 'comm', 12], ['030200.KS', 'KT', 'comm', 11],
  ['066570.KS', 'LG전자', 'tech', 11], ['018260.KS', '삼성에스디에스', 'tech', 10],
  ['247540.KQ', '에코프로비엠', 'mat', 10], ['091990.KQ', '셀트리온헬스케어', 'health', 9],
  ['196170.KQ', '알테오젠', 'health', 9], ['086520.KQ', '에코프로', 'mat', 8],
  ['352820.KS', '하이브', 'comm', 8], ['011070.KS', 'LG이노텍', 'tech', 7],
];

const JP = [
  ['7203.T', '도요타', 'cons', 280], ['8306.T', '미쓰비시UFJ', 'fin', 170],
  ['6501.T', '히타치', 'ind', 160], ['6758.T', '소니', 'tech', 150],
  ['9983.T', '패스트리테일링', 'cons', 110], ['8058.T', '미쓰비시상사', 'ind', 100],
  ['6861.T', '키엔스', 'ind', 95], ['9432.T', 'NTT', 'comm', 90],
  ['8035.T', '도쿄일렉트론', 'semi', 88], ['4519.T', '주가이제약', 'health', 70],
  ['8316.T', '미쓰이스미토모', 'fin', 68], ['7974.T', '닌텐도', 'comm', 65],
  ['6098.T', '리크루트', 'ind', 62], ['4063.T', '신에쓰화학', 'mat', 60],
  ['8411.T', '미즈호', 'fin', 55], ['7267.T', '혼다', 'cons', 50],
  ['6902.T', '덴소', 'cons', 48], ['4568.T', '다이이치산쿄', 'health', 46],
  ['6367.T', '다이킨', 'ind', 44], ['9433.T', 'KDDI', 'comm', 42],
  ['6981.T', '무라타제작소', 'tech', 40], ['8001.T', '이토추', 'ind', 38],
  ['7741.T', '호야', 'health', 36], ['6594.T', '니덱', 'ind', 30],
];

const EU = [
  ['ASML', 'ASML', 'semi', 330], ['SAP', 'SAP', 'tech', 320],
  ['NVO', '노보노디스크', 'health', 300], ['NVS', '노바티스', 'health', 240],
  ['AZN', '아스트라제네카', 'health', 235], ['HSBC', 'HSBC', 'fin', 200],
  ['SHEL', '셸', 'energy', 195], ['TTE', '토탈에너지스', 'energy', 150],
  ['UL', '유니레버', 'cons', 145], ['SNY', '사노피', 'health', 130],
  ['BUD', 'AB인베브', 'cons', 120], ['RIO', '리오틴토', 'mat', 110],
  ['BTI', 'BAT', 'cons', 105], ['BP', 'BP', 'energy', 90],
  ['DEO', '디아지오', 'cons', 70], ['UBS', 'UBS', 'fin', 68],
  ['BBVA', 'BBVA', 'fin', 60], ['SAN', '산탄데르', 'fin', 58],
  ['E', '에니', 'energy', 50], ['ING', 'ING', 'fin', 48],
];

const CN = [
  ['BABA', '알리바바', 'cons', 260], ['PDD', '핀둬둬', 'cons', 160],
  ['NTES', '넷이즈', 'comm', 90], ['JD', '징둥', 'cons', 60],
  ['BIDU', '바이두', 'comm', 32], ['TCOM', '트립닷컴', 'cons', 42],
  ['LI', '리오토', 'cons', 25], ['NIO', '니오', 'cons', 12],
  ['XPEV', '샤오펑', 'cons', 18], ['BEKE', '커홀딩스', 'reit', 22],
  ['YUMC', '염차이나', 'cons', 17], ['ZTO', 'ZTO익스프레스', 'ind', 16],
  ['TME', '텐센트뮤직', 'comm', 20], ['HTHT', '화주그룹', 'cons', 12],
];

export const MARKETS = [
  { id: 'us', ko: '미국', gr: 'Ἀμερική', index: '^GSPC', indexKo: 'S&P 500',
    unit: '십억 달러', note: '시가총액 위쪽 50종목', rows: US },
  { id: 'kr', ko: '한국', gr: 'Κορέα', index: '^KS11', indexKo: '코스피',
    unit: '조 원', note: '코스피·코스닥 위쪽 40종목', rows: KR },
  { id: 'jp', ko: '일본', gr: 'Ἰαπωνία', index: '^N225', indexKo: '닛케이 225',
    unit: '조 엔', note: '위쪽 24종목', rows: JP },
  { id: 'eu', ko: '유럽', gr: 'Εὐρώπη', index: '^STOXX50E', indexKo: '유로스톡스 50',
    unit: '십억 달러', note: '미국에 상장된 유럽 대형주 20종목', rows: EU },
  { id: 'cn', ko: '중국', gr: 'Σῖναι', index: '000001.SS', indexKo: '상하이종합',
    unit: '십억 달러', note: '미국에 상장된 중국 대형주 14종목', rows: CN },
];

export const marketById = (id) => MARKETS.find((m) => m.id === id) || MARKETS[0];

/** 한 시장의 종목을 {symbol, ko, sector, cap} 으로 편다 */
export function itemsOf(market) {
  return market.rows.map(([symbol, ko, sector, cap]) => ({ symbol, ko, sector, cap }));
}

/* ═══════════════════ 네모 채우기 ═══════════════════

   Squarified treemap. 넓이를 값에 비례해 나누되 칸이 되도록 정사각형에
   가깝게 만든다.

   ── 왜 그냥 세로로 자르지 않나 ──
   값 순서대로 세로로만 자르면 큰 것은 뚱뚱한 기둥, 작은 것은 실오라기가
   된다. 실오라기가 된 칸에는 이름을 적을 수 없고, 이름을 못 적으면
   그 칸은 없는 것과 같다.

   Bruls·Huizing·van Wijk (2000) 의 방법이다. 줄에 하나를 더 넣었을 때
   가로세로 비가 나아지면 넣고, 나빠지면 줄을 끊는다.
*/
export function squarify(items, x, y, w, h) {
  const out = [];
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!(total > 0) || w <= 0 || h <= 0) return out;

  // 넓이를 값에 맞춰 미리 환산해 둔다
  const scale = (w * h) / total;
  const queue = items.map((it) => ({ ...it, area: it.value * scale }))
    .sort((a, b) => b.area - a.area);

  let X = x, Y = y, W = w, H = h;
  let row = [], rowArea = 0;

  const short = () => Math.min(W, H);

  /** 이 줄을 지금 끊으면 가장 나쁜 칸의 가로세로 비 */
  const worst = (rowA, extra) => {
    const s = short();
    const area = rowA + extra;
    if (!(area > 0) || !(s > 0)) return Infinity;
    const side = area / s;                    // 줄의 두께
    let bad = 0;
    for (const it of row) {
      const len = it.area / side;
      bad = Math.max(bad, Math.max(side / len, len / side));
    }
    if (extra) {
      const len = extra / side;
      bad = Math.max(bad, Math.max(side / len, len / side));
    }
    return bad;
  };

  const flush = () => {
    if (!row.length) return;
    const s = short();
    const side = rowArea / s;                 // 줄의 두께
    let off = 0;
    for (const it of row) {
      const len = it.area / side;
      if (W >= H) out.push({ ...it, x: X, y: Y + off, w: side, h: len });
      else out.push({ ...it, x: X + off, y: Y, w: len, h: side });
      off += len;
    }
    if (W >= H) { X += side; W -= side; } else { Y += side; H -= side; }
    row = []; rowArea = 0;
  };

  for (const it of queue) {
    if (it.area <= 0) continue;
    if (!row.length || worst(rowArea, it.area) <= worst(rowArea, 0)) {
      row.push(it); rowArea += it.area;
    } else {
      flush();
      row.push(it); rowArea += it.area;
    }
  }
  flush();
  return out;
}

/* ═══════════════════ 업종으로 묶기 ═══════════════════

   업종 덩어리를 먼저 나누고, 그 안에서 종목을 다시 나눈다. 두 겹으로
   나누어야 "오늘 반도체가 통째로 빨갛다" 같은 것이 한눈에 보인다. */
export function layout(rows, w, h, { group = true } = {}) {
  const live = rows.filter((r) => r.value > 0);
  if (!live.length) return [];

  if (!group) return squarify(live, 0, 0, w, h).map((c) => ({ ...c, kind: 'leaf' }));

  const by = new Map();
  for (const r of live) {
    if (!by.has(r.sector)) by.set(r.sector, []);
    by.get(r.sector).push(r);
  }

  const groups = [...by.entries()].map(([sector, list]) => ({
    sector,
    value: list.reduce((a, b) => a + b.value, 0),
    list,
  }));

  const out = [];
  const PAD = 15;                              // 업종 이름이 앉을 자리
  for (const g of squarify(groups, 0, 0, w, h)) {
    out.push({ kind: 'group', sector: g.sector, x: g.x, y: g.y, w: g.w, h: g.h });
    const iw = Math.max(0, g.w - 2);
    const ih = Math.max(0, g.h - PAD - 1);
    if (iw < 6 || ih < 6) continue;
    for (const c of squarify(g.list, g.x + 1, g.y + PAD, iw, ih)) {
      out.push({ ...c, kind: 'leaf' });
    }
  }
  return out;
}
