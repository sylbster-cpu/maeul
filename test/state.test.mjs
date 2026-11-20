import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore, clearCommands, houseRect, blockedCells, cellKey, seatSpots, seatApproach } from '../src/state.js';
import { sampleCommands } from '../src/sample.js';
import { createHistory } from '../src/history.js';
import { serialize, parse, createSaver, SAVE_KEY, SAVE_VERSION } from '../src/save.js';

const snapshot = (store) => structuredClone(store.state);
function setup() {
  const store = createStore(createState(), 'p1');
  return { store, history: createHistory(store) };
}
function sampleStore() {
  const store = createStore(createState(), 'p1');
  for (const cmd of sampleCommands(store)) assert.ok(store.dispatch(cmd).ok, JSON.stringify(cmd));
  return store;
}
const put = (store, space, part, x, y, rot = 0, id = store.nextId()) => store.dispatch({ type: 'placeObject', space, id, part, x, y, rot });

test('가구는 방 안의 빈 칸에만 놓인다', () => {
  const { store } = setup();
  assert.ok(put(store, 'main', 'bed', 0, 0).ok);
  assert.equal(put(store, 'main', 'chair', 1, 2).ok, false); // 침대와 겹침
  assert.equal(put(store, 'main', 'bed', 5, 4).ok, false); // 방 밖으로 나감
  assert.equal(put(store, 'main', 'chair', 2, 5).ok, false); // 현관 깔개
  assert.ok(put(store, 'main', 'chair', 2, 4).ok);
});

test('러그는 가구 아래에 깔 수 있다', () => {
  const { store } = setup();
  assert.ok(put(store, 'main', 'rug', 1, 1).ok);
  assert.ok(put(store, 'main', 'table', 1, 1).ok);
  assert.equal(put(store, 'main', 'round_rug', 2, 2).ok, false);
});

test('마당에는 놓을 수 있지만 집과 문 앞에는 놓을 수 없다', () => {
  const { store } = setup();
  const r = houseRect(1);
  assert.ok(put(store, 'yard', 'plant', 2, 2).ok);
  assert.equal(put(store, 'yard', 'plant', r.x0, r.z0).ok, false);
  assert.equal(put(store, 'yard', 'plant', 12, r.z0 + r.d).ok, false);
  assert.ok(put(store, 'yard', 'plant', 12, r.z0 + r.d + 1).ok);
});

test('돌리면 차지하는 칸이 바뀐다', () => {
  const { store } = setup();
  put(store, 'main', 'bed', 0, 0, 0, 'p1-50');
  assert.ok(store.dispatch({ type: 'moveObject', space: 'main', id: 'p1-50', x: 0, y: 0, rot: 1 }).ok);
  assert.equal(store.derived.occ.main.furniture.get(cellKey(2, 1)), 'p1-50');
  assert.equal(store.derived.occ.main.furniture.has(cellKey(1, 2)), false);
});

test('집을 키우면 방이 넓어지고 가구는 제자리에 남는다', () => {
  const store = sampleStore();
  const before = snapshot(store).spaces.main.objects;
  assert.equal(put(store, 'main', 'chair', 7, 7).ok, false);
  assert.ok(store.dispatch({ type: 'setLevel', level: 2 }).ok);
  assert.deepEqual(Object.keys(store.state.spaces.main.objects), Object.keys(before));
  assert.ok(put(store, 'main', 'chair', 7, 6).ok);
  assert.ok(blockedCells('main', 2).has(cellKey(2, 7))); // 현관이 새 아래쪽 줄로 옮겨 간다
  assert.equal(store.dispatch({ type: 'setLevel', level: 4 }).ok, false);
  assert.equal(store.dispatch({ type: 'setLevel', level: 3 }).ok, true);
  assert.equal(store.dispatch({ type: 'setLevel', level: 1 }).ok, false); // 한 단계씩만
});

