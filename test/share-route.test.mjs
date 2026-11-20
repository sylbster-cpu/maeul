import test from 'node:test';
import assert from 'node:assert/strict';
import { watchShareHash } from '../src/share-route.js';

function fakeWindow(hash = '') {
  let reloads = 0;
  let onChange;
  const win = {
    location: { hash, reload: () => { reloads++; } },
    addEventListener(name, handler) { if (name === 'hashchange') onChange = handler; },
  };
  return {
    setHash(value) { win.location.hash = value; onChange(); },
    get reloads() { return reloads; },
    win,
  };
}

test('이미 열린 탭에서 집 공유 링크로 이동하면 새 상태를 불러온다', () => {
  const app = fakeWindow();
  watchShareHash(app.win);
  app.setHash('#home=gABC');
  assert.equal(app.reloads, 1);
});

test('공유 중 새 집 링크로 바꾸거나 내 집으로 돌아올 때도 다시 읽는다', () => {
  const app = fakeWindow('#home=gABC');
  watchShareHash(app.win);
  app.setHash('#home=gXYZ');
  assert.equal(app.reloads, 1);
  app.setHash('');
  assert.equal(app.reloads, 2);
});

test('공유와 관계없는 해시 변경은 게임을 다시 시작하지 않는다', () => {
  const app = fakeWindow('#help');
  watchShareHash(app.win);
  app.setHash('#settings');
  app.setHash('');
  assert.equal(app.reloads, 0);
});
