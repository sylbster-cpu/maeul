// 온라인 집 공유와 방문 인사에 쓰는 순수 데이터 검사. 외부 서버나 Firebase SDK를 불러오지 않는다.
import { serialize, parse } from './save.js';
import { PUBLIC_SHARE_URL } from './share.js';

const UID = /^[A-Za-z0-9_-]{6,128}$/;
const MAX_SNAPSHOT_BYTES = 80_000;
export const MAX_NOTE_LENGTH = 140;

export function validUid(value) { return typeof value === 'string' && UID.test(value); }

export function onlineVisitUid(hash) {
  if (!hash.startsWith('#visit=')) return null;
  const uid = hash.slice('#visit='.length);
  if (!validUid(uid)) throw new Error('온라인 집 주소가 잘못되었습니다');
  return uid;
}

export function onlineVisitLink(uid) {
  if (!validUid(uid)) throw new Error('집 주소를 만들 수 없습니다');
  return PUBLIC_SHARE_URL + '#visit=' + uid;
}

export function prepareOnlineSnapshot(state) {
  if (!state || state.version !== 2) throw new Error('올릴 집 데이터가 잘못되었습니다');
  const snapshot = serialize(state);
  if (new TextEncoder().encode(snapshot).length > MAX_SNAPSHOT_BYTES) {
    throw new Error('집이 너무 커서 온라인 공유를 할 수 없습니다');
  }
  // 현재 게임 규칙으로 되읽어 확인한다. 낯선 물건을 몰래 서버에 게시하지 않는다.
  const checked = parse(snapshot);
  if (!checked.ok || checked.dropped) throw new Error('온라인에 올릴 집의 가구를 확인할 수 없습니다');
  const count = Object.keys(checked.state.spaces.yard.objects).length
    + Object.keys(checked.state.spaces.main.objects).length;
  if (count > 300) throw new Error('온라인 공유 가구는 300개까지 가능합니다');
  return snapshot;
}

export function readPublishedSnapshot(data, ownerUid) {
  if (!validUid(ownerUid) || !data || data.ownerUid !== ownerUid ||
      data.isPublic !== true || typeof data.snapshot !== 'string' ||
      new TextEncoder().encode(data.snapshot).length > MAX_SNAPSHOT_BYTES) {
    throw new Error('공개된 집을 읽을 수 없습니다');
  }
  const checked = parse(data.snapshot);
  if (!checked.ok || checked.dropped) throw new Error('공개된 집의 가구 정보가 잘못되었습니다');
  const count = Object.keys(checked.state.spaces.yard.objects).length
    + Object.keys(checked.state.spaces.main.objects).length;
  if (count > 300) throw new Error('공개된 집이 너무 큽니다');
  return checked.state;
}

export function normalizeVisitNote(text) {
  if (typeof text !== 'string') throw new Error('인사말을 입력해 주세요');
  const body = text.trim();
  if (!body) throw new Error('인사말을 입력해 주세요');
  if (body.length > MAX_NOTE_LENGTH) throw new Error('인사말은 140자 이내로 적어 주세요');
  return body;
}

// 서버 응답을 기다리는 한도를 둔다. 한도를 넘으면 실패로 알린다.
// 원래 요청을 취소하는 것은 아니므로, 연결이 돌아오면 나중에 서버에 반영될 수 있다.
export function withOnlineTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('온라인 서버의 응답이 없습니다. 연결을 확인한 뒤 다시 시도해 주세요')), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); });
  });
}

export function onlineErrorText(error) {
  if (typeof error?.message === 'string' &&
      /^(집|인사말|온라인|공개|올릴|로그인|설정|방문|같은)/.test(error.message)) {
    return error.message;
  }
  switch (error?.code) {
    case 'permission-denied':
    case 'firestore/permission-denied': return '집을 볼 수 없거나, 인사를 이미 남겼거나, 접근 권한이 없습니다';
    case 'auth/operation-not-allowed': return 'Firebase에서 익명 로그인을 켜야 합니다';
    case 'auth/unauthorized-domain': return 'Firebase 인증 도메인에 이 게임 주소가 등록되지 않았습니다';
    case 'unavailable':
    case 'firestore/unavailable':
    case 'auth/network-request-failed': return '네트워크 연결을 확인하고 다시 시도해 주세요';
    default: return '온라인 연결에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요';
  }
}
