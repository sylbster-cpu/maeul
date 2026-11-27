// 5단계 작은 만들기(2026-11-26 사용자 결정): 화환. 고리의 6칸에 무엇을 꽂을지와 리본을 골라 벽에 건다.
// 모양(look)이 놓기·옮기기·치우기·되돌리기·저장·공유 링크·온라인 집에서 사라지지 않는지 본다(GPT 검토, 이슈 #4 글 7186050767)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore, validLook } from '../src/state.js';
import { createHistory } from '../src/history.js';
import { serialize, parse, isNewerHouse, createSaver, SAVE_VERSION, SAVE_KEY } from '../src/save.js';
import { PARTS, DEFAULT_WREATH, WREATH_SLOTS, WREATH_FILLS, WREATH_RIBBONS } from '../src/parts.js';
import { makeShareLink, readShareHash } from '../src/share.js';
import { prepareOnlineSnapshot, readPublishedSnapshot } from '../src/online-data.js';

const LOOK = { slots: ['feather', 'feather', null, 'pinecone', 'mushroom', null], ribbon: 'blue' };
const OTHER = { slots: ['mushroom', null, null, null, null, 'pinecone'], ribbon: null };
function setup() {
  const store = createStore(createState(), 'p1');
  const history = createHistory(store);
  return { store, history };
}
// 방의 서쪽 벽 1번 칸에 화환을 건다
const hang = (history, store, look = LOOK, i = 1) => {
  const id = store.nextId();
  return { id, r: history.run([{ type: 'placeObject', space: 'main', id, part: 'wreath', wall: 'W', i, by: 'p1', look }]) };
};
const lookOf = (store, id) => store.state.spaces.main.objects[id]?.look;

test('화환은 벽에 거는 부품이고, 모양의 선택지가 정해져 있다', () => {
  assert.equal(PARTS.wreath.layer, 'wall');
  assert.equal(PARTS.wreath.span, 1);
  assert.equal(WREATH_SLOTS, 6);
  assert.deepEqual([...WREATH_FILLS], ['pinecone', 'mushroom', 'feather']);
  assert.deepEqual(Object.keys(WREATH_RIBBONS), ['red', 'yellow', 'blue', 'white']);
  assert.ok(validLook(DEFAULT_WREATH));
});

test('모양 검사: 칸은 꼭 6개, 칸마다 주운 것 셋 가운데 하나나 빈칸, 리본은 넷 가운데 하나나 없음', () => {
  assert.ok(validLook(LOOK));
  assert.ok(validLook(OTHER));
  assert.ok(validLook({ slots: [null, null, null, null, null, null], ribbon: null }));
  for (const bad of [
    null, [], 'x', {},
    { slots: LOOK.slots.slice(0, 5), ribbon: 'red' },
    { slots: [...LOOK.slots, null], ribbon: 'red' },
    { slots: ['acorn', null, null, null, null, null], ribbon: 'red' },
    { slots: LOOK.slots, ribbon: 'purple' },
    { slots: LOOK.slots, ribbon: '__proto__' },
    { slots: LOOK.slots },
    { slots: LOOK.slots, ribbon: 'red', size: 2 },
  ]) assert.equal(validLook(bad), false, JSON.stringify(bad));
});

test('화환은 모양과 함께 걸리고, 모양이 없거나 틀리면 걸리지 않는다. 다른 물건은 모양을 갖지 않는다', () => {
  const { store, history } = setup();
  const { id, r } = hang(history, store);
  assert.ok(r.ok, r.reason);
  assert.deepEqual(lookOf(store, id), LOOK);
  LOOK.slots[0] = 'mushroom'; // 명령에 넘긴 것을 나중에 고쳐도 상태는 바뀌지 않는다(복사해 둔다)
  assert.equal(lookOf(store, id).slots[0], 'feather');
  LOOK.slots[0] = 'feather';
  assert.match(history.run([{ type: 'placeObject', space: 'main', id: store.nextId(), part: 'wreath', wall: 'W', i: 3, by: 'p1' }]).reason, /모양이 잘못/);
  assert.match(hang(history, store, { slots: ['acorn', null, null, null, null, null], ribbon: null }, 3).r.reason, /모양이 잘못/);
  assert.match(history.run([{ type: 'placeObject', space: 'main', id: store.nextId(), part: 'frame', wall: 'W', i: 3, by: 'p1', look: LOOK }]).reason, /모양이 잘못/);
});

