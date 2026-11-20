// Firebase SDK를 전달받아 사용하는 최소 서버 저장 절차. 가구 이동과 로컬 저장은 건드리지 않는다.
import { validUid, onlineVisitLink, prepareOnlineSnapshot,
  readPublishedSnapshot, normalizeVisitNote, MAX_NOTE_LENGTH } from './online-data.js';

export function createOnlineService({ uid, db, api }) {
  if (!validUid(uid)) throw new Error('온라인 사용자 확인에 실패했습니다');
  const houseRef = (ownerUid) => {
    if (!validUid(ownerUid)) throw new Error('온라인 집 주소가 잘못되었습니다');
    return api.doc(db, 'houses', ownerUid);
  };
  const noteRef = (ownerUid, authorUid) => {
    houseRef(ownerUid);
    if (!validUid(authorUid)) throw new Error('방문자 정보를 읽을 수 없습니다');
    return api.doc(db, 'houses', ownerUid, 'notes', authorUid);
  };

  return {
    uid,
    async publish(state) {
      const snapshot = prepareOnlineSnapshot(state);
      await api.setDoc(houseRef(uid), {
        ownerUid: uid, snapshot, isPublic: true, updatedAt: api.serverTimestamp(),
      });
      return onlineVisitLink(uid);
    },
    async visit(ownerUid) {
      const result = await api.getDocFromServer(houseRef(ownerUid));
      if (!result.exists()) throw new Error('공개된 집이 없습니다');
      return readPublishedSnapshot(result.data(), ownerUid);
    },
    async leaveNote(ownerUid, rawText) {
      if (ownerUid === uid) throw new Error('같은 집에는 인사를 남길 수 없습니다');
      const body = normalizeVisitNote(rawText);
      // 필드와 문서 ID는 모두 작성자 UID로 고정. 이미 있는 글의 수정은 보안 규칙에서 막는다.
      await api.setDoc(noteRef(ownerUid, uid), {
        authorUid: uid, body, createdAt: api.serverTimestamp(),
      });
    },
    async getNotes() {
      // 방명록 전체 조회는 집주인만 허용한다. 목록은 30개까지 읽는다.
      const q = api.query(api.collection(db, 'houses', uid, 'notes'), api.limit(30));
      const result = await api.getDocsFromServer(q);
      return result.docs.map((doc) => {
        const item = doc.data();
        return {
          uid: doc.id,
          body: typeof item.body === 'string' && item.body.length <= MAX_NOTE_LENGTH ? item.body : '',
          date: item.createdAt?.toDate?.() || null,
        };
      }).filter((note) => note.body && validUid(note.uid));
    },
    async removeNote(authorUid) {
      await api.deleteDoc(noteRef(uid, authorUid));
    },
    async unpublish() {
      await api.updateDoc(houseRef(uid), {
        isPublic: false, updatedAt: api.serverTimestamp(),
      });
    },
  };
}
