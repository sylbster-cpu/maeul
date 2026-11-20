// 실제 Firestore 에뮬레이터에서 보안 규칙을 검사한다. 운영 Firebase에는 접근하지 않는다.
// 실행: firebase emulators:exec --project demo-maeul-online --only firestore "node test/firestore-rules.mjs"
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const PROJECT = 'demo-maeul-online';
const OWNER = 'ownerAa123456789';
const GUEST = 'guestBb987654321';
const OTHER = 'otherCc555555555';
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { host: '127.0.0.1', port: 8080, rules },
});
let checks = 0;
const yes = async (action, name) => { await assertSucceeds(action); checks++; console.log('통과 허용:', name); };
const no = async (action, name) => { await assertFails(action); checks++; console.log('통과 차단:', name); };
try {
  const owner = env.authenticatedContext(OWNER).firestore();
  const guest = env.authenticatedContext(GUEST).firestore();
  const other = env.authenticatedContext(OTHER).firestore();
  const anon = env.unauthenticatedContext().firestore();
  const house = (db) => doc(db, 'houses', OWNER);
  const note = (db, uid) => doc(db, 'houses', OWNER, 'notes', uid);
  const houseData = () => ({
    ownerUid: OWNER, isPublic: true, snapshot: '{"format":"house-lab","version":2}',
    updatedAt: serverTimestamp(),
  });
  const noteData = (body = '반갑습니다') => ({ authorUid: GUEST, body, createdAt: serverTimestamp() });

  await no(getDoc(house(anon)), '로그인 없는 집 조회');
  await no(setDoc(house(guest), houseData()), '친구가 내 집 덮기');
  await yes(setDoc(house(owner), houseData()), '집주인만 게시');
  await yes(getDoc(house(owner)), '집주인의 자기 집 조회');
  await yes(getDoc(house(guest)), '방문자의 공개 집 단건 조회');
  await no(getDocs(collection(guest, 'houses')), '전체 집 목록 검색');
  await no(setDoc(house(owner), { ...houseData(), snapshot: 'X'.repeat(80001) }), '집 문서 초과 길이');
  await no(setDoc(house(owner), { ...houseData(), unexpected: true }), '임의 필드 쓰기');
  await no(updateDoc(house(guest), { isPublic: false }), '방문자의 집 비공개 변경');

  await no(setDoc(note(owner, GUEST), noteData()), '집주인 아닌 사람 ID로 인사 쓰기');
  await no(setDoc(note(guest, OWNER), noteData()), '남의 ID로 인사 쓰기');
  await no(setDoc(note(guest, GUEST), noteData('X'.repeat(141))), '긴 인사');
  await no(setDoc(note(guest, GUEST), { ...noteData(), extra: true }), '인사 임의 필드');
  await yes(setDoc(note(guest, GUEST), noteData()), '친구 자신의 첫 인사');
  await no(setDoc(note(guest, GUEST), noteData('다시 쓰기')), '이미 쓴 인사 덮어쓰기');
  await no(getDocs(collection(guest, 'houses', OWNER, 'notes')), '친구의 다른 인사 목록 열람');
  await yes(getDoc(note(guest, GUEST)), '친구의 자기 인사 단건 조회');
  await yes(getDocs(collection(owner, 'houses', OWNER, 'notes')), '집주인 방명록 조회');
  await no(deleteDoc(note(other, GUEST)), '제3자의 인사 삭제');
  await yes(deleteDoc(note(owner, GUEST)), '집주인 인사 삭제');
  await yes(updateDoc(house(owner), { isPublic: false, updatedAt: serverTimestamp() }), '집주인 게시 중지');
  await no(getDoc(house(guest)), '비공개 집 방문');
  await no(setDoc(note(guest, GUEST), noteData()), '비공개 집 인사 작성');
  assert.equal(checks, 21);
  console.log('Firestore 보안 규칙 시험 전체 통과:', checks);
} finally {
  await env.cleanup();
}
