/* ═══════════════════════════════════════════════════════════════
   setup.mjs — 새 PC 에서 한 번 돌리는 준비 프로그램

   SETUP.bat 이 이것을 부른다. 사람이 직접 부를 일은 없다.

   배치파일에 한글을 잔뜩 넣으면 PC 마다 코드페이지가 달라 깨진다.
   그래서 배치파일은 Node 가 있는지만 확인하는 열 줄짜리로 두고,
   말은 전부 여기서 한다. Node 는 무엇을 쓰든 UTF-8 로 내보낸다.

   하는 일
     1. 폴더가 온전한지 본다 (배경 영상 스물다섯 편, 소스, index.html)
     2. settings.json 이 있으면 알려 준다 — 켤 때 저절로 적용된다
     3. 바탕화면 바로가기를 만들지 묻는다
     4. 서버를 띄우고 브라우저를 연다
   ═══════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

const C = {
  dim:  (s) => `\x1b[2m${s}\x1b[0m`,
  gold: (s) => `\x1b[33m${s}\x1b[0m`,
  ok:   (s) => `\x1b[32m${s}\x1b[0m`,
  bad:  (s) => `\x1b[31m${s}\x1b[0m`,
};

const line = () => console.log(C.dim('  ' + '─'.repeat(56)));
const say  = (s = '') => console.log(s ? '  ' + s : '');

/* ─────────────── 1. 폴더가 온전한가 ─────────────── */

function check() {
  const want = [
    ['index.html',                    '첫 화면'],
    ['assets/js/main.js',             '프로그램'],
    ['assets/css/tokens.css',         '색과 글자'],
    ['assets/media/ink/full.mp4',     '배경 영상'],
    ['serve.mjs',                     '미리보기 서버'],
  ];

  const missing = want.filter(([p]) => !fs.existsSync(path.join(ROOT, p)));
  if (missing.length) {
    say(C.bad('폴더가 온전하지 않습니다. 아래가 없습니다:'));
    for (const [p, what] of missing) say(C.bad(`  · ${p}  (${what})`));
    say();
    say('압축을 다시 풀어 보십시오. 압축 프로그램이 폴더 구조를');
    say('제대로 풀지 못했을 수 있습니다.');
    return false;
  }

  // 배경 영상 스물넷이 다 있나 (바탕에 쓰는 calm 열둘, 관문에 쓰는 wild 열둘)
  const clips = [];
  for (const kind of ['calm', 'wild']) {
    for (let i = 1; i <= 12; i++) {
      const name = `${kind}-${String(i).padStart(2, '0')}.mp4`;
      if (!fs.existsSync(path.join(ROOT, 'assets/media/ink', name))) clips.push(name);
    }
  }
  if (clips.length) {
    say(C.gold(`배경 영상 ${clips.length}편이 없습니다 (${clips.slice(0, 4).join(', ')}${clips.length > 4 ? ' …' : ''}).`));
    say(C.gold('사이트는 그대로 돌아갑니다. 배경이 덜 갈릴 뿐입니다.'));
    say();
  }

  return true;
}

/* ─────────────── 2. 가져온 설정이 있나 ─────────────── */

function settingsNote() {
  const f = path.join(ROOT, 'settings.json');
  if (!fs.existsSync(f)) {
    say(C.dim('설정 파일(settings.json)은 없습니다 — 기본값으로 시작합니다.'));
    say(C.dim('전에 쓰던 PC 에서 [설정 → Περί → 설정 내보내기] 로 받은'));
    say(C.dim('settings.json 을 이 폴더에 넣어 두면 저절로 적용됩니다.'));
    return;
  }

  try {
    // 메모장이나 PowerShell 로 저장하면 파일 앞에 눈에 보이지 않는 BOM 이
    // 붙는다. 그대로 JSON.parse 에 넘기면 깨진 파일 취급을 받는다.
    const raw = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    if (data.app !== 'ktema-es-aei') {
      say(C.bad('settings.json 이 있지만 이 사이트의 설정 파일이 아닙니다. 건너뜁니다.'));
      return;
    }
    const n = Object.keys(data.settings || {}).length;
    const when = data.savedAt ? String(data.savedAt).slice(0, 10) : '날짜 모름';
    say(C.ok(`설정 파일을 찾았습니다 — ${n}가지, ${when} 에 내보낸 것.`));
    say(C.ok('브라우저가 열릴 때 저절로 적용됩니다.'));
  } catch {
    say(C.bad('settings.json 을 읽지 못했습니다 (파일이 깨졌습니다). 건너뜁니다.'));
  }
}

