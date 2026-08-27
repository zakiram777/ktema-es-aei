/* ═══════════════════════════════════════════════════════════════
   guide.js — 유리아는 길잡이다

   나타났다 사라지기만 하면 그것은 장식이다. 유리아가 이 사이트의
   동반자이려면 할 일이 있어야 한다 — 처음 온 사람에게 무엇이 어디
   있는지 알려 주고, 오래 헤매면 거들고, 무슨 일이 생기면 먼저 안다.

   ── 지킨 것 ──
   · 한 번 한 말은 다시 하지 않는다. 같은 말을 두 번 들으면 그것은
     안내가 아니라 잔소리다. 무엇을 말했는지 브라우저에 적어 둔다.
   · 사람이 무언가 하는 중에는 끼어들지 않는다. 글을 쓰거나 읽고
     있으면 기다린다.
   · 처음 몇 번만 말한다. 익숙해진 사람에게 계속 설명하지 않는다.

   ── 무엇을 말하나 ──
   화면마다 그 화면이 무엇을 하는 자리인지 한 마디. 그리고 그 화면
   에서만 쓸 수 있는 것 하나를 짚어 준다 (차트라면 "굴려 보십시오").
   ═══════════════════════════════════════════════════════════════ */

import { on } from '../core/bus.js';
import * as store from '../core/store.js';
import { greeting } from '../voice/script.js';

const KEY = 'ktema.guide.v1';

/** 화면마다 처음 왔을 때 하는 말 */
const FIRST = {
  news: {
    say: '소식입니다. 열여덟 곳에서 길어 옵니다. 제목을 누르면 제가 읽어 드립니다.',
    brief: '제목을 누르면 읽어 드립니다',
  },
  market: {
    say: '시장입니다. 숫자는 전부 누를 수 있습니다. 누르시면 제가 그 값을 읽습니다.',
    brief: '숫자를 누르면 읽어 드립니다',
  },
  chart: {
    say: '차트입니다. 차트 위에서 마우스를 굴리면 기간이 좁아지고 넓어집니다. 끌면 옆으로 흐릅니다.',
    brief: '굴려서 당기고, 끌어서 옆으로',
  },
  journal: {
    say: '투자일지입니다. 오늘 시장을 무엇으로 보았는지 적어 두십시오. 그때의 시세가 함께 붙들립니다.',
    brief: '그때의 시세가 함께 남습니다',
  },
  backtest: {
    say: '전략 시험입니다. 규칙을 짜서 지난 시세에 대어 봅니다. 그냥 사서 들고 있었을 때와 나란히 보여 드립니다.',
    brief: '사서 보유와 나란히 견줍니다',
  },
};

/** 이따금 건네는 말 — 오래 머무는 사람에게 */
const HINTS = [
  { at: 'chart', say: '지표를 직접 만드실 수 있습니다. 수식을 적으면 그것도 줄이 됩니다.', brief: '수식으로 지표를 만들 수 있습니다' },
  { at: 'news', say: '설정에서 출처를 끄고 켤 수 있습니다.', brief: '출처는 설정에서 고릅니다' },
  { at: 'journal', say: '적어 둔 것은 파일로 내보낼 수 있습니다. 이 브라우저에만 남으니까요.', brief: '내보내 두시면 잃지 않습니다' },
  { at: '*', say: '제게 물어보셔도 됩니다. 아래 대화 칸에 적으시면 답하겠습니다.', brief: '무엇이든 물어보십시오' },
  { at: '*', say: '제가 성가시면 저를 누르십시오. 물러나겠습니다.', brief: '누르면 물러납니다' },
];

/** 처음 들어온 사람에게 */
const GREET = {
  say: '유리아입니다. 시장의 소식과 시세를 읽어 드립니다. 필요하시면 언제든 부르십시오.',
  brief: '유리아입니다. 무엇을 도와드릴까요',
};

