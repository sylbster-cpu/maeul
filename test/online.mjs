// 온라인 기능을 가짜 서버 응답으로 열어 보는 브라우저/모바일 UI 시험.
// 실제 Firebase 설정·결제·실서버는 쓰지 않는다.
export default async function onlineTour(page, { out, logs }) {
  const say = (label, ok) => logs.push(`${ok ? '통과' : '실패'}  ${label}`);
  const mock = `
    import { createState } from './state.js';
    const OWNER = 'ownerAa123456789';
    export const ONLINE_TIMEOUT_MS = 20000;
    export function isOnlineConfigured() { return true; }
    let house = null; // 가짜 서버에 올라간 내 집의 상태
    export function getOnlineService() {
      return Promise.resolve({
        uid: OWNER,
        async ownStatus() { return house ? { published: true, isPublic: house.isPublic, updatedAt: house.at } : { published: false, isPublic: false, updatedAt: null }; },
        async publish() { house = { isPublic: true, at: new Date(2026, 10, 20, 18, 10) }; return 'https://sylbster-cpu.github.io/maeul/#visit=' + OWNER; },
        async visit() { return createState(); },
        async leaveNote() {},
        // 첫 장에는 다음 장이 있다고 알리고, 이어 읽으면 오래된 인사 하나를 준다
        async getNotes(after) {
          if (after === 'page1-last') return { notes: [{ uid: 'guestCc111111111', body: '오래된 인사', date: new Date(2026, 10, 1) }], next: null };
          return { notes: [{ uid: 'guestBb987654321', body: '<b>안전한 인사</b>', date: new Date() }], next: 'page1-last' };
        },
        async removeNote() {},
        async unpublish() { if (house) house.isPublic = false; },
      });
    }
  `;
  page.on('dialog', (dialog) => dialog.accept()); // 공개 중지를 묻는 창에는 예로 답한다
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
  const stateText = () => page.evaluate(() => document.getElementById('online-state').textContent);
  await page.waitForFunction(() => document.getElementById('online-state').dataset.state === 'none');
  say('게시한 적이 없으면 그렇게 알려 준다', (await stateText()).includes('게시한 집이 없습니다') && await page.locator('#online-state').isVisible());
  await page.click('#online-list');
  await page.waitForFunction(() => document.getElementById('online-notes-list').textContent.includes('안전한 인사'));
  say('방명록은 방문자 HTML을 실행하지 않고 글자로 표시한다',
    await page.evaluate(() => document.getElementById('online-notes-list').querySelector('b') === null));
  await page.click('#online-notes-list .online-more');
  await page.waitForFunction(() => document.getElementById('online-notes-list').textContent.includes('오래된 인사'));
  say('방명록 맨 아래의 더 보기로 오래된 인사를 이어 본다', await page.evaluate(() => {
    const l = document.getElementById('online-notes-list');
    return l.querySelectorAll('.online-note-row').length === 2 && !l.querySelector('.online-more');
  }));
  await page.click('#online-publish');
  await page.waitForFunction(() => document.getElementById('share-link').value.includes('#visit='));
  say('온라인 게시 버튼이 짧은 방문 링크를 표시한다', await page.locator('#share-layer').isVisible());
  await page.click('#share-close');
  await page.click('#online-action');
  await page.waitForFunction(() => document.getElementById('online-state').dataset.state === 'public');
  say('게시한 뒤 창을 열면 공개 중이라고 알려 준다', /지금 공개 중입니다.*마지막 게시 11\. 20\./.test(await stateText()));
  await page.click('#online-unpublish');
  await page.waitForFunction(() => document.getElementById('online-state').dataset.state === 'private');
  say('공개 중지를 누르면 중지됐다고 바로 알려 준다', (await stateText()).includes('공개가 중지되어 있습니다'));
  await page.click('#online-close');
  await page.click('#online-action');
  await page.waitForFunction(() => document.getElementById('online-state').dataset.state === 'private');
  say('창을 다시 열어도 중지 상태가 보인다', (await stateText()).includes('공개가 중지되어 있습니다'));
  await page.screenshot({ path: `${out}-state.png` });
  await page.click('#online-close');

  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => { location.hash = '#visit=ownerAa123456789'; }),
  ]);
  await page.waitForFunction(() => window.__ready === true && !document.getElementById('my-home').hidden);
  say('방문 모드에서는 편집 버튼이 숨겨진다', await page.locator('#mode-build').isHidden());
  await page.click('#online-action');
  say('방문자의 창에는 게시 상태 줄이 없다', await page.locator('#online-state').isHidden());
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