test('집이 커질 자리에 물건이 있으면 키우지 않는다. 줄일 때도 방 밖 물건이 있으면 줄이지 않는다', () => {
  const { store } = setup();
  const next = houseRect(2);
  put(store, 'yard', 'plant', next.x0, next.z0 + 1, 0, 'p1-70');
  assert.equal(store.dispatch({ type: 'setLevel', level: 2 }).ok, false);
  store.dispatch({ type: 'removeObject', space: 'yard', id: 'p1-70' });
  assert.ok(store.dispatch({ type: 'setLevel', level: 2 }).ok);
  put(store, 'main', 'chair', 7, 0);
  assert.equal(store.dispatch({ type: 'setLevel', level: 1 }).ok, false);
});

test('바닥재, 벽지, 겉모습은 목록에 있는 것만 고를 수 있다', () => {
  const { store } = setup();
  assert.ok(store.dispatch({ type: 'setFinish', space: 'main', slot: 'floor', value: 'checker' }).ok);
  assert.equal(store.dispatch({ type: 'setFinish', space: 'main', slot: 'floor', value: 'lava' }).ok, false);
  assert.ok(store.dispatch({ type: 'setExterior', slot: 'roof', value: 'slate' }).ok);
  assert.equal(store.dispatch({ type: 'setExterior', slot: 'roof', value: 'gold' }).ok, false);
  assert.equal(store.state.spaces.main.floor, 'checker');
  assert.equal(store.state.house.roof, 'slate');
});

test('ID 는 플레이어마다 겹치지 않게 이어서 발급된다', () => {
  const store = sampleStore();
  const used = new Set([...Object.keys(store.state.spaces.main.objects), ...Object.keys(store.state.spaces.yard.objects)]);
  const again = createStore(store.state, 'p1');
  assert.equal(used.has(again.nextId()), false);
  assert.equal(createStore(store.state, 'p2').nextId(), 'p2-1');
});

// ---- 올려놓는 소품 ----
const hang = (store, part, wall, i, id = store.nextId()) => store.dispatch({ type: 'placeObject', space: 'main', id, part, wall, i });
const where = (store, id) => { const o = store.state.spaces.main.objects[id]; return o && [o.x, o.y, o.rot]; };

test('소품은 탁자나 수납장 위에만 놓인다', () => {
  const { store } = setup();
  assert.equal(put(store, 'main', 'books', 1, 1).ok, false); // 맨바닥
  put(store, 'main', 'chair', 1, 1);
  assert.equal(put(store, 'main', 'books', 1, 1).ok, false); // 의자 위
  put(store, 'main', 'table', 3, 2);
  assert.ok(put(store, 'main', 'books', 3, 2).ok);
  assert.equal(put(store, 'main', 'photo', 3, 2).ok, false); // 같은 칸에 소품 둘
  assert.ok(put(store, 'main', 'photo', 4, 3).ok);
});

test('가구를 옮기거나 돌리면 위의 소품이 따라간다', () => {
  const { store } = setup();
  put(store, 'main', 'cabinet', 0, 0, 0, 'p1-10'); // 2 x 1 칸
  put(store, 'main', 'books', 0, 0, 0, 'p1-11');
  put(store, 'main', 'photo', 1, 0, 0, 'p1-12');
  assert.ok(store.dispatch({ type: 'moveObject', space: 'main', id: 'p1-10', x: 3, y: 2, rot: 0 }).ok);
  assert.deepEqual(where(store, 'p1-11'), [3, 2, 0]);
  assert.deepEqual(where(store, 'p1-12'), [4, 2, 0]);
  // 돌리면 1 x 2 칸이 되고 소품도 수납장 위에 남는다
  assert.ok(store.dispatch({ type: 'moveObject', space: 'main', id: 'p1-10', x: 3, y: 2, rot: 1 }).ok);
  const cells = [where(store, 'p1-11'), where(store, 'p1-12')].map(([x, y]) => `${x},${y}`).sort();
  assert.deepEqual(cells, ['3,2', '3,3']);
  assert.equal(where(store, 'p1-11')[2], 1);
  for (const id of ['p1-11', 'p1-12']) assert.equal(store.state.spaces.main.objects[id].on, 'p1-10');
});

test('네 번 돌리면 소품이 제자리로 돌아온다', () => {
  const { store } = setup();
  put(store, 'main', 'table', 2, 2, 0, 'p1-20');
  put(store, 'main', 'books', 3, 2, 0, 'p1-21');
  for (let r = 1; r <= 4; r++) store.dispatch({ type: 'moveObject', space: 'main', id: 'p1-20', x: 2, y: 2, rot: r % 4 });
  assert.deepEqual(where(store, 'p1-21'), [3, 2, 0]);
});

