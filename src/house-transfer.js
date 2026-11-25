// 집 공유 링크(#home=)의 배치만 브라우저에 옮긴다. Firebase 소유권/방명록은 옮기지 않는다.
// 집과 보관본을 교환할 때는 변경 기록을 먼저 저장해 오류·중간 종료 시 원본을 보존한다.
import { SAVE_KEY, serialize, parse, isNewerHouse } from './save.js';

export const PRE_IMPORT_KEY = 'house-lab-web:before-import';
export const TRANSFER_JOURNAL_KEY = 'house-lab-web:transfer-pending';
export const HOUSE_STORAGE_KEYS = Object.freeze([SAVE_KEY, PRE_IMPORT_KEY, TRANSFER_JOURNAL_KEY]);

function storageAvailable(storage) {
  if (!storage) throw new Error('이 브라우저에서는 집을 저장할 수 없습니다');
  return storage;
}

function rawPair(storage) {
  return { save: storage.getItem(SAVE_KEY), backup: storage.getItem(PRE_IMPORT_KEY) };
}

function samePair(a, b) {
  return a.save === b.save && a.backup === b.backup;
}

function validPair(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    (value.save === null || typeof value.save === 'string') &&
    (value.backup === null || typeof value.backup === 'string');
}

function setRaw(storage, key, value) {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

function readBackup(storage) {
  const raw = storage.getItem(PRE_IMPORT_KEY);
  if (raw === null) return null;
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('이전 집 백업이 손상되어 있습니다. 현재 집을 덮어쓰지 않았습니다'); }
  if (!value || value.version !== 1 ||
      !(value.previous === null || typeof value.previous === 'string')) {
    throw new Error('이전 집 백업의 형식이 잘못되었습니다. 현재 집을 덮어쓰지 않았습니다');
  }
  return value;
}

// 백업이 없던 브라우저의 첫 복사에서는 되돌리기를 제공하지 않는다.
// 원래 저장 데이터가 null인 상태를 "집"으로 바꿔 표시하면 복구 시 저장이 사라지기 때문이다.
export function hasPreviousHouse(storage) {
  try { const backup = storage ? readBackup(storage) : null; return backup !== null && backup.previous !== null; }
  catch {
    // 백업이 손상됐을 때는 버튼을 남겨 오류 원인을 볼 수 있게 한다.
    try { return storage?.getItem(PRE_IMPORT_KEY) !== null; } catch { return false; }
  }
}

// 다른 탭이 로컬 집이나 교환 백업을 고쳤을 때 오래된 화면의 자동 저장을 거부한다.
// 같은 탭의 정상적인 자동 저장이 성공했을 때만 refresh()로 기준을 갱신한다.
export function createHouseSaveGuard(storage) {
  const snapshot = () => HOUSE_STORAGE_KEYS.map((key) => storage.getItem(key));
  let expected;
  try { expected = storage ? snapshot() : null; } catch { expected = null; }
  return {
    isCurrent() {
      if (!storage || !expected) return false;
      try {
        const actual = snapshot();
        return actual.every((value, index) => value === expected[index]) &&
          actual[2] === null;
      } catch { return false; }
    },
    refresh() {
      if (!storage) return false;
      try { expected = snapshot(); return true; }
      catch { return false; }
    },
  };
}

function readJournal(storage) {
  const raw = storage.getItem(TRANSFER_JOURNAL_KEY);
  if (raw === null) return null;
  let item;
  try { item = JSON.parse(raw); }
  catch { throw new Error('집 교환 기록을 읽을 수 없습니다. 자동 저장을 중단했습니다'); }
  if (!item || item.version !== 1 || !validPair(item.before) || !validPair(item.after)) {
    throw new Error('집 교환 기록이 손상됐습니다. 자동 저장을 중단했습니다');
  }
  return item;
}

// 비정상 종료 뒤 기록이 남으면 새로 시작할 때 원래 상태를 복구하거나 완료 상태를 확인한다.
// 제3의 탭이 그 사이 다른 내용을 저장했다면 임의로 덮어쓰지 않고 자동 저장을 막는다.
export function recoverInterruptedHouseTransfer(storage) {
  if (!storage) return false;
  const journal = readJournal(storage);
  if (!journal) return false;
  const now = rawPair(storage);
  try {
    if (samePair(now, journal.after)) {
      storage.removeItem(TRANSFER_JOURNAL_KEY);
      return true;
    }
    if (![journal.before.save, journal.after.save].includes(now.save) ||
        ![journal.before.backup, journal.after.backup].includes(now.backup)) {
      throw new Error('다른 탭에서 집 데이터가 바뀌어 교환을 자동 복구할 수 없습니다');
    }
    setRaw(storage, SAVE_KEY, journal.before.save);
    setRaw(storage, PRE_IMPORT_KEY, journal.before.backup);
    storage.removeItem(TRANSFER_JOURNAL_KEY);
    return true;
  } catch {
    throw new Error('집 교환이 중단된 기록이 있습니다. 집을 보존하려고 자동 저장을 멈췄습니다');
  }
}

