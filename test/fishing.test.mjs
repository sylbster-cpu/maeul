// 낚시 규칙과 낚시 기록 시험. 브라우저 없이 돈다
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FISH, FISH_ORDER, BITE_WINDOW, HUSH, HUSH_GAP, inWater, rollFish, rollSize, planBite, judge, kstDay, catchWeight,
  createFishingState, createFishingStore, validate, apply, inverseOf,
  serializeFishing, parseFishing, createFishingSaver, FISHING_KEY, FISHING_VERSION,
} from '../src/fishing.js';
import { POND, YARD, YARD_MARGIN } from '../src/parts.js';

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

test('물고기 고르기는 비율을 따르고 크기는 범위 안이다', () => {
  assert.equal(rollFish(() => 0), FISH_ORDER[0]);
  assert.equal(rollFish(() => 0.9999), FISH_ORDER[FISH_ORDER.length - 1]);
  const count = Object.fromEntries(FISH_ORDER.map((id) => [id, 0]));
  for (let i = 0; i < 1000; i++) count[rollFish(() => (i + 0.5) / 1000)]++;
  const total = FISH_ORDER.reduce((s, id) => s + FISH[id].weight, 0);
  for (const id of FISH_ORDER) assert.ok(Math.abs(count[id] / 1000 - FISH[id].weight / total) < 0.01, id);
  assert.ok(count.catfish < count.medaka && count.catfish < count.carp, '메기가 가장 드물다');
  for (const id of FISH_ORDER) {
    for (const r of [0, 0.3, 0.999]) {
      const size = rollSize(id, () => r);
      assert.ok(size >= FISH[id].min && size <= FISH[id].max, `${id} ${size}`);
      assert.equal(Math.round(size * 10) / 10, size);
    }
  }
  assert.ok(rollSize('carp', () => 0.5) < (FISH.carp.min + FISH.carp.max) / 2, '작은 쪽이 흔하다');
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
