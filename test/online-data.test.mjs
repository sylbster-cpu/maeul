import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore } from '../src/state.js';
import { validUid, onlineVisitUid, onlineVisitLink, prepareOnlineSnapshot,
  readPublishedSnapshot, normalizeVisitNote, onlineErrorText, withOnlineTimeout } from '../src/online-data.js';

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

test('응답이 한도 안에 오면 그대로 돌려주고, 오지 않으면 한국어 안내와 함께 실패한다', async () => {
  assert.equal(await withOnlineTimeout(Promise.resolve('집'), 50), '집');
  await assert.rejects(() => withOnlineTimeout(Promise.reject(new Error('공개된 집이 없습니다')), 50), /공개된 집이 없습니다/);
  const started = Date.now();
  await assert.rejects(() => withOnlineTimeout(new Promise(() => {}), 40), /응답이 없습니다/);
  assert.ok(Date.now() - started < 1000);
  // 한도 안내는 화면에 그대로 보여 주는 문구에 든다
  let message = '';
  try { await withOnlineTimeout(new Promise(() => {}), 10); } catch (error) { message = onlineErrorText(error); }
  assert.match(message, /^온라인 서버의 응답이 없습니다/);
});

test('한도가 지난 뒤 늦게 온 응답은 결과를 바꾸지 않는다', async () => {
  let late;
  const slow = new Promise((resolve) => { late = resolve; });
  const waiting = withOnlineTimeout(slow, 20);
  await assert.rejects(() => waiting, /응답이 없습니다/);
  late('늦은 응답');
  await assert.rejects(() => waiting, /응답이 없습니다/);
});
