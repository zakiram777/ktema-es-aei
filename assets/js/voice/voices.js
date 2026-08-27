/* ═══════════════════════════════════════════════════════════════
   voices.js — 브라우저가 가진 목소리를 고르는 눈

   유리아는 여성의 목소리로 말한다. 그런데 Web Speech 규격에는
   성별 항목이 없다. 남는 단서는 이름뿐이라, 이름표를 들고 가른다.
   플랫폼마다 부르는 이름이 정해져 있어서 실제로는 잘 맞는다.

   못 가려낸 목소리는 '알 수 없음' 으로 두고 목록에는 남긴다.
   보는 사람이 직접 골라 들어 보고 정하면 된다.
   ═══════════════════════════════════════════════════════════════ */

/** 여성으로 알려진 이름들 */
const FEMALE = [
  // ── 한국어 ──
  // Azure/Edge: SunHi · JiMin · SeoHyeon · SoonBok · YuJin (여성)
  // Apple: Yuna · 유나   Amazon: Seoyeon   Windows: Heami
  'heami', 'sunhi', 'yuna', 'sora', 'jia', 'seoyeon', 'jimin',
  'seohyeon', 'soonbok', 'yujin', 'nayeon', 'jiyoon',
  '한국의', '유나', '여성',
  // ── Microsoft (영어·다국어) ──
  'zira', 'aria', 'jenny', 'michelle', 'ana', 'sara', 'eva', 'hazel',
  'susan', 'linda', 'heera', 'catherine', 'hoda', 'elsa', 'nanami',
  'xiaoxiao', 'xiaoyi', 'yunxi', 'sonia', 'libby', 'natasha', 'clara',
  'emily', 'amber', 'ashley', 'cora', 'elizabeth', 'monica', 'jessa',
  'nancy', 'jane', 'emma', 'luna', 'phoebe', 'yan', 'denise', 'seraphina',
  // ── Apple ──
  'samantha', 'victoria', 'allison', 'ava', 'karen', 'moira', 'tessa',
  'fiona', 'serena', 'kate', 'nicky', 'zoe', 'alva', 'anna', 'ellen',
  'ioana', 'joana', 'kanya', 'kyoko', 'laura', 'lekha', 'luciana',
  'mariska', 'mei', 'melina', 'milena', 'nora', 'paulina', 'sara',
  'satu', 'sinji', 'tarik', 'ting', 'yelda', 'zosia', 'zuzana',
  'amelie', 'amélie', 'chantal', 'marie', 'audrey', 'aurelie',
  // ── Google ──
  'female',
];

/** 남성으로 알려진 이름들 — female 을 먼저 보고 이쪽을 본다 */
const MALE = [
  // 한국어 남성 — Azure/Edge: InJoon · BongJin · GookMin · Hyunsu
  'injoon', 'gyeong', 'minsu', 'bongjin', 'gookmin', 'hyunsu',
  'davis', 'tony', 'jason', 'andrew', 'brian', 'ethan', 'liam',
  'david', 'mark', 'guy', 'ryan', 'george', 'oliver', 'james', 'william',
  'brandon', 'christopher', 'eric', 'jacob', 'roger', 'steffan', 'thomas',
  'alex', 'daniel', 'fred', 'tom', 'aaron', 'arthur', 'gordon', 'lee',
  'nathan', 'reed', 'rocko', 'grandpa', 'jamie', 'rishi', 'bruce',
  'diego', 'jorge', 'juan', 'luca', 'maged', 'xander', 'yuri', 'carlos',
  'male',
];

const has = (name, list) => list.some((w) => name.includes(w));

/** 'female' | 'male' | 'unknown' */
export function genderOf(voice) {
  const n = (voice.name || '').toLowerCase();
  // 'female' 안에 'male' 이 들어 있다. 반드시 이 순서로 본다.
  if (n.includes('female')) return 'female';
  if (has(n, FEMALE)) return 'female';
  if (has(n, MALE)) return 'male';
  return 'unknown';
}

/* ─────────────── 목소리 목록 ─────────────── */

let ready = null;

/**
 * 목소리 목록은 늦게 온다. 크롬은 처음 물으면 빈 배열을 주고
 * 잠시 뒤 voiceschanged 로 알려 준다. 그 사정을 여기서 감춘다.
 */
export function load() {
  if (ready) return ready;

  ready = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) { resolve([]); return; }

    // 목록이 곧바로 오면 done() 이 이 둘보다 먼저 불린다. 미리 세워 둔다.
    let poll = 0, giveUp = 0, settled = false;

    const take = () => {
      const list = synth.getVoices();
      if (list.length) { done(list); return true; }
      return false;
    };

    const done = (list) => {
      if (settled) return;
      settled = true;
      synth.removeEventListener?.('voiceschanged', onChange);
      clearInterval(poll);
      clearTimeout(giveUp);
      resolve(list);
    };

    const onChange = () => take();
    synth.addEventListener?.('voiceschanged', onChange);

    if (take()) return;

    // 사파리는 voiceschanged 를 안 줄 때가 있다. 잠깐 되물어 본다.
    poll = setInterval(take, 220);
    giveUp = setTimeout(() => done(synth.getVoices() || []), 4500);
  });

  return ready;
}

/** 목록을 다시 받아 온다 (기기에 목소리를 새로 깐 뒤) */
export function reload() { ready = null; return load(); }

