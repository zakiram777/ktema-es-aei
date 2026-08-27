/* ═══════════════════════════════════════════════════════════════
   settings.js — 설정 서랍

   여기 있는 것은 전부 취향이다. 하나도 건드리지 않아도 사이트는
   돌아간다. 그래서 서랍 안에 접어 두고, 기본값만으로 쓸 만하게 해 둔다.

   ── 왜 설정을 파일로 내보내나 ──
   서버가 없으니 고른 것은 이 브라우저에만 남는다. PC 를 옮기면 처음으로
   돌아간다. 파일 한 장으로 들고 다닐 수 있게 해 두면 그 문제가 없어진다
   (아래 '설정 옮기기').
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico, openPane, closePane } from '../core/dom.js';
import * as store from '../core/store.js';
import { SOURCES } from '../news/sources.js';
import { RANGES } from '../market/symbols.js';
import { KEY_HOWTO } from '../market/macro.js';
import { routeReport, forgetRoutes } from '../net/proxy.js';

export class Settings {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.root = $('#settings');
    this.body = $('#settingsBody');
    this.built = false;

    for (const b of this.root.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => this.close());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  async open(focus) {
    if (!this.built) { await this.build(); this.built = true; }
    openPane(this.root);
    if (focus) {
      this.body.querySelector('#grp' + focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  close() { closePane(this.root); }

  /* ─────────────── 짓기 ─────────────── */

  async build() {
    clear(this.body);
    this.body.appendChild(this.#marketGroup());
    this.body.appendChild(this.#keyGroup());
    this.body.appendChild(this.#lookGroup());
    this.body.appendChild(this.#newsGroup());
    this.body.appendChild(this.#alertGroup());
    this.body.appendChild(this.#sourceGroup());
    this.body.appendChild(this.#aboutGroup());
  }

  #group(gr, ko, note, kids) {
    return el('section.grp', { id: `grp${gr.replace(/\W/g, '')}` }, [
      el('div.grp__head', [
        el('span.grp__gr', { text: gr }),
        el('span.grp__ko', { text: ko }),
      ]),
      note ? el('p.grp__note', { text: note }) : null,
      ...[].concat(kids),
    ]);
  }

  #slider({ key, label, min, max, step, fmt, onInput }) {
    const val = el('span.row__val');
    const input = el('input', {
      type: 'range', min, max, step,
      value: String(store.get(key)),
    });
    const paint = () => {
      const v = Number(input.value);
      val.textContent = fmt ? fmt(v) : v.toFixed(2);
      const p = ((v - min) / (max - min)) * 100;
      input.style.setProperty('--fill', `${p}%`);
    };
    input.addEventListener('input', () => {
      paint();
      store.set(key, Number(input.value));
      onInput?.(Number(input.value));
    });
    paint();
    return el('div.row', [
      el('div.row__top', [el('span.row__label', { text: label }), val]),
      input,
    ]);
  }

  #toggle({ key, label, note, onChange }) {
    const input = el('input', { type: 'checkbox' });
    input.checked = !!store.get(key);
    input.addEventListener('change', () => {
      store.set(key, input.checked);
      onChange?.(input.checked);
    });
    return el('div.row', [
      el('div.row__top', [
        el('label.switch', [
          input,
          el('span.switch__track', [el('span.switch__dot')]),
          el('span.switch__label', { text: label }),
        ]),
      ]),
      note ? el('p.row__note', { text: note }) : null,
    ]);
  }

  /* ─────────────── 시세 ─────────────── */

  #marketGroup() {
    const tintSel = el('select', [
      el('option', { value: 'kr', text: '오름 붉음 · 내림 푸름 (한국)' }),
      el('option', { value: 'global', text: '오름 초록 · 내림 붉음 (해외)' }),
    ]);
    tintSel.value = store.get('tint') || 'kr';
    tintSel.addEventListener('change', () => {
      store.set('tint', tintSel.value);
      document.documentElement.dataset.tint = tintSel.value;
      this.hooks.onTint?.();
    });

    const rangeSel = el('select', RANGES.map((r) => el('option', {
      value: r.id, text: r.label, selected: r.id === (store.get('range') || '6mo'),
    })));
    rangeSel.addEventListener('change', () => {
      store.set('range', rangeSel.value);
      this.hooks.onRange?.(rangeSel.value);
    });

    return this.#group('Ἀγορά', '시세',
      '오르내림 색은 나라마다 관행이 다릅니다. 한국·일본·중국은 오름이 붉고, '
      + '미국·유럽은 오름이 초록입니다. 둘 다 맞는 관행이니 손에 익은 쪽으로 두십시오.',
      [
        el('div.row', [
          el('div.row__top', [el('span.row__label', { text: '오르내림 색' })]),
          tintSel,
        ]),
        el('div.row', [
          el('div.row__top', [el('span.row__label', { text: '차트를 열 때의 기간' })]),
          rangeSel,
        ]),
        el('div.danger', [
          el('button.btn.btn--quiet', {
            type: 'button',
            onclick: (e) => {
              this.hooks.onWatchReset?.();
              e.target.closest('.btn').querySelector('.btn__label').textContent = '되돌렸습니다';
            },
          }, el('span.btn__label', { text: '관심종목을 처음 목록으로' })),
        ]),
        el('p.row__note', {
          text: '오른쪽 목록에서 ×를 눌러 빼고, + 를 눌러 더할 수 있습니다. '
              + '하나도 남지 않으면 다음에 켜질 때 처음 목록이 되살아납니다.',
        }),
      ]);
  }

  /* ─────────────── 바깥 열쇠 ───────────────

     셋 다 공짜다. 그런데 이 사이트에는 열쇠를 숨길 서버가 없어서,
     넣은 열쇠는 이 브라우저에 그대로 남는다. 그 사실을 감추지 않고
     그대로 적어 둔다 — 감추면 사람이 여럿 쓰는 기기에 넣는다. */

  #keyGroup() {
    const row = (key, how, extra) => {
      const input = el('input.keyin', {
        type: 'password',
        placeholder: '아직 없음',
        autocomplete: 'off',
        spellcheck: 'false',
      });
      input.value = store.get(key) || '';
      input.addEventListener('input', () => {
        store.set(key, input.value.trim());
        this.hooks.onKeys?.(key);
      });

      const eye = el('button.iconbtn.iconbtn--sm', {
        type: 'button',
        title: '보이기',
        onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; },
      }, [ico('eye')]);

      return el('div.row', [
        el('div.row__top', [
          el('span.row__label', { text: how.ko }),
          el('a.row__get', {
            href: how.url, target: '_blank', rel: 'noopener noreferrer',
          }, '열쇠 받기 ↗'),
        ]),
        el('div.keyrow', [input, eye]),
        el('p.row__note', { text: how.note + (extra ? ' ' + extra : '') }),
      ]);
    };

    return this.#group('Κλεῖδες', '바깥 열쇠',
      '셋 다 공짜입니다. 안 넣어도 사이트는 그대로 돌아가고, 그 기능만 '
      + '비어 있습니다.',
      [
        row('keyFred', KEY_HOWTO.fred, '분석 화면 아래 “밑에 깔린 것”을 채웁니다.'),
        row('keyDart', KEY_HOWTO.dart, '관심종목의 한국 종목 공시를 소식에 섞습니다.'),
        row('keyAlpha', KEY_HOWTO.alpha, '평소에는 쓰지 않습니다.'),
        el('p.row__note.row__note--warn', {
          text: '넣은 열쇠는 이 브라우저에만 남습니다 — 우리에게도 오지 않고, '
              + '설정을 내보낼 때 파일에도 담기지 않습니다. 다만 이 기기를 쓰는 '
              + '사람은 꺼내 볼 수 있습니다. 혼자 쓰는 기기에서 쓰십시오.',
        }),
      ]);
  }

  /* ─────────────── 소식 ─────────────── */

  #newsGroup() {
    return this.#group('Ἀγγελίαι', '소식', null, [
      this.#toggle({
        key: 'autoRefresh', label: '자동 갱신',
        onChange: (v) => this.hooks.onAutoRefresh?.(v),
      }),
      this.#slider({
        key: 'refreshSec', label: '갱신 간격', min: 60, max: 900, step: 30,
        fmt: (v) => (v >= 60 ? `${Math.round(v / 60)}분` : `${v}초`),
        onInput: () => this.hooks.onAutoRefresh?.(store.get('autoRefresh')),
      }),
      this.#slider({
        key: 'perSource', label: '출처마다 가져올 개수', min: 5, max: 30, step: 1,
        fmt: (v) => `${v}건`,
      }),
    ]);
  }

  /* ─────────────── 알림 ─────────────── */

  #alertGroup() {
    return this.#group('Κῆρυξ', '속보',
      '새로 온 소식 가운데 급한 것을 화면 구석에 띄웁니다. 무엇을 급하다고 볼지는 '
      + '제목의 낱말로 가릅니다 — 속보·긴급·서킷브레이커·급락 같은 것들입니다.',
      [
        this.#toggle({ key: 'breaking', label: '속보를 띄운다' }),
        this.#toggle({ key: 'chime', label: '뜰 때 종을 친다' }),
        this.#slider({
          key: 'breakingMax', label: '한 번에 최대', min: 1, max: 6, step: 1,
          fmt: (v) => `${v}건`,
        }),
      ]);
  }

  /* ─────────────── 모습 ─────────────── */

  #lookGroup() {
    return this.#group('Ὄψις', '모습',
      '배경에는 이토 준지의 그림이 아주 옅게 깔려 있습니다. 알아보기 직전에서 '
      + '멈추는 짙기입니다 — 알아보게 되면 그때부터 그것만 보이기 때문입니다.',
      [
        this.#toggle({
          key: 'motion', label: '배경이 움직인다',
          note: '끄면 필름과 티끌이 멈춥니다. 오래된 기기에서 가볍습니다.',
          onChange: (v) => this.hooks.onMotion?.(v),
        }),
      ]);
  }

  /* ─────────────── 출처 ─────────────── */

  #sourceGroup() {
    const off = new Set(store.get('sourcesOff') || []);
    const grid = el('div.srcgrid');

    for (const s of SOURCES) {
      const input = el('input', { type: 'checkbox' });
      input.checked = !off.has(s.id);
      input.addEventListener('change', () => {
        const now = new Set(store.get('sourcesOff') || []);
        if (input.checked) now.delete(s.id); else now.add(s.id);
        store.set('sourcesOff', [...now]);
      });
      grid.appendChild(el('div.src', [
        el('label.switch', [
          input,
          el('span.switch__track', [el('span.switch__dot')]),
        ]),
        el('span.src__name', { text: `${s.name} — ${s.cats.join(', ')}` }),
        el('span.src__lang', { text: s.lang.toUpperCase() }),
      ]));
    }

    return this.#group('Πηγαί', '출처',
      '모두 각 언론사가 공개해 둔 RSS 입니다. 켜고 끄면 다음 갱신부터 반영됩니다.',
      [grid]);
  }

  /* ─────────────── 설정 파일 주고받기 ─────────────── */

  #note(text, bad = false) {
    const n = this.body.querySelector('#ioNote');
    if (!n) return;
    n.textContent = text;
    n.style.color = bad ? 'var(--coral-300)' : 'var(--jade-300)';
  }

  /** 설정을 파일 한 장으로 내려받는다 */
  #exportSettings() {
    try {
      const data = JSON.stringify(store.exportAll(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      // 이름을 settings.json 으로 고정한다. 새 PC 의 ktema 폴더에
      // 그대로 넣어 두면 켤 때 알아서 적용된다.
      const a = el('a', { href: url, download: 'settings.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.#note('settings.json 을 내보냈습니다. 새 PC 의 ktema 폴더에 그대로 넣어 두면 켤 때 저절로 적용됩니다.');
    } catch (e) {
      this.#note('내보내지 못했습니다: ' + e.message, true);
    }
  }

  /** 내보냈던 파일을 다시 들여온다 */
  #importSettings() {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const { applied, skipped } = store.importAll(JSON.parse(await file.text()));
        this.#note(
          `설정 ${applied}가지를 들여왔습니다.`
          + (skipped.length ? ` (모르는 항목 ${skipped.length}가지는 건너뛰었습니다)` : ''),
        );
        // 화면에 이미 그려 둔 값들을 새 설정으로 다시 그린다
        this.built = false;
        await this.build();
        this.hooks.onImported?.();
      } catch (e) {
        this.#note('가져오지 못했습니다: ' + e.message, true);
      }
    });

    input.click();
  }

  /* ─────────────── 이 사이트 ─────────────── */

  #aboutGroup() {
    const routes = routeReport();
    const routeText = routes.length
      ? routes.map((r) => `${r.host} → ${r.label || r.route}`).join('\n')
      : '아직 다녀온 길이 없습니다.';

    return this.#group('Περί', '이 사이트', null, [
      /* ── 설정을 들고 다니기 ──
         이 사이트는 서버가 없어 설정이 브라우저에만 남는다.
         다른 PC 로 옮겨 갈 때 이 파일 한 장을 같이 가져가면 된다. */
      el('div.row', [
        el('div.row__top', [el('span.row__label', { text: '설정 옮기기' })]),
        el('p.row__note', {
          text: '고른 색과 지표, 관심종목, 출처 설정은 이 브라우저에만 남습니다. '
              + '내보내면 settings.json 이 받아집니다. 그 파일을 새 PC 의 ktema 폴더에 '
              + '(index.html 옆에) 넣어 두면, 거기서 켤 때 저절로 적용됩니다. '
              + '손으로 넣고 싶을 때만 아래 가져오기를 쓰면 됩니다.',
        }),
        el('div.danger', [
          el('button.btn.btn--quiet', {
            type: 'button',
            onclick: () => this.#exportSettings(),
          }, el('span.btn__label', { text: '설정 내보내기' })),
          el('button.btn.btn--quiet', {
            type: 'button',
            onclick: () => this.#importSettings(),
          }, el('span.btn__label', { text: '설정 가져오기' })),
        ]),
        el('p.row__note', { id: 'ioNote' }),
      ]),

      el('div.danger', [
        el('button.btn.btn--quiet', {
          type: 'button',
          onclick: () => { forgetRoutes(); this.hooks.onRefresh?.(); },
        }, [ico('refresh'), el('span.btn__label', { text: '연결 경로 다시 찾기' })]),
        el('button.btn.btn--quiet', {
          type: 'button',
          onclick: () => {
            if (!confirm('설정을 처음 상태로 되돌립니다. 계속할까요?')) return;
            store.reset();
            location.reload();
          },
        }, el('span.btn__label', { text: '설정 초기화' })),
      ]),
      el('p.setfoot', {
        html:
          '<b>Κτῆμα ἐς Ἀεί</b> — 투키디데스가 자기 역사서를 두고 한 말입니다. '
          + '당대의 갈채가 아니라 오래 남을 것을 위해 쓴다는 뜻입니다.<br><br>'
          + '소식은 각 언론사의 공개 피드에서, 시세는 야후 파이낸스에서 옵니다. '
          + '시세는 지연될 수 있고 참고용입니다. 이 사이트의 어떤 숫자도 사거나 '
          + '팔라는 말이 아닙니다 — 전부 지나간 값에서 나온 것입니다.<br><br>'
          + '<b>지금 쓰고 있는 길</b><br><code>' + escapeHtml(routeText).replace(/\n/g, '<br>') + '</code>',
      }),
    ]);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
