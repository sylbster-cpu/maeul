// 4단계 채집(2026-11-24 사용자 결정)의 확인. 숲에서 줍고, 기록 창의 채집 칸에서 본다.
//   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/gather.mjs
// 1. 오늘 숲에는 주울 거리 6개와 오늘의 발견(금빛 고리)이 있다
// 2. 주울 거리를 누르면 그 곁으로 걸어가 줍는다. 그것만 줍고, 사라지고, 알림이 뜬다
// 3. 기록은 웹 잠금을 거쳐 집과 다른 열쇠에 저장되고, 집 저장은 바뀌지 않는다
// 4. 기록 창: 처음엔 낚시 칸, 채집 칸으로 바꾸면 주운 것과 오늘 남은 수가 보인다
// 5. 새로 열어도 주운 것은 기록에 남고 숲에서 사라진 채다
// 6. 주울 거리가 아닌 곳을 누르면 아무것도 줍지 않는다
export default async function gatherTour(page, { out, logs }) {
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const cdp = await page.context().newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const frames = (n) => g((k) => new Promise((done) => { let i = 0; const step = () => (++i >= k ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
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
  await page.waitForTimeout(300);

  // 1. 오늘 숲의 주울 거리
  const today = await g(() => ({ left: window.__game.gathering.left.map((f) => ({ ...f })), forest: window.__game.view.forest.state }));
  const ordinary = today.left.filter((f) => !f.special);
  say('오늘 숲에 주울 거리 6개와 오늘의 발견이 있다', ordinary.length === 6 && today.left.some((f) => f.special) && today.forest.items.length === 6 && today.forest.special,
    JSON.stringify({ ordinary: ordinary.length, items: today.forest.items.length, special: today.forest.special }));

  // 2. 주울 거리 하나를 누르면 걸어가 줍는다. 다른 것과 오늘의 발견을 지나치지 않는 출발점을 고른다
  const plan = await g(async (finds) => {
    const { TREES, TREE_RADIUS, OUTDOOR } = await import('./src/parts.js');
    const segClear = (a, b, p, r) => { for (let k = 0; k <= 1; k += 0.05) if (Math.hypot(a.x + (b.x - a.x) * k - p.x, a.z + (b.z - a.z) * k - p.z) < r) return false; return true; };
    for (const f of finds.filter((x) => !x.special)) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, s = { x: f.x + Math.cos(a) * 2.4, z: f.z + Math.sin(a) * 2.4 };
        if (s.x < OUTDOOR.x0 + 0.5 || s.z < OUTDOOR.z0 + 0.5) continue;
        if (TREES.some(([x, z]) => !segClear(s, f, { x, z }, TREE_RADIUS + 0.45))) continue;
        if (finds.some((o) => o.id !== f.id && !segClear(s, f, o, o.special ? 2.0 : 1.3))) continue;
        return { f, s };
      }
    }
    return null;
  }, today.left);
  const houseBefore = await g(() => localStorage.getItem('house-lab-web:save'));
  const lockable = await g(() => {
    if (!navigator.locks?.request) return false;
    const orig = navigator.locks.request.bind(navigator.locks);
    window.__locks = [];
    navigator.locks.request = (name, ...rest) => { window.__locks.push(name); return orig(name, ...rest); };
    return true;
  });
  const { f, s } = plan;
  await g((p) => { window.__game.character.teleport(p.x, p.z); window.__game.view.snapFocus(p.x, p.z); }, s);
  await page.waitForTimeout(400);
  await groundTap(f.x, f.z);
  const picked = await page.waitForFunction((id) => window.__game.gathering.store.state.picked.includes(id), f.id, { timeout: 20000 }).then(() => true).catch(() => false);
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600); // 줍는 연출(0.32초)이 끝나기를 기다린다
  const after = await g((id) => ({
    log: window.__game.gathering.store.state, forest: window.__game.view.forest.state, toast: document.getElementById('toast')?.textContent || '',
    pos: { ...window.__game.character.pos },
  }), f.id);
  say('주울 거리를 누르면 걸어가 그것만 줍고, 사라지며, 알림이 뜬다',
    picked && after.log.picked.length === 1 && after.log.log[f.kind]?.count === 1 && after.log.log[f.kind]?.best === f.size &&
    !after.forest.items.includes(f.id) && after.forest.picks === 1 && after.toast.includes(`${f.size}cm를 주웠습니다`),
    JSON.stringify({ id: f.id, kind: f.kind, size: f.size, picked: after.log.picked, toast: after.toast.slice(0, 40) }));
  await page.screenshot({ path: `${out}-1-picked.png` });

  // 3. 저장
  const saved = await g(() => ({ text: localStorage.getItem('maeul:gathering'), house: localStorage.getItem('house-lab-web:save'), locks: window.__locks || [] }));
  const data = JSON.parse(saved.text || '{}');
  say('채집 기록은 웹 잠금을 거쳐 따로 된 열쇠에 1판으로 저장된다', lockable && saved.locks.includes('maeul:gathering') && data.format === 'gather-log' && data.version === 1 && data.picked?.includes(f.id),
    JSON.stringify({ lockable, locks: saved.locks, format: data.format, version: data.version }));
  say('줍기는 집 저장을 바꾸지 않는다', saved.house === houseBefore, '');

  // 4. 기록 창
  await page.click('#fish-log');
  const fishTab = await g(() => ({ open: !document.getElementById('fish-layer').hidden, fish: !document.getElementById('log-fish').hidden, gather: !document.getElementById('log-gather').hidden, label: document.getElementById('fish-log').textContent }));
  await page.click('#log-tab-gather');
  const gatherTab = await g(() => ({
    fish: !document.getElementById('log-fish').hidden, gather: !document.getElementById('log-gather').hidden,
    rows: [...document.querySelectorAll('#gather-list li strong')].map((e) => e.textContent),
    best: document.querySelector('#gather-list li span')?.textContent || '',
    today: document.getElementById('gather-today').textContent,
    pressed: document.getElementById('log-tab-gather').getAttribute('aria-pressed'),
  }));
  const label = { pinecone: '솔방울', mushroom: '작은 버섯', feather: '새 깃털' }[f.kind];
  say('기록 버튼은 "기록"이고, 열면 낚시 칸이 먼저 보인다', fishTab.open && fishTab.fish && !fishTab.gather && fishTab.label === '기록', JSON.stringify(fishTab));
  say('채집 칸에 주운 것과 가장 큰 크기, 오늘 남은 수가 보인다',
    !gatherTab.fish && gatherTab.gather && gatherTab.pressed === 'true' && gatherTab.rows.join() === label && gatherTab.best.includes(`${f.size}cm`) && gatherTab.today.includes('6개 남았습니다'),
    JSON.stringify(gatherTab));
  await page.screenshot({ path: `${out}-2-log.png` });
  await page.click('#fish-close');

  // 5. 새로 열어도 남는다 (주운 자리 곁에서 열면 다른 것을 줍지 않게 집 앞으로 옮겨 연다)
  await g(() => { window.__game.character.teleport(12, 12.6); window.__game.view.snapFocus(12, 12.6); });
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const reloaded = await g((id) => ({ items: window.__game.view.forest.state.items, left: window.__game.gathering.left.length, count: Object.values(window.__game.gathering.store.state.log).reduce((n, e) => n + e.count, 0) }), f.id);
  say('새로 열어도 주운 것은 기록에 남고 숲에서 사라진 채다', !reloaded.items.includes(f.id) && reloaded.items.length === 5 && reloaded.left === 6 && reloaded.count === 1, JSON.stringify(reloaded));

  // 6. 주울 거리가 아닌 곳(길 위의 빈 곳)을 누르면 줍지 않는다
  const empty = await g(async () => {
    const finds = window.__game.gathering.left;
    for (const [x, z] of [[-1.5, -3], [0.5, -3], [-3.5, -3]]) if (finds.every((f) => Math.hypot(f.x - x, f.z - z) > 2)) return { x, z };
    return null;
  });
  await g(() => { window.__game.character.teleport(1.5, -3); window.__game.view.snapFocus(1.5, -3); });
  await page.waitForTimeout(300);
  await groundTap(empty.x, empty.z);
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 20000 }).catch(() => {});
  const still = await g(() => window.__game.gathering.left.length);
  say('주울 거리가 아닌 곳을 누르면 줍지 않는다', still === 6, JSON.stringify({ left: still, at: empty }));
}
