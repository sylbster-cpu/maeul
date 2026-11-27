// 연출 확인: 집 꾸미기·마을·낚시에 넣은 몸짓과 손맛 (docs/GAME_PRINCIPLES.md). 그리는 모습만 보고 규칙은 보지 않는다.
// 시간은 게임 시계(화면 수)로 기다린다. 실제 휴대폰의 느낌을 대신하지는 않는다.
//   TOUCH=1 node tools/shot.mjs / shots/feel 390 844 test/feel.mjs
import { menuClick, menuVisible } from './helpers/menu.mjs';
export default async function feel(page, { out, logs }) {
  const cdp = process.env.TOUCH === '1' ? await page.context().newCDPSession(page) : null;
  const tap = async (x, y) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(x, y);
    await page.waitForTimeout(60);
  };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const say = (name, ok, details = '') => logs.push(`${ok ? '통과' : '실패'}  ${name} ${details}`);
  const screenOf = (x, z) => g(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
  // 카메라가 멈춘 뒤에 누른다
  // 화면이 몇 번 새로 그려질 때까지 기다린다. 느린 CI 에서는 0.1초 안에 한 번도 그려지지 않아, 움직이는 카메라를 멈췄다고 잘못 볼 수 있다
  const frames = (n) => g((k) => new Promise((done) => { let i = 0; const step = () => (++i >= k ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
  const groundTap = async (x, z) => {
    let p = await screenOf(x, z);
    for (let i = 0; i < 40; i++) {
      await frames(4);
      const q = await screenOf(x, z);
      const still = Math.hypot(q.x - p.x, q.y - p.y) < 0.5;
      p = q;
      if (still) break;
    }
    await tap(p.x, p.y);
  };
  const feelNow = () => g(() => window.__game.view.feel);
  const until = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
  // 화면마다 값을 재어 가장 작은 값과 가장 큰 값을 모은다 (게임 시계로 seconds 초 동안)
  const sample = (expr, seconds) => g(([code, secs]) => new Promise((done) => {
    const read = new Function(`return (${code})`);
    let min = Infinity, max = -Infinity, last = performance.now(), passed = 0;
    const step = (now) => {
      passed += Math.min(0.05, (now - last) / 1000); last = now;
      const v = read();
      if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
      if (passed >= secs) done({ min, max }); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), [expr, seconds]);
  // 재기 시작해 두고 일을 일으킨 뒤 결과를 받는다 (짧은 동작의 처음을 놓치지 않게)
  const startSample = (expr, seconds) => g(([code, secs]) => {
    const read = new Function(`return (${code})`);
    window.__sample = new Promise((done) => {
      let min = Infinity, max = -Infinity, last = performance.now(), passed = 0;
      const step = (now) => {
        passed += Math.min(0.05, (now - last) / 1000); last = now;
        const v = read();
        if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
        if (passed >= secs) done({ min, max }); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, [expr, seconds]);
  const endSample = () => g(() => window.__sample);
  const ready = async () => { await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 }); await page.waitForTimeout(300); };

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready();
  // 진동을 받아 적는다 (안드로이드 쪽: navigator.vibrate)
  const catchVibration = () => g(() => { window.__vib = []; Object.defineProperty(navigator, 'vibrate', { value: (p) => { window.__vib.push(p); return true; }, configurable: true }); });
  const vibs = () => g(() => window.__vib.slice());
  await catchVibration();

  // 1) 마을: 서 있으면 숨을 쉰다
  const breath = await sample('window.__game.character.figure.userData.body.scale.y', 2.2);
  say('서 있으면 숨을 쉰다(몸이 조금 부풀었다 줄어든다)', breath.max > 1.015 && breath.min < 0.99, JSON.stringify(breath));

  // 2) 걸을 때는 가는 쪽으로 기울고, 멈추면 쏠렸다가 바로 선다
  await g(() => { window.__game.character.teleport(6, 16); window.__game.view.snapFocus(6, 16); });
  await groundTap(10, 18);
  const walking = await sample('window.__game.character.walking ? window.__game.character.figure.rotation.x : NaN', 0.3);
  say('걸을 때 가는 쪽으로 기운다', walking.max > 0.06, JSON.stringify(walking));
  await until(() => !window.__game.character.walking);
  const settle = await sample('window.__game.character.figure.rotation.x', 0.9);
  const leanAfter = await g(() => window.__game.character.figure.rotation.x);
  say('멈추면 쏠렸다가 곧 바로 선다', settle.min < -0.005 && Math.abs(leanAfter) < 0.01, JSON.stringify({ settle, leanAfter }));

  // 3) 나무 곁을 지나가면 흔들리고 잎이 떨어진다 (나무는 걸을 수 있는 둘레 바깥에 있다)
  // 바닷가(2026-11-22)를 만들며 나무 (31, 27)을 옮겼다. 서쪽 나무 (-6.5, 23.5)에서 4.0 떨어진, 걸을 수 있는 자리
  await g(() => { window.__game.character.teleport(-2.6, 24.5); });
  const rustle = await until(() => { const f = window.__game.view.feel; return f.rustling > 0 ? f : null; }, null, 8000);
  say('나무 곁을 지나가면 나무가 흔들리고 잎이 떨어진다', !!rustle && rustle.particles > 0, JSON.stringify(rustle && { rustling: rustle.rustling, particles: rustle.particles }));

  // 4) 문: 다가가면 열리며 조금 지나쳤다 멎는다
  await startSample('window.__game.view.feel.door', 1.5);
  await g(() => { const c = window.__game.character; c.teleport(12, 9.5); window.__game.view.snapFocus(12, 9.5); });
  const swing = await endSample();
  say('문 앞에 서면 문이 열리며 조금 지나쳤다 멎는다', swing.min < -1.52, JSON.stringify(swing));
  await g(() => { const c = window.__game.character; c.teleport(6, 16); window.__game.view.snapFocus(6, 16); });

  // 5) 집 꾸미기(마당): 놓으면 떨어져 내려앉으며 먼지가 일고, 다 앉으면 제자리 모양으로 돌아온다
  await page.click('#mode-build');
  await g(() => window.__game.input.setTool('stool'));
  await page.waitForTimeout(300);
  await groundTap(6.5, 18.5);
  const placed = await g(() => Object.values(window.__game.store.state.spaces.yard.objects).find((o) => o.part === 'stool' && o.x === 6 && o.y === 18)?.id ?? null);
  const pop = placed && await until((id) => window.__game.view.feel.pops.find((p) => p.id === id) || null, placed, 3000);
  say('가구를 놓으면 떨어져 내려앉는다', !!pop && pop.kind === 'place', JSON.stringify(pop));
  const landed = placed && await until((id) => { const f = window.__game.view.feel; const p = f.pops.find((q) => q.id === id); return p?.landed ? f : null; }, placed, 3000);
  say('내려앉는 순간 먼지가 인다', !!landed && landed.particles > 0, JSON.stringify(landed && { particles: landed.particles }));
  const rest = placed && await until((id) => (window.__game.view.feel.pops.some((p) => p.id === id) ? null : true), placed, 5000);
  // 제자리로 돌아왔으면 그 칸을 눌러 그 가구가 집힌다
  const restAt = await screenOf(6.5, 18.5);
  const restHit = placed && await g(([x, y]) => window.__game.view.pick(x, y)?.id ?? null, [restAt.x, restAt.y]);
  say('연출이 끝나면 제자리로 돌아와 그 자리에서 집힌다', !!rest && restHit === placed, JSON.stringify({ placed, restHit }));
  const placeVib = await vibs();
  say('가구를 놓으면 짧게 진동한다(안드로이드)', placeVib.some((v) => typeof v === 'number' && v >= 8 && v <= 20), JSON.stringify(placeVib));

  // 6) 돌리면 조금 지나쳤다 돌아온다
  await g(() => window.__game.input.rotate());
  const twist = await until((id) => window.__game.view.feel.pops.find((p) => p.id === id && p.kind === 'rotate') || null, placed, 3000);
  say('돌리면 돌린 쪽으로 조금 지나쳤다 돌아온다', !!twist, JSON.stringify(twist));

  // 7) 놓을 수 없는 자리: 미리보기가 고개를 젓듯 흔들린다
  await until((id) => (window.__game.view.feel.pops.some((p) => p.id === id) ? null : true), placed, 5000);
  await groundTap(6.5, 18.5);
  const nopes = (await feelNow()).nopes;
  say('놓을 수 없는 자리에서는 미리보기가 좌우로 흔들린다', nopes >= 1, await g(() => document.getElementById('toast').textContent));
  const nopeVib = await vibs();
  say('놓을 수 없는 자리에서는 짧게 두 번 진동한다', nopeVib.some((v) => JSON.stringify(v) === '[10,50,10]'), JSON.stringify(nopeVib.slice(-2)));

  // 8) 치우면 살짝 부풀었다 오므라들며 사라진다
  await g(() => window.__game.input.setTool('erase'));
  await page.waitForTimeout(200);
  await groundTap(6.5, 18.5);
  const gone = await g((id) => !window.__game.store.state.spaces.yard.objects[id], placed);
  const vanishedCount = (await feelNow()).vanished;
  const vanished = await until(() => (window.__game.view.feel.vanishing === 0 ? true : null), null, 5000);
  say('치우면 오므라들며 사라진다', gone && vanishedCount === 1 && !!vanished, JSON.stringify({ gone, vanishedCount }));
  await page.screenshot({ path: `${out}-1-build.png` });

  // 9) 집 키우기: 드문 큰일이라 크게 (늘어났다 내려앉기, 먼지, 반짝임)
  await g(() => window.__game.input.upgrade());
  const bump = await until(() => { const f = window.__game.view.feel; return f.houseBump ? f : null; }, null, 3000);
  say('집을 키우면 집이 늘어났다 내려앉고 먼지와 반짝임이 인다', !!bump && bump.particles > 6, JSON.stringify(bump && { particles: bump.particles }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}-2-upgrade.png` });
  const upVib = await vibs();
  say('집을 키우면 여러 번 이어 진동한다', upVib.some((v) => Array.isArray(v) && v.length === 5), JSON.stringify(upVib.slice(-1)));
  // 소리를 끄면 진동도 꺼진다
  await menuClick(page, '#sound');
  await g(() => { window.__vib.length = 0; window.__game.input.undo(); });
  const mutedVib = await vibs();
  await menuClick(page, '#sound');
  say('소리 버튼으로 소리를 끄면 진동도 하지 않는다', mutedVib.length === 0 && (await g(() => window.__game.haptics.enabled)), JSON.stringify(mutedVib));

  // 10) 앉으면 몸과 방석이 눌린다
  await g(() => window.__game.input.setTool('stool'));
  await page.waitForTimeout(200);
  await groundTap(8.5, 18.5);
  const seatId = await g(() => Object.values(window.__game.store.state.spaces.yard.objects).find((o) => o.part === 'stool' && o.x === 8 && o.y === 18)?.id ?? null);
  await page.click('#mode-walk');
  await until((id) => (window.__game.view.feel.pops.some((p) => p.id === id) ? null : true), seatId, 5000);
  await groundTap(8.5, 18.5);
  const seated = await until(() => (window.__game.character.sitAmount === 1 ? true : null), null, 15000);
  const cushion = seated && await until((id) => window.__game.view.feel.pops.find((p) => p.id === id && p.kind === 'bump') || null, seatId, 3000);
  say('앉는 순간 방석이 눌린다', !!seated && !!cushion, JSON.stringify(cushion));

  // 11) 낚시: 던지기 전에 뒤로 젖혔다가(예비동작) 휙 던진다
  await g(() => { window.__game.character.teleport(24.4, 18); window.__game.view.snapFocus(24.4, 18); window.__game.fishing.setRandom(() => 0.5); });
  await page.waitForTimeout(300);
  await startSample("window.__game.fishing.phase === 'cast' ? window.__game.character.figure.rotation.x : NaN", 4);
  await groundTap(26.2, 18);
  const windUp = await endSample();
  say('던지기 전에 몸을 뒤로 젖혔다가 앞으로 내던진다', windUp.min < -0.06 && windUp.max > 0.04, JSON.stringify(windUp));
  await g(() => window.__game.input.setMode('build'));
  await g(() => window.__game.input.setMode('walk'));

  // 12) 방 안의 벽걸이: 못에 건 듯 흔들리다 멎는다 (벽걸이에는 바닥 칸이 없다)
  await page.click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'main', null, { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.click('#mode-build');
  await g(() => window.__game.input.setTool('frame_small'));
  await page.waitForTimeout(300);
  const wallSpot = await g(() => {
    const { view } = window.__game;
    const v = new view.scene.position.constructor(0, 2, 2.5).project(view.camera);
    const r = document.getElementById('scene').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  });
  const framesBefore = await g(() => Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'frame_small').length);
  await tap(wallSpot.x, wallSpot.y);
  const frame = await until((n) => { const list = Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'frame_small'); return list.length > n ? list[list.length - 1].id : null; }, framesBefore, 3000);
  const frameSwing = frame && await until((id) => window.__game.view.feel.pops.find((p) => p.id === id) || null, frame, 3000);
  await page.waitForTimeout(600);
  say('벽걸이는 걸리면 흔들리다 멎고, 화면 오류가 없다', !!frameSwing && errors.length === 0, JSON.stringify({ frame, frameSwing, errors }));
  await page.click('#mode-walk');
  await page.click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'yard', null, { timeout: 10000 });
  await g(() => window.__game.saveNow());

  // 13) 아이폰 쪽 진동: 표준 진동이 없으면 스위치의 진동을 빌리고, 손가락을 뗄 때 울린다
  if (cdp) {
    // (이 브라우저에서는 실제로 떨리지 않는다. 스위치가 바뀌는 때가 뗄 때인지만 본다)
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true });
      Object.defineProperty(HTMLInputElement.prototype, 'switch', { value: false, writable: true, configurable: true });
    });
    await page.reload();
    await ready();
    const kind = await g(() => window.__game.haptics.kind);
    await g(() => { window.__ticks = 0; window.__game.haptics.switchInput.addEventListener('click', () => { window.__ticks++; }); });
    const ticks = () => g(() => window.__ticks);
    await g(() => { window.__game.character.teleport(6, 16); window.__game.view.snapFocus(6, 16); });
    await page.click('#mode-build');
    await g(() => window.__game.input.setTool('stool'));
    await page.waitForTimeout(200);
    await groundTap(12.5, 18.5);
    const placeTicks = await ticks();
    await page.click('#mode-walk');
    await g(() => { window.__game.character.teleport(24.4, 18); window.__game.view.snapFocus(24.4, 18); window.__game.fishing.setRandom(() => 0.05); });
    await page.waitForTimeout(300);
    await groundTap(26.2, 18);
    await until(() => (window.__game.fishing.phase === 'bite' ? true : null), null, 25000);
    await page.waitForTimeout(250); // 찌가 잠길 때의 진동(두 번, 0.09초 간격)이 끝난 뒤에 센다
    const atDown = { before: await ticks() };
    const pullAt = await screenOf(27.5, 18.8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(pullAt.x), y: Math.round(pullAt.y), id: 1 }] });
    // 판정은 두 번째 손가락이 오는지 0.07초 본 뒤 매듭지어진다. 손가락을 댄 채로 그때까지 기다린다
    atDown.verdict = await page.waitForFunction(() => (window.__game.fishing.pressPending ? null : window.__game.fishing.last?.verdict || 'none'), null, { timeout: 3000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
    atDown.down = await ticks();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    atDown.up = await ticks();
    say('아이폰에서는 스위치 진동을 빌리고, 가구를 놓는 탭에 울린다', kind === 'switch' && placeTicks >= 1, JSON.stringify({ kind, placeTicks }));
    say('아이폰에서 낚아챈 진동은 손가락을 뗄 때 울린다', atDown.verdict === 'caught' && atDown.down === atDown.before && atDown.up > atDown.before, JSON.stringify(atDown));
    await g(() => window.__game.input.setMode('build'));
    await g(() => window.__game.input.setMode('walk'));
  } else say('아이폰 쪽 진동은 터치 흉내(TOUCH=1)에서만 본다', true);

  // 14) 움직임 줄이기를 켠 기기에서는 이런 움직임을 하지 않는다
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await ready();
  await g(() => { window.__game.character.teleport(6, 16); window.__game.view.snapFocus(6, 16); });
  await page.click('#mode-build');
  await g(() => window.__game.input.setTool('stool'));
  await page.waitForTimeout(200);
  await groundTap(10.5, 18.5);
  const calmPlaced = await g(() => Object.values(window.__game.store.state.spaces.yard.objects).some((o) => o.part === 'stool' && o.x === 10 && o.y === 18));
  const calmFeel = await feelNow();
  const calmBreath = await sample('window.__game.character.figure.userData.body.scale.y', 1);
  say('지나는 동안 화면 오류가 나지 않았다', errors.length === 0, JSON.stringify(errors));
  say('움직임 줄이기를 켜면 떨어짐·먼지·숨쉬기를 하지 않는다', calmPlaced && calmFeel.pops.length === 0 && calmFeel.particles === 0 && calmBreath.max === 1 && calmBreath.min === 1, JSON.stringify({ calmPlaced, pops: calmFeel.pops.length, particles: calmFeel.particles, calmBreath }));
}
