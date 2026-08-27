/* ═══════════════════════════════════════════════════════════════
   reader.js — 기사 하나를 펼치고, 자키람이 읽는다

   RSS 는 제목과 요약만 준다. 본문 전체는 언론사 쪽에 있고,
   남의 글을 통째로 긁어다 이 화면에 옮겨 붙이는 것은 옳지 않다.
   그래서 여기서는 피드가 준 만큼만 보이고, 원문으로 가는 문을
   같이 둔다. 자키람이 읽는 것도 그 범위까지다.

   읽는 동안 지금 어느 문장인지 밝혀 준다. 소리와 글이 같이 가야
   듣는 사람이 따라오기 쉽다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, openPane, closePane } from '../core/dom.js';
import { dayStamp, isKorean } from '../core/fmt.js';
import * as store from '../core/store.js';
import * as tts from '../voice/tts.js';
import { forArticle } from '../voice/script.js';
import { emit } from '../core/bus.js';

export class Reader {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.root = $('#reader');
    this.titleEl = $('#readerTitle');
    this.srcEl = $('#readerSrc');
    this.timeEl = $('#readerTime');
    this.textEl = $('#readerText');
    this.noteEl = $('#readerNote');
    this.linkEl = $('#readerLink');
    this.btnRead = $('#btnRead');
    this.langSeg = $('#readLang');

    this.item = null;
    this.lang = store.get('readLang') === 'en' ? 'en' : 'ko';
    this.paras = [];
    this.speech = null;

    for (const b of this.root.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => this.close());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });

    this.btnRead.addEventListener('click', () => this.toggleRead());

    for (const b of this.langSeg.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        this.lang = b.dataset.lang;
        store.set('readLang', this.lang);
        for (const x of this.langSeg.querySelectorAll('button')) {
          x.classList.toggle('is-on', x === b);
        }
        if (tts.speaking()) this.read();     // 읽던 중이면 그 언어로 다시
      });
    }
  }

  /* ─────────────── 열고 닫기 ─────────────── */

  open(item) {
    this.item = item;
    store.markRead(item.id);
    emit('news:open', { item });

    this.titleEl.textContent = item.fullTitle || item.title;
    this.srcEl.textContent = item.srcName;
    this.timeEl.textContent = item.time ? dayStamp(new Date(item.time)) : '';
    this.linkEl.href = item.link || '#';
    this.linkEl.hidden = !item.link;

    // 읽을 언어를 스스로 고른다 (설정이 auto 일 때)
    const guess = isKorean(item.fullTitle || item.title) ? 'ko' : 'en';
    const want = store.get('readLang');
    this.lang = want === 'auto' || !want ? guess : want;
    for (const x of this.langSeg.querySelectorAll('button')) {
      x.classList.toggle('is-on', x.dataset.lang === this.lang);
    }

    // 본문 — 피드가 준 요약을 문단으로 나눈다
    clear(this.textEl);
    this.paras = [];
    const body = (item.summary || '').trim();
    if (body) {
      const chunks = body.split(/\n{2,}|(?<=\.)\s{2,}/).filter(Boolean);
      (chunks.length ? chunks : [body]).forEach((t, i) => {
        const p = el('p', { class: i === 0 ? 'lead' : '', text: t.trim() });
        this.textEl.appendChild(p);
        this.paras.push(p);
      });
    } else {
      this.textEl.appendChild(el('p', {
        text: '이 피드는 제목만 보내 왔습니다. 자키람은 제목을 읽어 드립니다.',
        class: 'lead',
      }));
    }

    this.noteEl.textContent =
      `${item.srcName}의 공개 피드에서 받은 제목과 요약입니다. 전문은 원문에서 보십시오.`;

    this.#setBtn(false);
    openPane(this.root);
    this.root.querySelector('.reader__body').scrollTop = 0;

    // 열자마자 읽어 주기 — 설정이 켜져 있을 때
    if (store.get('readOnOpen')) setTimeout(() => this.read(), 260);
  }

  close() {
    this.stop();
    closePane(this.root);
    this.item = null;
  }

  /* ─────────────── 읽기 ─────────────── */

  toggleRead() {
    if (tts.speaking()) this.stop();
    else this.read();
  }

  read() {
    if (!this.item) return;
    const { lang, lines } = forArticle(this.item, {
      lang: this.lang,
      withBody: store.get('readBody') !== false,
    });

    this.#clearMarks();
    this.#setBtn(true);
    this.hooks.onStart?.();

    // 문장 순서 ↔ 문단 짚기. 첫 줄은 머리말이라 본문 앞에 하나 더 있다.
    const offset = 1;

    this.speech = tts.speak(lines, {
      lang,
      onchunk: (i) => {
        const at = i - offset;
        this.#mark(at);
        this.hooks.onChunk?.(lines[i], i);
      },
      onend: () => {
        this.#clearMarks();
        this.#setBtn(false);
        this.speech = null;
        this.hooks.onEnd?.();
      },
    });
  }

  stop() {
    tts.stop();
    this.speech = null;
    this.#clearMarks();
    this.#setBtn(false);
  }

  #setBtn(on) {
    const label = this.btnRead.querySelector('.btn__label');
    const icon = this.btnRead.querySelector('.ico');
    if (label) label.textContent = on ? '그만 읽기' : '자키람이 읽어 준다';
    if (icon) icon.dataset.ico = on ? 'stop' : 'voice';
    this.btnRead.classList.toggle('btn--gold', true);
  }

  #mark(index) {
    this.paras.forEach((p, i) => {
      p.classList.toggle('is-now', i === index);
      p.classList.toggle('is-said', i < index);
    });
    if (index >= 0 && this.paras[index]) {
      this.paras[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  #clearMarks() {
    for (const p of this.paras) p.classList.remove('is-now', 'is-said');
  }
}
