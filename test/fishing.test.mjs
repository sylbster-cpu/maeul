// 낚시 규칙과 낚시 기록 시험. 브라우저 없이 돈다
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FISH, FISH_ORDER, WATERS, WATER_ORDER, fishIn, waterAt, BITE_WINDOW, HUSH, HUSH_GAP, FAVOR, inWater, rollFish, rollSize, planBite, judge, kstDay, todaysFish, catchWeight,
  createFishingState, createFishingStore, validate, apply, inverseOf,
  serializeFishing, parseFishing, createFishingSaver, FISHING_KEY, FISHING_VERSION,
} from '../src/fishing.js';
import { POND, YARD, YARD_MARGIN, BEACH, OUTDOOR, shoreZ } from '../src/parts.js';

// 정해진 수를 차례로 돌려주는 가짜 우연
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };
const memory = () => {
  const data = new Map();
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};

test('연못은 마당 칸과 겹치지 않고, 가까운 물가는 걸을 수 있는 둘레 안에 있다', () => {
  for (let x = 0; x < YARD.w; x++) for (let z = 0; z < YARD.h; z++) assert.equal(inWater(x + 0.5, z + 0.5), false, `${x},${z}`);
  assert.ok(POND.x - POND.rx > YARD.w, '연못의 서쪽 끝이 마당 밖');
  assert.ok(POND.x - POND.rx < YARD.w + YARD_MARGIN, '서쪽 물가에 걸어서 닿는다');
  assert.equal(inWater(POND.x, POND.z), true);
  assert.equal(inWater(POND.x + POND.rx + 0.1, POND.z), false);
  assert.equal(inWater(POND.x + POND.rx + 0.1, POND.z, 0.3), true, '넓힌 타원');
});

test('물고기 고르기는 던진 물 안에서 비율을 따르고 크기는 범위 안이다', () => {
  for (const water of WATER_ORDER) {
    const ids = fishIn(water);
    assert.ok(ids.length >= 3, `${water} 에 물고기가 셋 이상`);
    assert.equal(rollFish(() => 0, null, water), ids[0]);
    assert.equal(rollFish(() => 0.9999, null, water), ids[ids.length - 1]);
    const count = Object.fromEntries(ids.map((id) => [id, 0]));
    for (let i = 0; i < 1000; i++) count[rollFish(() => (i + 0.5) / 1000, null, water)]++;
    const total = ids.reduce((s, id) => s + FISH[id].weight, 0);
    for (const id of ids) assert.ok(Math.abs(count[id] / 1000 - FISH[id].weight / total) < 0.01, id);
  }
  assert.deepEqual(fishIn('pond'), ['medaka', 'crucian', 'carp', 'catfish'], '연못 물고기는 그대로');
  assert.deepEqual(fishIn('sea'), ['goby', 'mackerel', 'porgy'], '바다 물고기 셋 (사용자 결정)');
  assert.equal(rollFish(() => 0.5), rollFish(() => 0.5, null, 'pond'), '물을 말하지 않으면 연못');
  const count = Object.fromEntries(FISH_ORDER.map((id) => [id, 0]));
  for (let i = 0; i < 1000; i++) { count[rollFish(() => (i + 0.5) / 1000)]++; count[rollFish(() => (i + 0.5) / 1000, null, 'sea')]++; }
  assert.ok(count.catfish < count.medaka && count.catfish < count.carp, '메기가 연못에서 가장 드물다');
  assert.ok(count.porgy < count.goby && count.porgy < count.mackerel, '감성돔이 바다에서 가장 드물다');
  for (const id of FISH_ORDER) {
    for (const r of [0, 0.3, 0.999]) {
      const size = rollSize(id, () => r);
      assert.ok(size >= FISH[id].min && size <= FISH[id].max, `${id} ${size}`);
      assert.equal(Math.round(size * 10) / 10, size);
    }
  }
  assert.ok(rollSize('carp', () => 0.5) < (FISH.carp.min + FISH.carp.max) / 2, '작은 쪽이 흔하다');
});

