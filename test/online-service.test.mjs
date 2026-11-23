import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state.js';
import { createOnlineService } from '../src/online-service.js';
import { prepareOnlineSnapshot } from '../src/online-data.js';

const OWNER = 'ownerAa123456789';
const GUEST = 'guestBb987654321';
const docPath = (...args) => args.slice(1).join('/');

function mockApi() {
  const docs = new Map();
  let clock = 0;
  const api = {
    doc: docPath,
    collection: docPath,
    serverTimestamp: () => ++clock, // 서버 시각 대신 늘어나는 수
    async setDoc(path, data) { docs.set(path, structuredClone(data)); },
    async updateDoc(path, data) { docs.set(path, { ...docs.get(path), ...structuredClone(data) }); },
    async deleteDoc(path) { docs.delete(path); },
    async getDocFromServer(path) {
      const value = docs.get(path);
      return { exists: () => value !== undefined, data: () => structuredClone(value) };
    },
    // 조건은 { limit } / { after } / { order } 꼴로 모은다
    query: (collection, ...parts) => Object.assign({ collection }, ...parts),
    limit: (n) => ({ limit: n }),
    orderBy: (field, dir) => ({ order: [field, dir] }),
    startAfter: (doc) => ({ after: doc }),
    async getDocsFromServer(q) {
      let rows = [...docs.entries()].filter(([k]) => k.startsWith(q.collection + '/'))
        .map(([k, value]) => ({ id: k.split('/').pop(), path: k, data: () => structuredClone(value) }));
      if (q.order) {
        const [field, dir] = q.order;
        rows = rows.filter((r) => r.data()[field] !== undefined) // 그 필드가 없는 문서는 빠진다 (Firestore 와 같게)
          .sort((a, b) => (a.data()[field] - b.data()[field]) * (dir === 'desc' ? -1 : 1));
      }
      if (q.after) rows = rows.slice(rows.findIndex((r) => r.path === q.after.path) + 1);
      return { docs: rows.slice(0, q.limit) };
    },
  };
  return { api, docs };
}
test('집주인 게시 → 친구 방문 → 방문 인사 → 집주인 열람 → 삭제 → 비공개', async () => {
  const { api, docs } = mockApi();
  const owner = createOnlineService({ uid: OWNER, db: {}, api });
  const guest = createOnlineService({ uid: GUEST, db: {}, api });
  const local = createState();
  const before = structuredClone(local);
  assert.deepEqual(await owner.ownStatus(), { published: false, isPublic: false, updatedAt: null });
  const link = await owner.publish(local);
  assert.match(link, /#visit=ownerAa123456789$/);
  assert.deepEqual(await owner.ownStatus(), { published: true, isPublic: true, updatedAt: null });
  // 다른 브라우저(다른 익명 계정)는 남의 집을 자기 집으로 보지 않는다
  assert.equal((await guest.ownStatus()).published, false);
  assert.deepEqual(await guest.visit(OWNER), local);
  await guest.leaveNote(OWNER, ' 반갑습니다! ');
  const { notes, next } = await owner.getNotes();
  assert.deepEqual(notes.map((item) => item.body), ['반갑습니다!']);
  assert.equal(next, null);
  assert.equal(docs.get('houses/' + OWNER + '/notes/' + GUEST).authorUid, GUEST);
  await owner.removeNote(GUEST);
  assert.deepEqual(await owner.getNotes(), { notes: [], next: null });
  await owner.unpublish();
  assert.deepEqual(await owner.ownStatus(), { published: true, isPublic: false, updatedAt: null });
  await assert.rejects(() => guest.visit(OWNER), /공개/);
  assert.deepEqual(local, before);
});

test('방문자가 집주인인 척하거나 140자를 넘는 글을 올리지 않는다', async () => {
  const { api, docs } = mockApi();
  const guest = createOnlineService({ uid: GUEST, db: {}, api });
  await assert.rejects(() => guest.leaveNote(GUEST, '제 집'), /같은 집/);
  await assert.rejects(() => guest.leaveNote(OWNER, 'a'.repeat(141)), /140/);
  assert.equal(docs.size, 0);
});

test('정상적이지 않은 서버 집은 방문 화면에 쓰지 않는다', async () => {
  const { api, docs } = mockApi();
  const guest = createOnlineService({ uid: GUEST, db: {}, api });
  docs.set('houses/' + OWNER, { ownerUid: OWNER, isPublic: true,
    snapshot: prepareOnlineSnapshot(createState()).replace('"version":2', '"version":99') });
  await assert.rejects(() => guest.visit(OWNER), /형식|가구/);
});

test('방명록은 새 인사부터 30개씩 읽고, 이어 읽어 오래된 인사도 보고 지운다', async () => {
  const { api, docs } = mockApi();
  const owner = createOnlineService({ uid: OWNER, db: {}, api });
  await owner.publish(createState());
  const guests = Array.from({ length: 65 }, (_, i) => `guest${String(i).padStart(11, '0')}`);
  for (const [i, g] of guests.entries()) await createOnlineService({ uid: g, db: {}, api }).leaveNote(OWNER, `인사 ${i}`);
  const p1 = await owner.getNotes();
  assert.equal(p1.notes.length, 30);
  assert.equal(p1.notes[0].body, '인사 64'); // 가장 새것이 먼저
  assert.ok(p1.next);
  const p2 = await owner.getNotes(p1.next);
  assert.equal(p2.notes.length, 30);
  assert.equal(p2.notes[0].body, '인사 34');
  const p3 = await owner.getNotes(p2.next);
  assert.deepEqual(p3.notes.map((n) => n.body), ['인사 4', '인사 3', '인사 2', '인사 1', '인사 0']);
  assert.equal(p3.next, null);
  // 가장 오래된 인사도 지울 수 있다
  await owner.removeNote(p3.notes[4].uid);
  assert.equal(docs.has(`houses/${OWNER}/notes/${guests[0]}`), false);
});
