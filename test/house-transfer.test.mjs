import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore } from '../src/state.js';
import { SAVE_KEY, serialize, parse } from '../src/save.js';
import { PRE_IMPORT_KEY, TRANSFER_JOURNAL_KEY, hasPreviousHouse,
  importSharedHouse, restorePreviousHouse, recoverInterruptedHouseTransfer,
  createHouseSaveGuard } from '../src/house-transfer.js';

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
  const result = store.dispatch({ type: 'setExterior', slot: 'roof', value: roof });
  assert.ok(result.ok || result.reason?.startsWith('이미 그'), '기존 기본 지붕색도 허용한다');
  return store.state;
}

test('집 가져오기는 기존 저장의 원문과 온라인 계정 저장을 보존한다', () => {
  const original = serialize(house('slate'), { place: 'main', pos: { x: 3.4, z: 5.1 } });
  const storage = fakeStorage({ [SAVE_KEY]: original, 'firebase:authUser': 'unchanged' });
  const imported = house('moss'), clone = structuredClone(imported);
  const state = importSharedHouse(storage, imported);
  assert.equal(state.house.roof, 'moss');
  assert.deepEqual(imported, clone);
  assert.equal(hasPreviousHouse(storage), true);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, original);
  assert.equal(parse(storage.getItem(SAVE_KEY)).state.house.roof, 'moss');
  assert.equal(storage.getItem('firebase:authUser'), 'unchanged');
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('두 집을 맞바꾼 뒤에도 이전에 사용한 집을 보관해 반복 교환할 수 있다', () => {
  const original = serialize(house('slate'), { place: 'main', pos: { x: 2, z: 4 } });
  const storage = fakeStorage({ [SAVE_KEY]: original });
  importSharedHouse(storage, house('moss'));
  const imported = storage.getItem(SAVE_KEY);
  assert.equal(restorePreviousHouse(storage), true);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, imported);
  assert.equal(hasPreviousHouse(storage), true);
  assert.equal(restorePreviousHouse(storage), true);
  assert.equal(storage.getItem(SAVE_KEY), imported);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, original);
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('복사 전 저장된 집이 없었다면 null로 되돌리는 버튼이 나타나지 않는다', () => {
  const storage = fakeStorage();
  importSharedHouse(storage, house('slate'));
  const current = storage.getItem(SAVE_KEY);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, null);
  assert.equal(hasPreviousHouse(storage), false);
  assert.throws(() => restorePreviousHouse(storage), /맞바꿀 이전 집이 없습니다/);
  assert.equal(storage.getItem(SAVE_KEY), current);
});

test('이미 두 집을 보관한 상태에서는 확인 없이 세 번째 집으로 덮어쓰지 않는다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  importSharedHouse(storage, house('moss'));
  const current = storage.getItem(SAVE_KEY);
  assert.throws(() => importSharedHouse(storage, house('terracotta')), /보관된 다른 집이 이미/);
  assert.equal(storage.getItem(SAVE_KEY), current);
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, original);
});