test('바닷가: 바다는 마당·연못과 겹치지 않고, 모래사장은 걸을 수 있는 범위 안이다', () => {
  for (let x = OUTDOOR.x0; x < OUTDOOR.x1; x += 0.5) {
    assert.ok(shoreZ(x) > YARD.h + YARD_MARGIN, `${x}: 물가선이 마당 둘레보다 남쪽`);
    assert.ok(shoreZ(x) > BEACH.sand + 3, `${x}: 모래사장이 세 칸 이상`);
    assert.ok(shoreZ(x) <= OUTDOOR.z1, `${x}: 걸을 수 있는 범위가 물가선까지 닿는다`);
    assert.equal(waterAt(x, shoreZ(x) + 0.2), 'sea');
    assert.equal(waterAt(x, shoreZ(x) - 0.2), null);
    assert.equal(waterAt(x, shoreZ(x) - 0.2, 0.3), 'sea', '넓혀 보면 물');
    assert.equal(waterAt(x, shoreZ(x) + 0.2, -0.3), null, '좁혀 보면 물이 아니다');
  }
  for (let x = 0; x < YARD.w; x++) for (let z = 0; z < YARD.h; z++) assert.equal(waterAt(x + 0.5, z + 0.5), null);
  assert.equal(waterAt(POND.x, POND.z), 'pond');
  assert.ok(POND.z + POND.rz < BEACH.sand, '연못은 모래사장보다 북쪽');
  assert.deepEqual(WATER_ORDER, ['pond', 'sea']);
  assert.equal(WATERS.sea.label, '바다');
});

test('입질 계획: 느긋한 물고기는 한두 번, 까다로운 물고기는 여러 번 건드린 뒤 문다. 누를 시간은 모두 같다', () => {
  for (const r of [0, 0.5, 0.999]) {
    const steady = planBite('crucian', () => r);
    const tricky = planBite('catfish', () => r);
    assert.ok(steady.nibbles.length >= 1 && steady.nibbles.length <= 2);
    assert.ok(tricky.nibbles.length >= 2 && tricky.nibbles.length <= 4);
    for (const p of [steady, tricky]) {
      assert.ok(p.approach >= 1.2 && p.approach <= 3);
      assert.equal(p.nibbles[0], p.approach);
      for (let i = 1; i < p.nibbles.length; i++) assert.ok(p.nibbles[i] - p.nibbles[i - 1] >= 0.4 - 1e-9);
      assert.ok(p.bite - p.nibbles[p.nibbles.length - 1] >= HUSH_GAP - 1e-9, '물기 직전에 잠잠한 시간이 들어간다');
      assert.equal(p.window, BITE_WINDOW);
    }
  }
  assert.ok(BITE_WINDOW >= 0.8, '느린 기기에도 넉넉하다');
  // 잠잠함은 마지막 건드림(찌가 떠오르는 데 0.3초)이 끝난 뒤에 시작한다
  assert.ok(HUSH_GAP - HUSH >= 0.3 && HUSH >= 0.3 && HUSH <= 0.5);
});

test('무게감: 크고 드문 물고기일수록 크다. 0~1 안이다', () => {
  for (const id of FISH_ORDER) {
    const small = catchWeight(id, FISH[id].min), big = catchWeight(id, FISH[id].max);
    assert.ok(small >= 0 && big <= 1 && small < big, id);
  }
  assert.ok(catchWeight('medaka', 6) < catchWeight('crucian', 12));
  assert.ok(catchWeight('crucian', 32) < catchWeight('carp', 35));
  assert.ok(catchWeight('carp', 60) < catchWeight('catfish', 60), '같은 크기면 드문 쪽이 크다');
  assert.ok(catchWeight('medaka', 3) < 0.1 && catchWeight('catfish', 90) > 0.9);
});

test('누른 때의 판정', () => {
  const plan = { nibbles: [2, 3], bite: 4, window: 1 };
  assert.equal(judge(plan, 1.9), 'reeled');
  assert.equal(judge(plan, 2.5), 'early');
  assert.equal(judge(plan, 3.99), 'early');
  assert.equal(judge(plan, 4), 'caught');
  assert.equal(judge(plan, 5), 'caught');
  assert.equal(judge(plan, 5.01), 'late');
});

test('한국 날짜는 기기 시간대와 상관없다', () => {
  assert.equal(kstDay(Date.UTC(2026, 10, 21, 14, 59)), '2026-11-21');
  assert.equal(kstDay(Date.UTC(2026, 10, 21, 15, 0)), '2026-11-22');
});

