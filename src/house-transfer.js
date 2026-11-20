// 서버를 쓰지 않는 내 집 복사. 집 공유 링크(#home=)의 사본만 이 브라우저에 복원한다.
// 다른 브라우저의 Firebase 익명 계정/온라인 집/방명록 소유권은 이전되지 않는다.
import { SAVE_KEY, serialize, parse } from './save.js';

export const PRE_IMPORT_KEY = 'house-lab-web:before-import';

function storageAvailable(storage) {
  if (!storage) throw new Error('이 브라우저에서는 집을 저장할 수 없습니다');
  return storage;
}

function readBackup(storage) {
  const raw = storage.getItem(PRE_IMPORT_KEY);
  if (raw === null) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('이전 집 백업이 손상되어 있습니다. 덮어쓰지 않았습니다'); }
  if (!value || value.version !== 1 ||
      !(value.previous === null || typeof value.previous === 'string')) {
    throw new Error('이전 집 백업의 형식이 잘못되었습니다. 덮어쓰지 않았습니다');
  }
  return value;
}

export function hasPreviousHouse(storage) {
  try { return !!storage && storage.getItem(PRE_IMPORT_KEY) !== null; }
  catch { return false; }
}

// 처음 복원하기 전에 원래 집을 백업한다. 기존 백업이 있으면 실수로 덮어쓰지 않는다.
// 실패했을 때 복원 전 저장 내용을 변경하지 않는다.
export function importSharedHouse(storage, incomingState) {
  storageAvailable(storage);
  let checked;
  try { checked = parse(serialize(incomingState)); }
  catch { throw new Error('가져올 집 데이터가 올바르지 않습니다'); }
  if (!checked?.ok || checked.dropped) throw new Error('가져올 집 데이터가 현재 게임 규칙에 맞지 않습니다');
  if (readBackup(storage) !== null) {
    throw new Error('이전 집 백업이 이미 있습니다. 먼저 내 집에서 이전 집을 복구한 뒤 다시 시도해 주세요');
  }

  const original = storage.getItem(SAVE_KEY);
  const next = serialize(checked.state, { place: 'yard' });
  try {
    storage.setItem(PRE_IMPORT_KEY, JSON.stringify({ version: 1, previous: original }));
  } catch {
    throw new Error('이전 집을 안전하게 백업하지 못했습니다. 내 집은 변경하지 않았습니다');
  }
  try {
    storage.setItem(SAVE_KEY, next);
  } catch {
    // 집을 바꾸지 못했으면 방금 만든 백업 표시도 지워 다음 시도를 막지 않는다.
    try { storage.removeItem(PRE_IMPORT_KEY); } catch { /* 원래 집 저장 내용은 그대로다 */ }
    throw new Error('집을 저장하지 못했습니다. 이전 집은 그대로 남아 있습니다');
  }
  return checked.state;
}

// 내가 명시적으로 복구를 누를 때만 실행. 성공 뒤에만 백업을 제거한다.
export function restorePreviousHouse(storage) {
  storageAvailable(storage);
  const backup = readBackup(storage);
  if (!backup) throw new Error('복구할 이전 집이 없습니다');
  try {
    if (backup.previous === null) storage.removeItem(SAVE_KEY);
    else storage.setItem(SAVE_KEY, backup.previous);
    storage.removeItem(PRE_IMPORT_KEY);
  } catch {
    throw new Error('이전 집 복구를 완료하지 못했습니다. 저장 공간을 확인해 주세요');
  }
  return true;
}
