// 바닷가: 마당 남쪽으로 걸어 나가 모래사장에 서고, 바다에는 들어가지 않으며, 바다에 던져 바다 물고기를 낚는다.
// 실제 터치 흉내로 걷고 던지고 당긴다. 물고기와 입질은 setRandom 으로 정해 둔다. 실제 휴대폰의 손맛을 대신하지는 않는다.
//   TOUCH=1 node tools/shot.mjs / shots/beach 390 844 test/beach.mjs
export default async function beachTour(page, { out, logs }) {
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
  // 화면이 몇 번 새로 그려질 때까지 기다린다 (느린 CI 에서 움직이는 카메라를 멈췄다고 잘못 보지 않게)
  const frames = (n) => g((k) => new Promise((done) => { let i = 0; const step = () => (++i >= k ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
  // 카메라가 멈춘 뒤 땅(또는 물)의 한 점을 누른다
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
  const ready = async () => { await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 }); await page.waitForTimeout(300); };
  const pos = () => g(() => ({ ...window.__game.character.pos }));
  const shore = (x) => g(async (v) => (await import('./src/parts.js')).shoreZ(v), x);
  const hint = () => g(() => document.getElementById('hint').textContent);
  // 낚시 중에는 화면 어디를 눌러도 줄을 당긴다. 손가락이면 두 번째 손가락이 오는지 0.07초 본 뒤 판정이 매듭지어진다
  const pull = async () => {
    const p = await screenOf(14, 33);
    await tap(p.x, p.y);
    await page.waitForFunction(() => !window.__game.fishing.pressPending, null, { timeout: 3000, polling: 'raf' }).catch(() => {});
  };

  await ready();
  const houseBefore = await g(() => JSON.stringify(window.__game.store.state));

  // 1) 마당에서 남쪽 모래사장을 누르면 걸어 나간다
  await g(() => { window.__game.character.teleport(14, 22); window.__game.view.snapFocus(14, 22); });
  await groundTap(14, 28.6);
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 15000, polling: 200 }).catch(() => {});
  let p = await pos();
  say('마당에서 남쪽 모래사장까지 걸어 나간다', p.z > 27.5 && p.z < 30, JSON.stringify(p));
  const surf = await g(() => window.__game.fishing.surf);
  say('바닷가에 서면 파도 소리가 커진다', surf && surf.level > 0.5, JSON.stringify(surf));
  await page.screenshot({ path: `${out}-1-sand.png` });

  // 2) 바다에는 들어가지 않는다 (물속을 목표로 걸어도 물가에서 멈춘다)
  const into = await g(() => window.__game.character.goTo(14.5, 34.5));
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 15000, polling: 200 }).catch(() => {});
  p = await pos();
  const edge = await shore(p.x);
  say('바다 쪽으로 걸어도 물에 들어가지 않고 물가에서 멈춘다', into !== undefined && p.z < edge - 0.2 && p.z > edge - 2, JSON.stringify({ p, edge }));
  await frames(3);
  const nearHint = await hint();
  say('물가에 서면, 처음 온 사람에게는 바닷가에서도 기록이 남는다고 안내한다', nearHint.includes('물을 누르면') && nearHint.includes('낚시 기록에 남습니다'), nearHint);

  // 3) 바다를 누르면 물가로 가서 바다에 던진다. 바다 물고기가 온다
  await g(() => { window.__game.character.teleport(9, 27.5); window.__game.view.snapFocus(9, 27.5); window.__game.fishing.setRandom(() => 0.05); });
  await groundTap(10, 33.2);
  const cast = await page.waitForFunction(() => ['cast', 'wait'].includes(window.__game.fishing.phase), null, { timeout: 20000 }).then(() => true).catch(() => false);
  const castInfo = await g(() => ({ water: window.__game.fishing.water, fish: window.__game.fishing.plan?.fish, pos: { ...window.__game.character.pos } }));
  say('바다를 누르면 물가로 걸어가 바다에 던진다', cast && castInfo.water === 'sea', JSON.stringify(castInfo));
  say('바다에서는 바다 물고기만 온다', ['goby', 'mackerel', 'porgy'].includes(castInfo.fish), castInfo.fish);
  await waitPhase('wait');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}-2-cast.png` });
  const bit = await waitPhase('bite');
  await pull();
  const reeled = await waitPhase('result', 15000);
  const caught = await g(() => ({ last: window.__game.fishing.last, log: window.__game.fishing.store.state.log, card: document.getElementById('catch-name').textContent }));
  say('찌가 잠길 때 누르면 바다 물고기를 낚아 기록한다', bit && reeled && caught.log.goby?.count === 1 && caught.card === '망둥어', JSON.stringify(caught));
  await page.screenshot({ path: `${out}-3-caught.png` });
  await page.waitForFunction(() => window.__game.fishing.phase === 'idle', null, { timeout: 15000, polling: 200 }).catch(() => {});

  // 4) 한 마리라도 잡은 뒤에는 바닷가에서 오늘 바다에서 잘 잡히는 물고기를 알린다
  await frames(3);
  const todayHint = await hint();
  const todaySea = await g(async () => {
    const { FISH, todaysFish, kstDay } = await import('./src/fishing.js');
    const id = todaysFish(kstDay(), 'sea');
    return window.__game.fishing.store.state.log[id] ? `오늘 바다에서는 ${FISH[id].label}` : '오늘 바다에서는 아직 잡아 보지 못한 물고기가 잘 잡힙니다.';
  });
  say('잡아 본 뒤에는 바닷가에서 오늘 바다에서 잘 잡히는 물고기를 알린다', todayHint.includes(todaySea), JSON.stringify({ todayHint, todaySea }));

  // 5) 낚시 기록 창: 바다 물고기와 물 이름, 물마다 남은 수, 물마다 오늘의 물고기
  await page.click('#fish-log');
  const panel = await g(() => ({
    rows: [...document.querySelectorAll('#fish-list li')].map((li) => li.textContent),
    summary: document.getElementById('fish-summary').textContent,
    today: document.getElementById('fish-today').textContent,
  }));
  say('기록 창에 바다 물고기가 바다라는 표시와 함께 나온다', panel.rows.some((r) => r.includes('망둥어') && r.includes('바다 ·')), JSON.stringify(panel.rows));
  say('못 잡은 물고기는 물마다 수만 알린다', panel.summary.includes('연못에 4종') && panel.summary.includes('바다에 2종'), panel.summary);
  say('기록 창에 연못과 바다의 오늘 잘 잡히는 물고기가 모두 나온다', panel.today.startsWith('오늘 잘 잡히는 물고기는 연못에서 ') && panel.today.includes(', 바다에서 ') && panel.today.includes('한국 날짜로 날마다 바뀝니다'), panel.today);
  await page.screenshot({ path: `${out}-4-log.png` });
  await page.click('#fish-close');

  // 6) 파도가 밀려왔다 빠진다 (움직임 줄이기를 켜지 않은 기기)
  const w1 = await g(() => window.__game.view.beach);
  await page.waitForTimeout(700);
  const w2 = await g(() => window.__game.view.beach);
  say('파도가 움직인다', Math.abs(w1.crestZ - w2.crestZ) > 0.05 || Math.abs(w1.foamZ - w2.foamZ) > 0.02, JSON.stringify({ w1, w2 }));

  // 7) 집은 바뀌지 않고, 낚시 기록은 2판으로 저장되며, 바닷가에서 새로 고쳐도 그 자리에서 시작한다
  say('바다 낚시는 집의 상태를 바꾸지 않는다', (await g(() => JSON.stringify(window.__game.store.state))) === houseBefore);
  const saved = await g(() => JSON.parse(localStorage.getItem('house-lab-web:fishing')));
  say('낚시 기록은 2판으로 저장된다', saved.version === 2 && saved.log.goby?.count === 1, JSON.stringify(saved));
  await g(() => { window.__game.character.teleport(20.5, 29); window.__game.saveNow(); });
  await page.reload();
  await ready();
  p = await pos();
  say('바닷가에서 새로 고쳐도 그 자리에서 시작한다', Math.abs(p.x - 20.5) < 0.01 && Math.abs(p.z - 29) < 0.01, JSON.stringify(p));
  say('새로 고쳐도 바다 물고기 기록이 남는다', (await g(() => window.__game.fishing.store.state.log.goby?.count)) === 1);
  say('작은 휴대폰 화면에서 가로 넘침이 없다', await g(() => document.documentElement.scrollWidth <= innerWidth));
  say('새로 고친 뒤 낚시는 쉬는 상태로 시작한다', (await phase()) === 'idle');
}
