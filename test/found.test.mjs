// 4단계 "집에 놓기"(2026-11-25 사용자 결정): 숲에서 주운 것을 가진 만큼만 놓는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore } from '../src/state.js';
import { createHistory } from '../src/history.js';
import { serialize, parse } from '../src/save.js';
import { PARTS, FOUND_PARTS } from '../src/parts.js';
import { placedFound, ownedFound, availableFound, checkFoundCommands, GATHER_ORDER } from '../src/gathering.js';

const gather = (counts) => ({ version: 2, day: null, picked: [], log: Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, { best: 5, first: '2026-11-25', count: n }])) });
function setup(counts) {
  const store = createStore(createState(), 'p1');
  let g = gather(counts);
  const history = createHistory(store, { guard: (cmds) => checkFoundCommands(store.state, g, cmds) });
  return { store, history, setGather: (c) => { g = gather(c); }, place: (part, x, y, space = 'yard') => history.run([{ type: 'placeObject', space, id: store.nextId(), part, x, y, rot: 0, by: 'p1' }]) };
}

test('주운 것 세 가지가 놓는 부품으로 있고, 모델 대신 코드로 그리며 충돌 크기가 있다', () => {
  assert.deepEqual(Object.keys(FOUND_PARTS).sort(), [...GATHER_ORDER].sort());
  for (const id of Object.values(FOUND_PARTS)) {
    const p = PARTS[id];
    assert.ok(!p.model && p.found && p.bounds?.min?.length === 3 && p.bounds?.max?.length === 3, id);
    assert.deepEqual(p.size, [1, 1]);
  }
});
test('가진 만큼만 놓고, 치우면 다시 놓을 수 있다', () => {
  const { store, place, history } = setup({ pinecone: 2 });
  assert.ok(place('found_pinecone', 1, 1).ok);
  assert.ok(place('found_pinecone', 3, 1).ok);
  const r = place('found_pinecone', 5, 1);
  assert.equal(r.ok, false);
  assert.match(r.reason, /더 주워 와야/);
  assert.deepEqual(placedFound(store.state), { pinecone: 2, mushroom: 0, feather: 0 });
  const id = Object.values(store.state.spaces.yard.objects).find((o) => o.part === 'found_pinecone').id;
  assert.ok(history.run([{ type: 'removeObject', space: 'yard', id }]).ok);
  assert.ok(place('found_pinecone', 5, 1).ok, '치운 뒤에는 다시 놓인다');
});
test('주운 적 없는 것은 놓이지 않고, 다른 가구는 제한이 없다', () => {
  const { place } = setup({});
  assert.match(place('found_feather', 1, 1).reason, /아직 주운 적이 없습니다/);
  assert.ok(place('chair', 1, 1).ok);
  assert.ok(place('chair', 3, 1).ok);
});
test('되돌리기와 다시 하기도 가진 수를 넘지 않고, 막힌 기록은 버리지 않는다', () => {
  const { store, place, history, setGather } = setup({ pinecone: 1 });
  assert.ok(place('found_pinecone', 1, 1).ok);
  const id = Object.values(store.state.spaces.yard.objects).find((o) => o.part === 'found_pinecone').id;
  assert.ok(history.run([{ type: 'removeObject', space: 'yard', id }]).ok);
  setGather({}); // 그사이 가진 것이 없어졌다고 치면
  const u = history.undo();
  assert.equal(u.ok, false);
  assert.match(u.reason, /주운 적이 없습니다/);
  assert.equal(history.status().canUndo, true, '기록은 남는다');
  setGather({ pinecone: 1 });
  assert.ok(history.undo().ok);
  assert.equal(placedFound(store.state).pinecone, 1);
  // 다시 하기(치우기)와 그 되돌리기
  assert.ok(history.redo().ok);
  assert.equal(placedFound(store.state).pinecone, 0);
});
test('가진 것보다 많이 놓인 집(가져온 친구 집 등)은 그대로 읽히고, 더 놓지만 못한다', () => {
  const store = createStore(createState(), 'p1');
  for (const [i, x] of [1, 3, 5].entries()) store.dispatch({ type: 'placeObject', space: 'yard', id: `f${i}`, part: 'found_mushroom', x, y: 1, rot: 0, by: 'p1' });
  const back = parse(serialize(store.state));
  assert.ok(back.ok && !back.dropped, '불러오기·공유에서 지워지지 않는다');
  assert.equal(placedFound(back.state).mushroom, 3);
  const g = gather({ mushroom: 1 });
  assert.equal(availableFound(back.state, g).mushroom, 0);
  assert.equal(ownedFound(g).mushroom, 1);
  assert.equal(checkFoundCommands(back.state, g, [{ type: 'placeObject', part: 'found_mushroom' }]).ok, false);
  // 치우고 그 자리에 놓는 묶음은 늘지 않으므로 통과한다
  assert.ok(checkFoundCommands(back.state, g, [{ type: 'removeObject', space: 'yard', id: 'f0' }, { type: 'placeObject', part: 'found_mushroom' }]).ok);
});
