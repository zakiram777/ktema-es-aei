/* ═══════════════════════════════════════════════════════════════
   reader.js — 기사 하나를 펼친다

   RSS 는 제목과 요약만 준다. 본문 전체는 언론사 쪽에 있고, 남의 글을
   통째로 긁어다 이 화면에 옮겨 붙이는 것은 옳지 않다. 그래서 여기서는
   피드가 준 만큼만 보이고, 원문으로 가는 문을 같이 둔다.

   ── 종목을 짚어 준다 ──
   기사 제목에 지켜보는 것의 이름이 들어 있으면 그 이름을 단추로
   만든다. 누르면 그 차트로 간다. 소식과 시세가 따로 놀면 소식은
   그냥 읽을거리가 되는데, 여기서는 읽을거리가 아니라 재료여야 한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, openPane, closePane } from '../core/dom.js';
import { dayStamp } from '../core/fmt.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';

export class Reader {
  /** @param {{onSymbol?:(sym:string)=>void, watch?:()=>Array}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.root = $('#reader');
    this.titleEl = $('#readerTitle');
    this.srcEl = $('#readerSrc');
    this.timeEl = $('#readerTime');
    this.textEl = $('#readerText');
    this.noteEl = $('#readerNote');
    this.linkEl = $('#readerLink');
    this.tagsEl = $('#readerTags');

    this.item = null;

    for (const b of this.root.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => this.close());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  open(item) {
    this.item = item;
    store.markRead(item.id);
    emit('news:open', { item });

    this.titleEl.textContent = item.fullTitle || item.title;
    this.srcEl.textContent = item.srcName;
    this.timeEl.textContent = item.time ? dayStamp(new Date(item.time)) : '';
    this.linkEl.href = item.link || '#';
    this.linkEl.hidden = !item.link;

    clear(this.textEl);
    const body = (item.summary || '').trim();
    if (body) {
      const chunks = body.split(/\n{2,}|(?<=\.)\s{2,}/).filter(Boolean);
      (chunks.length ? chunks : [body]).forEach((t, i) => {
        this.textEl.appendChild(el('p', { class: i === 0 ? 'lead' : '', text: t.trim() }));
      });
    } else {
      this.textEl.appendChild(el('p', {
        class: 'lead',
        text: '이 피드는 제목만 보내 왔습니다. 원문에서 보십시오.',
      }));
    }

    this.#paintTags(item);

    this.noteEl.textContent =
      `${item.srcName}의 공개 피드에서 받은 제목과 요약입니다. 전문은 원문에서 보십시오.`;

    openPane(this.root);
    this.root.querySelector('.reader__body').scrollTop = 0;
  }

  close() {
    closePane(this.root);
    this.item = null;
  }

  /** 제목·요약에 이름이 보이는 종목을 단추로 단다 */
  #paintTags(item) {
    if (!this.tagsEl) return;
    clear(this.tagsEl);

    const hay = `${item.fullTitle || item.title} ${item.summary || ''}`;
    const hits = (this.hooks.watch?.() || [])
      .filter((w) => {
        const ko = w.ko || '';
        const en = w.name || '';
        return (ko.length > 1 && hay.includes(ko))
            || (en.length > 2 && new RegExp('\\b' + escapeRe(en) + '\\b', 'i').test(hay));
      })
      .slice(0, 6);

    this.tagsEl.hidden = !hits.length;
    if (!hits.length) return;

    this.tagsEl.appendChild(el('span.reader__tagsk', { text: '이 글에 나온 것' }));
    for (const w of hits) {
      this.tagsEl.appendChild(el('button.tag', {
        type: 'button',
        title: w.symbol + ' 차트로',
        onclick: () => { this.close(); this.hooks.onSymbol?.(w.symbol); },
      }, w.ko || w.name));
    }
  }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
