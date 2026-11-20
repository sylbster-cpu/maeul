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
  const api = {
    doc: docPath,
    collection: docPath,
    serverTimestamp: () => ({ serverTimestamp: true }),
    async setDoc(path, data) { docs.set(path, structuredClone(data)); },
    async updateDoc(path, data) { docs.set(path, { ...docs.get(path), ...structuredClone(data) }); },
    async deleteDoc(path) { docs.delete(path); },
    async getDocFromServer(path) {
      const value = docs.get(path);
      return { exists: () => value !== undefined, data: () => structuredClone(value) };
    },
    query: (collection, limit) => ({ collection, limit }),
    limit: (n) => n,
    async getDocsFromServer(q) {
      return { docs: [...docs.entries()].filter(([k]) => k.startsWith(q.collection + '/'))
        .slice(0, q.limit).map(([k, value]) => ({
          id: k.split('/').pop(), data: () => structuredClone(value),
        })) };
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
  const notes = await owner.getNotes();
  assert.deepEqual(notes.map((item) => item.body), ['반갑습니다!']);
  assert.equal(docs.get('houses/' + OWNER + '/notes/' + GUEST).authorUid, GUEST);
  await owner.removeNote(GUEST);
  assert.deepEqual(await owner.getNotes(), []);
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
