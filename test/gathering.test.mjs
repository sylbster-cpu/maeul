import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATHER, GATHER_ORDER, DAILY_FINDS, SPECIAL_ID, findsForDay, findById, createGatherState, createGatherStore, pickedOn,
  validate, apply, inverseOf, serializeGather, parseGather, createGatherSaver, GATHER_KEY, GATHER_VERSION,
} from '../src/gathering.js';
import { GATHER_SPOTS, discoveryForDay, discoverySiteForDay } from '../src/forest.js';
import { TREES, TREE_RADIUS } from '../src/parts.js';

const DAY = '2026-11-24';
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; };

test('같은 날이면 주울 거리가 같고, 6곳과 오늘의 발견 하나다', () => {
  const a = findsForDay(DAY), b = findsForDay(DAY);
  assert.deepEqual(a, b);
  assert.equal(a.length, DAILY_FINDS + 1);
  assert.equal(new Set(a.map((f) => f.id)).size, a.length);
  const special = a.find((f) => f.special);
  assert.equal(special.id, SPECIAL_ID);
  assert.equal(special.kind, discoveryForDay(DAY).id);
  assert.deepEqual({ x: special.x, z: special.z }, discoverySiteForDay(DAY));
  for (const f of a.filter((x) => !x.special)) assert.ok(GATHER_SPOTS.some((s) => s.x === f.x && s.z === f.z));
});
test('날이 바뀌면 자리나 크기가 달라진다', () => {
  const days = ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
  const keys = days.map((d) => JSON.stringify(findsForDay(d).map((f) => [f.id, f.kind, f.size])));
  assert.equal(new Set(keys).size, days.length);
});
test('크기는 범위 안이고, 오늘의 발견은 그날 같은 종류의 보통 것보다 언제나 크다 (400일)', () => {
  for (let d = 0; d < 400; d++) {
    const day = new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10);
    const finds = findsForDay(day);
    const special = finds.find((f) => f.special);
    for (const f of finds) {
      assert.ok(f.size >= GATHER[f.kind].min && f.size <= GATHER[f.kind].max, `${day} ${f.kind} ${f.size}`);
      if (!f.special && f.kind === special.kind) assert.ok(f.size < special.size, `${day} ${f.size} < ${special.size}`);
    }
  }
});
test('주울 자리는 나무줄기에서 떨어져 있어 걸어가 닿을 수 있다', () => {
  for (const s of GATHER_SPOTS) assert.ok(TREES.every(([x, z]) => Math.hypot(s.x - x, s.z - z) > TREE_RADIUS + 0.9), JSON.stringify(s));
});
test('줍기: 종류별 가장 큰 것·처음 주운 날·수를 남기고, 같은 자리는 하루에 한 번만', () => {
  const store = createGatherStore();
  const finds = findsForDay(DAY);
  const pine = finds.filter((f) => f.kind === finds[0].kind);
  for (const f of pine) assert.ok(store.dispatch({ type: 'pick', day: DAY, id: f.id }).ok);
  const entry = store.state.log[finds[0].kind];
  assert.equal(entry.count, pine.length);
  assert.equal(entry.best, Math.max(...pine.map((f) => f.size)));
  assert.equal(entry.first, DAY);
  assert.deepEqual(pickedOn(store.state, DAY), pine.map((f) => f.id));
  assert.equal(store.dispatch({ type: 'pick', day: DAY, id: finds[0].id }).ok, false);
});
test('날이 바뀌면 주운 자리가 비워지고, 처음 주운 날은 그대로다', () => {
  const store = createGatherStore();
  const a = findsForDay('2026-11-24')[0];
  store.dispatch({ type: 'pick', day: '2026-11-24', id: a.id });
  const b = findsForDay('2026-11-25').find((f) => f.id === a.id) || findsForDay('2026-11-25')[0];
  assert.ok(store.dispatch({ type: 'pick', day: '2026-11-25', id: b.id }).ok);
  assert.deepEqual(pickedOn(store.state, '2026-11-25'), [b.id]);
  assert.deepEqual(pickedOn(store.state, '2026-11-24'), []);
  if (b.kind === a.kind) assert.equal(store.state.log[a.kind].first, '2026-11-24');
});
test('명령에는 종류와 크기가 없어 지어낼 수 없고, 잘못된 명령은 거절한다', () => {
  const s = createGatherState();
  assert.equal(validate(s, { type: 'pick', day: DAY, id: 's99' }).ok, false);
  assert.equal(validate(s, { type: 'pick', day: '2026/11/24', id: 's0' }).ok, false);
  assert.equal(validate(s, { type: 'nope' }).ok, false);
  assert.equal(validate(s, { type: 'setGatherEntry', kind: 'pinecone', entry: { best: 99, first: DAY, count: 1 } }).ok, false);
  assert.equal(validate(s, { type: 'setPicked', day: DAY, picked: ['s0', 's0'] }).ok, false);
});
test('줍기를 되돌리는 명령은 앞 상태를 그대로 되살린다', () => {
  let s = createGatherState();
  for (const f of findsForDay(DAY)) {
    const cmd = { type: 'pick', day: DAY, id: f.id };
    const before = s;
    const back = inverseOf(s, cmd);
    s = apply(s, cmd);
    assert.ok(validate(s, back).ok);
    assert.deepEqual(apply(s, back), before);
    s = apply(before, cmd);
  }
});
test('저장 글자를 되읽으면 같고, 맞지 않는 항목은 빼며, 더 새 판은 읽지 않는다', () => {
  const store = createGatherStore();
  for (const f of findsForDay(DAY).slice(0, 3)) store.dispatch({ type: 'pick', day: DAY, id: f.id });
  const back = parseGather(serializeGather(store.state));
  assert.ok(back.ok);
  assert.deepEqual(back.state, store.state);
  const broken = JSON.parse(serializeGather(store.state));
  broken.log.mushroom = { best: 999, first: DAY, count: 1 };
  broken.picked = ['s99'];
  const fixed = parseGather(JSON.stringify(broken));
  assert.ok(fixed.ok && fixed.dropped === 2 && !fixed.state.log.mushroom && fixed.state.picked.length === 0);
  assert.equal(parseGather(JSON.stringify({ format: 'gather-log', version: GATHER_VERSION + 1, log: {} })).newer, true);
  assert.equal(parseGather('{').ok, false);
});
test('저장소: 처음엔 빈 기록, 망가진 기록은 옆에 남기고, 더 새 판 위에는 쓰지 않는다', () => {
  const st = memory();
  const saver = createGatherSaver(st);
  assert.deepEqual(saver.load().state, createGatherState());
  st.setItem(GATHER_KEY, 'not json');
  assert.equal(saver.load().ok, false);
  assert.equal(st.getItem(`${GATHER_KEY}:broken`), 'not json');
  st.setItem(GATHER_KEY, JSON.stringify({ format: 'gather-log', version: GATHER_VERSION + 1, log: {} }));
  assert.equal(saver.save(createGatherState()), false);
  assert.equal(saver.newerStored(), true);
  assert.equal(createGatherSaver(null).load(), null);
});
test('종류는 숲의 발견물 세 가지다', () => {
  assert.deepEqual(GATHER_ORDER, ['pinecone', 'mushroom', 'feather']);
  assert.equal(findById(DAY, SPECIAL_ID).special, true);
});
