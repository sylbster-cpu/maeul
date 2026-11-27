// 실제 Firestore 에뮬레이터에서 보안 규칙을 검사한다. 운영 Firebase에는 접근하지 않는다.
// 실행: firebase emulators:exec --project demo-maeul-online --only firestore "node test/firestore-rules.mjs"
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp, runTransaction } from 'firebase/firestore';

import { createShelter, readShelter, apply } from '../src/shelter-state.js';

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
  assert.equal(checks, 23);
  console.log('기존 집 보안 규칙 시험 통과:', checks);

  // 공동 쉼터: 운영 서버 대신 실제 보안 규칙 에뮬레이터에서 확인.
  const db4 = env.authenticatedContext('fourthDd123456').firestore();
  const db5 = env.authenticatedContext('fifthEe1234567').firestore();
  const uid4 = 'fourthDd123456', uid5 = 'fifthEe1234567';
  const roomId = 'AbCdEf0123456789GhIj';
  const room = db => doc(db,'shelters',roomId);
  const writeRoom = (db,s) => setDoc(room(db),{...s,updatedAt:serverTimestamp()});
  const readRoom = async db => readShelter((await getDoc(room(db))).data());
  const put = (mark,slot,cell,kind='stool',rot=0) => ({type:'place',mark,slot,piece:{kind,cell,rot}});
  let s = createShelter(OWNER);
  await no(writeRoom(guest,s),'남의 이름으로 쉼터 개설');
  await yes(writeRoom(owner,s),'개설자만 자기 이름으로 생성');
  await no(getDoc(room(anon)),'미인증 쉼터 읽기');
  await no(getDocs(collection(guest,'shelters')),'쉼터 전체 목록');
  await yes(getDoc(room(guest)),'초대 주소 단건 읽기');
  let next = apply(s,GUEST,{type:'join',mark:'wind'});
  await no(writeRoom(other,next),'남의 UID로 참여');
  await no(writeRoom(guest,{...next,items:{...next.items,wind:{'0':{kind:'stool',cell:'0_0',rot:0}}}}),'참여 때 가구 몰래 넣기');
  await yes(writeRoom(guest,next),'친구 참여'); s=next;
  await no(writeRoom(guest,{...s,revision:s.revision+1,members:{...s.members,star:GUEST},items:{...s.items,star:{}},
    change:{type:'join',mark:'star',slot:'',from:'',to:''}}),'같은 UID 두 표식');
  next=apply(s,OTHER,{type:'join',mark:'star'}); await yes(writeRoom(other,next),'세 번째 참여'); s=next;
  next=apply(s,uid4,{type:'join',mark:'moon'}); await yes(writeRoom(db4,next),'네 번째 참여'); s=next;
  await no(writeRoom(db5,{...s,revision:s.revision+1,members:{...s.members,extra:uid5},items:{...s.items,extra:{}},
    change:{type:'join',mark:'extra',slot:'',from:'',to:''}}),'다섯 번째 표식');
  next=apply(s,OWNER,put('tree','0','0_2'));
  await no(writeRoom(guest,next),'남의 슬롯에 배치');
  await no(writeRoom(owner,{...next,cells:{}}),'점유 누락');
  await no(writeRoom(owner,{...next,cells:{...next.cells,'1_2':{mark:'tree',slot:'0'}}}),'고아 점유');
  await no(writeRoom(owner,{...next,items:{...next.items,wind:{'0':{kind:'lamp',cell:'2_2',rot:0}}}}),'내 배치와 함께 남의 가구 덮기');
  await no(writeRoom(owner,{...next,revision:s.revision}),'낡은 판 번호');
  await no(writeRoom(owner,{...next,items:{...next.items,tree:{'0':{kind:'table',cell:'0_2',rot:0}}}}),'허용 밖 모델');
  await no(writeRoom(owner,{...next,items:{...next.items,tree:{'0':{kind:'stool',cell:'0_2',rot:4}}}}),'잘못된 회전');
  await no(writeRoom(owner,{...next,items:{...next.items,tree:{'0':{kind:'stool',cell:'3_0',rot:0}}},
    cells:{'3_0':{mark:'tree',slot:'0'}},change:{...next.change,to:'3_0'}}),'입구 칸');
  await yes(writeRoom(owner,next),'내 가구 배치'); s=next;
  const overlap=apply(s,GUEST,put('wind','0','1_2'));
  await no(writeRoom(guest,{...overlap,items:{...overlap.items,wind:{'0':{kind:'stool',cell:'0_2',rot:0}}},
    cells:{...s.cells,'0_2':{mark:'wind',slot:'0'}},change:{...overlap.change,to:'0_2'}}),'겹친 칸 배치');
  for(let i=1;i<6;i++){
    next=apply(s,OWNER,put('tree',String(i),i+'_2')); await yes(writeRoom(owner,next),'내 가구 슬롯 '+i); s=next;
  }
  await no(writeRoom(owner,{...s,revision:s.revision+1,items:{...s.items,tree:{...s.items.tree,'6':{kind:'lamp',cell:'6_2',rot:0}}},
    cells:{...s.cells,'6_2':{mark:'tree',slot:'6'}},change:{type:'place',mark:'tree',slot:'6',from:'',to:'6_2'}}),'일곱 번째 가구');
  const moved=apply(s,OWNER,{type:'move',mark:'tree',slot:'0',expect:s.items.tree['0'],piece:{kind:'stool',cell:'0_3',rot:1}});
  await no(writeRoom(guest,moved),'남의 가구 이동');
  await no(writeRoom(owner,{...moved,cells:{...moved.cells,'0_2':{mark:'tree',slot:'0'}}}),'옮긴 뒤 이전 칸 점유 남기기');
  await yes(writeRoom(owner,moved),'내 가구 이동'); s=moved;
  next=apply(s,OWNER,{type:'rotate',mark:'tree',slot:'0',expect:s.items.tree['0'],piece:{kind:'stool',cell:'0_3',rot:2}});
  await yes(writeRoom(owner,next),'내 가구 회전'); s=next;
  next=apply(s,OWNER,{type:'remove',mark:'tree',slot:'0',expect:s.items.tree['0']});
  await no(writeRoom(guest,next),'남의 가구 삭제');
  await yes(writeRoom(owner,next),'내 가구 치우기'); s=next;
  // 같은 칸을 동시에 노릴 때 트랜잭션은 최신 상태에서 다시 검증한다.
  const contend=(db,uid,mark)=>runTransaction(db,async tx=>{
    const now=readShelter((await tx.get(room(db))).data());
    const n=apply(now,uid,put(mark,'0','7_7'));
    tx.set(room(db),{...n,updatedAt:serverTimestamp()});
    return n;
  });
  const outcomes=await Promise.allSettled([contend(guest,GUEST,'wind'),contend(other,OTHER,'star')]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const after=await readRoom(owner);
  assert.ok(['wind','star'].includes(after.cells['7_7'].mark));
  checks++; console.log('통과 동시 충돌: 한 사람만 배치');
  await no(deleteDoc(room(owner)),'쉼터 전체 삭제');
  const emptyMark=after.cells['7_7'].mark==='wind'?'star':'wind';
  const emptyUid=emptyMark==='wind'?GUEST:OTHER, emptyDb=emptyMark==='wind'?guest:other;
  next=apply(after,emptyUid,{type:'leave',mark:emptyMark});
  await yes(writeRoom(emptyDb,next),'빈 자기 표식 비우기');
  s=next;
  next=apply(s,uid5,{type:'join',mark:emptyMark});
  await yes(writeRoom(db5,next),'빈 자리 새 친구 참여');
  assert.deepEqual(await readRoom(owner),next);
  console.log('공동 쉼터 보안 규칙 시험 포함 전체 통과:',checks);

} finally {
  await env.cleanup();
}
