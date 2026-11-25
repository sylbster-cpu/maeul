import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATHER, GATHER_ORDER, DAILY_FINDS, SPECIAL_ID, findsForDay, findById, createGatherState, createGatherStore, pickedOn,
  validate, apply, inverseOf, serializeGather, parseGather, createGatherSaver, GATHER_KEY, GATHER_VERSION, validDay,
  kstSlot, nextSlotHour, specialForDay, SLOTS, SLOT_HOURS,
} from '../src/gathering.js';
import { createGathering } from '../src/gathering-play.js';
import { GATHER_SPOTS, discoveryForDay, discoverySiteForDay } from '../src/forest.js';
import { TREES, TREE_RADIUS } from '../src/parts.js';

const DAY = '2026-11-24';
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; };

test('같은 날·시간대면 주울 거리가 같고, 6곳과 오늘의 발견 하나다', () => {
  const a = findsForDay(DAY, 0), b = findsForDay(DAY, 0);
  assert.deepEqual(a, b);
  assert.equal(a.length, DAILY_FINDS + 1);
  assert.equal(new Set(a.map((f) => f.id)).size, a.length);
  const special = a.find((f) => f.special);
  assert.equal(special.id, SPECIAL_ID);
  assert.equal(special.kind, discoveryForDay(DAY).id);
  assert.deepEqual({ x: special.x, z: special.z }, discoverySiteForDay(DAY));
  for (const f of a.filter((x) => !x.special)) assert.ok(GATHER_SPOTS.some((s) => s.x === f.x && s.z === f.z));
});
test('날이 바뀌면 자리나 크기가 달라진다 (같은 시간대끼리)', () => {
  const days = ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
  const keys = days.map((d) => JSON.stringify(findsForDay(d, 0).map((f) => [f.id, f.kind, f.size])));
  assert.equal(new Set(keys).size, days.length);
});
test('크기는 범위 안이고, 오늘의 발견은 그날 어느 시간대의 같은 종류 보통 것보다 언제나 크다 (100일 × 8시간대)', () => {
  for (let d = 0; d < 100 * SLOTS; d++) {
    const day = new Date(Date.UTC(2026, 0, 1) + Math.floor(d / SLOTS) * 864e5).toISOString().slice(0, 10);
    const finds = findsForDay(day, d % SLOTS);
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
  const finds = findsForDay(DAY, 0);
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
  const a = findsForDay('2026-11-24', 0)[0];
  store.dispatch({ type: 'pick', day: '2026-11-24', id: a.id });
  const b = findsForDay('2026-11-25', 0)[0];
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
  for (const f of findsForDay(DAY, 0)) {
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
  for (const f of findsForDay(DAY, 0).slice(0, 3)) store.dispatch({ type: 'pick', day: DAY, id: f.id });
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

// ---- PR #41 GPT 검토 2·3 ----
test('달력에 없는 날짜는 거절하고, 손상된 날짜가 든 기록을 읽어도 예외로 끝나지 않는다', () => {
  assert.equal(validDay('2026-13-01'), false);
  assert.equal(validDay('2026-02-30'), false);
  assert.equal(validDay('2028-02-29'), true);
  assert.equal(validate(createGatherState(), { type: 'pick', day: '2026-02-30', id: 's0' }).ok, false);
  const r = parseGather(JSON.stringify({ format: 'gather-log', version: 2, log: { pinecone: { best: 5, first: '2026-02-30', count: 1 } }, day: '2026-13-01', picked: ['0:s0'] }));
  assert.ok(r.ok && r.dropped === 2 && !r.state.log.pinecone && r.state.day === null);
  assert.equal(parseGather(JSON.stringify({ format: 'gather-log', version: 2, log: { pinecone: null }, picked: 5, day: 7 })).ok, true);
  assert.doesNotThrow(() => parseGather('{"format":"gather-log","version":2,"log":{"__proto__":{"best":1}}}'));
  const st = memory();
  st.setItem(GATHER_KEY, JSON.stringify({ format: 'gather-log', version: 2, log: {}, day: '2026-13-01', picked: ['0:s0'] }));
  assert.doesNotThrow(() => createGatherSaver(st).load());
});
test('저장소에 쓰지 못하면 줍기 전으로 되돌려, 다음 줍기가 앞의 것을 소리 없이 지우지 않는다', async () => {
  let fail = true;
  const st = memory();
  const setItem = st.setItem;
  st.setItem = (k, v) => { if (k === GATHER_KEY && fail) { fail = false; throw new Error('가득 참'); } setItem(k, v); };
  const toasts = [];
  const character = { place: 'yard', pos: { x: 99, z: 99 } };
  const view = { forest: { setPicked() {}, found() {}, pick() {} } };
  const g = createGathering({ character, view, ui: { toast: (t, k) => toasts.push(k || 'info') }, audio: { play() {} }, storage: st, now: () => new Date('2026-11-24T03:00:00Z') });
  const [a, b] = findsForDay(DAY, kstSlot(new Date('2026-11-24T03:00:00Z')).slot).filter((f) => !f.special);
  const visit = async (f) => { character.pos = { x: f.x, z: f.z }; g.update(0.016); await new Promise((r) => setTimeout(r, 10)); character.pos = { x: 99, z: 99 }; g.update(0.016); };
  await visit(a);
  assert.deepEqual(g.store.state.picked, [], '저장 실패면 줍지 않은 상태로 돌아간다');
  assert.ok(toasts.includes('error'));
  assert.ok(g.left.some((f) => f.id === a.id), '숲에 다시 보인다');
  await visit(b);
  await visit(a);
  const saved = JSON.parse(st.getItem(GATHER_KEY));
  assert.deepEqual([...saved.picked].sort(), [a.id, b.id].sort());
  assert.deepEqual([...g.store.state.picked].sort(), [a.id, b.id].sort());
});
test('저장소가 아예 없는 브라우저에서는 이번 접속 동안만 줍기가 남는다', async () => {
  const character = { place: 'yard', pos: { x: 99, z: 99 } };
  const toasts = [];
  const g = createGathering({ character, view: { forest: { setPicked() {}, found() {}, pick() {} } }, ui: { toast: (t, k) => toasts.push(t) }, audio: { play() {} }, storage: null, now: () => new Date('2026-11-24T03:00:00Z') });
  const f = findsForDay(DAY, kstSlot(new Date('2026-11-24T03:00:00Z')).slot).find((x) => !x.special);
  character.pos = { x: f.x, z: f.z }; g.update(0.016); await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(g.store.state.picked, [f.id]);
  assert.ok(toasts.some((t) => t.includes('이번 접속 동안만')));
});

// ---- 2026-11-25 사용자 결정: 같은 날에도 3시간마다 다시 놓인다 ----
test('한국 시각으로 시간대를 가른다 (3시간씩 8개, 자정에 날이 바뀐다)', () => {
  assert.equal(SLOT_HOURS, 3);
  assert.equal(SLOTS, 8);
  assert.deepEqual(kstSlot(new Date('2026-11-24T17:59:59Z')), { day: '2026-11-25', slot: 0 });
  assert.deepEqual(kstSlot(new Date('2026-11-24T18:00:00Z')), { day: '2026-11-25', slot: 1 });
  assert.deepEqual(kstSlot(new Date('2026-11-24T14:59:59Z')), { day: '2026-11-24', slot: 7 });
  assert.deepEqual(kstSlot(new Date('2026-11-24T15:00:00Z')), { day: '2026-11-25', slot: 0 });
  assert.equal(nextSlotHour(0), 3);
  assert.equal(nextSlotHour(7), 0);
});
test('시간대마다 새로 놓이고, 오늘의 발견은 하루 내내 같다', () => {
  const all = Array.from({ length: SLOTS }, (_, s) => findsForDay(DAY, s));
  const keys = all.map((f) => JSON.stringify(f.filter((x) => !x.special).map((x) => [x.x, x.z, x.kind, x.size])));
  assert.ok(new Set(keys).size >= SLOTS - 1, '시간대마다 거의 다 다르다');
  for (const [s, finds] of all.entries()) {
    assert.ok(finds.filter((f) => !f.special).every((f) => f.id.startsWith(`${s}:`)));
    assert.deepEqual(finds.find((f) => f.special), specialForDay(DAY));
  }
});
test('앞 시간대에 주운 것은 다음 시간대의 것을 막지 않고, 오늘의 발견은 하루에 한 번만', () => {
  const store = createGatherStore();
  const a = findsForDay(DAY, 2).find((f) => !f.special);
  const b = findsForDay(DAY, 3).find((f) => !f.special && f.x === a.x && f.z === a.z) || findsForDay(DAY, 3).find((f) => !f.special);
  assert.ok(store.dispatch({ type: 'pick', day: DAY, id: a.id }).ok);
  assert.ok(store.dispatch({ type: 'pick', day: DAY, id: b.id }).ok);
  assert.ok(store.dispatch({ type: 'pick', day: DAY, id: SPECIAL_ID }).ok);
  assert.equal(store.dispatch({ type: 'pick', day: DAY, id: SPECIAL_ID }).ok, false);
  assert.equal(validate(store.state, { type: 'pick', day: DAY, id: 's3' }).ok, false, '시간대 없는 옛 id 는 받지 않는다');
  assert.equal(validate(store.state, { type: 'pick', day: DAY, id: '9:s3' }).ok, false);
});
test('1판 기록(미리 보기)은 종류별 기록을 남기고, 그날 주운 자리만 비워 2판으로 옮긴다', () => {
  const old = JSON.stringify({ format: 'gather-log', version: 1, log: { pinecone: { best: 9.5, first: '2026-11-24', count: 2 } }, day: '2026-11-24', picked: ['special', 's0'] });
  const r = parseGather(old);
  assert.ok(r.ok && r.dropped === 0);
  assert.deepEqual(r.state.log, { pinecone: { best: 9.5, first: '2026-11-24', count: 2 } });
  assert.equal(r.state.day, null);
  assert.equal(GATHER_VERSION, 2);
});
