// 고칠 것 목록 정리(2026-11-23)의 확인.
//   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/upkeep.mjs
// 1. Firebase 모듈이 막힌 주소에서는 무엇이 막혔는지 알린다
// 2. 방을 다시 그려도 GPU 메모리의 기하·무늬 수가 늘지 않는다
// 3. 360×640 화면에서도 방의 뒤쪽 벽이 위쪽 버튼에 가려지지 않는다
// 4. Object.hasOwn 과 structuredClone 이 없는 오래된 브라우저에서도 게임이 뜨고, 놓기·되돌리기·저장이 된다
// 5. 찌가 앞쪽 나무에 가리면 그 나무의 잎을 비친다 (2026-11-23 사용자 휴대폰 화면: "살짝 가리네요")
// 6. 이 화면이 모르는 부품(더 새로운 판에서 놓은 것)이 든 집을 열면 원문을 남기고 저장하지 않는다 (2026-11-25, PR #42 GPT 검토 1)
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
  const future = await g(() => {
    const data = JSON.parse(localStorage.getItem('house-lab-web:save'));
    data.state.spaces.yard.objects.zz = { id: 'zz', part: 'future_thing', x: 1, y: 1, rot: 0, by: 'p1' };
    const text = JSON.stringify(data);
    localStorage.setItem('house-lab-web:save', text);
    return text;
  });
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
}