export class Guide {
  /**
   * @param {{
   *   yuria: object,
   *   speak: (lines, opts) => void,
   *   bubble: (brief, opts) => void,
   *   busy: () => boolean,
   * }} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.said = load();
    this.view = null;
    this.hintAt = Date.now();
    this.hintsGiven = 0;
    this.waitTimer = 0;

    on('view:shown', ({ view }) => this.#onView(view));

    /* 지금 보고 있는 화면을 일러 준다.

       메뉴(nav)는 길잡이보다 먼저 세워진다 — 화면이 있어야 그 위에
       안내를 얹을 수 있기 때문이다. 그런데 메뉴는 세워지면서 곧바로
       첫 화면을 열고 view:shown 을 외친다. 그때 길잡이는 아직 없다.
       그래서 첫 화면의 안내만 늘 새어 나갔다. 뒤늦게라도 물어본다. */
    if (hooks.view) this.#onView(hooks.view());

    // 한참 머물면 이따금 한 마디
    this.timer = setInterval(() => this.#maybeHint(), 30_000);
  }

  /**
   * 들어온 사람에게 인사한다.
   *
   * 처음이면 자기가 누구인지 말한다. 두 번째부터는 짧게, 그러나
   * 매번 다른 말로 — 같은 말을 매번 들으면 사람이 아니라 안내방송이
   * 된다. 그 말들은 voice/script.js 에 여럿 적혀 있다.
   */
  greet() {
    if (!this.said.has('greet')) {
      this.#say('greet', GREET);
      return;
    }

    const line = greeting('ko');
    this.hooks.yuria?.show({ reason: 'greet' });
    this.hooks.bubble?.(line, { kind: 'Ὑρία' });
    if (!store.get('muted') && !this.hooks.busy?.()) {
      this.hooks.speak?.([line], { lang: 'ko' });
    }
  }

  #onView(view) {
    this.view = view;
    this.hintAt = Date.now();
    clearTimeout(this.waitTimer);   // 떠난 화면의 안내는 뜻이 없다

    const first = FIRST[view];
    if (!first) return;
    if (this.said.has('view:' + view)) return;

    // 화면이 자리를 잡은 뒤에 — 바뀌자마자 말하면 글씨와 겹친다
    setTimeout(() => {
      if (this.view !== view) return;
      this.#say('view:' + view, first);
    }, 1400);
  }

  #maybeHint() {
    if (this.hintsGiven >= 3) return;                 // 세 번이면 넉넉하다
    if (Date.now() - this.hintAt < 45_000) return;
    if (this.hooks.busy?.()) return;

    const pool = HINTS.filter((h) =>
      (h.at === '*' || h.at === this.view) && !this.said.has('hint:' + h.brief));
    if (!pool.length) return;

    const hint = pool[Math.floor(Math.random() * pool.length)];
    this.hintsGiven += 1;
    this.hintAt = Date.now();
    this.#say('hint:' + hint.brief, hint);
  }

  /**
   * 한 번 한 말은 다시 하지 않는다.
   *
   * ── 바쁘면 버리지 않고 기다린다 ──
   * 사람이 무언가 읽고 있거나 유리아가 아직 말하는 중이면 끼어들지
   * 않는다. 그런데 그때 그냥 넘어가 버리면 그 안내는 통째로 사라진다 —
   * 들어오자마자 인사가 나가는 동안 화면을 옮기면 그 화면의 안내를
   * 영영 못 듣게 되는 것이다. 그래서 물러섰다가 다시 온다.
   */
  #say(id, what, tries = 0) {
    if (this.said.has(id)) return;

    if (this.hooks.busy?.()) {
      if (tries >= 6) return;                       // 20초쯤 기다려도 안 되면 그만
      clearTimeout(this.waitTimer);
      this.waitTimer = setTimeout(() => this.#say(id, what, tries + 1), 3200);
      return;
    }

    this.said.add(id);
    persist(this.said);

    this.hooks.yuria?.show({ reason: 'guide' });
    this.hooks.bubble?.(what.brief, { kind: 'Ὑρία' });
    if (!store.get('muted')) this.hooks.speak?.([what.say], { lang: 'ko' });
  }

  /** 다 잊고 처음부터 — 설정에서 부른다 */
  forget() {
    this.said.clear();
    this.hintsGiven = 0;
    try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  }

  get count() { return this.said.size; }
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch { return new Set(); }
}

function persist(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); }
  catch { /* 사생활 보호 창 — 이번 방문에만 기억한다 */ }
}