// 2026-11-22 고침(PR #15 Claude 검토 1번): 한 브라우저가 한 번만 가져올 수 있던 막다른 길
test('원래 집이 없던 브라우저도 두 번째 링크를 가져올 수 있고, 그사이 꾸민 집은 보관된다', () => {
  const storage = fakeStorage();
  importSharedHouse(storage, house('slate'));
  const first = storage.getItem(SAVE_KEY);
  assert.equal(hasPreviousHouse(storage), false, '보관된 집은 아직 없다');
  const state = importSharedHouse(storage, house('moss'));
  assert.equal(state.house.roof, 'moss');
  assert.equal(parse(storage.getItem(SAVE_KEY)).state.house.roof, 'moss');
  assert.equal(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous, first, '첫 번째로 가져온 집을 보관한다');
  assert.equal(hasPreviousHouse(storage), true);
  assert.equal(restorePreviousHouse(storage), true, '보관된 집과 맞바꿀 수 있다');
  assert.equal(storage.getItem(SAVE_KEY), first);
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('보관된 집이 있을 때 확인하고 가져오면 보관된 집은 그대로 두고 지금 집만 바꾼다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  importSharedHouse(storage, house('moss'));
  restorePreviousHouse(storage); // 지금: 원래 집, 보관: moss
  const keptRaw = storage.getItem(PRE_IMPORT_KEY);
  const kept = JSON.parse(keptRaw).previous;
  assert.equal(parse(kept).state.house.roof, 'moss');
  const state = importSharedHouse(storage, house('terracotta'), { replaceCurrent: true });
  assert.equal(state.house.roof, 'terracotta');
  assert.equal(parse(storage.getItem(SAVE_KEY)).state.house.roof, 'terracotta');
  assert.equal(storage.getItem(PRE_IMPORT_KEY), keptRaw, '보관된 집의 원문을 건드리지 않는다');
  // 다시 맞바꾸고 또 가져오기: 보관 칸이 차 있어도 막히지 않는다
  assert.equal(restorePreviousHouse(storage), true);
  assert.equal(parse(storage.getItem(SAVE_KEY)).state.house.roof, 'moss');
  importSharedHouse(storage, house('slate'), { replaceCurrent: true });
  assert.equal(parse(storage.getItem(SAVE_KEY)).state.house.roof, 'slate');
  assert.equal(parse(JSON.parse(storage.getItem(PRE_IMPORT_KEY)).previous).state.house.roof, 'terracotta');
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('손상된 백업이 있으면 확인하고 가져와도 아무것도 바꾸지 않는다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original, [PRE_IMPORT_KEY]: '{broken' });
  assert.throws(() => importSharedHouse(storage, house('moss'), { replaceCurrent: true }), /손상/);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), '{broken');
});

test('손상되거나 현재 게임 규칙을 통과하지 못하는 집을 가져오지 않는다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  const broken = house('terracotta');
  broken.spaces.main.floor = 'constructor';
  assert.throws(() => importSharedHouse(storage, broken), /맞지 않습니다/);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), null);
});

test('백업 키 저장 실패 시 원래 집과 임시 기록을 그대로 정리한다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  storage.blockWrite(PRE_IMPORT_KEY);
  assert.throws(() => importSharedHouse(storage, house('moss')), /집을 저장하지 못했습니다/);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), null);
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('집 저장 키가 막혀도 이전 집과 백업을 잃지 않는다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  storage.blockWrite(SAVE_KEY);
  assert.throws(() => importSharedHouse(storage, house('moss')), /집을 저장하지 못했습니다/);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), null);
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('교환 기록을 쓰지 못하면 어떠한 집 데이터도 수정하지 않는다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original });
  storage.blockWrite(TRANSFER_JOURNAL_KEY);
  assert.throws(() => importSharedHouse(storage, house('moss')), /보관할 공간/);
  assert.equal(storage.getItem(SAVE_KEY), original);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), null);
});

test('손상된 백업을 임의로 덮어쓰지 않고 사용자에게 오류를 알린다', () => {
  const original = serialize(house('slate'));
  const storage = fakeStorage({ [SAVE_KEY]: original, [PRE_IMPORT_KEY]: '{broken' });
  assert.equal(hasPreviousHouse(storage), true, '복구 버튼을 통해 원인을 알려 준다');
  assert.throws(() => importSharedHouse(storage, house('moss')), /백업이 손상/);
  assert.throws(() => restorePreviousHouse(storage), /백업이 손상/);
  assert.equal(storage.getItem(SAVE_KEY), original);
});

test('백업 교환 중 브라우저가 종료되면 두 키를 원래 값으로 복구한다', () => {
  const beforeSave = serialize(house('slate')), afterSave = serialize(house('moss'));
  const beforeBackup = JSON.stringify({ version: 1, previous: afterSave });
  const afterBackup = JSON.stringify({ version: 1, previous: beforeSave });
  const journal = JSON.stringify({
    version: 1, before: { save: beforeSave, backup: beforeBackup },
    after: { save: afterSave, backup: afterBackup },
  });
  // 백업까지만 교체되고 집은 이전 상태로 남은 시점에 앱이 종료된 경우.
  const storage = fakeStorage({
    [SAVE_KEY]: beforeSave, [PRE_IMPORT_KEY]: afterBackup, [TRANSFER_JOURNAL_KEY]: journal,
  });
  assert.equal(recoverInterruptedHouseTransfer(storage), true);
  assert.equal(storage.getItem(SAVE_KEY), beforeSave);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), beforeBackup);
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('집 교환은 끝났고 임시 기록만 남았다면 완료 상태를 유지한다', () => {
  const beforeSave = serialize(house('slate')), afterSave = serialize(house('moss'));
  const beforeBackup = JSON.stringify({ version: 1, previous: afterSave });
  const afterBackup = JSON.stringify({ version: 1, previous: beforeSave });
  const journal = JSON.stringify({
    version: 1, before: { save: beforeSave, backup: beforeBackup },
    after: { save: afterSave, backup: afterBackup },
  });
  const storage = fakeStorage({
    [SAVE_KEY]: afterSave, [PRE_IMPORT_KEY]: afterBackup, [TRANSFER_JOURNAL_KEY]: journal,
  });
  assert.equal(recoverInterruptedHouseTransfer(storage), true);
  assert.equal(storage.getItem(SAVE_KEY), afterSave);
  assert.equal(storage.getItem(PRE_IMPORT_KEY), afterBackup);
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
});

