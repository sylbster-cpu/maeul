// 확인용 화면 갈무리. CDN 요청은 node_modules 의 three 로 대신 응답한다.
// 사용법: node tools/shot.mjs <경로> <출력.png> [너비] [높이] [실행할 스크립트 파일]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [urlPath = '/', out = 'shot.png', w = '1280', h = '800', scriptFile] = process.argv.slice(2);
const port = process.env.PORT || 5173;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// TOUCH=1 이면 손가락으로 쓰는 휴대폰처럼 연다
const touch = process.env.TOUCH === '1';
const context = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1, colorScheme: process.env.SCHEME || 'light', hasTouch: touch, isMobile: touch });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
// 시험이 새 탭을 열어도 같은 대신 응답을 받게 탭 묶음(context)에 건다. 전에는 첫 탭에만 걸어
// house-transfer-tabs 의 두 번째 탭이 jsDelivr 가 막힌 환경에서 뜨지 않았다(0/0)
await context.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (route) => {
  const rel = new URL(route.request().url()).pathname.replace('/npm/three@0.170.0/', '');
  route.fulfill({ body: fs.readFileSync(path.join(root, 'node_modules/three', rel)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
});
await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
await page.goto(`http://localhost:${port}${urlPath}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => logs.push('[shot] __ready 신호 없음'));
try {
  if (scriptFile) {
    const mod = await import(path.resolve(scriptFile));
    await mod.default(page, { out, logs });
  } else {
    await page.waitForTimeout(400);
    await page.screenshot({ path: out });
  }
} finally {
  // 시험이 도중에 멈춰도 그때까지의 통과·실패 기록을 남긴다 (어디서 멈췄는지 보이게)
  for (const l of logs) console.log(l);
}
await browser.close();
