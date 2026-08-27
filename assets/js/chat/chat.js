/* ═══════════════════════════════════════════════════════════════
   chat.js — 자키람에게 묻는 자리

   얼굴 바로 아래에 둔다. 묻는 사람은 얼굴을 보면서 묻고, 자키람은
   답하면서 입이 움직인다. 창을 따로 띄우면 그 이어짐이 끊긴다.

   답이 오면 세 곳으로 나간다.
     · 대화창       — 전문. 여기가 원본이다
     · 말풍선       — 요지만 (core/summary.js)
     · 자키람의 목  — 소리. 소리를 꺼 두었으면 건너뛴다

   주고받은 것은 이 브라우저에만 남는다. 서버가 없으니 갈 곳도 없다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';
import { summarize } from '../core/summary.js';
import { ask, answerLocally, byId } from './providers.js';

const KEEP = 40;             // 이만큼만 남긴다
const LOG_KEY = 'ktema.chat.v1';

export class Chat {
  /**
   * @param {{onSpeak:(text)=>void, onBubble:(summary, full)=>void, facts:()=>object}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.root = $('#chat');
    this.log = $('#chatLog');
    this.form = $('#chatForm');
    this.input = $('#chatInput');
    this.btn = $('#chatSend');
    this.hint = $('#chatHint');

    this.history = load();
    this.busy = false;
    this.abort = null;

    this.#wire();
    this.#paintAll();
    this.paintHint();
  }

  #wire() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send(this.input.value);
    });

    // 엔터로 보내고, 시프트+엔터로 줄을 바꾼다
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.form.requestSubmit();
      }
    });

    // 자라나는 입력칸 — 긴 물음도 다 보이게
    this.input.addEventListener('input', () => this.#grow());

    $('#chatClear')?.addEventListener('click', () => this.clear());
  }

  #grow() {
    this.input.style.height = 'auto';
    this.input.style.height = Math.min(140, this.input.scrollHeight) + 'px';
  }

  /** 지금 어느 길로 이어져 있는지 입력칸 아래에 적는다 */
  paintHint() {
    const p = byId(store.get('chatProvider'));
    const keyed = !p.needsKey || !!store.get('chatKey' + p.id);
    const urled = !p.needsUrl || !!store.get('chatUrl');

    if (p.id === 'local') {
      this.hint.textContent = '바깥에 잇지 않았습니다 — 화면에 있는 것만 답합니다.';
      this.hint.className = 'chat__hint';
    } else if (keyed && urled) {
      this.hint.textContent = p.ko + ' 에 이어져 있습니다.';
      this.hint.className = 'chat__hint is-live';
    } else {
      this.hint.textContent = p.ko + ' 를 골랐지만 ' + (p.needsKey && !keyed ? '열쇠가' : '주소가') + ' 없습니다. 설정에서 넣어 주십시오.';
      this.hint.className = 'chat__hint is-warn';
    }
  }

  /* ─────────────── 묻기 ─────────────── */

  async send(raw) {
    const text = String(raw || '').trim();
    if (!text || this.busy) return;

    this.input.value = '';
    this.#grow();

    this.#push({ role: 'user', text, at: Date.now() });
    this.busy = true;
    this.btn.disabled = true;

    const waiting = this.#waiting();

    try {
      const facts = this.hooks.facts?.() || {};
      const cfg = {
        provider: store.get('chatProvider') || 'local',
        key: store.get('chatKey' + (store.get('chatProvider') || '')),
        model: store.get('chatModel') || byId(store.get('chatProvider')).def,
        url: store.get('chatUrl'),
      };

      let answer = '';
      let via = 'local';

      if (cfg.provider === 'local') {
        answer = answerLocally(text, facts);
      } else {
        this.abort = new AbortController();
        const got = await ask(cfg, this.history, text, facts.brief || '', { signal: this.abort.signal });
        answer = got.text;
        via = got.via;
        this.abort = null;
      }

      waiting.remove();
      if (!answer) answer = '답을 받지 못했습니다.';

      this.#push({ role: 'assistant', text: answer, at: Date.now(), via });
      this.#deliver(answer);
    } catch (err) {
      waiting.remove();
      const why = err?.name === 'AbortError' ? '물음을 거두었습니다.' : String(err?.message || err);
      this.#push({ role: 'assistant', text: why, at: Date.now(), failed: true });
    } finally {
      this.busy = false;
      this.btn.disabled = false;
      this.input.focus();
    }
  }

  /** 답을 목소리와 말풍선으로 내보낸다 */
  #deliver(answer) {
    const brief = summarize(answer, { max: 120, lines: 2 });
    this.hooks.onBubble?.(brief, answer);
    if (!store.get('muted')) this.hooks.onSpeak?.(answer);
    emit('chat:answer', { text: answer, brief });
  }

  stop() {
    try { this.abort?.abort(); } catch { /* 무시 */ }
    this.abort = null;
  }

  clear() {
    if (!this.history.length) return;
    if (!confirm('주고받은 말을 모두 지웁니다. 계속할까요?')) return;
    this.history = [];
    save(this.history);
    this.#paintAll();
  }

  /* ─────────────── 그리기 ─────────────── */

  #push(msg) {
    this.history.push(msg);
    if (this.history.length > KEEP) this.history = this.history.slice(-KEEP);
    save(this.history);
    this.log.appendChild(this.#node(msg));
    this.#scroll();
  }

  #paintAll() {
    clear(this.log);
    if (!this.history.length) {
      this.log.appendChild(el('p.chat__empty', {
        text: '자키람에게 물어보십시오. 지금 시장이 어떤지, 무엇이 움직였는지.',
      }));
      return;
    }
    for (const m of this.history) this.log.appendChild(this.#node(m));
    this.#scroll();
  }

  #node(m) {
    return el('div.msg', {
      class: [
        m.role === 'user' ? 'msg--me' : 'msg--zak',
        m.failed ? 'msg--failed' : '',
      ].filter(Boolean).join(' '),
    }, [
      el('p.msg__text', { text: m.text }),
    ]);
  }

  #waiting() {
    const node = el('div.msg.msg--zak.msg--wait', [
      el('span.dots', [el('i'), el('i'), el('i')]),
    ]);
    this.log.appendChild(node);
    this.#scroll();
    return node;
  }

  #scroll() {
    this.log.scrollTop = this.log.scrollHeight;
  }
}

/* ─────────────── 남기기 ─────────────── */

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(-KEEP) : [];
  } catch { return []; }
}

function save(list) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-KEEP))); }
  catch { /* 사생활 보호 창 — 이번 방문에만 남는다 */ }
}
