// 공동 쉼터만 읽고 쓴다. 개인 집과 방명록의 문서·저장소를 참조하지 않는다.
import { createShelter, readShelter, validShelterId, memberMark, MARKS, apply } from './shelter-state.js';

// 동시에 쓰는 친구 때문에 판 번호가 바뀌었을 때만 바깥에서 최대 세 번 시도한다.
// Firestore SDK가 일반적으로 재시도하는 ABORTED와 달리, 규칙에서 거절된 permission-denied는
// 자동 재시도되지 않을 수 있다. 권한이 실제로 없거나 규칙이 틀렸다면 무한 재시도하지 않는다.
const MAX_CONTENTION_ATTEMPTS = 3;

export function createShelterService({ uid, db, api }) {
  createShelter(uid);
  const ref = (id) => {
    if (!validShelterId(id)) throw new Error('쉼터 초대 주소가 잘못되었습니다');
    return api.doc(db, 'shelters', id);
  };
  const read = (snapshot) => {
    if (!snapshot.exists()) throw new Error('쉼터를 찾을 수 없습니다');
    return readShelter(snapshot.data());
  };
  const data = (state) => ({ ...state, updatedAt: api.serverTimestamp() });

  async function transact(target, plan) {
    for (let attempt = 0; attempt < MAX_CONTENTION_ATTEMPTS; attempt++) {
      let attemptedRevision = null;
      try {
        return await api.runTransaction(db, async (tx) => {
          const old = read(await tx.get(target));
          const next = plan(old);
          if (next === old) return old; // 이미 참여 중이면 쓰지 않는다
          attemptedRevision = old.revision;
          tx.set(target, data(next));
          return next;
        });
      } catch (error) {
        if (error?.code !== 'permission-denied' || attemptedRevision === null) throw error;
        const fresh = read(await api.getDocFromServer(target));
        // 실제 권한 오류는 숨기지 않는다. 내가 쓰려던 판 이후 새 변경이 있을 때만 다시 검증한다.
        if (fresh.revision <= attemptedRevision) throw error;
        const next = plan(fresh); // 칸 충돌, 낡은 가구, 가득 찬 쉼터라면 명확한 규칙 오류
        if (next === fresh) return fresh; // 같은 UID의 다른 탭이 먼저 참여한 경우
        if (attempt + 1 === MAX_CONTENTION_ATTEMPTS)
          throw new Error('친구가 계속 꾸미고 있습니다. 잠시 뒤 다시 해 주세요');
      }
    }
    throw new Error('쉼터 변경을 확인할 수 없습니다');
  }

  const newId = () => {
    const id = api.doc(api.collection(db, 'shelters')).id;
    if (!validShelterId(id)) throw new Error('쉼터 주소를 만들 수 없습니다');
    return id;
  };

  return {
    uid, newId,
    async create(id = newId()) {
      // 만들기 응답을 잃어도 같은 주소로 다시 시도한다. 남의 쉼터를 덮어쓰지 않는다.
      const target = ref(id);
      const existing = snap => {
        const state = read(snap);
        if (state.ownerUid !== uid) throw new Error('이미 다른 사람이 만든 쉼터입니다');
        return { id, state };
      };
      try {
        return await api.runTransaction(db, async tx => {
          const snap = await tx.get(target);
          if (snap.exists()) return existing(snap);
          const state = createShelter(uid);
          tx.set(target, data(state));
          return { id, state };
        });
      } catch (error) {
        // 두 탭의 같은 ID 생성이 엇갈려 보안 규칙이 늦은 쓰기를 거절할 수 있다.
        if (error?.code !== 'permission-denied') throw error;
        const fresh = await api.getDocFromServer(target);
        if (!fresh.exists()) throw error;
        return existing(fresh);
      }
    },
    async get(id) {
      return read(await api.getDocFromServer(ref(id)));
    },
    // 캐시나 아직 확정되지 않은 내 쓰기를 서버에서 저장됐다고 표시하지 않는다.
    watch(id, onState, onStatus) {
      return api.onSnapshot(ref(id), { includeMetadataChanges: true }, snap => {
        if (snap.metadata.hasPendingWrites) return;
        if (snap.metadata.fromCache) { onStatus(false); return; }
        try { onState(read(snap)); onStatus(true); }
        catch (error) { onStatus(false, error); }
      }, error => onStatus(false, error));
    },
    async join(id) {
      return transact(ref(id), old => {
        if (memberMark(old, uid)) return old;
        const mark = MARKS.find(key => !Object.prototype.hasOwnProperty.call(old.members, key));
        if (!mark) throw new Error('이 쉼터는 네 사람이 모두 참여 중입니다');
        return apply(old, uid, { type: 'join', mark });
      });
    },
    async command(id, cmd) {
      // 호출한 화면의 명령이 대기 중에 변하지 않도록 복사한다.
      // 쓰기 성공 전에는 화면 상태를 확정하지 않는다.
      const original = structuredClone(cmd);
      return transact(ref(id), old => apply(old, uid, original));
    },
  };
}
