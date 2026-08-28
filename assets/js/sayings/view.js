/* ═══════════════════════════════════════════════════════════════
   view.js — 격언 화면 (Γνῶμαι)

   ── 이 화면이 지키는 세 가지 ──
   1. 출처 없는 말은 싣지 않는다. 누가·어디서·언제가 없으면 그것은
      격언이 아니라 소문이다.
   2. 그 사람 말이라고 확인되지 않았으면 그렇다고 적는다. 기사 안에는
      여러 사람의 말이 섞여 있고, 우리가 늘 가려낼 수 있는 것은 아니다.
   3. 하루 열 건에서 멈춘다. 스무 개를 읽으면 하나도 남지 않는다.

   ── 왜 원문으로 보내나 ──
   여기 실리는 것은 한 문장이다. 한 문장은 언제나 맥락을 잃는다.
   "지금은 팔 때다" 가 무엇을 팔 때인지는 기사를 읽어야 안다. 그래서
   모든 말에 원문 링크를 달고, 링크가 없는 말은 싣지 않는다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { ago, dayStamp } from '../core/fmt.js';
import * as w from './wisdom.js';
import { TAGS, VOICES } from './sources.js';

const FILTERS = [
  { id: 'today', gr: 'Σήμερον', ko: '오늘의 열' },
  { id: 'kept', gr: 'Θησαυρός', ko: '담아 둔 것' },
  { id: 'who', gr: 'Πρόσωπα', ko: '누구를 듣나' },
];

export class SayingsView {
  constructor() {
    this.host = $('#sayBody');
    this.tabsEl = $('#sayTabs');
    this.stampEl = $('#sayStamp');
    this.btn = $('#btnSay');

    this.tab = 'today';
    const had = w.saved();
    this.items = had.items;
    this.papers = had.papers;
    this.busy = false;

    this.btn?.addEventListener('click', () => this.load({ fresh: true }));
    this.#buildTabs();
    this.render();
  }

  #buildTabs() {
    if (!this.tabsEl) return;
    clear(this.tabsEl);
    for (const f of FILTERS) {
      this.tabsEl.appendChild(el('button.tab', {
        class: this.tab === f.id ? 'is-on' : '', type: 'button',
        onclick: () => { this.tab = f.id; this.#buildTabs(); this.render(); },
      }, [
        el('span.tab__gr', { text: f.gr }),
        el('span.tab__ko', { text: f.ko }),
      ]));
    }
  }

  /** 화면이 처음 열릴 때 — 오늘 몫이 이미 있으면 바깥에 묻지 않는다 */
  async open() {
    if (this.items.length || this.busy) return;
    await this.load();
  }

  async load({ fresh = false } = {}) {
    if (this.busy) return;
    this.busy = true;
    this.btn?.classList.add('is-busy');
    this.#say('스물몇 곳에 묻는 중…');

    try {
      const r = await w.today({
        fresh,
        onEach: (done, total) => this.#say(`묻는 중… ${done}/${total}`),
      });
      this.items = r.items;
      this.papers = r.papers || [];
      this.#say(r.items.length
        ? `${dayStamp(new Date())} · ${r.items.length}건`
        + (r.cached ? ' · 오늘 이미 골라 둔 것' : ` · ${r.found}개에서 골랐습니다`)
        : '');
    } catch (err) {
      this.#say('');
      this.err = err;
    } finally {
      this.busy = false;
      this.btn?.classList.remove('is-busy');
      this.render();
    }
  }

  #say(t) { if (this.stampEl) this.stampEl.textContent = t; }

  render() {
    clear(this.host);
    if (this.tab === 'who') return this.#renderWho();
    if (this.tab === 'kept') return this.#renderKept();
    this.#renderToday();
  }

  /* ═══ 오늘의 열 ═══ */

  #renderToday() {
    if (this.busy && !this.items.length) {
      return this.host.appendChild(el('p.say__wait', {
        text: '스물몇 곳에 묻고 있습니다. 처음 한 번은 조금 걸립니다.',
      }));
    }

    if (!this.items.length) {
      this.host.appendChild(el('div.say__empty', [
        el('b', { text: this.err ? '가져오지 못했습니다' : '아직 오늘 몫이 없습니다' }),
        el('p', {
          text: this.err
            ? '바깥으로 나가는 길이 막혀 있는 것 같습니다. 진단 화면에서 「바깥 연결」을 보십시오.'
            : '위의 「오늘 것을 찾는다」를 누르면 스물몇 곳을 두드려 봅니다.',
        }),
      ]));
      return;
    }

    this.host.appendChild(el('p.say__lead', {
      text: '실제로 보도된 글에서 따옴표 안에 든 말만 꺼냈습니다. '
          + '한 문장은 언제나 맥락을 잃으므로, 마음에 걸리는 것이 있으면 원문을 여십시오.',
    }));

    const keptIds = new Set(w.kept().map((x) => x.id));
    for (const q of this.items) this.host.appendChild(this.#card(q, keptIds.has(q.id)));

    this.#renderPapers();

    this.host.appendChild(el('p.say__foot', {
      text: '여기 실린 말은 그 사람들의 판단이지 이 사이트의 권유가 아닙니다. '
          + '유명한 사람이 한 말이라는 것은 그 말이 맞다는 뜻이 아닙니다 — '
          + '가장 크게 틀린 예측도 대개 가장 유명한 사람이 했습니다.',
    }));
  }

  /* 오늘 나온 원문.

     ── 왜 격언과 갈라 두나 ──
     연설문 목록의 제목은 말이 아니라 문서 이름이다. 'Cook, Outlook
     for the U.S. and Alaskan Economies' 를 격언 자리에 앉히면 그
     화면은 격언 화면이 아니게 된다. 값진 것이므로 버리지는 않되,
     제 이름을 달아 아래에 둔다. */
  #renderPapers() {
    if (!this.papers?.length) return;

    this.host.appendChild(el('h3.say__group', [
      el('span.say__groupgr', { text: 'Πηγαί' }),
      el('span.say__groupko', { text: '오늘 나온 원문' }),
    ]));
    this.host.appendChild(el('p.say__lead', {
      text: '중앙은행이 낸 연설문과 발표입니다. 말을 옮긴 것이 아니라 문서 이름이므로 '
          + '격언과 갈라 두었습니다. 시장을 움직이는 문장은 대개 여기 들어 있습니다.',
    }));

    this.host.appendChild(el('ul.say__papers', this.papers.map((p) => el('li', [
      p.link
        ? el('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer', text: p.said })
        : el('span', { text: p.said }),
      el('span.say__papermeta', {
        text: p.who + (p.at ? ' · ' + dayStamp(new Date(p.at)) : ''),
      }),
    ]))));
  }

  #card(q, isKept) {
    const when = q.at ? new Date(q.at) : null;

    return el('article.say', { class: q.sure ? '' : 'is-unsure' }, [
      el('blockquote.say__text', { text: q.said }),

      el('div.say__by', [
        el('b.say__who', { text: q.who }),
        q.role ? el('span.say__role', { text: q.role }) : null,
        q.tag && TAGS[q.tag] ? el('span.say__tag', { text: TAGS[q.tag].ko }) : null,
      ].filter(Boolean)),

      el('div.say__meta', [
        q.outlet ? el('span.say__outlet', { text: q.outlet }) : null,
        when ? el('time.say__when', {
          datetime: when.toISOString(),
          title: when.toLocaleString('ko-KR'),
          text: dayStamp(when) + ' · ' + ago(q.at),
        }) : el('span.say__when', { text: '날짜 미상' }),

        q.kind === 'speech-quote' ? el('span.say__kind', { text: '연설 원문' }) : null,

        q.link ? el('a.say__link', {
          href: q.link, target: '_blank', rel: 'noopener noreferrer',
          text: '원문',
        }) : null,

        el('button.say__keep', {
          type: 'button',
          class: isKept ? 'is-on' : '',
          title: isKept ? '담아 둔 것에서 뺍니다' : '담아 둡니다',
          onclick: (e) => {
            if (isKept) w.unkeep(q.id); else w.keep(q);
            this.render();
            e.stopPropagation();
          },
          text: isKept ? '담아 둠' : '담아 두기',
        }),
      ].filter(Boolean)),

      // 확인 못 한 것은 숨기지 않고 그렇다고 적는다
      q.sure ? null : el('p.say__doubt', {
        text: '이 말이 ' + q.who + ' 의 것이라고 확인하지 못했습니다. '
            + '기사 안에 다른 사람의 말이 함께 인용되어 있을 수 있으니 원문을 보십시오.',
      }),

      q.headline ? el('p.say__head', { text: '기사 제목 — ' + q.headline }) : null,
    ].filter(Boolean));
  }

  /* ═══ 담아 둔 것 ═══ */

  #renderKept() {
    const list = w.kept();
    if (!list.length) {
      return this.host.appendChild(el('div.say__empty', [
        el('b', { text: '아직 담아 둔 말이 없습니다' }),
        el('p', {
          text: '오늘의 열에서 「담아 두기」를 누르면 여기 남습니다. '
              + '이 브라우저에만 남고 어디로도 가지 않습니다.',
        }),
      ]));
    }

    this.host.appendChild(el('p.say__lead', {
      text: list.length + '개를 담아 두었습니다. '
          + '몇 달 뒤에 다시 읽으면, 그때 옳게 들렸던 말이 지금도 옳은지 알 수 있습니다.',
    }));

    const keptIds = new Set(list.map((x) => x.id));
    for (const q of list) this.host.appendChild(this.#card(q, keptIds.has(q.id)));
  }

  /* ═══ 누구를 듣나 ═══ */

  #renderWho() {
    this.host.appendChild(el('p.say__lead', {
      text: '이 사람들의 이름으로 찾습니다. 자기 돈을 굴리며 그 판단을 글이나 말로 '
          + '남기는 이들, 그리고 시장 전체가 그 입을 보는 자리에 있는 이들입니다. '
          + '방송에서 종목을 찍어 주는 이들은 넣지 않았습니다 — 그것은 격언이 아니라 '
          + '광고이고, 섞으면 나머지도 같은 것으로 읽힙니다.',
    }));

    for (const [tagId, tag] of Object.entries(TAGS)) {
      const mine = VOICES.filter((v) => v.tag === tagId);
      if (!mine.length) continue;

      this.host.appendChild(el('h3.say__group', [
        el('span.say__groupgr', { text: tag.gr }),
        el('span.say__groupko', { text: tag.ko }),
      ]));

      this.host.appendChild(el('div.say__who-list', mine.map((v) => el('div.say__person', [
        el('b', { text: v.ko }),
        v.en ? el('span.say__en', { text: v.en }) : null,
        el('span.say__role', { text: v.role }),
      ].filter(Boolean)))));
    }
  }
}
