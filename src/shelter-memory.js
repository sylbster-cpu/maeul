// 쉼터 전용 주소·재방문 기억. 개인 집·낚시·채집 키를 읽거나 바꾸지 않는다.
import { readShelter, validShelterId, memberMark } from './shelter-state.js';

const ROOT = 'https://sylbster-cpu.github.io/maeul/shelter.html';
export function shelterRoomId(hash) {
  if (hash === '') return null;
  if (typeof hash !== 'string' || !hash.startsWith('#room=') || !validShelterId(hash.slice(6)))
    throw new Error('쉼터 초대 주소가 올바르지 않습니다');
  return hash.slice(6);
}
export function shelterLink(id) {
  if (!validShelterId(id)) throw new Error('쉼터 주소가 올바르지 않습니다');
  return ROOT + '#room=' + id;
}
export function createShelterMemory(storage, uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) throw new Error('쉼터 사용자 정보가 맞지 않습니다');
  const prefix = 'maeul:shelter:' + uid + ':';
  const read = key => { try { return storage?.getItem(prefix + key) || null; } catch { return null; } };
  const write = (key, value) => { try {
    if (!storage) return false;
    storage.setItem(prefix + key, value); return true;
  } catch { return false; } };
  const readId = key => { const id = read(key); return validShelterId(id) ? id : null; };
  return {
    recent: () => readId('recent'),
    pending: () => readId('pending'),
    reserve(id) { return validShelterId(id) && write('pending', id); },
    complete(id) {
      if (!validShelterId(id)) return false;
      const ok = write('recent', id);
      // 최근 주소가 저장되지 않았으면 만들어 둔 주소를 지우지 않는다.
      if (ok && readId('pending') === id) { try { storage.removeItem(prefix + 'pending'); } catch {} }
      return ok;
    },
    seen(id) {
      if (!validShelterId(id)) return null;
      try {
        const state = readShelter(JSON.parse(read('seen:' + id)));
        return memberMark(state, uid) ? state : null;
      } catch { return null; }
    },
    remember(id, state) {
      if (!validShelterId(id)) return false;
      const next = readShelter(state);
      if (!memberMark(next, uid)) return false;
      // 동시에 열린 탭이 더 새 판을 봤다면 오래된 기억으로 되돌리지 않는다.
      const previous = this.seen(id);
      if (previous && previous.revision > next.revision) return false;
      return write('seen:' + id, JSON.stringify(next));
    },
  };
}
