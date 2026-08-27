/* ═══════════════════════════════════════════════════════════════
   settings.js — 설정 서랍

   목소리를 고르는 자리가 가장 크다. 브라우저마다 가진 목소리가
   달라서, 목록을 그대로 보여 주고 하나씩 들어 보게 하는 것이
   설명보다 빠르다. 여자 목소리로 짚이는 것에는 표를 달아 둔다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico, openPane, closePane } from '../core/dom.js';
import * as store from '../core/store.js';
import * as tts from '../voice/tts.js';
import { catalogue, forLang, PRESETS, presetById, SAMPLE, reload } from '../voice/voices.js';
import { SOURCES } from '../news/sources.js';
import { routeReport, forgetRoutes } from '../net/proxy.js';
import { PROVIDERS, byId as providerById } from '../chat/providers.js';

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
    if (focus === 'voice') {
      this.body.querySelector('#grpVoice')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  close() { closePane(this.root); }

  /* ─────────────── 짓기 ─────────────── */

  async build() {
    clear(this.body);
    this.body.appendChild(await this.#voiceGroup());
    this.body.appendChild(this.#yuriaGroup());
    this.body.appendChild(this.#chatGroup());
    this.body.appendChild(this.#readingGroup());
    this.body.appendChild(this.#newsGroup());
    this.body.appendChild(this.#alertGroup());
    this.body.appendChild(this.#lookGroup());
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

  /* ─────────────── 목소리 ─────────────── */

  async #voiceGroup() {
    const all = await catalogue();
    const femaleOnly = store.get('femaleOnly') !== false;

    const mk = async (base) => {
      const key = base === 'en' ? 'voiceEn' : 'voiceKo';
      const rest = all.filter((v) => v.base !== base);
      const list = await forLang(base, { femaleOnly });

      const wrap = el('div.voices');
      if (!list.length) {
        wrap.appendChild(el('p.row__note', {
          text: base === 'ko'
            ? '이 기기에 한국어 목소리가 없습니다. 아래 다른 언어 목소리로도 읽을 수 있지만 발음이 어색합니다.'
            : 'No English voice on this device.',
        }));
      }

      const pool = list.length ? list : rest.slice(0, 12);
      for (const v of pool) {
        const on = store.get(key) === v.name;
        const node = el('button.voice', {
          type: 'button',
          class: on ? 'is-on' : '',
          onclick: async () => {
            store.set(key, v.name);
            for (const x of wrap.children) x.classList?.remove('is-on');
            node.classList.add('is-on');
            await tts.refreshVoices();
          },
        }, [
          el('div', [
            el('div.voice__name', { text: v.name }),
            el('div.voice__meta', [
              el('span.voice__lang', { text: v.lang }),
              v.gender === 'female' ? el('span.voice__tag.voice__tag--f', { text: '여성' }) : null,
              v.local ? el('span.voice__tag.voice__tag--local', { text: '기기' }) : null,
            ]),
          ]),
          el('span.voice__try', {
            text: '들어 보기',
            onclick: async (e) => {
              e.stopPropagation();
              store.set(key, v.name);
              await tts.refreshVoices();
              tts.say(SAMPLE[base] || SAMPLE.ko, { lang: base });
            },
          }),
        ]);
        wrap.appendChild(node);
      }
      return wrap;
    };

    // 말투 프리셋
    const presetRow = el('div.presets');
    const paintPresets = () => {
      for (const b of presetRow.children) {
        b.classList.toggle('is-on', b.dataset.id === store.get('preset'));
      }
    };
    for (const p of PRESETS) {
      presetRow.appendChild(el('button.preset', {
        type: 'button',
        data: { id: p.id },
        title: p.note,
        onclick: () => {
          store.set({ preset: p.id, rate: p.rate, pitch: p.pitch });
          paintPresets();
          this.#repaintSliders();
          tts.say(SAMPLE.ko, { lang: 'ko' });
        },
      }, [
        el('span.preset__gr', { text: p.gr }),
        el('span.preset__ko', { text: p.ko }),
      ]));
    }
    paintPresets();

    this.rateRow = this.#slider({
      key: 'rate', label: '빠르기', min: 0.6, max: 1.5, step: 0.01,
      fmt: (v) => `${v.toFixed(2)}배`,
    });
    this.pitchRow = this.#slider({
      key: 'pitch', label: '높낮이', min: 0.6, max: 1.6, step: 0.01,
      fmt: (v) => v.toFixed(2),
    });
    const volRow = this.#slider({
      key: 'volume', label: '크기', min: 0, max: 1, step: 0.01,
      fmt: (v) => `${Math.round(v * 100)}%`,
    });

    const koList = await mk('ko');
    const enList = await mk('en');

    return this.#group(
      'Φωνή', '목소리',
      '유리아는 여성의 목소리로 말합니다. 브라우저에 깔린 목소리를 쓰므로 기기마다 '
      + '고를 수 있는 것이 다릅니다. 아래에서 목소리를 고르고, 그 위에 결(말투)을 '
      + '얹습니다 — 같은 목소리라도 결에 따라 다른 사람처럼 들립니다.',
      [
        el('div.row', [el('div.row__top', [el('span.row__label', { text: '결' })]), presetRow]),
        el('p.row__note', {
          text: PRESETS.map((p) => `${p.ko} — ${p.note}`).join('\n'),
          style: { whiteSpace: 'pre-line' },
        }),
        this.rateRow, this.pitchRow, volRow,

        this.#toggle({
          key: 'femaleOnly',
          label: '여성 목소리만 보기',
          note: '규격에 성별 항목이 없어 이름으로 가립니다. 여성으로 짚이지 않은 것 중에도 '
              + '여성이 있을 수 있으니, 고를 것이 마땅치 않으면 이 표시를 꺼 보십시오.',
          onChange: async () => { this.built = false; await this.build(); },
        }),
        el('div.row', [
          el('div.row__top', [el('span.row__label', { text: '한국어 목소리' })]),
          koList,
        ]),
        el('div.row', [
          el('div.row__top', [el('span.row__label', { text: 'English voice' })]),
          enList,
        ]),
        this.#toggle({
          key: 'mixLang',
          label: '섞인 영어는 영어 목소리로',
          note: '"Fed 가 금리를 동결했습니다" 처럼 한 문장에 두 나라 말이 섞이면 그 자리만 '
              + '영어 목소리에게 넘겨 읽습니다. 발음이 또렷해지는 대신 사이가 아주 살짝 벌어집니다.',
        }),
        el('button.btn.btn--quiet', {
          type: 'button',
          onclick: async () => { await reload(); this.built = false; await this.build(); },
        }, [ico('refresh'), el('span.btn__label', { text: '목소리 목록 다시 읽기' })]),
      ],
    );
  }

  /** 결을 고르면 빠르기·높낮이 손잡이도 그 자리로 옮겨 간다 */
  #repaintSliders() {
    for (const row of [this.rateRow, this.pitchRow]) {
      const input = row?.querySelector('input');
      if (!input) continue;
      const key = row === this.rateRow ? 'rate' : 'pitch';
      input.value = String(store.get(key));
      input.dispatchEvent(new Event('input'));
    }
  }

  /* ─────────────── 유리아 ─────────────── */

  #yuriaGroup() {
    return this.#group(
      'Ὑρία', '유리아',
      '유리아는 한자리에 있지 않습니다. 화면을 누를 때, 말할 때, 그리고 이따금 '
      + '문득 나타났다가 잠시 뒤에 사라집니다. 나타날 때마다 다른 낯빛입니다.',
      [
        this.#toggle({
          key: 'yuria',
          label: '유리아가 나타나게',
          note: '꺼 두면 소리로만 말합니다. 소식과 시세는 그대로입니다.',
          onChange: (on) => { if (!on) this.hooks.onYuriaOff?.(); },
        }),
        el('p.row__note', {
          text: '머리의 “유리아” 단추를 누르면 기다리지 않고 지금 부를 수 있습니다. '
              + '나타난 유리아를 누르면 물러납니다.',
        }),
        el('div.danger', [
          el('button.btn.btn--quiet', {
            type: 'button',
            onclick: (e) => {
              this.hooks.onForgetGuide?.();
              e.target.closest('.btn').querySelector('.btn__label').textContent = '다시 안내합니다';
            },
          }, el('span.btn__label', { text: '안내를 처음부터 다시' })),
        ]),
        el('p.row__note', {
          text: '유리아는 화면마다 한 번씩만 안내합니다 — 같은 말을 두 번 들으면 '
              + '안내가 아니라 잔소리이기 때문입니다. 처음부터 다시 듣고 싶으면 위를 누르십시오.',
        }),
      ],
    );
  }

  /* ─────────────── 대화 ─────────────── */

  #chatGroup() {
    const cur = () => providerById(store.get('chatProvider'));
    const body = el('div.row');

    /* 어느 길로 이을지 */
    const pickRow = el('div.presets');
    const paintPick = () => {
      for (const b of pickRow.children) {
        b.classList.toggle('is-on', b.dataset.id === store.get('chatProvider'));
      }
    };
    for (const p of PROVIDERS) {
      pickRow.appendChild(el('button.preset', {
        type: 'button',
        data: { id: p.id },
        title: p.note,
        onclick: () => {
          store.set({ chatProvider: p.id, chatModel: p.def || '' });
          paintPick();
          paintBody();
          this.hooks.onChat?.();
        },
      }, [
        el('span.preset__gr', { text: p.gr }),
        el('span.preset__ko', { text: p.ko }),
      ]));
    }
    paintPick();

    /* 고른 길에 따라 필요한 것만 보여 준다 */
    const paintBody = () => {
      clear(body);
      const p = cur();

      body.appendChild(el('p.row__note', { text: p.note }));

      if (p.models?.length) {
        const sel = el('select.sel', {
          onchange: () => { store.set('chatModel', sel.value); this.hooks.onChat?.(); },
        }, p.models.map((m) => el('option', {
          value: m.id, text: m.ko, selected: m.id === (store.get('chatModel') || p.def),
        })));
        body.appendChild(el('div.row__top', [el('span.row__label', { text: '모형' })]));
        body.appendChild(sel);
      }

      if (p.needsKey) {
        const key = el('input.jr__title', {
          type: 'password',
          placeholder: p.keyHint || '열쇠',
          value: store.get('chatKey' + p.id) || '',
          oninput: () => {
            store.set('chatKey' + p.id, key.value.trim());
            this.hooks.onChat?.();
          },
        });
        body.appendChild(el('div.row__top', [el('span.row__label', { text: '열쇠 (API key)' })]));
        body.appendChild(key);
        body.appendChild(el('p.row__note.row__note--warn', {
          text: '열쇠는 이 브라우저에만 남습니다. 우리에게도, 어디에도 보내지 않습니다. '
              + '다만 브라우저에 둔 열쇠는 이 기기를 쓰는 사람이면 꺼내 볼 수 있습니다. '
              + '혼자 쓰는 기기에서, 한도를 걸어 둔 열쇠로 쓰십시오. 설정 내보내기에는 '
              + '열쇠가 담기지 않습니다 — 옮길 때는 새 기기에서 다시 넣으십시오.',
        }));
      }

      if (p.needsUrl) {
        const url = el('input.jr__title', {
          type: 'url',
          placeholder: 'https://내서버/ask',
          value: store.get('chatUrl') || '',
          oninput: () => { store.set('chatUrl', url.value.trim()); this.hooks.onChat?.(); },
        });
        body.appendChild(el('div.row__top', [el('span.row__label', { text: '내 서버 주소' })]));
        body.appendChild(url);
        body.appendChild(el('p.row__note', {
          text: '그 서버는 { system, messages } 를 받아 { text } 를 돌려주면 됩니다. '
              + '열쇠는 그 서버가 들고 있으므로 브라우저에는 없습니다. 여럿이 보는 '
              + '사이트라면 이 길이 맞습니다.',
        }));
      }
    };
    paintBody();

    return this.#group(
      'Διάλογος', '대화',
      '유리아는 지금 스스로 생각하지 않습니다 — 시세와 소식을 보고 정해진 말을 할 뿐입니다. '
      + '그 뒤에 큰 모형을 이어 붙이면 진짜로 묻고 답할 수 있습니다. 답은 대화창에 전문으로, '
      + '얼굴 곁 말풍선에는 요지만, 그리고 유리아의 목소리로 나갑니다.',
      [
        el('div.row', [el('div.row__top', [el('span.row__label', { text: '어디에 잇나' })]), pickRow]),
        body,
      ],
    );
  }

  /* ─────────────── 읽기 ─────────────── */

  #readingGroup() {
    const langSel = el('select', [
      el('option', { value: 'auto', text: '글에 맞춰 스스로' }),
      el('option', { value: 'ko', text: '항상 한국어' }),
      el('option', { value: 'en', text: '항상 English' }),
    ]);
    langSel.value = store.get('readLang') || 'auto';
    langSel.addEventListener('change', () => store.set('readLang', langSel.value));

    return this.#group('Ἀνάγνωσις', '읽기', null, [
      el('div.row', [
        el('div.row__top', [el('span.row__label', { text: '읽을 언어' })]),
        langSel,
      ]),
      this.#toggle({
        key: 'readOnOpen', label: '기사를 열면 바로 읽기',
        note: '꺼 두면 기사 안의 단추를 눌러야 읽습니다.',
      }),
      this.#toggle({
        key: 'readBody', label: '요약까지 읽기',
        note: '꺼 두면 제목만 읽습니다.',
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
      '새로 온 소식 가운데 급한 것을 유리아가 스스로 읽습니다. '
      + '무엇을 급하다고 볼지는 제목의 낱말로 가릅니다 — 속보·긴급·서킷브레이커·급락 같은 것들입니다.',
      [
        this.#toggle({ key: 'breaking', label: '속보를 스스로 읽어 준다' }),
        this.#toggle({ key: 'chime', label: '읽기 전에 종을 친다' }),
        this.#slider({
          key: 'breakingMax', label: '한 번에 최대', min: 1, max: 6, step: 1,
          fmt: (v) => `${v}건`,
        }),
      ]);
  }

  /* ─────────────── 모습 ─────────────── */

  #lookGroup() {
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

    return this.#group('Ὄψις', '모습', null, [
      el('div.row', [
        el('div.row__top', [el('span.row__label', { text: '오르내림 색' })]),
        tintSel,
      ]),
      this.#toggle({
        key: 'motion', label: '배경이 움직인다',
        note: '끄면 티끌과 문양이 멈춥니다. 오래된 기기에서 가볍습니다.',
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
        await tts.refreshVoices();
        // 화면에 이미 그려 둔 값들을 새 설정으로 다시 그린다
        this.built = false;
        await this.build();
        this.#note('설정을 들여왔습니다. 목소리와 말투가 바뀌었는지 확인해 보십시오.');
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
          text: '고른 목소리와 말투, 출처 설정은 이 브라우저에만 남습니다. '
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
          + '시세는 지연될 수 있고 참고용입니다. 유리아는 보이는 것을 읽을 뿐, '
          + '사거나 팔라고 말하지 않습니다.<br><br>'
          + '<b>지금 쓰고 있는 길</b><br><code>' + escapeHtml(routeText).replace(/\n/g, '<br>') + '</code>',
      }),
    ]);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