test('가구를 치우면 위의 소품도 함께 치워지고, 되돌리면 함께 돌아온다', () => {
  const { store, history } = setup();
  put(store, 'main', 'table', 2, 2, 0, 'p1-30');
  put(store, 'main', 'books', 2, 2, 0, 'p1-31');
  put(store, 'main', 'photo', 3, 3, 2, 'p1-32');
  const before = snapshot(store);
  history.run([{ type: 'removeObject', space: 'main', id: 'p1-30' }]);
  assert.equal(Object.keys(store.state.spaces.main.objects).length, 0);
  history.undo();
  assert.deepEqual(store.state, before);
});

test('소품이 올라간 가구를 옮긴 것을 되돌리면 소품도 원래 자리로 간다', () => {
  const { store, history } = setup();
  put(store, 'main', 'cabinet', 0, 0, 0, 'p1-40');
  put(store, 'main', 'books', 1, 0, 0, 'p1-41');
  const before = snapshot(store);
  history.run([{ type: 'moveObject', space: 'main', id: 'p1-40', x: 2, y: 3, rot: 3 }]);
  history.undo();
  assert.deepEqual(store.state, before);
});

// ---- 벽에 거는 것 ----
test('벽에 걸 수 있고, 창문과 문과 이미 걸린 자리에는 걸 수 없다', () => {
  const { store } = setup();
  assert.ok(hang(store, 'frame', 'W', 2).ok);
  assert.equal(hang(store, 'frame_small', 'W', 2).ok, false); // 이미 걸림
  assert.equal(hang(store, 'frame', 'N', 3).ok, false); // 창문
  assert.equal(hang(store, 'frame_wide', 'N', 2).ok, false); // 두 칸짜리가 창문에 걸침
  assert.ok(hang(store, 'frame_wide', 'N', 0).ok);
  assert.equal(hang(store, 'frame', 'S', 2).ok, false); // 문
  assert.equal(hang(store, 'frame', 'E', 6).ok, false); // 벽 밖
  assert.equal(store.dispatch({ type: 'placeObject', space: 'yard', id: 'p1-99', part: 'frame', wall: 'N', i: 0 }).ok, false); // 마당
});

test('벽에 건 것을 다른 벽으로 옮기고 되돌린다', () => {
  const { store, history } = setup();
  hang(store, 'shelf', 'N', 0, 'p1-50');
  const before = snapshot(store);
  history.run([{ type: 'moveObject', space: 'main', id: 'p1-50', wall: 'E', i: 4 }]);
  assert.equal(store.state.spaces.main.objects['p1-50'].wall, 'E');
  assert.equal(store.dispatch({ type: 'moveObject', space: 'main', id: 'p1-50', wall: 'E', i: 5 }).ok, false); // 두 칸짜리가 벽 끝을 넘음
  history.undo();
  assert.deepEqual(store.state, before);
});

test('집을 키워도 벽에 건 것은 그 벽에 남고, 방이 줄면 벽 밖의 것 때문에 줄이지 않는다', () => {
  const { store } = setup();
  hang(store, 'frame', 'E', 5, 'p1-60');
  assert.ok(store.dispatch({ type: 'setLevel', level: 2 }).ok);
  assert.deepEqual([store.state.spaces.main.objects['p1-60'].wall, store.state.spaces.main.objects['p1-60'].i], ['E', 5]);
  hang(store, 'frame', 'E', 7, 'p1-61');
  assert.equal(store.dispatch({ type: 'setLevel', level: 1 }).ok, false);
});

// ---- 되돌리기 ----
test('놓기, 옮기기, 치우기를 되돌리고 다시 한다', () => {
  const { store, history } = setup();
  const s0 = snapshot(store);
  history.run([{ type: 'placeObject', space: 'main', id: 'p1-1', part: 'bed', x: 0, y: 0, rot: 0 }]);
  const s1 = snapshot(store);
  history.run([{ type: 'moveObject', space: 'main', id: 'p1-1', x: 3, y: 1, rot: 1 }]);
  const s2 = snapshot(store);
  history.run([{ type: 'removeObject', space: 'main', id: 'p1-1' }]);
  history.undo(); assert.deepEqual(store.state, s2);
  history.undo(); assert.deepEqual(store.state, s1);
  history.undo(); assert.deepEqual(store.state, s0);
  history.redo(); history.redo(); assert.deepEqual(store.state, s2);
});

