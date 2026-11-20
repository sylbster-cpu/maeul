// 온라인 기능을 가짜 서버 응답으로 열어 보는 브라우저/모바일 UI 시험.
// 실제 Firebase 설정·결제·실서버는 쓰지 않는다.
export default async function onlineTour(page, { out, logs }) {
  const say = (label, ok) => logs.push(`${ok ? '통과' : '실패'}  ${label}`);
  const mock = `
    import { createState } from './state.js';
    const OWNER = 'ownerAa123456789';
    export const ONLINE_TIMEOUT_MS = 20000;
    export function isOnlineConfigured() { return true; }
    export function getOnlineService() {
      return Promise.resolve({
        uid: OWNER,
        async publish() { return 'https://sylbster-cpu.github.io/maeul/#visit=' + OWNER; },
        async visit() { return createState(); },
        async leaveNote() {},
        async getNotes() { return [{ uid: 'guestBb987654321', body: '<b>안전한 인사</b>', date: new Date() }]; },
        async removeNote() {},
        async unpublish() {},
      });
    }
  `;
  await page.route('**/src/online.js', (route) => route.fulfill({
    body: mock, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' },
  }));
  await page.reload();
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => {
    window.__game.store.dispatch({ type: 'setExterior', slot: 'roof', value: 'slate' });
    window.__game.saveNow();
  });
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('house-lab-web:save')).state);
  say('설정된 경우 온라인 버튼이 나타난다', await page.locator('#online-action').isVisible());

  await page.click('#online-action');
  say('온라인 게시 창이 화면 위에 열린다', await page.locator('#online-layer').isVisible());
  await page.click('#online-list');
  await page.waitForFunction(() => document.getElementById('online-notes-list').textContent.includes('안전한 인사'));
  say('방명록은 방문자 HTML을 실행하지 않고 글자로 표시한다',
    await page.evaluate(() => document.getElementById('online-notes-list').querySelector('b') === null));
  await page.click('#online-publish');
  await page.waitForFunction(() => document.getElementById('share-link').value.includes('#visit='));
  say('온라인 게시 버튼이 짧은 방문 링크를 표시한다', await page.locator('#share-layer').isVisible());
  await page.click('#share-close');

  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => { location.hash = '#visit=ownerAa123456789'; }),
  ]);
  await page.waitForFunction(() => window.__ready === true && !document.getElementById('my-home').hidden);
  say('방문 모드에서는 편집 버튼이 숨겨진다', await page.locator('#mode-build').isHidden());
  await page.click('#online-action');
  await page.fill('#online-note-text', '반가워요');
  await page.click('#online-submit');
  await page.waitForFunction(() => document.getElementById('online-status').textContent.includes('방문 인사를 남겼습니다'));
  say('친구 방문 인사를 보낼 수 있다', await page.locator('#online-submit').isDisabled());
  await page.click('#online-close');
  await Promise.all([page.waitForEvent('load'), page.click('#my-home')]);
  await page.waitForFunction(() => window.__ready === true && document.getElementById('my-home').hidden);
  const current = await page.evaluate(() => JSON.parse(localStorage.getItem('house-lab-web:save')).state);
  say('온라인 방문과 인사 후에도 내 집은 유지된다', current.house.roof === original.house.roof);
  say('모바일 너비에서 가로 넘침이 없다',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${out}-final.png` });
}
