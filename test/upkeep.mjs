// 고칠 것 목록 정리(2026-11-23)의 확인.
//   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/upkeep.mjs
// 1. Firebase 모듈이 막힌 주소에서는 무엇이 막혔는지 알린다
// 2. 방을 다시 그려도 GPU 메모리의 기하·무늬 수가 늘지 않는다
// 3. 360×640 화면에서도 방의 뒤쪽 벽이 위쪽 버튼에 가려지지 않는다
// 4. Object.hasOwn 과 structuredClone 이 없는 오래된 브라우저에서도 게임이 뜨고, 놓기·되돌리기·저장이 된다
// 5. 찌가 앞쪽 나무에 가리면 그 나무의 잎을 비친다 (2026-11-23 사용자 휴대폰 화면: "살짝 가리네요")
// 6. 이 화면이 모르는 부품(더 새로운 판에서 놓은 것)이 든 집을 열면 원문을 남기고 저장하지 않는다 (2026-11-25, PR #42 GPT 검토 1)
//    그 상태에서는 공유 링크도, 온라인 게시도 하지 않는다. 연결을 기다리는 사이 새 판이 저장해도 게시하지 않는다.
//    맞바꾸기는 원문을 그대로 옮기므로 할 수 있다 (PR #43 GPT 검토·재검토)
// 7. 저장 공간이 가득 차 새로 쓰기가 안 되어도 저장된 집을 읽어 연다(처음 배치로 시작하지 않는다) (2026-11-26 GPT 점검)
//    같은 열쇠를 같은 크기로 덮어쓰는 저장은 가득 차도 될 수 있으므로, 저장 여부가 아니라 집의 내용을 본다
export default async function upkeepTour(page, { out, logs }) {
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 3) => g((k) => new Promise((done) => {
    const step = () => (k-- <= 0 ? done() : requestAnimationFrame(step));
    step();
  }), n);

  // 5. 연못 남쪽 물가에서 던지면 찌가 남동쪽 나무(31.5, 23.5) 뒤에 떨어진다
  const cdp = await page.context().newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const groundTap = async (x, z) => {
    let p = await g(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
    for (let i = 0; i < 40; i++) {
      await frames(4);
      const q = await g(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
      const still = Math.hypot(q.x - p.x, q.y - p.y) < 0.5;
      p = q;
      if (still) break;
    }
    await tap(p.x, p.y);
  };
  await g(() => { window.__game.character.teleport(26, 15); window.__game.view.snapFocus(26, 15); window.__game.fishing.setRandom(() => 0.05); });
  await groundTap(29.2, 19.8);
  await page.waitForFunction(() => window.__game.fishing.phase === 'wait' && window.__game.view.closeAmount > 0.99, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(700);
  const cover = await g(async () => {
    const T = await import('./src/three.js');
    const { view } = window.__game;
    // 찌에서 카메라 쪽으로 그은 선에 걸리는 나뭇잎들의 불투명도
    const [p] = window.__game.pondWatch();
    const ray = new T.Raycaster(new T.Vector3(p.x, p.y, p.z), view.camera.getWorldDirection(new T.Vector3()).negate());
    ray.camera = view.camera; // 장면의 그림 조각(Sprite)도 훑으려면 카메라가 있어야 한다
    const leaves = ray.intersectObjects(view.scene.children, true).filter((h) => h.object.geometry?.type === 'IcosahedronGeometry');
    return { opacity: leaves.map((h) => +h.object.material.opacity.toFixed(2)), see: view.trees.find((t) => t.x === 31.5 && t.z === 23.5).see };
  });
  say('찌가 앞쪽 나무에 가리면 그 나무의 잎을 비친다', cover.opacity.length > 0 && cover.opacity.every((o) => o < 0.5) && cover.see < 0.5, JSON.stringify(cover));
  await page.screenshot({ path: `${out}-bobber.png` });
  await g(() => window.__game.fishing.cancel());
  await page.waitForTimeout(300);

  // 1. Firebase 모듈을 막는다 (Claude 미리 보기 주소에서 일어나는 일)
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => route.abort());
  await page.click('#online-action');
  const blocked = await page.waitForFunction(() => document.getElementById('online-state').dataset.state === 'blocked', null, { timeout: 25000 })
    .then(() => true).catch(() => false);
  const stateText = await g(() => document.getElementById('online-state').textContent);
  say('Firebase 모듈이 막히면 그렇다고 알리고 GitHub Pages 주소를 권한다', blocked && stateText.includes('GitHub Pages'), stateText.slice(0, 40));
  await page.click('#online-close');

  // 2. 방에 들어가 벽지·바닥을 바꾸며 여러 번 다시 그린다
  await g(() => window.__game.travel.toggle());
  await page.waitForFunction(() => window.__game.character.place === 'main', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const memory = () => g(() => ({ ...window.__game.view.renderer.info.memory }));
  const papers = ['cream', 'sky', 'rose', 'navy', 'sage'];
  const floors = ['walnut', 'checker', 'carpet', 'moss', 'wood'];
  const cycle = async () => {
    for (let i = 0; i < papers.length; i++) {
      await g(([wall, floor]) => {
        const { store } = window.__game;
        store.dispatch({ type: 'setFinish', space: 'main', slot: 'wall', value: wall });
        store.dispatch({ type: 'setFinish', space: 'main', slot: 'floor', value: floor });
      }, [papers[i], floors[i]]);
      await frames(3);
    }
  };
  await cycle(); // 벽지·바닥 무늬를 한 번씩 만들어 둔다 (이것들은 다시 쓰려고 남긴다)
  const before = await memory();
  for (let k = 0; k < 4; k++) await cycle();
  for (let k = 0; k < 10; k++) { await g(() => window.__game.view.rebuild()); await frames(2); }
  const after = await memory();
  say('방을 다시 그려도 기하와 무늬가 쌓이지 않는다', after.geometries <= before.geometries && after.textures <= before.textures,
    `기하 ${before.geometries}→${after.geometries}, 무늬 ${before.textures}→${after.textures}`);

  // 3. 좁은 화면
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(1500);
  const fit = await g(() => {
    const { view } = window.__game;
    const V = view.scene.position.constructor;
    const r = document.getElementById('scene').getBoundingClientRect();
    const y = (a, b, c) => r.top + (1 - new V(a, b, c).project(view.camera).y) / 2 * r.height;
    const tops = [y(0, 3.4, 0), y(6, 3.4, 0), y(0, 3.4, 6)];
    return { wallTop: Math.round(Math.min(...tops)), buttons: Math.round(document.querySelector('.top').getBoundingClientRect().bottom),
      floor: Math.round(y(6, 0, 6)), tray: Math.round(document.querySelector('.bottom').getBoundingClientRect().top) };
  });
  say('360×640 화면에서 방의 뒤쪽 벽이 위쪽 버튼 아래에서 시작한다', fit.wallTop >= fit.buttons, JSON.stringify(fit));
  say('360×640 화면에서 방의 앞쪽 바닥이 아래쪽 쟁반 위에서 끝난다', fit.floor <= fit.tray, JSON.stringify(fit));
  await page.screenshot({ path: `${out}-360.png` });
  await page.setViewportSize({ width: 390, height: 844 });

  // 4. 오래된 브라우저 흉내: 두 기능을 지우고 다시 연다
  await page.addInitScript(() => { delete Object.hasOwn; delete window.structuredClone; });
  await page.reload();
  const ready = await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).then(() => true).catch(() => false);
  const gone = await g(() => typeof Object.hasOwn === 'undefined' && typeof structuredClone === 'undefined');
  say('Object.hasOwn·structuredClone 없이도 게임이 뜬다', ready && gone);
  const count = () => g(() => Object.keys(window.__game.store.state.spaces.main.objects).length);
  const start = await count();
  const placed = await g(() => {
    const { store, history } = window.__game;
    for (let x = 0; x < 6; x++) for (let y = 0; y < 5; y++) {
      const r = history.run([{ type: 'placeObject', space: 'main', id: store.nextId(), part: 'stool', x, y, rot: 0, by: store.playerId }]);
      if (r.ok) return true;
    }
    return false;
  });
  say('오래된 브라우저에서 가구를 놓는다', placed && (await count()) === start + 1);
  const undone = await g(() => window.__game.history.undo().ok);
  say('오래된 브라우저에서 되돌린다', undone && (await count()) === start);
  await g(() => window.__game.history.redo());
  await g(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => {});
  say('오래된 브라우저에서 저장한 집을 다시 연다', (await count()) === start + 1);

  // 6. 더 새로운 판의 집: 미래의 부품 하나를 끼운 저장을 열면, 옆에 남기고 자동 저장을 멈춘다
  // 온라인 기능은 가짜 서버로 바꿔, 게시를 부르는지만 센다(실제 Firebase 를 쓰지 않는다).
  // globalThis.__gate 를 걸면 연결이 그것을 기다린다(연결을 기다리는 사이의 일을 흉내 낸다)
  await page.route('**/src/online.js', (route) => route.fulfill({
    contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' },
    body: `
      export const ONLINE_TIMEOUT_MS = 20000;
      export function isOnlineConfigured() { return true; }
      export function getOnlineService() {
        const service = {
          uid: 'ownerAa123456789',
          async ownStatus() { return { published: true, isPublic: true, updatedAt: null }; },
          async publish() { globalThis.__published = (globalThis.__published || 0) + 1; return 'https://example.invalid/#visit=x'; },
          async getNotes() { return { notes: [], next: null }; },
          async unpublish() {}, async removeNote() {}, async leaveNote() {}, async visit() { return null; },
        };
        return (globalThis.__gate || Promise.resolve()).then(() => service);
      }`,
  }));
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  const normal = await g(() => localStorage.getItem('house-lab-web:save'));
  const future = (() => {
    const data = JSON.parse(normal);
    data.state.spaces.yard.objects.zz = { id: 'zz', part: 'future_thing', x: 1, y: 1, rot: 0, by: 'p1' };
    return JSON.stringify(data);
  })();
  // 6-가. 게시를 누를 때는 보통 집이었는데, 연결을 기다리는 사이 다른 탭의 새 판이 저장하면 게시하지 않는다 (PR #43 GPT 재검토)
  await page.click('#online-action');
  await page.waitForTimeout(300);
  await g(() => { globalThis.__gate = new Promise((done) => { globalThis.__open = done; }); });
  await page.click('#online-publish');
  await page.waitForTimeout(200);
  await g((text) => { localStorage.setItem('house-lab-web:save', text); globalThis.__open(); }, future);
  await page.waitForTimeout(500);
  const raced = await g(() => ({ published: globalThis.__published || 0, status: document.getElementById('online-status')?.textContent || '' }));
  say('게시를 누른 뒤 연결을 기다리는 사이 새 판이 저장하면 게시하지 않는다', raced.published === 0 && raced.status.includes('새로 고친 뒤'), JSON.stringify(raced));
  await page.click('#online-close');
  // 6-나. 그 집을 새로 열면: 원문을 남기고 저장하지 않으며, 공유 링크·온라인 게시도 하지 않는다
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  const lock = await g(() => ({
    status: document.getElementById('save-status')?.textContent || '', toast: document.getElementById('toast')?.textContent || '',
    saved: window.__game.saveNow(),
  }));
  const stored = await g(() => ({ same: localStorage.getItem('house-lab-web:save'), kept: localStorage.getItem('house-lab-web:save:newer') }));
  say('새 판의 부품이 든 집을 열면 원문을 남기고 저장하지 않는다', lock.saved === false && lock.status.includes('새 판') && lock.toast.includes('새로 고쳐') && stored.same === future && stored.kept === future,
    JSON.stringify({ status: lock.status, saved: lock.saved, same: stored.same === future, kept: stored.kept === future }));
  // 공유 링크: 빠진 배치로 만들지 않고 새로 고치라고 알린다 (보관된 집이 없으면 창도 열지 않는다)
  await page.click('#share-house');
  await page.waitForTimeout(300);
  const shared = await g(() => ({ open: !document.getElementById('share-layer').hidden, link: document.getElementById('share-link').value, toast: document.getElementById('toast')?.textContent || '' }));
  say('그 상태에서는 공유 링크를 만들지 않는다', !shared.open && !shared.link && shared.toast.includes('새로 고친 뒤'), JSON.stringify(shared));
  // 온라인 게시: 서버의 내 집을 빠진 배치로 덮지 않는다
  await page.click('#online-action');
  await page.waitForTimeout(300);
  await page.click('#online-publish');
  await page.waitForTimeout(500);
  const online = await g(() => ({ published: globalThis.__published || 0, status: document.getElementById('online-status')?.textContent || '' }));
  say('그 상태에서는 온라인 게시를 하지 않는다', online.published === 0 && online.status.includes('새로 고친 뒤'), JSON.stringify(online));
  await page.click('#online-close');
  const untouched = await g(() => localStorage.getItem('house-lab-web:save'));
  say('그 뒤에도 저장된 원문은 그대로다', untouched === future, '');
  // 6-다. 맞바꾸기는 원문을 그대로 옮기므로 그 상태에서도 할 수 있다 (PR #43 GPT 재검토: 공유 창에서만 갈 수 있다)
  await g((text) => localStorage.setItem('house-lab-web:before-import', JSON.stringify({ version: 1, previous: text })), normal);
  await page.click('#share-house');
  await page.waitForTimeout(300);
  const swap = await g(() => ({
    open: !document.getElementById('share-layer').hidden, link: document.getElementById('share-link').value,
    button: !document.getElementById('share-restore-previous').hidden,
  }));
  say('그 상태에서도 보관된 집과 맞바꾸는 창은 열리고, 공유 주소는 없다', swap.open && !swap.link && swap.button, JSON.stringify(swap));
  page.once('dialog', (dialog) => dialog.accept());
  await Promise.all([page.waitForEvent('load', { timeout: 30000 }).catch(() => {}), page.click('#share-restore-previous')]);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => {});
  const swapped = await g(() => ({ save: localStorage.getItem('house-lab-web:save'), backup: localStorage.getItem('house-lab-web:before-import') }));
  const previous = (() => { try { return JSON.parse(swapped.backup).previous; } catch { return null; } })();
  const sameState = (() => { try { return JSON.stringify(JSON.parse(swapped.save).state) === JSON.stringify(JSON.parse(normal).state); } catch { return false; } })();
  say('맞바꾸면 새 판의 집은 글자 그대로 보관되고, 보관했던 집이 열린다', previous === future && sameState, JSON.stringify({ kept: previous === future, sameState }));

  // 7. 저장 공간을 가득 채운 뒤 새로 연다
  const roof7 = await g(() => (window.__game.store.state.house.roof === 'slate' ? 'moss' : 'slate')); // 처음 배치(terracotta)와 다른 색
  await g((roof) => { window.__game.store.dispatch({ type: 'setExterior', slot: 'roof', value: roof }); window.__game.saveNow(); }, roof7);
  const saved7 = await g(() => localStorage.getItem('house-lab-web:save'));
  const filled = await g(() => {
    let n = 0;
    // 1글자까지 줄여 가며 채운다. 16글자에서 멈추면 남은 몇 바이트에 아래의 시험 쓰기가 들어가 가득 차지 않은 것으로 보였다
    for (let size = 1 << 20; size >= 1; size >>= 1) {
      const chunk = 'x'.repeat(size);
      for (;;) { try { localStorage.setItem(`fill:${n}`, chunk); n++; } catch { break; } }
    }
    try { localStorage.setItem('fill:probe', '1'); localStorage.removeItem('fill:probe'); return { n, full: false }; } catch { return { n, full: true }; }
  });
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  const full7 = await g(() => ({
    roof: window.__game.store.state.house.roof, objects: Object.keys(window.__game.store.state.spaces.main.objects).length,
    saved: window.__game.saveNow(), status: document.getElementById('save-status')?.textContent || '',
    same: localStorage.getItem('house-lab-web:save'),
  }));
  const savedObjects = Object.keys(JSON.parse(saved7).state.spaces.main.objects).length;
  const keptState = (() => { try { return JSON.stringify(JSON.parse(full7.same).state) === JSON.stringify(JSON.parse(saved7).state); } catch { return false; } })();
  say('저장 공간이 가득 차도 저장된 집을 읽어 열고, 저장된 집도 그대로다',
    filled.full && full7.roof === roof7 && full7.objects === savedObjects && keptState,
    JSON.stringify({ full: filled.full, roof: full7.roof, want: roof7, objects: full7.objects, savedObjects, keptState, saved: full7.saved, status: full7.status }));
  await g(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('fill:')) localStorage.removeItem(k); });
}