test('바닥재, 겉모습, 집 키우기를 되돌린다', () => {
  const { store, history } = setup();
  const s0 = snapshot(store);
  history.run([{ type: 'setFinish', space: 'main', slot: 'wall', value: 'navy' }]);
  history.run([{ type: 'setExterior', slot: 'door', value: 'red' }]);
  history.run([{ type: 'setLevel', level: 2 }]);
  assert.equal(store.state.house.level, 2);
  history.undo(); history.undo(); history.undo();
  assert.deepEqual(store.state, s0);
});

test('모두 치우기는 한 번에 되돌린다', () => {
  const store = sampleStore();
  const history = createHistory(store);
  const before = snapshot(store);
  history.run(clearCommands(store.state, 'main'));
  assert.equal(Object.keys(store.state.spaces.main.objects).length, 0);
  assert.ok(Object.keys(store.state.spaces.yard.objects).length > 0); // 마당은 그대로
  history.undo();
  assert.deepEqual(store.state, before);
});

test('그사이 상태가 바뀌어 맞지 않으면 아무것도 바꾸지 않고 거절한다', () => {
  const { store, history } = setup();
  history.run([
    { type: 'placeObject', space: 'main', id: 'p1-1', part: 'chair', x: 1, y: 1, rot: 0 },
    { type: 'placeObject', space: 'main', id: 'p1-2', part: 'plant', x: 2, y: 2, rot: 0 },
  ]);
  store.dispatch({ type: 'removeObject', space: 'main', id: 'p1-1' });
  const before = snapshot(store);
  assert.equal(history.undo().ok, false);
  assert.deepEqual(store.state, before);
  assert.equal(history.status().canUndo, false);
});

// ---- 저장 ----
function fakeStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } };
}

test('저장했다가 불러오면 집과 가구와 고른 것들이 그대로다', () => {
  const store = sampleStore();
  store.dispatch({ type: 'setLevel', level: 2 });
  store.dispatch({ type: 'setLevel', level: 3 });
  store.dispatch({ type: 'setFinish', space: 'main', slot: 'floor', value: 'walnut' });
  store.dispatch({ type: 'setFinish', space: 'main', slot: 'wall', value: 'rose' });
  store.dispatch({ type: 'setExterior', slot: 'siding', value: 'sky' });
  put(store, 'main', 'couch', 6, 6);
  put(store, 'main', 'table_lamp', 3, 3);
  hang(store, 'frame_small', 'S', 8);
  const result = parse(serialize(store.state, { pos: { x: 3.5, z: 7.25 }, place: 'main' }));
  assert.ok(result.ok);
  assert.equal(result.dropped, 0);
  assert.deepEqual(result.state, store.state);
  assert.deepEqual(result.pos, { x: 3.5, z: 7.25 });
  assert.equal(result.place, 'main');
});

test('없어진 가구와 규칙에 맞지 않는 항목은 빼고 불러온다', () => {
  const store = sampleStore();
  const data = JSON.parse(serialize(store.state));
  data.state.spaces.main.objects['p1-900'] = { id: 'p1-900', part: 'piano', x: 0, y: 0, rot: 0 };
  data.state.spaces.main.objects['p1-901'] = { id: 'p1-901', part: 'chair', x: 0, y: 0, rot: 0 }; // 침대와 겹침
  data.state.spaces.yard.objects['p1-902'] = { id: 'p1-902', part: 'chair', x: 99, y: 99, rot: 0 };
  data.state.spaces.main.floor = 'lava';
  const result = parse(JSON.stringify(data));
  assert.ok(result.ok);
  assert.equal(result.dropped, 4);
  assert.deepEqual(result.state, store.state);
});

