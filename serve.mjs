/* ═══════════════════════════════════════════════════════════════
   serve.mjs — 이 폴더를 그 자리에서 띄운다

   이 사이트는 ES 모듈을 쓰므로 index.html 을 두 번 눌러 file:// 로
   여는 방식으로는 뜨지 않는다. 웹서버가 하나 있어야 한다.

     node serve.mjs              http://localhost:4488
     node serve.mjs 8080         다른 문으로
     node serve.mjs --lan        같은 공유기에 물린 다른 기기에서도 보이게
     node serve.mjs --open       다 뜨면 브라우저를 연다

   Node 만 깔려 있으면 어느 PC에서든 그대로 돈다. 설치할 꾸러미도,
   설정 파일도, 이 컴퓨터에만 있는 경로도 없다. 폴더째 옮기면 된다.

   웹호스팅에 올릴 때 이 파일은 아무 일도 하지 않는다. 지워도 된다.
   ═══════════════════════════════════════════════════════════════ */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const LAN  = args.includes('--lan');
const OPEN = args.includes('--open');
const PORT = Number(args.find((a) => /^\d+$/.test(a))) || 4488;

// 기본은 이 컴퓨터 안에서만. --lan 을 줘야 바깥으로 연다.
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400).end('400'); return; }

  if (rel.endsWith('/')) rel += 'index.html';

  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('403'); return; }

  // 이 작은 서버는 PHP 를 돌리지 못한다. 그냥 넘겨주면 api/proxy.php 의
  // 속살이 그대로 브라우저에 떨어지고, 사이트는 그것을 프록시가 살아
  // 있는 것으로 잘못 읽는다. 없는 셈 치는 편이 맞다 — 그러면 사이트가
  // 웹호스팅이 아닌 곳에서 그러듯 공개 프록시로 넘어간다.
  if (path.extname(file).toLowerCase() === '.php') {
    res.writeHead(501, { 'content-type': 'text/plain; charset=utf-8' })
       .end('이 미리보기 서버는 PHP 를 돌리지 못합니다. (웹호스팅에 올리면 살아납니다)');
    return;
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('404 ' + rel); return; }

    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;

    // 영상 구간을 건너뛰려면 이어받기가 되어야 한다
    if (range && /^bytes=/.test(range)) {
      const [, a, b] = /bytes=(\d*)-(\d*)/.exec(range);
      const start = a ? Number(a) : 0;
      const end = b ? Number(b) : st.size - 1;
      if (start >= st.size) {
        res.writeHead(416, { 'content-range': `bytes */${st.size}` }).end();
        return;
      }
      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${st.size}`,
        'accept-ranges': 'bytes',
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'content-type': type,
      'content-length': st.size,
      'accept-ranges': 'bytes',
    });
    fs.createReadStream(file).pipe(res);
  });
});

/* ── 문이 이미 쓰이고 있으면 다음 문을 열어 본다 ──
   다른 PC 에서는 4488 이 이미 다른 것에 잡혀 있을 수 있다.
   그때마다 사람이 번호를 골라 주게 하는 대신 알아서 옆으로 옮긴다. */
let port = PORT;
let tries = 0;

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && tries < 12) {
    tries += 1;
    port += 1;
    server.listen(port, HOST);
    return;
  }
  console.error('\n띄우지 못했습니다:', e.message);
  if (e.code === 'EACCES') console.error('1024 미만의 번호는 관리자 권한이 필요합니다.');
  process.exit(1);
});

server.listen(port, HOST, () => {
  const local = `http://localhost:${port}`;
  console.log('');
  console.log('  Κτῆμα ἐς Ἀεί');
  console.log('  ' + '─'.repeat(46));
  console.log('  이 컴퓨터   ' + local);

  if (LAN) {
    for (const addr of lanAddresses()) {
      console.log('  같은 공유기 ' + `http://${addr}:${port}`);
    }
    console.log('');
    console.log('  ※ 휴대폰이나 다른 PC 에서 위 주소로 들어가면 됩니다.');
    console.log('    (같은 공유기에 물려 있어야 하고, 이 창을 닫으면 꺼집니다)');
  } else {
    console.log('');
    console.log('  다른 기기에서도 보려면:  node serve.mjs --lan');
  }

  console.log('');
  console.log('  끝내려면 Ctrl+C');
  console.log('');

  if (OPEN) openBrowser(local);
});

/** 이 컴퓨터가 공유기에서 받은 주소들 */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out.length ? out : ['(주소를 찾지 못했습니다)'];
}

/** 운영체제별로 기본 브라우저를 연다 */
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
            : process.platform === 'darwin' ? ['open', [url]]
            : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref(); }
  catch { /* 못 열면 주소를 직접 누르면 된다 */ }
}
