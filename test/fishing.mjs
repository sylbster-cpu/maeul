// 연못 낚시: 실제 터치 흉내로 물가까지 걷고, 던지고, 잠길 때 누르고, 기록이 남는지 본다.
// 물고기와 입질은 setRandom 으로 정해 둔다. 실제 휴대폰의 손맛을 대신하지는 않는다.
//   TOUCH=1 node tools/shot.mjs / shots/fishing 390 844 test/fishing.mjs
export default async function fishingTour(page, { out, logs }) {
  const cdp = process.env.TOUCH === '1' ? await page.context().newCDPSession(page) : null;
  const tap = async (x, y) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(x, y);
    await page.waitForTimeout(60);
  };
  const g = (fn, arg) => page.evaluate(fn, arg);
  // 카메라가 땅을 내려다보는 각도(도)
  const elevation = () => g(() => {
    const { view } = window.__game;
    const d = view.camera.getWorldDirection(new view.scene.position.constructor());
    return Math.asin(-d.y) * 180 / Math.PI;
  });
  const say = (name, ok, details = '') => logs.push(`${ok ? '통과' : '실패'}  ${name} ${details}`);
  // 카메라는 캐릭터를 천천히 따라간다. 움직이는 중에 좌표를 구하면 누르는 순간 다른 곳이 된다. 멈출 때까지 기다린다
  const screenOf = (x, z) => g(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
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
  const phase = () => g(() => window.__game.fishing.phase);
  const waitPhase = (name, timeout = 25000) => page.waitForFunction((n) => window.__game.fishing.phase === n, name, { timeout, polling: 'raf' }).then(() => true).catch(() => false);
  const toast = () => g(() => document.getElementById('toast').textContent);
  const fishState = () => g(() => ({ phase: window.__game.fishing.phase, last: window.__game.fishing.last, log: window.__game.fishing.store.state.log, pos: { ...window.__game.character.pos } }));
  const inWater = (p, pad = 0) => ((p.x - 27.5) / (2.6 + pad)) ** 2 + ((p.z - 18) / (3.1 + pad)) ** 2 < 1;
  const ready = async () => { await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 }); await page.waitForTimeout(300); };
  // 줄을 당기는 누름. 화면 어디를 눌러도 되지만, 넓은 화면에서는 조작법 창이 열려 있으므로 연못 위를 누른다
  // 기다리지 않고 바로 누른다. 낚시 중에는 화면 어디를 눌러도 당기므로 카메라가 움직여도 상관없다
  // 손가락이면 두 번째 손가락이 오는지 0.07초 본 뒤 판정이 매듭지어진다. 그것을 기다린다(판정은 누른 때로 한다)
  const pull = async () => {
    const p = await screenOf(27.5, 18.8);
    await tap(p.x, p.y);
    await page.waitForFunction(() => !window.__game.fishing.pressPending, null, { timeout: 3000, polling: 'raf' }).catch(() => {});
  };
  const ambience = () => g(() => window.__game.fishing.ambience);
  // 끌어올리는 데 걸린 게임 시간과 그동안 누르고 있던 시간을 잰다. 시작해 두고 일을 일으킨 뒤 받는다
  const startReelProbe = () => g(() => {
    window.__reelProbe = new Promise((done) => {
      let last = performance.now(), dur = 0, held = 0, seen = false;
      const begin = performance.now();
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const f = window.__game.fishing;
        if (f.phase === 'reel') { seen = true; dur += dt; if (f.reeling?.holding) held += dt; }
        else if (seen) { done({ dur, held, time: null }); return; }
        if (now - begin > 30000) { done({ dur, held, timeout: true }); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
  const reelProbe = () => g(() => window.__reelProbe);
  // r 하나로 물고기·입질·크기가 정해진다. 0.05 송사리(빨리 문다), 0.5 붕어, 0.8 잉어, 0.99 메기.
  // 오늘 잘 잡히는 물고기가 무엇이든(나오는 비율이 1.5배) 같은 물고기가 오는 값으로 골랐다
  const setRandom = (r) => g((v) => window.__game.fishing.setRandom(() => v), r);

  await ready();
  const houseBefore = await g(() => JSON.stringify(window.__game.store.state));

  // 0) 처음 화면에서 빛과 움직임으로 연못을 알린다 (반짝임, 잠자리, 멀리 있을 때 가끔 뛰는 물고기)
  // 잠자리는 무작위로 날아다녀 어느 한순간에는 화면 밖에 있을 수 있다. 그래서 한 번 재지 않고,
  // 반짝임·뛰는 물고기가 있고 잠자리가 한 번이라도 화면에 들어오는 때를 20초까지 기다린다(2026-11-22 흔들림 고침)
  const guided = await page.waitForFunction(() => {
    const fx = window.__game.fishing.fx;
    const on = (p) => { const q = window.__game.view.screenPoint(p.x, p.z); return q.x >= 0 && q.x <= innerWidth && q.y >= 0 && q.y <= innerHeight; };
    const now = { glints: fx.glints.length, fliesOnScreen: fx.dragonflies.filter(on).length, jumps: fx.jumps };
    window.__guide = now;
    return now.glints > 0 && now.jumps > 0 && now.fliesOnScreen >= 1;
  }, null, { timeout: 20000, polling: 100 }).then(() => true).catch(() => false);
  const farAmbience = await ambience();
  const guide = await g(() => window.__guide);
  say('처음 화면에서 반짝임과 잠자리, 뛰는 물고기로 연못을 알린다', guided && guide.fliesOnScreen >= 1, JSON.stringify(guide));

  // 오늘 잘 잡히는 물고기 (한국 날짜로 정해져 모두에게 같다). 아직 잡아 보지 못했으면 이름을 밝히지 않는다
  const todayExpect = () => g(async () => {
    const { FISH, todaysFish, kstDay } = await import('./src/fishing.js');
    const id = todaysFish(kstDay());
    const known = !!window.__game.fishing.store.state.log[id];
    const label = known ? FISH[id].label : '아직 잡아 보지 못한 물고기';
    return { id, label, text: `오늘 연못에서는 ${label}` };
  });
  await g(() => { window.__game.character.teleport(24.5, 18.5); window.__game.view.snapFocus(24.5, 18.5); });
  await frames(2);
  const firstHint = await g(() => document.getElementById('hint').textContent);
  say('처음 온 사람에게는 물가에서 기록이 남는다고 안내한다', firstHint.includes('낚시 기록에 남습니다') && !firstHint.includes('오늘 '), firstHint);

  // 1) 멀리서 물을 누르면 물가로 걸어가 던진다
  await g(() => { window.__game.character.teleport(20.5, 12.5); window.__game.view.snapFocus(20.5, 12.5); });
  await setRandom(0.05);
  await groundTap(26.4, 17.5);
  say('물을 누르면 물가로 걸어간다', (await phase()) === 'walk');
  say('연못으로 걸어가는 동안 연못가로 간다고 안내한다', (await g(() => document.getElementById('hint').textContent)) === '연못가로 걸어가는 중입니다.');
  const cast = await page.waitForFunction(() => ['cast', 'wait'].includes(window.__game.fishing.phase), null, { timeout: 20000 }).then(() => true).catch(() => false);
  let s = await fishState();
  say('물가에 닿으면 찌를 던진다', cast, JSON.stringify(s.pos));
  say('물에 들어가지 않고 물가에 선다', !inWater(s.pos, 0.3) && inWater(s.pos, 1.4), JSON.stringify(s.pos));
  say('던지면 찌가 잠길 때 누르라고 안내한다', await g(() => document.getElementById('hint').textContent.includes('완전히 잠기면')));

  // 2) 찌가 완전히 잠길 때 누르면 낚는다
  const bit = await waitPhase('bite');
  await startReelProbe();
  await pull(); // 누를 시간은 1.3초뿐이다. 화면 찍기는 누른 뒤에 한다
  const closeAtBite = await g(() => window.__game.view.closeAmount);
  say('낚아채면 끌어올리기가 시작된다', (await phase()) === 'reel', await phase());
  // 톡 누르고 뗐으므로 느리게 끌어올린다. 놓치지는 않는다. 카드는 다 끌어올린 뒤에 뜬다
  const reelTap = await reelProbe();
  await waitPhase('result', 10000);
  // 기록은 탭끼리 차례를 지켜(웹 잠금) 조금 뒤에 쓰인다
  await page.waitForFunction(() => window.__game.fishing.store.state.log.medaka?.count === 1, null, { timeout: 3000 }).catch(() => {});
  s = await fishState();
  say('찌가 잠길 때 누르면 낚는다', bit && s.last?.verdict === 'caught' && s.log.medaka?.count === 1, JSON.stringify(s.last));
  const card = await g(() => ({ shown: !document.getElementById('catch-card').hidden, name: document.getElementById('catch-name').textContent, size: document.getElementById('catch-size').textContent, note: document.getElementById('catch-note').textContent }));
  // 느린 CI 에서는 시험이 보낸 손가락 떼기가 늦게 닿아 처음 몇 화면은 누르고 있는 것으로 셀 수 있다(그동안은 제 속도가 맞다)
  say('손을 떼도 놓치지 않고 천천히 끌어올린다', !reelTap.timeout && reelTap.held < 0.35 && reelTap.dur > 1.2, JSON.stringify(reelTap));
  say('다 끌어올리면 낚은 물고기와 크기를 화면 가운데 카드로 알린다', card.shown && card.name === '송사리' && card.size === '3cm' && card.note.includes('처음 잡은'), JSON.stringify(card));
  say('낚시하는 동안 카메라가 물가와 찌를 가까이 본다', closeAtBite > 0.9, String(closeAtBite));
  say('낚을 때 누른 것으로 걷지 않는다', !(await g(() => window.__game.character.walking)));
  const fx2 = await g(() => ({ hushedAt: window.__game.fishing.hushedAt, bite: window.__game.fishing.plan.bite, fx: window.__game.fishing.fx }));
  say('진짜로 물기 직전에 잠잠해진다', fx2.hushedAt !== null && fx2.bite - fx2.hushedAt > 0.3 && fx2.bite - fx2.hushedAt <= 0.4 + 1e-9, JSON.stringify([fx2.hushedAt, fx2.bite]));
  say('낚아챈 순간 멈춤·흰 번쩍·흔들림·물보라가 함께 온다', fx2.fx.catches === 1 && fx2.fx.freeze > 0 && fx2.fx.shake > 0 && fx2.fx.splash > 0, JSON.stringify({ weight: fx2.fx.weight, freeze: fx2.fx.freeze, shake: fx2.fx.shake, splash: fx2.fx.splash }));
  // 손에 떨어진 뒤 퍼덕임이 차츰 줄어드는지 게임 시계(들고 있은 시간)로 본다. 첫 값은 화면을 찍기 전에 잰다
  const flapA = await page.waitForFunction(() => { const f = window.__game.fishing.fx; return f.flapAmp > 0 ? { amp: f.flapAmp, hold: f.holdTime } : null; }, null, { timeout: 10000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
  await page.screenshot({ path: `${out}-3-caught.png` });
  const flapB = flapA && await page.waitForFunction((h) => { const f = window.__game.fishing.fx; return f.holdTime >= h + 0.8 ? { amp: f.flapAmp, hold: f.holdTime } : null; }, flapA.hold, { timeout: 10000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
  say('머리 위 물고기의 퍼덕임이 차츰 줄어든다', !!flapB && flapB.amp < flapA.amp * 0.4, JSON.stringify({ flapA, flapB }));
  await waitPhase('idle', 10000);
  const jumpsNear = await g(() => window.__game.fishing.fx.jumps);
  say('결과를 보인 뒤 카드가 사라지고, 물가에 있는 동안 카메라는 가까이 둔다', (await g(() => document.getElementById('catch-card').hidden)) && (await g(() => window.__game.view.closeAmount)) > 0.9);
  const lowAngle = await elevation();
  say('낚시로 가까이 볼 때는 카메라를 24도로 낮춘다 (원근 없이)', Math.abs(lowAngle - 24) < 1 && (await g(() => window.__game.view.camera.isOrthographicCamera)), `${lowAngle.toFixed(1)}도`);

  // 3) 건드릴 때 누르면 너무 이르다
  await setRandom(0.5); // 붕어: 두 번 건드린 뒤 문다
  await groundTap(26.6, 18.2);
  await waitPhase('wait'); // 물가로 몇 걸음 옮길 수 있다. 던진 뒤에 입질 수를 센다
  await page.waitForFunction(() => window.__game.fishing.nibbled >= 1, null, { timeout: 25000, polling: 'raf' }).catch(() => {});
  await pull();
  s = await fishState();
  const earlyToast = await g(() => ({ text: document.getElementById('toast').textContent, kind: document.getElementById('toast').dataset.kind || '' }));
  say('찌가 흔들릴 때 누르면 이르다는 것을 빨간 오류 없이 알린다', s.last?.verdict === 'early' && earlyToast.text.includes('건드려 보던') && earlyToast.kind !== 'error', JSON.stringify({ last: s.last, earlyToast }));
  say('놓친 것은 기록하지 않는다', !s.log.crucian);
  await waitPhase('idle', 10000);

  // 4) 잠긴 뒤 누르지 않으면 늦는다
  await groundTap(26.6, 18.2);
  // 누르지 않는 판에서 던진 모습과 잠긴 모습을 찍는다. 찍는 데 걸리는 시간이 누를 시간을 잡아먹지 않게 한다
  if (await waitPhase('wait')) await page.screenshot({ path: `${out}-1-cast.png` });
  const waitAmbience = await ambience();
  const hushAmbience = await page.waitForFunction(() => (window.__game.fishing.phase === 'wait' && window.__game.fishing.hushedAt !== null ? window.__game.fishing.ambience : null), null, { timeout: 25000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
  say('연못가에서는 물소리가 들리고, 물기 직전 잠잠할 때는 작아진다(꺼지지는 않는다)', farAmbience?.level === 0 && waitAmbience?.level === 1 && !waitAmbience.ducked && hushAmbience?.ducked === true && hushAmbience.level === 1, JSON.stringify({ farAmbience, waitAmbience, hushAmbience }));
  if (await waitPhase('bite')) await page.screenshot({ path: `${out}-2-bite.png` });
  const late = await page.waitForFunction(() => window.__game.fishing.last?.verdict === 'late' && window.__game.fishing.phase !== 'bite', null, { timeout: 30000 }).then(() => true).catch(() => false);
  say('잠긴 뒤 한참 누르지 않으면 늦었다는 것을 부드럽게 알린다', late && (await toast()).includes('미끼만'), await toast());
  await waitPhase('idle', 10000);

  // 5) 물고기가 오기 전에 누르면 찌를 거둔다. 던지는 동안 누른 것은 흘려보낸다
  await groundTap(26.6, 18.2);
  await waitPhase('cast', 10000);
  await pull(); // 던지는 시간(0.5초) 안에 바로 누른다
  say('던지는 동안 누른 것은 흘려보낸다', ['cast', 'wait'].includes(await phase()) && !(await g(() => window.__game.character.walking)));
  await waitPhase('wait', 10000);
  await pull();
  s = await fishState();
  say('물고기가 오기 전에 누르면 찌를 거둔다', s.last?.verdict === 'reeled' && (await toast()).includes('거두었습니다'), JSON.stringify(s.last));
  await waitPhase('idle', 10000);
  // 두 손가락으로 확대하려고 첫 손가락을 대도 줄을 당기지 않는다 (손가락 흉내에서만)
  if (cdp) {
    await setRandom(0.05);
    await groundTap(26.6, 18.2);
    await waitPhase('bite');
    const p1 = await screenOf(27.0, 18.6), p2 = await screenOf(28.2, 19.6);
    const before = await g(() => window.__game.fishing.last?.verdict);
    // 두 손가락이 거의 함께 닿는다(한 번에 보낸다). 차례로 보내면 느린 CI 에서는 두 번째가 0.07초 뒤에 닿아 시험이 흔들린다
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(p1.x), y: Math.round(p1.y), id: 1 }, { x: Math.round(p2.x), y: Math.round(p2.y), id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(p1.x) - 20, y: Math.round(p1.y) - 20, id: 1 }, { x: Math.round(p2.x) + 20, y: Math.round(p2.y) + 20, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const after = await g(() => ({ verdict: window.__game.fishing.last?.verdict, phase: window.__game.fishing.phase, medaka: window.__game.fishing.store.state.log.medaka?.count }));
    say('두 손가락으로 확대하려 해도 줄을 당기지 않는다', after.verdict === before && after.phase === 'bite' && after.medaka === 1, JSON.stringify({ before, after }));
    await page.waitForFunction(() => window.__game.fishing.last?.verdict === 'late', null, { timeout: 15000 }).catch(() => {});
    await waitPhase('idle', 10000);
  }
  // 가까이서 뛰는 물고기는 던질 곳을 고르는 단서처럼 보일 수 있으므로 연못가에서는 뛰지 않는다
  say('연못가에서 낚시하는 동안에는 물고기가 뛰지 않는다', (await g(() => window.__game.fishing.fx.jumps)) === jumpsNear);

  // 6) 다른 탭이 남긴 기록을 지우지 않는다. 처음 잡은 날은 한국 날짜다
  await g(() => {
    const data = JSON.parse(localStorage.getItem('house-lab-web:fishing') || '{"format":"fishing-log","version":1,"log":{}}');
    data.log.catfish = { best: 60, first: '2026-11-01', count: 3 };
    localStorage.setItem('house-lab-web:fishing', JSON.stringify(data));
  });
  await setRandom(0.8); // 잉어
  // 기록을 쓸 때 웹 잠금을 거치는지 센다 (탭끼리 차례를 지켜 읽고 쓰게 하는 장치)
  const lockable = await g(() => {
    if (!navigator.locks?.request) return false;
    const orig = navigator.locks.request.bind(navigator.locks);
    window.__locks = [];
    navigator.locks.request = (name, ...rest) => { window.__locks.push(name); return orig(name, ...rest); };
    return true;
  });
  await groundTap(26.6, 18.2);
  await waitPhase('bite');
  await pull();
  await page.waitForFunction(() => window.__game.fishing.store.state.log.carp?.count === 1, null, { timeout: 3000 }).catch(() => {});
  await waitPhase('result', 15000); // 끌어올리기가 끝나면 카드가 뜬다
  const locks = await g(() => window.__locks || []);
  say('낚시 기록은 탭끼리 차례를 지켜(웹 잠금) 읽고 쓴다', lockable && locks.includes('house-lab-web:fishing'), JSON.stringify({ lockable, locks }));
  s = await fishState();
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  say('다른 탭에서 남긴 기록과 함께 저장한다', s.log.carp?.count === 1 && s.log.catfish?.count === 3 && s.log.medaka?.count === 1, JSON.stringify(s.log));
  say('처음 잡은 날은 한국 날짜다', s.log.carp?.first === kst, s.log.carp?.first);
  const fx6 = await g(() => window.__game.fishing.fx);
  say('큰 물고기일수록 멈춤·흔들림·물보라·나는 시간이 크다', fx6.weight > fx2.fx.weight + 0.3 && fx6.freeze > fx2.fx.freeze && fx6.shake > fx2.fx.shake && fx6.splash > fx2.fx.splash && fx6.leapTime > fx2.fx.leapTime, JSON.stringify({ medaka: fx2.fx.weight, carp: fx6.weight }));
  // 게임 시계로 0.6초를 기다린다. 화면 수가 적은 환경에서는 게임 시계가 실제 시간보다 느리다
  await page.waitForFunction(() => window.__game.fishing.phase === 'result' && window.__game.fishing.elapsed >= 0.6, null, { timeout: 10000, polling: 'raf' }).catch(() => {});
  await pull();
  say('낚은 카드를 보는 중에 누르면 바로 넘어간다', (await phase()) === 'idle' && (await g(() => document.getElementById('catch-card').hidden)));
  await waitPhase('idle', 10000);

  // 7) 낚시 기록 창
  await page.click('#fish-log');
  const panel = await g(() => ({ open: !document.getElementById('fish-layer').hidden, rows: [...document.querySelectorAll('#fish-list li strong')].map((e) => e.textContent), text: document.getElementById('log-fish').innerText }));
  say('낚시 기록 창에 잡은 물고기만 보인다', panel.open && panel.rows.join() === '송사리,잉어,메기', JSON.stringify(panel));
  say('못 잡은 물고기가 몇 종인지는 알리지 않는다 (2026-11-26 사용자 결정)', !/종 더|모두 잡아/.test(panel.text), panel.text);
  const today = await todayExpect();
  const todayLine = await g(() => document.getElementById('fish-today').textContent);
  say('기록 창에 오늘 잘 잡히는 물고기가 나온다', todayLine.startsWith(`오늘 잘 잡히는 물고기는 연못에서 ${today.label}, 바다에서 `) && todayLine.includes('한국 날짜로 날마다 바뀝니다'), JSON.stringify({ todayLine, today }));
  await page.screenshot({ path: `${out}-4-log.png` });
  await page.click('#fish-close');
  say('기록 창을 닫는다', await g(() => document.getElementById('fish-layer').hidden));

  // 8) 걷기를 바꾸거나 땅을 누르면 그만둔다. 이 던지기로 오늘 잘 잡히는 물고기가 더 자주 오는지도 본다:
  // 평소라면 다른 물고기가 오는 r 가운데, 오늘 잘 잡히는 물고기라서 그 물고기가 오는 값을 골라 던진다
  const favor = await g(async () => {
    const { rollFish, todaysFish, kstDay } = await import('./src/fishing.js');
    const id = todaysFish(kstDay());
    const rs = [];
    for (let i = 0; i < 1000; i++) { const r = (i + 0.5) / 1000; if (rollFish(() => r, id) === id && rollFish(() => r) !== id) rs.push(r); }
    const r = rs[Math.floor(rs.length / 2)];
    window.__game.fishing.setRandom(() => r);
    return { id, r, normally: rollFish(() => r) };
  });
  await groundTap(26.6, 18.2);
  await waitPhase('wait', 10000);
  const castFish = await g(() => window.__game.fishing.plan?.fish);
  say('오늘 잘 잡히는 물고기는 평소보다 조금 더 자주 온다', castFish === favor.id && favor.normally !== favor.id, JSON.stringify({ ...favor, castFish }));
  await page.click('#mode-build');
  say('꾸미기로 바꾸면 낚시를 그만둔다', (await phase()) === 'idle');
  await page.click('#mode-walk');
  await groundTap(22, 17);
  say('물가에서 땅을 누르면 걸어간다', (await phase()) === 'idle' && (await g(() => window.__game.character.walking)));
  const zoomBack = await page.waitForFunction(() => window.__game.view.closeAmount < 0.05, null, { timeout: 10000 }).then(() => true).catch(() => false);
  say('물가를 떠나면 카메라가 평소대로 돌아온다', zoomBack);
  await page.waitForTimeout(300);
  const backAngle = await elevation();
  say('물가를 떠나면 카메라 각도도 36도로 돌아온다', Math.abs(backAngle - 36) < 1, `${backAngle.toFixed(1)}도`);

  // 9) 집 저장과 섞이지 않고, 새로 고쳐도 기록과 물가의 자리가 남는다
  const houseAfter = await g(() => JSON.stringify(window.__game.store.state));
  say('낚시는 집의 상태를 바꾸지 않는다', houseAfter === houseBefore);
  await g(() => { window.__game.character.teleport(24.5, 18.5); window.__game.saveNow(); });
  const saved = await g(() => localStorage.getItem('house-lab-web:save'));
  say('집 저장에 낚시 기록이 들어가지 않는다', !saved.includes('fishing') && !saved.includes('medaka'));
  await page.reload();
  await ready();
  const houseReloaded = await g(() => JSON.stringify(window.__game.store.state));
  s = await fishState();
  say('새로 고쳐도 낚시 기록이 남는다', s.log.medaka?.count === 1 && s.log.carp?.count === 1, JSON.stringify(s.log));
  say('연못가에서 새로 고쳐도 그 자리에서 시작한다', Math.abs(s.pos.x - 24.5) < 0.01 && Math.abs(s.pos.z - 18.5) < 0.01, JSON.stringify(s.pos));
  const nearHint = await g(() => document.getElementById('hint').textContent);
  say('연못가에 서면 낚시 안내가 나온다', nearHint.includes('물을 누르면'));
  const todayAfter = await todayExpect();
  say('물고기를 잡아 본 뒤에는 물가에서 오늘 잘 잡히는 물고기를 알린다', nearHint.includes(todayAfter.text), JSON.stringify({ nearHint, todayAfter }));

  // 10) 읽을 수 없는 낚시 기록: 원본을 옆에 남기고 새로 시작한다. 집은 그대로 열린다
  await g(() => localStorage.setItem('house-lab-web:fishing', '{broken'));
  await page.reload();
  await ready();
  const broken = await g(() => ({ toast: document.getElementById('toast').textContent, kept: localStorage.getItem('house-lab-web:fishing:broken'), log: window.__game.fishing.store.state.log, house: JSON.stringify(window.__game.store.state) }));
  say('읽을 수 없는 낚시 기록은 옆에 남기고 알린다', broken.kept === '{broken' && broken.toast.includes('낚시 기록') && Object.keys(broken.log).length === 0, broken.toast);
  say('그래도 집은 그대로 열린다', broken.house === houseReloaded);
  await page.screenshot({ path: `${out}-5-pond.png` });

  // 11) 누르고 버티기: 낚아챈 뒤 손가락을 대고 있으면 빨리 끌어올린다 (손가락 흉내에서만)
  if (cdp) {
    await setRandom(0.05);
    await groundTap(26.6, 18.2);
    await waitPhase('bite');
    await startReelProbe();
    const at = await screenOf(27.5, 18.8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(at.x), y: Math.round(at.y), id: 1 }] });
    await waitPhase('reel', 3000);
    const holdHint = await g(() => document.getElementById('hint').textContent);
    const reelHold = await reelProbe();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    say('누르고 있으면 버티는 동안 빨리 끌어올린다', !reelHold.timeout && reelHold.held >= reelHold.dur * 0.8 && reelHold.dur < reelTap.dur * 0.6 && holdHint.includes('누르고 있으면'), JSON.stringify({ reelHold, reelTap, holdHint }));
    await waitPhase('idle', 10000);
  }
}