test('깨진 내용, 예전 판, 더 새로운 버전은 거절한다', () => {
  assert.equal(parse('{{{').ok, false);
  assert.equal(parse('{"hello":1}').ok, false);
  assert.equal(parse(JSON.stringify({ format: 'house-lab', version: 1, state: { walls: {} } })).ok, false);
  assert.equal(parse(JSON.stringify({ format: 'house-lab', version: SAVE_VERSION + 1, state: {} })).ok, false);
});

test('저장소에 쓰고 읽는다. 읽지 못한 내용은 옆에 남기고, 저장소가 없어도 멈추지 않는다', () => {
  const storage = fakeStorage();
  const saver = createSaver(storage);
  assert.equal(saver.load(), null);
  const store = sampleStore();
  assert.equal(saver.save(store.state, {}), true);
  assert.deepEqual(saver.load().state, store.state);
  storage.setItem(SAVE_KEY, 'not json');
  assert.equal(saver.load().ok, false);
  assert.equal(storage.getItem(`${SAVE_KEY}:broken`), 'not json');
  const none = createSaver(null);
  assert.equal(none.load(), null);
  assert.equal(none.save(createState(), {}), false);
});

// ---- 앉는 자리 ----
const round = (n) => Math.round(n * 100) / 100;

test('의자의 앉는 자리는 칸의 가운데이고, 의자가 보는 쪽을 본다', () => {
  for (let rot = 0; rot < 4; rot++) {
    const [spot, ...rest] = seatSpots({ part: 'chair', x: 2, y: 3, rot });
    assert.equal(rest.length, 0);
    assert.deepEqual([spot.x, spot.z, spot.y], [2.5, 3.5, 0.5]);
    assert.equal(spot.face, rot * Math.PI / 2);
  }
  assert.deepEqual(seatSpots({ part: 'table', x: 0, y: 0, rot: 0 }), []); // 앉을 수 없는 가구
});

test('소파에는 세 자리가 있고, 돌리면 자리도 함께 돈다', () => {
  // 앞을 볼 때(rot 0)는 가로로 나란히, 조금 앞쪽에 앉는다
  const front = seatSpots({ part: 'couch', x: 4, y: 6, rot: 0 });
  assert.deepEqual(front.map((p) => round(p.x)), [4.72, 5.5, 6.28]);
  assert.ok(front.every((p) => round(p.z) === 7.11 && p.z > 7 && p.face === 0));
  // 서쪽을 볼 때(rot 3)는 세로로 나란히, 서쪽으로 조금 나와 앉는다
  const west = seatSpots({ part: 'couch', x: 4, y: 6, rot: 3 });
  assert.deepEqual(west.map((p) => round(p.z)), [6.72, 7.5, 8.28]);
  assert.ok(west.every((p) => round(p.x) === 4.89 && p.x < 5));
  // 뒤를 볼 때(rot 2)는 좌우가 뒤집힌다
  const back = seatSpots({ part: 'couch', x: 4, y: 6, rot: 2 });
  assert.deepEqual(back.map((p) => round(p.x)), [6.28, 5.5, 4.72]);
});

test('앉으러 갈 때는 의자의 앞, 옆, 뒤 순서로 설 칸을 찾는다', () => {
  // 동쪽을 보는 의자: 앞은 동쪽 칸, 뒤는 서쪽 칸
  const chair = { part: 'chair', x: 2, y: 2, rot: 1 };
  const cells = seatApproach(chair, seatSpots(chair)[0]);
  assert.deepEqual(cells[0], [3, 2]);
  assert.deepEqual(cells[3], [1, 2]);
  assert.deepEqual(cells.slice(1, 3).sort(), [[2, 1], [2, 3]]);
  // 소파의 오른쪽 자리: 앞쪽 칸 가운데 그 자리에 가장 가까운 칸이 먼저다
  const couch = { part: 'couch', x: 4, y: 6, rot: 0 };
  const right = seatSpots(couch)[2];
  const around = seatApproach(couch, right);
  assert.deepEqual(around.slice(0, 3), [[6, 8], [5, 8], [4, 8]]);
  assert.equal(around.length, 10); // 둘레의 칸 전부 (가로 3칸 x 2 + 세로 2칸 x 2)
  assert.ok(!around.some(([x, y]) => x >= 4 && x < 7 && y >= 6 && y < 8)); // 소파가 차지한 칸은 없다
});