test('setLook: 모양을 바꾸고, 되돌리기·다시 하기로 앞뒤 모양을 오간다. 화환이 아니거나 같은 모양이면 거절한다', () => {
  const { store, history } = setup();
  const { id } = hang(history, store);
  assert.ok(history.run([{ type: 'setLook', space: 'main', id, look: OTHER }]).ok);
  assert.deepEqual(lookOf(store, id), OTHER);
  assert.ok(history.undo().ok);
  assert.deepEqual(lookOf(store, id), LOOK);
  assert.ok(history.redo().ok);
  assert.deepEqual(lookOf(store, id), OTHER);
  assert.match(history.run([{ type: 'setLook', space: 'main', id, look: OTHER }]).reason, /이미 그 모양/);
  assert.match(history.run([{ type: 'setLook', space: 'main', id, look: { slots: [], ribbon: null } }]).reason, /모양이 잘못/);
  assert.match(history.run([{ type: 'setLook', space: 'main', id: 'nope', look: OTHER }]).reason, /물건이 없습니다/);
  const frame = store.nextId();
  assert.ok(history.run([{ type: 'placeObject', space: 'main', id: frame, part: 'frame', wall: 'W', i: 3, by: 'p1' }]).ok);
  assert.match(history.run([{ type: 'setLook', space: 'main', id: frame, look: OTHER }]).reason, /바꿀 수 없는/);
});

test('옮겨도 모양이 남고, 치운 것을 되돌리면 모양째 돌아온다', () => {
  const { store, history } = setup();
  const { id } = hang(history, store);
  assert.ok(history.run([{ type: 'moveObject', space: 'main', id, wall: 'N', i: 0 }]).ok);
  assert.deepEqual(lookOf(store, id), LOOK);
  assert.ok(history.run([{ type: 'removeObject', space: 'main', id }]).ok);
  assert.equal(lookOf(store, id), undefined);
  assert.ok(history.undo().ok);
  assert.deepEqual(lookOf(store, id), LOOK, '되살린 화환의 모양');
  assert.ok(history.undo().ok);
  assert.equal(store.state.spaces.main.objects[id].wall, 'W');
  assert.deepEqual(lookOf(store, id), LOOK);
});

test('저장은 3판이고, 새로 읽어도 모양이 그대로다. 2판의 집도 그대로 읽힌다', () => {
  const { store, history } = setup();
  const { id } = hang(history, store);
  const text = serialize(store.state);
  assert.equal(JSON.parse(text).version, 3);
  assert.equal(SAVE_VERSION, 3);
  const back = parse(text);
  assert.ok(back.ok && back.dropped === 0 && back.unknown === 0, JSON.stringify(back));
  assert.deepEqual(back.state.spaces.main.objects[id].look, LOOK);
  // 2판(화환이 없던 때)의 집
  const old = JSON.parse(serialize(createState()));
  old.version = 2;
  old.state.house.roof = 'slate';
  const fromOld = parse(JSON.stringify(old));
  assert.ok(fromOld.ok && fromOld.dropped === 0, JSON.stringify(fromOld));
  assert.equal(fromOld.state.house.roof, 'slate');
});

test('모양이 틀린 화환은 조용히 빼지 않는다: 원문을 남기고 그 화면에서는 저장하지 않는다', () => {
  const { store, history } = setup();
  const { id } = hang(history, store);
  const data = JSON.parse(serialize(store.state));
  data.state.spaces.main.objects[id].look = { slots: ['acorn', null, null, null, null, null], ribbon: 'red' }; // 새 판의 재료라고 친다
  const text = JSON.stringify(data);
  assert.equal(isNewerHouse(text), true);
  const r = parse(text);
  assert.ok(r.ok && r.unknown === 1, JSON.stringify({ ok: r.ok, unknown: r.unknown }));
  const mem = new Map([[SAVE_KEY, text]]);
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const saver = createSaver(storage);
  saver.load();
  assert.equal(saver.locked, true);
  assert.equal(mem.get(`${SAVE_KEY}:newer`), text, '원문을 옆에 남긴다');
  assert.equal(saver.save(createState()), false);
  assert.equal(mem.get(SAVE_KEY), text, '원문 위에 쓰지 않는다');
  // 맞는 모양의 집은 새 판이 아니다
  assert.equal(isNewerHouse(serialize(store.state)), false);
});

test('공유 링크와 온라인 집에도 모양이 그대로 간다', async () => {
  const { store, history } = setup();
  const { id } = hang(history, store);
  const link = await makeShareLink(store.state, 'https://example.com/');
  const received = await readShareHash(new URL(link).hash);
  const shared = parse(serialize(received));
  assert.ok(shared.ok && shared.dropped === 0);
  assert.deepEqual(shared.state.spaces.main.objects[id].look, LOOK);
  const snapshot = prepareOnlineSnapshot(store.state);
  const uid = 'abcdefghijklmnopqrstuvwxyz12';
  const visited = readPublishedSnapshot({ ownerUid: uid, isPublic: true, snapshot }, uid);
  assert.deepEqual(visited.spaces.main.objects[id].look, LOOK);
});