/** 화면에 뿌리기 좋은 꼴로 */
export async function catalogue() {
  const list = await load();
  return list.map((v) => ({
    voice: v,
    name: v.name,
    lang: v.lang,
    base: (v.lang || '').slice(0, 2).toLowerCase(),
    gender: genderOf(v),
    local: !!v.localService,
    def: !!v.default,
  }));
}

/**
 * 이 언어에 가장 어울리는 목소리를 고른다.
 * 여성 > 알 수 없음 > 남성, 그리고 언어가 정확히 맞을수록 높다.
 */
export async function best(langBase = 'ko', opts = {}) {
  const all = await catalogue();
  const mine = all.filter((v) => v.base === langBase);
  let pool = mine.length ? mine : all;

  // 유리아는 여성의 목소리로 말한다. 여성으로 짚이는 것이 하나라도
  // 있으면 남성으로 짚이는 것은 아예 후보에서 뺀다. (성별을 못 가린
  // 것은 남긴다 — 이름만으로는 모를 뿐 여성일 수 있다)
  if (opts.femaleOnly !== false) {
    const kept = pool.filter((v) => v.gender !== 'male');
    if (kept.some((v) => v.gender === 'female')) pool = kept;
  }

  const score = (v) => {
    let s = 0;
    if (v.gender === 'female') s += 100;
    else if (v.gender === 'unknown') s += 40;
    if (v.base === langBase) s += 30;
    // 기기에 있는 목소리가 끊기지 않는다
    if (v.local) s += 12;
    // 이름에 Natural / Neural 이 있으면 대개 더 낫다
    if (/natural|neural|enhanced|premium/i.test(v.name)) s += 18;
    if (v.def) s += 4;
    return s;
  };

  return pool.slice().sort((a, b) => score(b) - score(a))[0] || null;
}

/**
 * 이 언어의 목소리들 — 여성으로 짚이는 것을 앞에 세워 돌려준다.
 * 설정 화면의 목록이 이것을 그대로 쓴다.
 *
 * 기기에 여성 목소리가 여럿 깔려 있어도 브라우저마다 이름이 달라
 * 어느 것이 여성인지 사람 눈에는 잘 안 보인다. 그래서 표를 달고
 * 앞으로 끌어낸다. 엣지에서는 Natural 목소리가 여럿 잡히므로
 * 이 목록만으로도 고를 것이 꽤 된다.
 */
export async function forLang(langBase = 'ko', opts = {}) {
  const all = await catalogue();
  const mine = all.filter((v) => v.base === langBase);
  const pool = mine.length ? mine : all;

  const kept = opts.femaleOnly
    ? pool.filter((v) => v.gender !== 'male')
    : pool;
  // 여성이 하나도 없는데 걸러 버리면 고를 것이 없어진다
  const list = kept.length ? kept : pool;

  const rank = (v) => (v.gender === 'female' ? 0 : v.gender === 'unknown' ? 1 : 2);
  const nice = (v) => (/natural|neural|enhanced|premium/i.test(v.name) ? 0 : 1);

  return list.slice().sort((a, b) =>
    rank(a) - rank(b) || nice(a) - nice(b) || a.name.localeCompare(b.name));
}

/** 이름으로 찾기 — 설정에 저장된 것을 되살릴 때 */
export async function byName(name) {
  if (!name) return null;
  const all = await load();
  return all.find((v) => v.name === name) || null;
}

/* ─────────────── 목소리 결 ───────────────

   같은 합성기라도 높낮이와 속도를 만지면 인상이 크게 달라진다.
   영상 열세 편의 소리를 재어 보니 기본 진동수 중앙값이 184~245 Hz,
   전체로는 220 Hz 언저리였다. 여성 음역이면서 조금 높고 밝은 쪽이다.
   그 자리를 기준으로 네 가지 결을 만들어 두었다. */

export const PRESETS = [
  {
    id: 'sage', gr: 'Σοφία', ko: '지성',
    rate: 0.98, pitch: 1.06,
    note: '또박또박, 들뜨지 않게. 아는 것을 아는 만큼만 말하는 결이다. 기본값.',
  },
  {
    id: 'oracle', gr: 'Χρησμός', ko: '신탁',
    rate: 0.92, pitch: 1.14,
    note: '느리고 조금 높다. 영상 속 목소리에 가장 가깝게 맞춘 결.',
  },
  {
    id: 'grace', gr: 'Ἑσπέρα', ko: '그윽함',
    rate: 0.9, pitch: 0.94,
    note: '낮고 깊다. 같은 목소리라도 나이가 한 뼘 들어 보인다.',
  },
  {
    id: 'clear', gr: 'Αἴγλη', ko: '맑음',
    rate: 1.02, pitch: 1.2,
    note: '가볍고 밝다. 짧은 소식을 빠르게 훑을 때.',
  },
  {
    id: 'calm', gr: 'Γαλήνη', ko: '고요',
    rate: 0.86, pitch: 1.02,
    note: '더 느리고 낮다. 긴 기사를 오래 들을 때.',
  },
  {
    id: 'keen', gr: 'Ὀξύς', ko: '단호',
    rate: 1.06, pitch: 1.18,
    note: '빠르고 또렷하다. 속보와 시세를 짚을 때.',
  },
  {
    id: 'hush', gr: 'Ψίθυρος', ko: '속삭임',
    rate: 0.82, pitch: 1.26,
    note: '가장 느리고 가장 높다. 밤에 조용히 들을 때.',
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];

/** 목소리를 시험할 때 읽는 말 */
export const SAMPLE = {
  ko: '유리아입니다. 오늘의 시장을 읽어 드리겠습니다.',
  en: 'I am Zakiram. Let me read you the market.',
};
