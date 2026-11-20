import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore } from '../src/state.js';
import { SAVE_KEY, serialize, parse } from '../src/save.js';
import { PRE_IMPORT_KEY, hasPreviousHouse, importSharedHouse, restorePreviousHouse } from '../src/house-transfer.js';

function fakeStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  let blockedKey = null;
  return {
    entries,
    blockWrite(key) { blockedKey = key; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) {
      if (key === blockedKey) throw Error('QuotaExceededError');
      entries.set(key, String(value));
    },
    removeItem(key) { entries.delete(key); },
  };
}
function house(roof) {
  const store = createStore(createState(), 'p1');
  assert.equal(store.dispatch({ type: 'setExterior', slot: 'roof', value: roof }).ok, true);
  return store.state;
}

test('공유 집을 가져오면 현재 집을 정확한 원문으로 별도 보관하고 새 집을 저장한다', () => {
  const original = serialize(house('slate'), { place: 'main', pos: { x: 3.4, z: 5.1 } });
  const storage = fakeStorage({ [SAVE_KEY]: original, 'firebase:authUser': 'unchanged' });
  const imported = house('moss');
  const clone = structuredClone(imported);
  const result = importSharedHouse(storage, imported);
  assert.equal(result.house.roof, 'moss');
  assert.deepEqual(imported, clone);
  assert.equal(hasPreviousHouse(storage), true);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, original);
  assert.equal(parse(storage.getItem(SAVE_KEY)).state.house.roof, 'moss');
  assert.equal(storage.getItem('firebase:authUser'), 'unchanged');
});

test('복구 버튼은 가져오기 전의 집 JSON을 그대로 돌리고 백업 표시를 해제한다', () => {
  const oldSave = serialize(house('slate'), { place: 'main', pos: { x: 2, z: 4 } });
  const storage = fakeStorage({ [SAVE_KEY]: oldSave });
  importSharedHouse(storage, house('moss'));
  assert.equal(restorePreviousHouse(storage), true);
  assert.equal(storage.getItem(SAVE_KEY), oldSave);
  assert.equal(hasPreviousHouse(storage), false);
});

test('기존 집 저장이 없는 브라우저에서는 이전 상태가 없음을 기록하고 다시 초기 집으로 돌아간다', () => {
  const storage = fakeStorage();
  importSharedHouse(storage, house('slate'));
  assert.equal(storage.getItem(SAVE_KEY) !== null, true);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, null);
  restorePreviousHouse(storage);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.equal(hasPreviousHouse(storage), false);
});

test('이전 집의 백업이 있으면 다른 집으로 다시 덮어쓸 수 없게 막는다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  importSharedHouse(storage, house('moss'));
  const current = storage.getItem(SAVE_KEY);
  assert.throws(() => importSharedHouse(storage, house('terracotta')), /백업이 이미/);
  assert.equal(storage.getItem(SAVE_KEY), current);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, original);
});

test('손상되거나 규칙에 맞지 않는 집을 가져오려 해도 현재 집은 변경되지 않는다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  const broken = house('terracotta');
  broken.spaces.main.floor = 'constructor';
  assert.throws(() => importSharedHouse(storage, broken), /맞지 않습니다/);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), null);
});

test('백업 저장이 막혀 있으면 현재 집을 교체하지 않는다', () => {
  const oldSave = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: oldSave });
  storage.blockWrite(PRE_IMPORT_KEY);
  assert.throws(() => importSharedHouse(storage, house('moss')), /백업하지 못했습니다/);
  assert.equal(storage.getItem(SAVE_KEY), oldSave);
});

test('새 집 저장에 실패하면 원래 집을 유지하고 불완전한 백업 표시를 지운다', () => {
  const oldSave = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: oldSave });
  storage.blockWrite(SAVE_KEY);
  assert.throws(() => importSharedHouse(storage, house('moss')), /저장하지 못했습니다/);
  assert.equal(storage.getItem(SAVE_KEY), oldSave);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), null);
});

test('기존 백업 데이터가 손상되면 복구 불가를 분명히 알리고 새 집을 덮어쓰지 않는다', () => {
  const oldSave = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: oldSave, [PRE_IMPORT_KEY]: '{broken' });
  assert.throws(() => importSharedHouse(storage, house('moss')), /백업이 손상/);
  assert.throws(() => restorePreviousHouse(storage), /백업이 손상/);
  assert.equal(storage.getItem(SAVE_KEY), oldSave);
});

test('저장소가 없는 브라우저에서는 복사를 시작하지 않는다', () => {
  assert.throws(() => importSharedHouse(null, house('moss')), /저장할 수 없습니다/);
  assert.equal(hasPreviousHouse(null), false);
  assert.throws(() => restorePreviousHouse(null), /저장할 수 없습니다/);
});