// 자리가 틀린 화환 하나와 겹친 ID 하나가 든 원문을 만든다 (모양은 맞다)
function damaged(mark = 999) {
  const { store, history } = setup();
  const { id } = hang(history, store);
  const two = hang(history, store, OTHER, 3).id;
  const data = JSON.parse(serialize(store.state));
  data.state.spaces.main.objects[id].i = mark; // 벽 밖
  data.state.spaces.yard.objects[two] = { ...data.state.spaces.main.objects[two] }; // 겹친 ID
  return JSON.stringify(data);
}
// setItem 을 고를 수 있게 막는 가짜 저장소
function memStorage(init = {}, refuse = () => false) {
  const mem = new Map(Object.entries(init));
  return {
    mem,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { if (refuse(k, v)) throw new DOMException('가득 참', 'QuotaExceededError'); mem.set(k, String(v)); },
    removeItem: (k) => mem.delete(k),
  };
}
const kept = (st) => JSON.parse(st.mem.get(`${SAVE_KEY}:dropped`));

test('자리가 틀린 화환을 빼고 읽으면 원문을 옆에 남기고, 남겼으면 저장은 이어 간다 (PR #48 GPT 검토)', () => {
  const text = damaged();
  const r = parse(text);
  assert.ok(r.ok && r.dropped === 2 && r.unknown === 0, JSON.stringify({ dropped: r.dropped, unknown: r.unknown }));
  assert.equal(isNewerHouse(text), false, '새 판의 집은 아니다');
  const st = memStorage({ [SAVE_KEY]: text });
  const saver = createSaver(st);
  const loaded = saver.load();
  assert.equal(loaded.keptDropped, true);
  assert.deepEqual(kept(st), [text], '원문을 옆에 남긴다');
  assert.equal(saver.locked, false, '남겼으면 저장은 멈추지 않는다(새로 고쳐도 풀리지 않는 손상이므로)');
  assert.ok(saver.save(loaded.state), '뺀 채로 저장은 된다');
  assert.deepEqual(kept(st), [text], '저장해도 남긴 원문은 그대로다');
  createSaver(st).load(); // 같은 원문을 다시 읽어도 두 벌 남기지 않는다(이미 저장되어 빠진 것이 없다)
  assert.equal(kept(st).length, 1);
});

test('남기지 못하면(저장 공간 부족) 저장을 멈추고, 원문 위에 짧은 집을 쓰지 않는다 (PR #48 GPT 재검토 a)', () => {
  const text = damaged();
  const st = memStorage({ [SAVE_KEY]: text }, (k) => k.endsWith(':dropped')); // 원문 복사만 실패한다
  const saver = createSaver(st);
  const loaded = saver.load();
  assert.equal(loaded.keptDropped, false, '남겼다고 하지 않는다');
  assert.equal(saver.locked, true);
  assert.equal(saver.lockReason, 'backup');
  assert.equal(saver.save(loaded.state), false, '뺀 집을 저장하지 않는다');
  assert.equal(st.mem.get(SAVE_KEY), text, '원문은 그대로다');
  // 공간을 비우고 새로 열면 남기고 이어 간다
  const st2 = memStorage(Object.fromEntries(st.mem));
  const again = createSaver(st2);
  const back = again.load();
  assert.ok(back.keptDropped && !again.locked, JSON.stringify({ kept: back.keptDropped, locked: again.locked }));
  assert.deepEqual(kept(st2), [text]);
});

test('앞서 남긴 다른 원문이 있으면 새 원문을 더해 쌓는다. 첫 판의 글자 하나도 읽는다 (PR #48 GPT 재검토 b)', () => {
  const a = damaged(999);
  const b = damaged(777); // 다른 손상
  assert.notEqual(a, b);
  // 첫 판은 원문 글자 하나를 그대로 두었다
  const st = memStorage({ [SAVE_KEY]: b, [`${SAVE_KEY}:dropped`]: a });
  const saver = createSaver(st);
  const loaded = saver.load();
  assert.ok(loaded.keptDropped && !saver.locked);
  assert.deepEqual(kept(st), [a, b], '앞의 원문을 남긴 채 새 원문을 더한다');
  // 쌓인 목록이 있을 때 또 다른 손상
  const c = damaged(555);
  st.mem.set(SAVE_KEY, c);
  createSaver(st).load();
  assert.deepEqual(kept(st), [a, b, c]);
  // 더하기가 실패하면 저장을 멈춘다
  const d = damaged(333);
  const full = memStorage({ ...Object.fromEntries(st.mem), [SAVE_KEY]: d }, (k) => k.endsWith(':dropped'));
  const held = createSaver(full);
  held.load();
  assert.equal(held.locked, true);
  assert.deepEqual(JSON.parse(full.mem.get(`${SAVE_KEY}:dropped`)), [a, b, c], '앞서 남긴 것은 그대로다');
});
