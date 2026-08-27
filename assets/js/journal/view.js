/* ═══════════════════════════════════════════════════════════════
   view.js — 투자일지 화면

   적는 자리가 위, 적어 둔 것이 아래. 적는 자리를 늘 펴 두는 것은
   일부러다 — 무언가 적으려면 단추를 한 번 눌러야 한다면, 대개
   적지 않게 된다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { stamp } from '../core/fmt.js';
import * as J from './journal.js';

export class JournalView {
  /** @param {{quotes:()=>object[], onSaved?:()=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.root = $('#journal');
    this.listEl = $('#journalList');
    this.countEl = $('#journalCount');
    this.editing = null;
    this.filter = { text: '', tag: '', mood: '' };

    this.#buildForm();
    this.#buildFilter();
    this.paint();
  }

  /* ─────────────── 적는 자리 ─────────────── */

  #buildForm() {
    const host = $('#journalForm');
    clear(host);

    this.title = el('input.jr__title', {
      type: 'text',
      placeholder: '한 줄로 — 오늘 시장을 무엇으로 보았는가',
      maxlength: '120',
    });

    this.body = el('textarea.jr__body', {
      placeholder: '왜 그렇게 보았는지, 무엇을 하기로 했는지 적습니다.\n'
                 + '뒷날 결과를 알고 나면 기억은 그 결과에 맞추어 고쳐집니다. '
                 + '그날 적어 둔 글만이 그 고침을 막습니다.',
      rows: '7',
    });

    this.moodRow = el('div.jr__moods');
    this.mood = 'watch';
    for (const m of J.MOODS) {
      this.moodRow.appendChild(el('button.jr__mood', {
        type: 'button',
        class: m.id === this.mood ? 'is-on' : '',
        data: { mood: m.id, tone: m.tone },
        title: m.gr,
        onclick: () => {
          this.mood = m.id;
          for (const b of this.moodRow.children) {
            b.classList.toggle('is-on', b.dataset.mood === m.id);
          }
        },
      }, [
        el('span.jr__mood-gr', { text: m.gr }),
        el('span.jr__mood-ko', { text: m.ko }),
      ]));
    }

    this.tags = el('input.jr__tags', {
      type: 'text',
      placeholder: '이름표 — 빈칸으로 나눕니다 (예: 반도체 금리 실수)',
    });

    this.snapNote = el('p.jr__snap');
    this.#paintSnap();

    this.saveBtn = el('button.btn.btn--gold', {
      type: 'button',
      onclick: () => this.save(),
    }, [ico('voice'), el('span.btn__label', { text: '적어 둔다' })]);

    this.cancelBtn = el('button.btn.btn--quiet', {
      type: 'button', hidden: true,
      onclick: () => this.reset(),
    }, el('span.btn__label', { text: '고치기 그만' }));

    host.append(
      this.title,
      this.body,
      el('div.jr__row', [this.moodRow]),
      this.tags,
      this.snapNote,
      el('div.jr__actions', [this.saveBtn, this.cancelBtn]),
    );
  }

  #paintSnap() {
    const qs = this.hooks.quotes?.() || [];
    const live = qs.filter((q) => q.ok && Number.isFinite(q.price));
    this.snapNote.textContent = live.length
      ? '지금 시세 ' + live.length + '개가 이 글에 함께 붙들립니다 — 뒷날 무엇을 보고 썼는지 남습니다.'
      : '시세가 아직 오지 않아, 이 글에는 시세가 붙지 않습니다.';
  }

  /* ─────────────── 거르는 자리 ─────────────── */

  #buildFilter() {
    const host = $('#journalFilter');
    clear(host);

    this.search = el('input.jr__search', {
      type: 'search',
      placeholder: '적어 둔 것에서 찾기',
      oninput: () => { this.filter.text = this.search.value; this.paint(); },
    });

    this.moodFilter = el('div.jr__chips');
    const mk = (id, label) => el('button.chip.chip--pick', {
      type: 'button',
      class: this.filter.mood === id ? 'is-on' : '',
      data: { mood: id },
      onclick: () => {
        this.filter.mood = this.filter.mood === id ? '' : id;
        for (const b of this.moodFilter.children) {
          b.classList.toggle('is-on', b.dataset.mood === this.filter.mood);
        }
        this.paint();
      },
    }, label);

    for (const m of J.MOODS) this.moodFilter.appendChild(mk(m.id, m.ko));

    this.tagRow = el('div.jr__chips');
    host.append(this.search, this.moodFilter, this.tagRow);
  }

  #paintTags() {
    clear(this.tagRow);
    const list = J.tags().slice(0, 12);
    for (const { tag, n } of list) {
      this.tagRow.appendChild(el('button.chip.chip--tag', {
        type: 'button',
        class: this.filter.tag === tag ? 'is-on' : '',
        onclick: () => {
          this.filter.tag = this.filter.tag === tag ? '' : tag;
          this.paint();
        },
      }, '#' + tag + ' ' + n));
    }
  }

  /* ─────────────── 적기 ─────────────── */

  save() {
    const entry = {
      id: this.editing || undefined,
      title: this.title.value,
      body: this.body.value,
      mood: this.mood,
      tags: this.tags.value.split(/[\s,]+/).filter(Boolean),
      snapshot: this.editing ? J.byId(this.editing)?.snapshot : J.snapshotOf(this.hooks.quotes?.() || []),
    };

    if (!entry.title.trim() && !entry.body.trim()) {
      this.title.focus();
      return;
    }

    const saved = J.save(entry);
    if (!saved) {
      alert('남기지 못했습니다. 사생활 보호 창에서는 저장이 되지 않습니다.');
      return;
    }
    this.reset();
    this.paint();
    this.hooks.onSaved?.(saved);
  }

  reset() {
    this.editing = null;
    this.title.value = '';
    this.body.value = '';
    this.tags.value = '';
    this.mood = 'watch';
    for (const b of this.moodRow.children) {
      b.classList.toggle('is-on', b.dataset.mood === 'watch');
    }
    this.cancelBtn.hidden = true;
    this.saveBtn.querySelector('.btn__label').textContent = '적어 둔다';
    this.#paintSnap();
  }

  edit(id) {
    const e = J.byId(id);
    if (!e) return;
    this.editing = id;
    this.title.value = e.title;
    this.body.value = e.body;
    this.tags.value = (e.tags || []).join(' ');
    this.mood = e.mood;
    for (const b of this.moodRow.children) {
      b.classList.toggle('is-on', b.dataset.mood === e.mood);
    }
    this.cancelBtn.hidden = false;
    this.saveBtn.querySelector('.btn__label').textContent = '고쳐 적는다';
    this.snapNote.textContent = '고쳐 적어도 그때 붙들어 둔 시세는 그대로 둡니다.';
    this.title.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.title.focus();
  }

  /* ─────────────── 보이기 ─────────────── */

  paint() {
    this.#paintTags();
    const list = J.search(this.filter);
    const total = J.all().length;

    this.countEl.textContent = total
      ? (list.length === total ? total + '편' : list.length + ' / ' + total + '편')
      : '';

    clear(this.listEl);

    if (!list.length) {
      this.listEl.appendChild(el('p.jr__empty', {
        text: total
          ? '고른 조건에 맞는 글이 없습니다.'
          : '아직 적어 둔 것이 없습니다. 오늘 시장을 무엇으로 보았습니까.',
      }));
      return;
    }

    for (const e of list) this.listEl.appendChild(this.#card(e));
  }

  #card(e) {
    const m = J.moodById(e.mood);
    const when = new Date(e.at);

    return el('article.jr__item', { data: { tone: m.tone } }, [
      el('header.jr__head', [
        el('div.jr__when', [
          el('time', {
            datetime: when.toISOString(),
            text: when.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }),
          }),
          el('span.jr__time', { text: stamp(when) }),
          e.edited ? el('span.jr__edited', { text: '고쳐 적음' }) : null,
        ]),
        el('span.jr__badge', { text: m.ko }),
      ]),

      el('h3.jr__itemtitle', { text: e.title }),
      e.body ? el('p.jr__text', { text: e.body }) : null,

      (e.tags || []).length
        ? el('div.jr__itemtags', e.tags.map((t) => el('button.chip.chip--tag', {
          type: 'button',
          onclick: () => { this.filter.tag = t; this.paint(); },
        }, '#' + t)))
        : null,

      e.snapshot?.marks?.length
        ? el('div.jr__snapshot', [
          el('span.jr__snaplabel', { text: '그때' }),
          ...e.snapshot.marks.map((s) => el('span.jr__snapmark', [
            el('b', { text: s.ko }),
            el('span.num', { text: fmt(s.price) }),
            s.changePct != null
              ? el('span.num', {
                class: s.changePct > 0 ? 'up' : s.changePct < 0 ? 'down' : '',
                text: (s.changePct > 0 ? '+' : '') + s.changePct.toFixed(2) + '%',
              })
              : null,
          ])),
        ])
        : null,

      el('div.jr__tools', [
        el('button.btn.btn--quiet.btn--tiny', {
          type: 'button', onclick: () => this.edit(e.id),
        }, el('span.btn__label', { text: '고치기' })),
        el('button.btn.btn--quiet.btn--tiny', {
          type: 'button',
          onclick: () => {
            if (!confirm('이 글을 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) return;
            J.remove(e.id);
            if (this.editing === e.id) this.reset();
            this.paint();
          },
        }, el('span.btn__label', { text: '지우기' })),
      ]),
    ]);
  }

  /* ─────────────── 옮기기 ─────────────── */

  exportFile() {
    const data = J.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'ktema-journal.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  importFile() {
    const input = el('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const got = J.importAll(JSON.parse(await file.text()));
        this.paint();
        alert('들여왔습니다 — 새로 ' + got.added + '편, 고쳐진 것 ' + got.merged + '편.');
      } catch (err) {
        alert('들여오지 못했습니다: ' + err.message);
      }
    });
    input.click();
  }
}

const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—');
