import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore, cellKey } from '../src/state.js';
import { sampleCommands } from '../src/sample.js';

function room() {
  const store = createStore(createState(), 'p1');
  for (const cmd of sampleCommands(store)) assert.equal(store.dispatch(cmd).ok, true, JSON.stringify(cmd));
  return store;
}

// 현재 캐릭터의 길 찾기와 같은 4방향 가구 점유 기준으로 통로 연결성을 검사한다.
function canWalk(store, start, end) {
  const [w, h] = [6, 6];
  const occupied = store.derived.occ.main.furniture;
  const key = (p) => cellKey(p[0], p[1]);
  const seen = new Set([key(start)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    if (x === end[0] && z === end[1]) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, zz = z + dz, k = cellKey(xx, zz);
      if (xx < 0 || zz < 0 || xx >= w || zz >= h || seen.has(k) || occupied.has(k)) continue;
      seen.add(k);
      queue.push([xx, zz]);
    }
  }
  return false;
}

test('새로 시작하는 작은 방에서 현관에서 탁자 반대편까지 이어진 길이 있다', () => {
  const store = room();
  assert.equal(store.derived.occ.main.furniture.has(cellKey(5, 3)), false, '탁자 오른쪽 길을 비워 둔다');
  assert.equal(canWalk(store, [3, 5], [3, 1]), true);
  assert.equal(canWalk(store, [3, 1], [3, 5]), true);
});

test('기존 방의 가구 배치는 강제로 바꾸지 않고, 막힌 길만 구분할 수 있다', () => {
  const store = room();
  const chair = Object.values(store.state.spaces.main.objects).find(
    (obj) => obj.part === 'chair' && obj.x === 4 && obj.y === 4);
  assert.ok(chair);
  assert.equal(store.dispatch({ type: 'moveObject', space: 'main', id: chair.id, x: 5, y: 3, rot: 3 }).ok, true);
  assert.equal(canWalk(store, [3, 5], [3, 1]), false, '이전 의자 배치는 실제 통로가 막혀 있다');
  assert.equal(Object.values(store.state.spaces.main.objects).some(
    (obj) => obj.part === 'chair' && obj.x === 5 && obj.y === 3), true, '사용자가 선택한 배치를 유지한다');
});
