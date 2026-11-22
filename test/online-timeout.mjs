// 온라인 서버가 응답하지 않을 때의 화면 확인. 가짜 서비스로 응답을 멈추거나 늦춘다.
// 실제 Firebase 에는 접속하지 않는다.
// 실행: TOUCH=1 node tools/shot.mjs / shots/online-timeout 390 844 test/online-timeout.mjs
export default async function onlineTimeoutTour(page, { out, logs }) {
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const g = (fn, arg) => page.evaluate(fn, arg);
  // 주소의 ?hang= 으로 응답을 멈추고, ?gate= 로 시험이 풀어 줄 때까지 응답을 붙잡아 둔다.
  // 순서를 시간에 기대지 않게 하려는 것이다. 한도만 실제 시계로 본다(멈춘 경우 3초)
  const mock = `
    import { createState } from './state.js';
    const OWNER = 'ownerAa123456789';
    const mode = new URLSearchParams(location.search);
    const never = () => new Promise(() => {});
    let release = null;
    window.__releaseOnline = () => { if (release) { release(); release = null; return true; } return false; };
    const gate = () => new Promise((resolve) => { release = resolve; });
    const hold = async (name) => { if (mode.get('hang') === name) await never(); if (mode.get('gate') === name) await gate(); };
    // 응답을 붙잡아 둘 때는 한도가 먼저 걸리지 않게 넉넉히 둔다
    export const ONLINE_TIMEOUT_MS = mode.get('gate') ? 60000 : 3000;
    export function isOnlineConfigured() { return true; }
    export function getOnlineService() {
      return Promise.resolve({
        uid: OWNER,
        async publish() { await hold('publish'); return 'https://sylbster-cpu.github.io/maeul/#visit=' + OWNER; },
        async ownStatus() { return { published: false, isPublic: false, updatedAt: null }; },
        async visit() { await hold('visit'); return createState(); },
        async leaveNote() {}, async getNotes() { return { notes: [], next: null }; }, async removeNote() {}, async unpublish() {},
      });
    }
  `;
  await page.route('**/src/online.js', (route) => route.fulfill({
    body: mock, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' },
  }));
  const base = page.url().split(/[?#]/)[0];
  const ready = () => page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 }).then(() => page.waitForTimeout(300));
  const hidden = (id) => g((i) => document.getElementById(i).hidden, id);
  const status = () => g(() => document.getElementById('online-status').textContent);

  // 1) 게시가 응답하지 않을 때
  await page.goto(base + '?hang=publish'); await ready();
  await g(() => { window.__game.store.dispatch({ type: 'setExterior', slot: 'roof', value: 'slate' }); window.__game.saveNow(); });
  await page.click('#online-action');
  await page.click('#online-publish');
  // 세 값을 한 번에 읽는다. 따로 읽으면 그 사이에 한도가 지나 값이 엇갈릴 수 있다
  const waiting = await g(() => ({ text: document.getElementById('online-status').textContent, closeOff: document.getElementById('online-close').disabled, publishOff: document.getElementById('online-publish').disabled }));
  say('기다리는 동안 닫기 버튼은 켜져 있고 게시 버튼은 꺼져 있다', waiting.text.includes('연결하는 중') && !waiting.closeOff && waiting.publishOff, JSON.stringify(waiting));
  await page.click('#online-close');
  say('응답을 기다리는 중에도 창을 닫을 수 있다', await hidden('online-layer'));

  await page.click('#online-action');
  say('닫았다 다시 열면 버튼을 바로 쓸 수 있다', !(await g(() => document.getElementById('online-publish').disabled)) && (await status()) === '');
  await page.click('#online-publish');
  await page.waitForFunction(() => document.getElementById('online-status').textContent.includes('응답이 없습니다'), null, { timeout: 15000 }).catch(() => {});
  const after = { text: await status(), publishOff: await g(() => document.getElementById('online-publish').disabled), toast: await g(() => document.getElementById('toast').textContent) };
  say('한도가 지나면 실패로 알리고 버튼을 다시 쓸 수 있다', after.text.includes('응답이 없습니다') && !after.publishOff && after.toast.includes('응답이 없습니다'), JSON.stringify(after));
  await page.screenshot({ path: `${out}-1-timeout.png` });

  // 바깥을 눌러도 기다리는 창이 닫힌다
  await page.click('#online-publish');
  await page.mouse.click(4, 4);
  say('창 바깥을 눌러도 닫힌다', await hidden('online-layer'));

  // 2) 창을 닫은 뒤 늦게 온 응답
  await page.goto(base + '?gate=publish'); await ready();
  await page.click('#online-action');
  await page.click('#online-publish');
  await page.click('#online-close'); // 응답은 아직 붙잡혀 있다
  const released = await g(() => window.__releaseOnline()); // 닫은 뒤에 응답을 보낸다
  await page.waitForTimeout(400);
  say('닫은 뒤 늦게 온 응답은 화면을 바꾸지 않는다', released && (await hidden('share-layer')) && (await hidden('online-layer')));
  await page.click('#online-action');
  await page.click('#online-publish');
  await page.waitForFunction(() => document.getElementById('online-publish').disabled, null, { timeout: 5000 }).catch(() => {});
  await g(() => window.__releaseOnline()); // 이번에는 창을 연 채로 응답을 받는다
  await page.waitForFunction(() => !document.getElementById('share-layer').hidden, null, { timeout: 10000 }).catch(() => {});
  say('창을 연 채 기다리면 늦은 응답도 정상으로 처리된다', !(await hidden('share-layer')) && (await g(() => document.getElementById('share-link').value.includes('#visit='))));

  // 3) 방문 링크가 응답하지 않을 때
  const saved = await g(() => JSON.stringify(JSON.parse(localStorage.getItem('house-lab-web:save')).state.house));
  await page.goto('about:blank');
  const started = Date.now();
  await page.goto(base + '?hang=visit#visit=ownerAa123456789');
  const up = await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).then(() => true).catch(() => false);
  const took = Date.now() - started;
  await page.waitForTimeout(200);
  const visit = up ? await g(() => ({
    loading: !document.getElementById('loading').hidden,
    guest: !document.getElementById('my-home').hidden,
    build: !document.getElementById('mode-build').hidden,
    toast: document.getElementById('toast').textContent,
    roof: window.__game.store.state.house.roof,
  })) : {};
  say('방문 링크가 응답하지 않으면 한도 뒤에 내 집으로 열린다', up && !visit.loading && !visit.guest && visit.build && visit.roof === 'slate' && visit.toast.includes('응답이 없습니다'), `${took}ms ${JSON.stringify(visit)}`);
  say('그 뒤에도 내 저장은 그대로다', (await g(() => JSON.stringify(JSON.parse(localStorage.getItem('house-lab-web:save')).state.house))) === saved);
  await page.screenshot({ path: `${out}-2-visit.png` });
}