test('오늘 잘 잡히는 물고기: 물마다 날짜만으로 정해지고, 이틀 잇달아 같지 않으며, 물고기 수만큼의 날마다 모두 한 번씩 온다', () => {
  const day = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const start = Math.round(Date.parse('2026-01-01T00:00:00Z') / 86400000);
  for (const water of WATER_ORDER) {
    const ids = fishIn(water);
    const len = ids.length;
    let prev = null;
    const seen = Object.fromEntries(ids.map((id) => [id, 0]));
    for (let n = start; n < start + 2000; n++) {
      const id = todaysFish(day(n), water);
      assert.ok(ids.includes(id), `${water} ${id}`);
      assert.equal(todaysFish(day(n), water), id, '같은 날은 언제 물어도 같다');
      assert.notEqual(id, prev, `${water} ${day(n)} 이 전날과 같다`);
      prev = id;
      seen[id]++;
      if (n % len === len - 1) {
        // 묶음(n 을 물고기 수로 나눈 몫이 같은 날들)에는 모든 물고기가 한 번씩 있다
        const block = new Set(Array.from({ length: len }, (_, k) => todaysFish(day(n - k), water)));
        assert.equal(block.size, len, `${water} ${day(n)} 로 끝나는 묶음`);
      }
    }
    for (const id of ids) assert.ok(Math.abs(seen[id] / 2000 - 1 / len) < 0.01, `${id} ${seen[id]}`);
    // 한국 날짜가 바뀌는 때(한국 시각 0시 = 세계시 15시)에 바뀐다
    assert.notEqual(todaysFish(kstDay(Date.UTC(2026, 10, 21, 14, 59)), water), todaysFish(kstDay(Date.UTC(2026, 10, 21, 15, 0)), water));
  }
  // 바다를 더하기 전과 연못의 날짜표가 같다 (2026-11-01 부터 40일, PR #24 의 결과)
  const before = 'medaka carp medaka carp catfish crucian catfish crucian medaka carp medaka carp crucian catfish medaka carp crucian catfish medaka crucian carp catfish medaka carp crucian catfish carp crucian catfish medaka crucian carp catfish medaka catfish carp crucian medaka catfish medaka';
  const pond = Array.from({ length: 40 }, (_, k) => todaysFish(new Date(Date.UTC(2026, 10, 1) + k * 86400000).toISOString().slice(0, 10)));
  assert.equal(pond.join(' '), before);
});

test('오늘 잘 잡히는 물고기는 나오는 비율만 FAVOR 배가 된다', () => {
  const N = 20000;
  for (const water of WATER_ORDER) {
    const ids = fishIn(water);
    const total = ids.reduce((s, id) => s + FISH[id].weight, 0);
    for (const favored of ids) {
      const count = Object.fromEntries(ids.map((id) => [id, 0]));
      for (let i = 0; i < N; i++) count[rollFish(() => (i + 0.5) / N, favored, water)]++;
      const sum = total + FISH[favored].weight * (FAVOR - 1);
      for (const id of ids) {
        const want = (FISH[id].weight * (id === favored ? FAVOR : 1)) / sum;
        assert.ok(Math.abs(count[id] / N - want) < 0.001, `${favored}: ${id}`);
      }
      assert.ok(count[favored] / N > FISH[favored].weight / total, `${favored} 가 더 자주 온다`);
    }
  }
  assert.ok(FAVOR > 1 && FAVOR <= 1.5, '확률만 조금');
  // 모르는 물고기나 다른 물의 물고기를 주면 평소와 같다
  assert.equal(rollFish(() => 0.5, 'shark'), rollFish(() => 0.5));
  assert.equal(rollFish(() => 0.5, 'porgy', 'pond'), rollFish(() => 0.5, null, 'pond'));
});