/* ─────────────── 3. 바탕화면 바로가기 ─────────────── */

function shortcutPath() {
  const desktop = path.join(os.homedir(), 'Desktop');
  if (!fs.existsSync(desktop)) return null;
  return path.join(desktop, isWin ? 'Ktema es Aei.lnk' : 'Ktema es Aei.command');
}

function makeShortcut() {
  const target = shortcutPath();
  if (!target) { say(C.dim('바탕화면을 찾지 못해 건너뜁니다.')); return; }

  try {
    if (isWin) {
      // PowerShell 로 .lnk 를 만든다. 아이콘은 사이트의 인장을 쓸 수 없어
      // (ico 가 아니다) 기본 아이콘으로 둔다.
      const bat = path.join(ROOT, 'START.bat');
      const ps = [
        '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:KT_LNK)',
        '$s.TargetPath = $env:KT_BAT',
        '$s.WorkingDirectory = $env:KT_DIR',
        '$s.Description = "Ktema es Aei"',
        '$s.Save()',
      ].join('; ');

      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        env: { ...process.env, KT_LNK: target, KT_BAT: bat, KT_DIR: ROOT },
      });
      if (r.status !== 0) throw new Error('powershell');
    } else {
      fs.writeFileSync(target,
        `#!/usr/bin/env bash\ncd "${ROOT}" && ./start.sh\n`, { mode: 0o755 });
    }
    say(C.ok('바탕화면에 바로가기를 만들었습니다.'));
  } catch {
    say(C.dim('바로가기를 만들지 못했습니다. START.bat 을 직접 누르면 됩니다.'));
  }
}


/* ─────────────── 묻기 ─────────────── */

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  ' + question + ' ', (a) => {
      rl.close();
      resolve(String(a || '').trim().toLowerCase());
    });
  });
}

const yes = (a) => a === '' || a === 'y' || a === 'ㅛ' || a === 'yes' || a === 'ㅇ';

/* ─────────────── 시작 ─────────────── */

async function main() {
  console.clear?.();
  say();
  say(C.gold('Κτῆμα ἐς Ἀεί') + C.dim('   준비'));
  line();
  say();

  say(C.dim('Node.js ' + process.version + ' · ' + process.platform));
  say(C.dim('폴더: ' + ROOT));
  say();

  if (!check()) {
    say();
    await ask('창을 닫으려면 Enter 를 누르십시오.');
    process.exit(1);
  }
  say(C.ok('파일이 모두 제자리에 있습니다.'));
  say();

  settingsNote();
  say();

  const target = shortcutPath();
  const already = target && fs.existsSync(target);
  if (already) {
    say(C.dim('바탕화면 바로가기가 이미 있습니다.'));
  } else {
    const a = await ask('바탕화면에 바로가기를 만들까요? ' + C.dim('[Y/n]'));
    if (yes(a)) makeShortcut();
    else say(C.dim('만들지 않았습니다.'));
  }

  say();
  line();
  say();
  say('준비가 끝났습니다. 이제부터는 ' + C.gold('START.bat') + ' 만 누르면 됩니다.');
  say();
  say(C.dim('사이트를 띄웁니다…'));
  say();

  // 서버로 넘긴다. 이 창이 그대로 서버 창이 된다.
  const child = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), '--open'], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  say(C.bad('준비 중에 문제가 생겼습니다: ' + e.message));
  say(C.dim('START.bat 을 직접 눌러 보십시오.'));
  process.exitCode = 1;
});
