// 숲(3단계 공간 탐색)과 숲 연출(2026-11-24)의 확인. 화면에서만 보이는 문제가 되풀이되어 만든 시험이다.
//   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/forest.mjs
// 1. 첫 방문 안내는 처음 열 때만 뜬다
// 2. 오늘의 발견을 찾기 전에는 숲 쪽으로 잎이 흘러간다 (처음 화면에서)
// 3. 카메라 네 방향 모두: 오늘의 발견 곁에서 캐릭터 머리와 발견물을 불투명한 것이 가리지 않는다
//    (나무가 가리면 그 나무가 비친다. 2026-11-24 고침). 누르면 그 뒤에 서서 줍는다
// 4. 처음 주울 때 솟음·말풍선·반짝임이 나고, 주운 것은 사라진다(4단계 채집, 기록에 남음). 주운 뒤에는 잎 단서가 멎는다
// 5. 줄기 한가운데에서 시작해도 걸어 나간다 (예전 저장 자리가 새 나무 자리여도 갇히지 않는다)
export default async function forestTour(page, { out, logs }) {
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const cdp = await page.context().newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const frames = (n) => g((k) => new Promise((done) => { let i = 0; const step = () => (++i >= k ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
  // 카메라가 멈춘 뒤의 화면 자리를 누른다
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
  const toastText = () => g(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.textContent : ''; });
  const forestState = () => g(() => window.__game.view.forest.state);

  // 1. 첫 방문 안내
  await page.waitForTimeout(300);
  const first = await toastText();
  say('처음 열면 숲 안내가 뜬다', first.includes('숲길'), first.slice(0, 30));

  // 2. 처음 화면의 잎 단서 (3초쯤 뒤, 그 뒤 6.5초마다. 게임 시계 기준)
  await page.waitForFunction(() => window.__game.view.forest.state.cues > 0, null, { timeout: 40000 }).catch(() => {});
  const cue = await forestState();
  say('찾기 전에는 숲 쪽으로 잎 단서가 흐른다', cue.cues > 0 && cue.found === 0, JSON.stringify({ cues: cue.cues, found: cue.found }));
  await page.screenshot({ path: `${out}-0-cue.png` });

  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const second = await toastText();
  say('다시 열면 숲 안내가 뜨지 않는다', !second.includes('숲길'), second.slice(0, 30));

  // 바닥 꾸밈이 그려졌다 (자리는 단위 시험이 본다)
  const decor = (await forestState()).decor;
  say('숲 바닥에 돌·풀·꽃이 있다', decor.stones > 0 && decor.tufts > 0 && decor.flowers > 0, JSON.stringify(decor));

  // 3. 카메라 네 방향. 캐릭터 머리(1.45)와 발견물(0.85)까지 카메라에서 곧게 그은 선에 불투명한 것이 먼저 걸리지 않는가
  const site = (await forestState()).site;
  // 카메라에서 target 까지 곧게 그은 선에 target 보다 0.45 넘게 앞에 있는 불투명한 메시가 있는가
  const blockers = (st) => g(async (st) => {
    const T = await import('./src/three.js');
    const { view, character } = window.__game;
    const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const ray = new T.Raycaster();
    const blocker = (x, y, z) => {
      const target = new T.Vector3(x, y, z);
      const ndc = target.clone().project(view.camera);
      ray.setFromCamera(new T.Vector2(ndc.x, ndc.y), view.camera);
      const far = ray.ray.origin.distanceTo(target) - 0.45;
      const hit = ray.intersectObjects(view.scene.children, true)
        .find((h) => h.object.isMesh && shown(h.object) && (h.object.material.opacity ?? 1) > 0.9 && h.distance < far);
      return hit ? { name: hit.object.geometry.type, at: hit.point.toArray().map((v) => +v.toFixed(2)) } : null;
    };
    const p = character.pos;
    return { head: blocker(p.x, 1.45, p.z), item: blocker(st.x, 0.85, st.z), dist: +Math.hypot(p.x - st.x, p.z - st.z).toFixed(2), special: view.forest.state.special };
  }, st);
  // 3a. 카메라 네 방향: 오늘의 발견 바로 바깥(1.6칸, 줍는 거리 1.3 밖)의 카메라 반대쪽에 서서 잰다
  for (let turn = 0; turn < 4; turn++) {
    if (turn) { await g(() => window.__game.view.rotateCamera(1)); await page.waitForTimeout(500); }
    await g((s) => {
      const f = window.__game.view.basis().forward;
      window.__game.character.teleport(s.x + f.x * 1.6, s.z + f.z * 1.6); window.__game.view.snapFocus(s.x, s.z);
    }, site);
    await page.waitForTimeout(900); // 잎이 비쳐 옅어지기를 기다린다
    const seen = await blockers(site);
    say(`카메라 ${turn * 90}도: 오늘의 발견 곁에서 캐릭터 머리와 발견물을 불투명한 것이 가리지 않는다`,
      !seen.head && !seen.item && seen.special, JSON.stringify(seen));
    await page.screenshot({ path: `${out}-1-turn${turn}.png` });
  }
  await g(() => window.__game.view.rotateCamera(1)); // 처음 방향으로

  // 3b. 오늘의 발견을 누르면 카메라 반대쪽 곁(1.15칸)으로 걸어가 줍는다
  await g(() => { window.__game.character.teleport(-7.5, -3); window.__game.view.snapFocus(-7.5, -3); });
  await page.waitForTimeout(300);
  await groundTap(site.x, site.z);
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 20000 }).catch(() => {});
  const walked = await g((s) => {
    const p = window.__game.character.pos, f = window.__game.view.basis().forward;
    const toast = document.getElementById('toast')?.textContent || '';
    return { dist: +Math.hypot(p.x - s.x, p.z - s.z).toFixed(2), behind: (p.x - s.x) * f.x + (p.z - s.z) * f.z > 0, toast: toast.includes('숲에서 발견'), picked: window.__game.gathering.pickedToday('special') };
  }, site);
  say('오늘의 발견을 누르면 그 뒤에 서서 줍고 알림이 뜬다', walked.dist < 1.6 && walked.behind && walked.toast && walked.picked, JSON.stringify(walked));

  // 4. 처음 줍는 순간: 솟고, 말풍선이 뜨고, 반짝임이 인다. 새로 열고 기록을 비운 뒤 본다.
  // 서 있던 자리가 저장되므로, 발견물 곁에서 새로 열면 열자마자 줍는다. 집 앞으로 옮긴 뒤 새로 연다
  await g(() => { window.__game.character.teleport(12, 12.6); window.__game.view.snapFocus(12, 12.6); localStorage.removeItem('maeul:gathering'); });
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await g((s) => { window.__game.character.teleport(s.x + 3, s.z + 2); window.__game.view.snapFocus(s.x, s.z); }, site);
  await page.waitForTimeout(300);
  await groundTap(site.x, site.z);
  const popped = await page.waitForFunction(() => window.__game.view.forest.state.itemY > 1.4, null, { timeout: 20000 }).then(() => true).catch(() => false);
  const moment = await g(() => ({ ...window.__game.view.forest.state, particles: window.__game.view.feel.particles }));
  say('처음 주우면 발견물이 솟고 말풍선과 반짝임이 난다', popped && moment.bubble && moment.particles > 0 && moment.found === 1,
    JSON.stringify({ itemY: +moment.itemY.toFixed(2), bubble: moment.bubble, particles: moment.particles }));
  await page.screenshot({ path: `${out}-2-found.png` });
  // 주우면 솟음이 끝난 뒤 사라지고, 다시 가도 나지 않는다
  await page.waitForFunction(() => !window.__game.view.forest.state.popping && !window.__game.view.forest.state.bubble, null, { timeout: 20000 }).catch(() => {});
  await g((s) => window.__game.character.goTo(s.x + 3, s.z + 2), site);
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 20000 }).catch(() => {});
  await g((s) => window.__game.character.goTo(s.x + 0.3, s.z + 0.3), site);
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 20000 }).catch(() => {});
  const again = await forestState();
  say('주운 오늘의 발견은 사라지고, 다시 가도 크게 나지 않는다', again.found === 1 && !again.special && !again.popping, JSON.stringify({ found: again.found, special: again.special }));
  // 주운 뒤에는 잎 단서가 멎는다. 새로 열어도 주운 것은 기록에 남아 그대로다 (단서 간격 6.5초보다 길게 본다, 게임 시계 기준)
  await g(() => { window.__game.character.teleport(12, 12.6); window.__game.view.snapFocus(12, 12.6); });
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const waited = await g(() => new Promise((done) => {
    let t = 0, last = performance.now();
    const step = (now) => { t += Math.min(0.05, (now - last) / 1000); last = now; if (t >= 8) done(t); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }));
  const after = await forestState();
  say('주운 뒤에는 새로 열어도 오늘의 발견이 없고 잎 단서가 나지 않는다', after.cues === 0 && !after.special, JSON.stringify({ cues: after.cues, special: after.special, waited: +waited.toFixed(1) }));

  // 5. 줄기 한가운데에서 시작해도 걸어 나간다 (새 숲 나무 (-12,-8))
  await g(() => { window.__game.character.teleport(-12, -8); window.__game.view.snapFocus(-12, -8); });
  await page.waitForTimeout(300);
  const ok = await g(() => window.__game.character.goTo(-9, -8));
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 10000 }).catch(() => {});
  const pos = await g(() => ({ ...window.__game.character.pos }));
  say('줄기 한가운데에서 시작해도 걸어 나간다', Math.hypot(pos.x + 12, pos.z + 8) > 1, JSON.stringify({ ok, pos }));
}
