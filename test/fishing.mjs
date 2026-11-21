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
  const say = (name, ok, details = '') => logs.push(`${ok ? '통과' : '실패'}  ${name} ${details}`);
  const groundTap = async (x, z) => { const p = await g(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]); await tap(p.x, p.y); };
  const phase = () => g(() => window.__game.fishing.phase);
  const waitPhase = (name, timeout = 25000) => page.waitForFunction((n) => window.__game.fishing.phase === n, name, { timeout, polling: 'raf' }).then(() => true).catch(() => false);
  const toast = () => g(() => document.getElementById('toast').textContent);
  const fishState = () => g(() => ({ phase: window.__game.fishing.phase, last: window.__game.fishing.last, log: window.__game.fishing.store.state.log, pos: { ...window.__game.character.pos } }));
  const inWater = (p, pad = 0) => ((p.x - 27.5) / (2.6 + pad)) ** 2 + ((p.z - 18) / (3.1 + pad)) ** 2 < 1;
  const ready = async () => { await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 }); await page.waitForTimeout(300); };
  // 줄을 당기는 누름. 화면 어디를 눌러도 되지만, 넓은 화면에서는 조작법 창이 열려 있으므로 연못 위를 누른다
  const pull = () => groundTap(27.5, 18.8);
  // r 하나로 물고기·입질·크기가 정해진다. 0.05 송사리(빨리 문다), 0.5 붕어, 0.75 잉어, 0.99 메기
  const setRandom = (r) => g((v) => window.__game.fishing.setRandom(() => v), r);

  await ready();
  const houseBefore = await g(() => JSON.stringify(window.__game.store.state));

  // 1) 멀리서 물을 누르면 물가로 걸어가 던진다
  await g(() => { window.__game.character.teleport(20.5, 12.5); window.__game.view.snapFocus(23, 16); });
  await page.waitForTimeout(250);
  await setRandom(0.05);
  await groundTap(26.4, 17.5);
  say('물을 누르면 물가로 걸어간다', (await phase()) === 'walk');
  const cast = await page.waitForFunction(() => ['cast', 'wait'].includes(window.__game.fishing.phase), null, { timeout: 20000 }).then(() => true).catch(() => false);
  let s = await fishState();
  say('물가에 닿으면 찌를 던진다', cast, JSON.stringify(s.pos));
  say('물에 들어가지 않고 물가에 선다', !inWater(s.pos, 0.3) && inWater(s.pos, 1.4), JSON.stringify(s.pos));
  say('낚싯대와 찌가 보인다', await g(() => window.__game.fishing && document.getElementById('hint').textContent.includes('잠기면')));
  await page.screenshot({ path: `${out}-1-cast.png` });

  // 2) 찌가 완전히 잠길 때 누르면 낚는다
  const bit = await waitPhase('bite');
  await page.screenshot({ path: `${out}-2-bite.png` });
  await pull();
  s = await fishState();
  say('찌가 잠길 때 누르면 낚는다', bit && s.last?.verdict === 'caught' && s.log.medaka?.count === 1, JSON.stringify(s.last));
  say('낚은 물고기와 크기를 알린다', (await toast()).includes('송사리를 낚았습니다') && (await toast()).includes('처음 잡은'), await toast());
  say('낚을 때 누른 것으로 걷지 않는다', !(await g(() => window.__game.character.walking)));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}-3-caught.png` });
  await waitPhase('idle', 10000);

  // 3) 건드릴 때 누르면 너무 이르다
  await setRandom(0.5); // 붕어: 두 번 건드린 뒤 문다
  await groundTap(26.6, 18.2);
  await waitPhase('wait'); // 물가로 몇 걸음 옮길 수 있다. 던진 뒤에 입질 수를 센다
  await page.waitForFunction(() => window.__game.fishing.nibbled >= 1, null, { timeout: 25000, polling: 'raf' }).catch(() => {});
  await pull();
  s = await fishState();
  say('찌가 흔들릴 때 누르면 너무 이르다고 알린다', s.last?.verdict === 'early' && (await toast()).includes('너무 일찍'), JSON.stringify(s.last));
  say('놓친 것은 기록하지 않는다', !s.log.crucian);
  await waitPhase('idle', 10000);

  // 4) 잠긴 뒤 누르지 않으면 늦는다
  await groundTap(26.6, 18.2);
  const late = await page.waitForFunction(() => window.__game.fishing.last?.verdict === 'late' && window.__game.fishing.phase !== 'bite', null, { timeout: 30000 }).then(() => true).catch(() => false);
  say('잠긴 뒤 한참 누르지 않으면 늦었다고 알린다', late && (await toast()).includes('늦었습니다'), await toast());
  await waitPhase('idle', 10000);

  // 5) 물고기가 오기 전에 누르면 찌를 거둔다. 던지는 동안 누른 것은 흘려보낸다
  await groundTap(26.6, 18.2);
  await waitPhase('cast', 10000);
  await pull();
  say('던지는 동안 누른 것은 흘려보낸다', ['cast', 'wait'].includes(await phase()) && !(await g(() => window.__game.character.walking)));
  await waitPhase('wait', 10000);
  await pull();
  s = await fishState();
  say('물고기가 오기 전에 누르면 찌를 거둔다', s.last?.verdict === 'reeled' && (await toast()).includes('거두었습니다'), JSON.stringify(s.last));
  await waitPhase('idle', 10000);

  // 6) 다른 탭이 남긴 기록을 지우지 않는다. 처음 잡은 날은 한국 날짜다
  await g(() => {
    const data = JSON.parse(localStorage.getItem('house-lab-web:fishing') || '{"format":"fishing-log","version":1,"log":{}}');
    data.log.catfish = { best: 60, first: '2026-11-01', count: 3 };
    localStorage.setItem('house-lab-web:fishing', JSON.stringify(data));
  });
  await setRandom(0.75); // 잉어
  await groundTap(26.6, 18.2);
  await waitPhase('bite');
  await pull();
  s = await fishState();
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  say('다른 탭에서 남긴 기록과 함께 저장한다', s.log.carp?.count === 1 && s.log.catfish?.count === 3 && s.log.medaka?.count === 1, JSON.stringify(s.log));
  say('처음 잡은 날은 한국 날짜다', s.log.carp?.first === kst, s.log.carp?.first);
  await waitPhase('idle', 10000);

  // 7) 낚시 기록 창
  await page.click('#fish-log');
  const panel = await g(() => ({ open: !document.getElementById('fish-layer').hidden, rows: [...document.querySelectorAll('#fish-list li strong')].map((e) => e.textContent), summary: document.getElementById('fish-summary').textContent }));
  say('낚시 기록 창에 잡은 물고기만 보인다', panel.open && panel.rows.join() === '송사리,잉어,메기', JSON.stringify(panel));
  say('못 잡은 물고기는 수만 알린다', panel.summary.includes('1종'), panel.summary);
  await page.screenshot({ path: `${out}-4-log.png` });
  await page.click('#fish-close');
  say('기록 창을 닫는다', await g(() => document.getElementById('fish-layer').hidden));

  // 8) 걷기를 바꾸거나 땅을 누르면 그만둔다
  await groundTap(26.6, 18.2);
  await waitPhase('wait', 10000);
  await page.click('#mode-build');
  say('꾸미기로 바꾸면 낚시를 그만둔다', (await phase()) === 'idle');
  await page.click('#mode-walk');
  await groundTap(22, 17);
  say('물가에서 땅을 누르면 걸어간다', (await phase()) === 'idle' && (await g(() => window.__game.character.walking)));
  await page.waitForTimeout(800);

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
  say('연못가에 서면 낚시 안내가 나온다', (await g(() => document.getElementById('hint').textContent)).includes('물을 누르면'));

  // 10) 읽을 수 없는 낚시 기록: 원본을 옆에 남기고 새로 시작한다. 집은 그대로 열린다
  await g(() => localStorage.setItem('house-lab-web:fishing', '{broken'));
  await page.reload();
  await ready();
  const broken = await g(() => ({ toast: document.getElementById('toast').textContent, kept: localStorage.getItem('house-lab-web:fishing:broken'), log: window.__game.fishing.store.state.log, house: JSON.stringify(window.__game.store.state) }));
  say('읽을 수 없는 낚시 기록은 옆에 남기고 알린다', broken.kept === '{broken' && broken.toast.includes('낚시 기록') && Object.keys(broken.log).length === 0, broken.toast);
  say('그래도 집은 그대로 열린다', broken.house === houseReloaded);
  await page.screenshot({ path: `${out}-5-pond.png` });
}