test('교환 기록이 있는데 다른 탭의 새 값이 있으면 자동으로 덮어쓰지 않는다', () => {
  const beforeSave = serialize(house('slate')), afterSave = serialize(house('moss'));
  const thirdSave = serialize(house('terracotta'));
  const journal = JSON.stringify({
    version: 1, before: { save: beforeSave, backup: null },
    after: { save: afterSave, backup: JSON.stringify({ version: 1, previous: beforeSave }) },
  });
  const storage = fakeStorage({ [SAVE_KEY]: thirdSave, [TRANSFER_JOURNAL_KEY]: journal });
  assert.throws(() => recoverInterruptedHouseTransfer(storage), /자동 저장을 멈췄습니다/);
  assert.equal(storage.getItem(SAVE_KEY), thirdSave);
  assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), journal);
});

test('다른 탭이 집 저장·백업·교환 기록을 바꾸면 예전 탭은 저장을 중지할 수 있다', () => {
  const original = serialize(house('slate')), storage = fakeStorage({ [SAVE_KEY]: original });
  const guard = createHouseSaveGuard(storage);
  assert.equal(guard.isCurrent(), true);
  storage.setItem(SAVE_KEY, serialize(house('moss')));
  assert.equal(guard.isCurrent(), false);
  guard.refresh(); // 같은 탭의 정상적인 저장 성공 뒤에만 사용
  assert.equal(guard.isCurrent(), true);
  storage.setItem(PRE_IMPORT_KEY, JSON.stringify({ version: 1, previous: original }));
  assert.equal(guard.isCurrent(), false);
  guard.refresh();
  storage.setItem(TRANSFER_JOURNAL_KEY, 'pending');
  assert.equal(guard.isCurrent(), false, '교환 중인 저장소는 새 자동 저장을 허용하지 않는다');
});

test('저장소가 없는 브라우저에서는 가져오기나 복구를 시작하지 않는다', () => {
  assert.throws(() => importSharedHouse(null, house('moss')), /저장할 수 없습니다/);
  assert.equal(hasPreviousHouse(null), false);
  assert.throws(() => restorePreviousHouse(null), /저장할 수 없습니다/);
});
test('지금 집이 새 판의 집이면 가져오지 않는다: 보관된 집이 있어도 새 판의 원문을 잃지 않는다 (2026-11-26 GPT 점검)', () => {
  const data = JSON.parse(serialize(house('slate')));
  data.state.spaces.yard.objects.zz = { id: 'zz', part: 'future_thing', x: 1, y: 1, rot: 0, by: 'p1' };
  const newer = JSON.stringify(data); // 확인 창이 떠 있는 사이 다른 탭이 저장한 새 판의 집
  const backup = JSON.stringify({ version: 1, previous: serialize(house('moss')) });
  const storage = fakeStorage({ [SAVE_KEY]: newer, [PRE_IMPORT_KEY]: backup });
  for (const replaceCurrent of [true, false]) {
    assert.throws(() => importSharedHouse(storage, house('moss'), { replaceCurrent }), /더 새로운 판/);
    assert.equal(storage.getItem(SAVE_KEY), newer);
    assert.equal(storage.getItem(PRE_IMPORT_KEY), backup);
    assert.equal(storage.getItem(TRANSFER_JOURNAL_KEY), null);
  }
  // 판 번호가 더 큰 집도 같다
  const later = JSON.stringify({ ...JSON.parse(serialize(house('slate'))), version: 99 });
  const storage2 = fakeStorage({ [SAVE_KEY]: later });
  assert.throws(() => importSharedHouse(storage2, house('moss')), /더 새로운 판/);
  assert.equal(storage2.getItem(SAVE_KEY), later);
  assert.equal(storage2.getItem(PRE_IMPORT_KEY), null);
});