test('잡은 물고기를 기록하고, 반대 명령으로 되돌린다', () => {
  const store = createFishingStore();
  const a = store.dispatch({ type: 'recordCatch', fish: 'crucian', size: 20.5, day: '2026-11-22' });
  assert.ok(a.ok);
  assert.deepEqual(store.state.log.crucian, { best: 20.5, first: '2026-11-22', count: 1 });
  const b = store.dispatch({ type: 'recordCatch', fish: 'crucian', size: 15, day: '2026-11-23' });
  assert.deepEqual(store.state.log.crucian, { best: 20.5, first: '2026-11-22', count: 2 }, '작은 것은 최고 기록을 바꾸지 않고, 처음 잡은 날은 그대로');
  store.dispatch({ type: 'recordCatch', fish: 'crucian', size: 31.2, day: '2026-11-24' });
  assert.equal(store.state.log.crucian.best, 31.2);
  // 되돌리기
  const before = structuredClone(store.state);
  const c = store.dispatch({ type: 'recordCatch', fish: 'catfish', size: 50, day: '2026-11-24' });
  assert.ok(store.dispatch(c.inverse).ok);
  assert.deepEqual(store.state, before);
  assert.ok(store.dispatch(b.inverse).ok);
  assert.deepEqual(store.state.log.crucian, { best: 20.5, first: '2026-11-22', count: 1 });
  assert.ok(store.dispatch(a.inverse).ok);
  assert.deepEqual(store.state, createFishingState());
});

test('apply 는 받은 상태를 고치지 않는다', () => {
  const s0 = createFishingState();
  const s1 = apply(s0, { type: 'recordCatch', fish: 'medaka', size: 4, day: '2026-11-22' });
  assert.deepEqual(s0.log, {});
  const inv = inverseOf(s1, { type: 'recordCatch', fish: 'medaka', size: 5, day: '2026-11-22' });
  apply(s1, { type: 'recordCatch', fish: 'medaka', size: 5, day: '2026-11-22' });
  assert.deepEqual(s1.log.medaka, { best: 4, first: '2026-11-22', count: 1 });
  assert.deepEqual(inv, { type: 'setLogEntry', fish: 'medaka', entry: { best: 4, first: '2026-11-22', count: 1 } });
});

test('맞지 않는 명령은 거절한다', () => {
  const s = createFishingState();
  const bad = [
    { type: 'recordCatch', fish: 'shark', size: 10, day: '2026-11-22' },
    { type: 'recordCatch', fish: 'toString', size: 10, day: '2026-11-22' },
    { type: 'recordCatch', fish: 'medaka', size: 30, day: '2026-11-22' },
    { type: 'recordCatch', fish: 'medaka', size: NaN, day: '2026-11-22' },
    { type: 'recordCatch', fish: 'medaka', size: '4', day: '2026-11-22' },
    { type: 'recordCatch', fish: 'medaka', size: 4, day: '11/22' },
    { type: 'setLogEntry', fish: 'medaka', entry: { best: 4, first: '2026-11-22', count: 0 } },
    { type: 'setLogEntry', fish: 'medaka', entry: { best: 99, first: '2026-11-22', count: 1 } },
    { type: 'setLogEntry', fish: 'medaka', entry: 'x' },
    { type: 'eraseAll' },
    null,
  ];
  for (const cmd of bad) assert.equal(validate(s, cmd).ok, false, JSON.stringify(cmd));
});

test('저장하고 되읽는다. 맞지 않는 항목은 빼고, 형식이 다르거나 새 판이면 읽지 않는다', () => {
  const store = createFishingStore();
  store.dispatch({ type: 'recordCatch', fish: 'carp', size: 40.1, day: '2026-11-22' });
  const back = parseFishing(serializeFishing(store.state));
  assert.ok(back.ok);
  assert.deepEqual(back.state, store.state);
  assert.equal(back.dropped, 0);
  const mixed = JSON.stringify({ format: 'fishing-log', version: 1, log: { carp: { best: 40, first: '2026-11-22', count: 2 }, shark: { best: 1 }, medaka: { best: 50, first: 'x', count: 1 } } });
  const m = parseFishing(mixed);
  assert.ok(m.ok);
  assert.deepEqual(Object.keys(m.state.log), ['carp']);
  assert.equal(m.dropped, 2);
  assert.equal(parseFishing('{').ok, false);
  assert.equal(parseFishing(JSON.stringify({ format: 'house-lab', version: 2, state: {} })).ok, false, '집 저장은 낚시 기록이 아니다');
  assert.equal(parseFishing(JSON.stringify({ format: 'fishing-log', version: FISHING_VERSION + 1, log: {} })).ok, false);
});

