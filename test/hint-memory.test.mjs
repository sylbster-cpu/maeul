// 처음 몇 번만 보이는 걷기 안내의 기억 (6단계 HUD A, src/hint-memory.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHintMemory, HINT_KEY, HINT_LIMIT } from '../src/hint-memory.js';

const fakeStorage = (init = {}) => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};

test('안내가 나온 접속을 HINT_LIMIT 번까지 세고, 그 뒤 접속부터는 감춘다', () => {
  const storage = fakeStorage();
  for (let visit = 1; visit <= HINT_LIMIT; visit++) {
    const memory = createHintMemory(storage);
    assert.equal(memory.shows('walkYard'), true, `${visit}번째 접속`);
    assert.equal(memory.shows('walkYard'), true, '같은 접속에서 다시 물어도 센 수가 늘지 않는다');
    assert.equal(memory.counts.walkYard, visit);
  }
  const later = createHintMemory(storage);
  assert.equal(later.shows('walkYard'), false);
  assert.equal(later.counts.walkYard, HINT_LIMIT, '감춘 접속은 세지 않는다');
});

test('안내마다 따로 센다. 방에 처음 들어간 접속에는 방 안내가 보인다', () => {
  const storage = fakeStorage({ [HINT_KEY]: JSON.stringify({ walkYard: HINT_LIMIT }) });
  const memory = createHintMemory(storage);
  assert.equal(memory.shows('walkYard'), false);
  assert.equal(memory.shows('walkRoom'), true);
  assert.deepEqual(JSON.parse(storage.data.get(HINT_KEY)), { walkYard: HINT_LIMIT, walkRoom: 1 });
});

test('"처음 안내 다시 보기"는 센 것을 지우고 이번 접속부터 다시 보인다', () => {
  const storage = fakeStorage({ [HINT_KEY]: JSON.stringify({ walkYard: 9, seated: 9 }) });
  const memory = createHintMemory(storage);
  assert.equal(memory.shows('walkYard'), false);
  memory.reset();
  assert.equal(memory.shows('walkYard'), true);
  assert.deepEqual(JSON.parse(storage.data.get(HINT_KEY)), { walkYard: 1 });
});

test('안내가 알려 준 것을 해 보면 이번 접속에서는 접고, 센 수는 그대로다', () => {
  const storage = fakeStorage();
  const memory = createHintMemory(storage);
  assert.equal(memory.shows('walkYard'), true);
  memory.done('walkYard');
  assert.equal(memory.shows('walkYard'), false);
  assert.equal(memory.counts.walkYard, 1);
  memory.done('walkRoom'); // 아직 나오지 않은 안내를 먼저 해 보면 세지 않고 접는다
  assert.equal(memory.shows('walkRoom'), false);
  assert.equal(memory.counts.walkRoom, undefined);
  assert.equal(createHintMemory(storage).shows('walkYard'), true, '다음 접속에는 다시 보인다(세 번까지)');
});

test('저장소가 없거나 깨졌거나 쓰기가 막혀도 안내는 보인다', () => {
  assert.equal(createHintMemory(null).shows('walkYard'), true);
  assert.equal(createHintMemory(fakeStorage({ [HINT_KEY]: '{깨짐' })).shows('walkYard'), true);
  assert.equal(createHintMemory(fakeStorage({ [HINT_KEY]: '[1,2]' })).shows('walkYard'), true);
  assert.equal(createHintMemory(fakeStorage({ [HINT_KEY]: JSON.stringify({ walkYard: -1, seated: 'x' }) })).shows('walkYard'), true);
  const blocked = { getItem: () => { throw new Error('막힘'); }, setItem: () => { throw new Error('막힘'); } };
  assert.equal(createHintMemory(blocked).shows('walkYard'), true);
});

test('집 저장 열쇠와 섞지 않는다', () => {
  const storage = fakeStorage();
  createHintMemory(storage).shows('walkYard');
  assert.deepEqual([...storage.data.keys()], [HINT_KEY]);
});
