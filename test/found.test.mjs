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
test('되돌리기와 다시 하기는 막지 않는다: 이번 접속에서 이미 있었던 상태로만 돌아간다 (PR #42 GPT 검토 2)', () => {
  const { store, place, history, setGather } = setup({ pinecone: 1 });
  assert.ok(place('found_pinecone', 1, 1).ok);
  const id = Object.values(store.state.spaces.yard.objects).find((o) => o.part === 'found_pinecone').id;
  assert.ok(history.run([{ type: 'removeObject', space: 'yard', id }]).ok);
  setGather({}); // 그사이 가진 것이 없어졌다고 쳐도
  assert.ok(history.undo().ok, '치운 것을 되돌리면 다시 놓인다');
  assert.equal(placedFound(store.state).pinecone, 1);
  assert.ok(history.redo().ok);
  assert.equal(placedFound(store.state).pinecone, 0);
  assert.equal(place('found_pinecone', 1, 1).ok, false, '새로 놓기는 여전히 막힌다');
});
test('가져온 집처럼 가진 것보다 많이 놓인 집도 모두 치운 뒤 되돌릴 수 있다', () => {
  const store = createStore(createState(), 'p1');
  for (const [i, x] of [1, 3, 5].entries()) store.dispatch({ type: 'placeObject', space: 'yard', id: `f${i}`, part: 'found_feather', x, y: 1, rot: 0, by: 'p1' });
  const g = gather({ feather: 1 });
  const history = createHistory(store, { guard: (cmds) => checkFoundCommands(store.state, g, cmds) });
  assert.ok(history.run(['f0', 'f1', 'f2'].map((id) => ({ type: 'removeObject', space: 'yard', id }))).ok, '모두 치우기');
  assert.equal(placedFound(store.state).feather, 0);
  assert.ok(history.undo().ok, '되돌리기로 셋 모두 돌아온다');
  assert.equal(placedFound(store.state).feather, 3);
});
test('명령 묶음은 차례대로 적용해 보며 센다 (PR #42 GPT 검토 3)', () => {
  const store = createStore(createState(), 'p1');
  store.dispatch({ type: 'placeObject', space: 'yard', id: 'a', part: 'found_pinecone', x: 1, y: 1, rot: 0, by: 'p1' });
  const g = gather({ pinecone: 1 });
  const rm = (id) => ({ type: 'removeObject', space: 'yard', id });
  const put = (id, x) => ({ type: 'placeObject', space: 'yard', id, part: 'found_pinecone', x, y: 3, rot: 0, by: 'p1' });
  // 같은 것을 두 번 치워도 하나만 빠진다. 그 뒤 둘을 놓으면 가진 수(1)를 넘는다
  assert.equal(checkFoundCommands(store.state, g, [rm('a'), rm('a'), put('b', 3), put('c', 5)]).ok, false);
  // 놓았다가 바로 치운 것은 남지 않는다
  assert.ok(checkFoundCommands(store.state, g, [rm('a'), put('b', 3), rm('b'), put('c', 5)]).ok);
  // 없는 것을 치워도 빈자리가 생기지 않는다
  assert.equal(checkFoundCommands(store.state, g, [rm('zz'), put('b', 3)]).ok, false);
  // 다른 곳(방)의 같은 id 를 치워도 마당의 것은 빠지지 않는다
  assert.equal(checkFoundCommands(store.state, g, [{ type: 'removeObject', space: 'main', id: 'a' }, put('b', 3)]).ok, false);
  // 치우고 놓으면 그대로 1개
  assert.ok(checkFoundCommands(store.state, g, [rm('a'), put('b', 3)]).ok);
});
test('집 규칙에 막히는 명령은 건너뛰고 센다: 실패한 놓기와 같은 id 로 다시 놓아도 센다 (PR #42 GPT 재검토)', () => {
  const store = createStore(createState(), 'p1');
  const g = gather({ pinecone: 1 });
  const cmds = [
    { type: 'placeObject', space: 'yard', id: 'a', part: 'chair', x: -1, y: 1, rot: 0, by: 'p1' }, // 마당 밖이라 실패한다
    { type: 'placeObject', space: 'yard', id: 'a', part: 'found_pinecone', x: 1, y: 1, rot: 0, by: 'p1' },
    { type: 'placeObject', space: 'yard', id: 'b', part: 'found_pinecone', x: 3, y: 1, rot: 0, by: 'p1' },
  ];
  assert.equal(store.can(cmds[0]).ok, false, '첫 명령은 집 규칙에 막힌다');
  assert.equal(checkFoundCommands(store.state, g, cmds).ok, false);
  // 실제로 보내도 하나도 놓이지 않는다
  const history = createHistory(store, { guard: (c) => checkFoundCommands(store.state, g, c) });
  assert.equal(history.run(cmds).ok, false);
  assert.equal(placedFound(store.state).pinecone, 0);
  // 놓을 자리가 막혀 실패하는 놓기는 세지 않는다(가진 수를 쓰지 않는다)
  assert.ok(checkFoundCommands(store.state, g, [{ ...cmds[1], x: -1 }, cmds[2]]).ok);
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
  const more = { type: 'placeObject', space: 'yard', id: 'n1', part: 'found_mushroom', x: 7, y: 1, rot: 0, by: 'p1' };
  assert.equal(checkFoundCommands(back.state, g, [more]).ok, false);
  // 치우고 다른 자리에 놓는 묶음은 늘지 않으므로 통과한다
  assert.ok(checkFoundCommands(back.state, g, [{ type: 'removeObject', space: 'yard', id: 'f0' }, more]).ok);
});