test('낚시 기록 2판: 1판 기록을 그대로 옮기고, 바다 물고기를 기록한다', () => {
  assert.equal(FISHING_VERSION, 2);
  const v1 = JSON.stringify({ format: 'fishing-log', version: 1, log: { carp: { best: 40, first: '2026-11-22', count: 2 }, catfish: { best: 60, first: '2026-11-01', count: 3 } } });
  const m = parseFishing(v1);
  assert.ok(m.ok, '1판을 읽는다');
  assert.equal(m.dropped, 0);
  assert.deepEqual(m.state.log.carp, { best: 40, first: '2026-11-22', count: 2 });
  assert.deepEqual(m.state.log.catfish, { best: 60, first: '2026-11-01', count: 3 });
  assert.equal(JSON.parse(serializeFishing(m.state)).version, 2, '다시 쓰면 2판');
  const store = createFishingStore(m.state);
  assert.ok(store.dispatch({ type: 'recordCatch', fish: 'porgy', size: 42.3, day: '2026-11-22' }).ok);
  assert.equal(store.dispatch({ type: 'recordCatch', fish: 'porgy', size: 90, day: '2026-11-22' }).ok, false, '감성돔 크기 범위 밖');
  assert.ok(store.dispatch({ type: 'recordCatch', fish: 'goby', size: 12, day: '2026-11-22' }).ok);
  const back = parseFishing(serializeFishing(store.state));
  assert.deepEqual(back.state, store.state);
  // 무게감: 바다 물고기도 0~1, 같은 물 안에서 크고 드물수록 크다
  for (const id of fishIn('sea')) for (const size of [FISH[id].min, FISH[id].max]) { const w = catchWeight(id, size); assert.ok(w >= 0 && w <= 1, `${id} ${w}`); }
  assert.ok(catchWeight('porgy', 50) > catchWeight('mackerel', 35) && catchWeight('mackerel', 35) > catchWeight('goby', 14));
});

test('저장소: 없으면 새 기록, 읽지 못하면 원본을 옆에 남긴다. 집 저장 열쇠와 겹치지 않는다', () => {
  assert.notEqual(FISHING_KEY, 'house-lab-web:save');
  const storage = memory();
  const saver = createFishingSaver(storage);
  const fresh = saver.load();
  assert.ok(fresh.ok);
  assert.deepEqual(fresh.state, createFishingState());
  const store = createFishingStore(fresh.state);
  store.dispatch({ type: 'recordCatch', fish: 'medaka', size: 5.5, day: '2026-11-22' });
  assert.ok(saver.save(store.state));
  assert.deepEqual(saver.load().state, store.state);
  storage.setItem(FISHING_KEY, 'not json');
  const broken = saver.load();
  assert.equal(broken.ok, false);
  assert.equal(storage.getItem(`${FISHING_KEY}:broken`), 'not json');
  storage.setItem(FISHING_KEY, 'second broken');
  saver.load();
  assert.equal(storage.getItem(`${FISHING_KEY}:broken`), 'not json', '처음 남긴 원본을 덮어쓰지 않는다');
  assert.equal(createFishingSaver(null).load(), null);
  assert.equal(createFishingSaver(null).save(store.state), false);
  const failing = { getItem: () => null, setItem: () => { throw new Error('full'); } };
  assert.equal(createFishingSaver(failing).save(store.state), false);
});

test('저장소: 더 새로운 판의 기록은 망가진 것으로 보지 않고, 그 위에 덮어쓰지 않는다', () => {
  const storage = memory();
  const saver = createFishingSaver(storage);
  const newer = JSON.stringify({ format: 'fishing-log', version: FISHING_VERSION + 1, log: { medaka: { best: 5, first: '2026-12-01', count: 9 } }, extra: '새 판의 자료' });
  storage.setItem(FISHING_KEY, newer);
  const loaded = saver.load();
  assert.equal(loaded.ok, false);
  assert.equal(loaded.newer, true);
  assert.equal(storage.getItem(`${FISHING_KEY}:broken`), null, '옆에 옮기지 않는다 (망가진 기록을 위한 자리를 남긴다)');
  assert.equal(saver.newerStored(), true);
  const store = createFishingStore();
  store.dispatch({ type: 'recordCatch', fish: 'crucian', size: 20, day: '2026-11-22' });
  assert.equal(saver.save(store.state), false, '1판 기록으로 덮어쓰지 않는다');
  assert.equal(storage.getItem(FISHING_KEY), newer, '새 판의 기록이 그대로 남는다');
});
