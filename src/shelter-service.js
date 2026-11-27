// 공동 쉼터만 읽고 쓴다. 개인 집과 방명록의 문서·저장소를 참조하지 않는다.
import { createShelter, readShelter, validShelterId, memberMark, MARKS, apply } from './shelter-state.js';

export function createShelterService({ uid, db, api }) {
  // 사용자 식별자 검사는 기존 순수 규칙과 같은 기준으로 한다.
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

  return {
    uid,
    async create() {
      const target = api.doc(api.collection(db, 'shelters'));
      if (!validShelterId(target.id)) throw new Error('쉼터 주소를 만들 수 없습니다');
      const state = createShelter(uid);
      await api.setDoc(target, data(state));
      return { id: target.id, state };
    },
    async get(id) {
      return read(await api.getDocFromServer(ref(id)));
    },
    async join(id) {
      const target = ref(id);
      return api.runTransaction(db, async (tx) => {
        const old = read(await tx.get(target));
        if (memberMark(old, uid)) return old;
        const mark = MARKS.find(key => !Object.prototype.hasOwnProperty.call(old.members, key));
        if (!mark) throw new Error('이 쉼터는 네 사람이 모두 참여 중입니다');
        const next = apply(old, uid, { type: 'join', mark });
        tx.set(target, data(next));
        return next;
      });
    },
    async command(id, cmd) {
      // 트랜잭션 재시도마다 최신 상태를 읽고 같은 명령을 검증한다. 쓰기 성공 전에는 화면 상태를 바꾸지 않는다.
      // 호출한 화면의 명령이 대기 중에 변하지 않도록 복사한다.
      const original = structuredClone(cmd);
      const target = ref(id);
      return api.runTransaction(db, async (tx) => {
        const old = read(await tx.get(target));
        const next = apply(old, uid, original);
        tx.set(target, data(next));
        return next;
      });
    },
  };
}