function commitHouseChange(storage, after, failureMessage) {
  if (storage.getItem(TRANSFER_JOURNAL_KEY) !== null) {
    throw new Error('완료되지 않은 집 교환이 있습니다. 먼저 화면을 새로 고쳐 주세요');
  }
  const before = rawPair(storage);
  const journal = JSON.stringify({ version: 1, before, after });
  try { storage.setItem(TRANSFER_JOURNAL_KEY, journal); }
  catch { throw new Error('집을 안전하게 보관할 공간이 없습니다. 현재 집은 그대로입니다'); }

  try {
    // 백업을 먼저 남긴 뒤 현재 집을 바꾼다. 임시 기록에는 두 원본이 모두 있다.
    setRaw(storage, PRE_IMPORT_KEY, after.backup);
    setRaw(storage, SAVE_KEY, after.save);
  } catch {
    // 저장 공간 부족 등으로 일부만 변경됐으면 원래 값으로 되돌린다.
    // 한 키를 되돌리지 못해도 다른 키의 원본을 되살리는 시도는 계속한다.
    let restored = true;
    try { if (storage.getItem(PRE_IMPORT_KEY) !== before.backup) setRaw(storage, PRE_IMPORT_KEY, before.backup); }
    catch { restored = false; }
    try { if (storage.getItem(SAVE_KEY) !== before.save) setRaw(storage, SAVE_KEY, before.save); }
    catch { restored = false; }
    if (restored) {
      try { storage.removeItem(TRANSFER_JOURNAL_KEY); }
      catch { /* 교환 기록을 남겨 다음 시작에 확인 */ }
    }
    throw new Error(failureMessage);
  }
  // 정리 작업이 실패해도 교환 기록을 남겨 두면 다음 시작에서 완료 여부를 확인한다.
  try { storage.removeItem(TRANSFER_JOURNAL_KEY); } catch { /* 다음 시작에 검사 */ }
}

// 공유 링크의 집을 이 브라우저의 집으로 가져온다. 보관 칸은 하나다.
// - 보관된 집이 없으면(처음이거나, 원래 집 없이 한 번 가져온 브라우저) 지금 집을 보관하고 가져온다.
// - 보관된 집이 있으면 그 집은 그대로 두고 지금 집을 바꾼다. 지금 집이 사라지므로 replaceCurrent 로
//   사용자가 확인했을 때만 한다. 지금 집을 남기고 싶으면 먼저 맞바꿔 보관된 집으로 만들면 된다.
// (2026-11-22 고침: 전에는 보관 칸이 한 번 차면 영원히 다시 가져올 수 없었다. PR #15 Claude 검토)
export function importSharedHouse(storage, incomingState, { replaceCurrent = false } = {}) {
  storageAvailable(storage);
  let checked;
  try { checked = parse(serialize(incomingState)); }
  catch { throw new Error('가져올 집 데이터가 올바르지 않습니다'); }
  if (!checked?.ok || checked.dropped) throw new Error('가져올 집 데이터가 현재 게임 규칙에 맞지 않습니다');
  const backup = readBackup(storage); // 손상됐으면 여기서 멈춘다
  const kept = backup !== null && backup.previous !== null;
  const original = storage.getItem(SAVE_KEY);
  // 지금 집이 이 화면이 모르는 새 판의 집이면 가져오지 않는다. 확인 창이 떠 있는 사이 다른 탭이 저장했을 수도 있으므로
  // 쓰기 바로 앞에서 본다(2026-11-26 GPT 점검: 보관된 집이 있으면 새 판의 원문이 어디에도 남지 않았다)
  if (original !== null && isNewerHouse(original)) {
    throw new Error('지금 내 집이 더 새로운 판에서 저장되어 있어 가져오지 않았습니다. 새로 고친 뒤 다시 해 주세요');
  }
  if (kept && !replaceCurrent) {
    throw new Error('보관된 다른 집이 이미 있습니다. 가져오면 지금 집이 바뀝니다. 다시 확인해 주세요');
  }
  const next = serialize(checked.state, { place: 'yard' });
  commitHouseChange(storage, {
    save: next,
    // 보관된 집이 있으면 건드리지 않는다. 없으면 지금 집을 보관한다(지금 집도 없으면 null)
    backup: kept ? storage.getItem(PRE_IMPORT_KEY) : JSON.stringify({ version: 1, previous: original }),
  }, '집을 저장하지 못했습니다. 원래 집을 복구할 수 있도록 보관했습니다');
  return checked.state;
}

// 두 집을 맞바꾼다. 이전 저장을 없애지 않고 현재 집을 다음 교환용 백업으로 남긴다.
// 저장된 집이 원래 없었다면 없는 값을 집으로 취급하지 않는다.
export function restorePreviousHouse(storage) {
  storageAvailable(storage);
  const backup = readBackup(storage);
  if (!backup || backup.previous === null) throw new Error('맞바꿀 이전 집이 없습니다');
  const current = storage.getItem(SAVE_KEY);
  if (current === null) throw new Error('지금 집의 저장 내용을 찾지 못했습니다. 교환하지 않았습니다');
  commitHouseChange(storage, {
    save: backup.previous,
    backup: JSON.stringify({ version: 1, previous: current }),
  }, '두 집을 맞바꾸지 못했습니다. 저장 상태를 확인해 주세요');
  return true;
}
