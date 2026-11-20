import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore } from '../src/state.js';
import { validUid, onlineVisitUid, onlineVisitLink, prepareOnlineSnapshot,
  readPublishedSnapshot, normalizeVisitNote, onlineErrorText } from '../src/online-data.js';

const OWNER = 'ownerAa123456789';
const house = () => createState();

test('온라인 방문 링크는 공식 주소에 UID만 담는다', () => {
  assert.equal(onlineVisitLink(OWNER), 'https://sylbster-cpu.github.io/maeul/#visit=' + OWNER);
  assert.equal(onlineVisitUid('#visit=' + OWNER), OWNER);
  assert.equal(onlineVisitUid('#home=gabc'), null);
  assert.equal(onlineVisitUid(''), null);
  assert.equal(validUid('bad/uid'), false);
  assert.throws(() => onlineVisitUid('#visit=constructor/notes/x'), /잘못/);
  assert.throws(() => onlineVisitLink('a'), /주소/);
});

test('현재 집을 온라인 사본으로 만들어 검증한 뒤 재구성한다', () => {
  const state = house();
  const original = structuredClone(state);
  const raw = prepareOnlineSnapshot(state);
  const copy = readPublishedSnapshot({ ownerUid: OWNER, isPublic: true, snapshot: raw }, OWNER);
  assert.deepEqual(copy, state);
  assert.deepEqual(state, original);
});

test('받은 서버 데이터가 잘못되면 내 집 데이터로 쓰지 않고 거부한다', () => {
  const state = house();
  const original = structuredClone(state);
  const raw = prepareOnlineSnapshot(state);
  assert.throws(() => readPublishedSnapshot({ ownerUid: OWNER, isPublic: false, snapshot: raw }, OWNER));
  assert.throws(() => readPublishedSnapshot({ ownerUid: 'someoneelse123', isPublic: true, snapshot: raw }, OWNER));
  const altered = JSON.parse(raw);
  altered.state.spaces.main.floor = 'constructor';
  assert.throws(() => readPublishedSnapshot({ ownerUid: OWNER, isPublic: true, snapshot: JSON.stringify(altered) }, OWNER));
  assert.deepEqual(state, original);
});

test('문자 수 초과나 비어 있는 방명록을 거부한다', () => {
  assert.equal(normalizeVisitNote('  반가워요\n  '), '반가워요');
  assert.throws(() => normalizeVisitNote('   '), /입력/);
  assert.throws(() => normalizeVisitNote('가'.repeat(141)), /140/);
  assert.match(onlineErrorText({ code: 'permission-denied' }), /권한/);
});
