// 서버 없는 집 공유. URL의 #home= 부분에 읽기 전용 집 상태를 담는다.
// 로컬 저장과 별개이며, 공유 링크를 연 사람의 기존 집은 바꾸지 않는다.
// Claude 임시 게시 화면에서도, 친구에게 보낼 링크는 정식 GitHub Pages 주소를 사용한다.
export const PUBLIC_SHARE_URL = 'https://sylbster-cpu.github.io/maeul/';
const MAX_TEXT_BYTES = 100_000;
const MAX_HASH_LENGTH = 6_000;
const MAX_OBJECTS = 300;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkState(state) {
  if (!isRecord(state) || state.version !== 2 || !isRecord(state.house) || !isRecord(state.spaces)) {
    throw new Error('공유된 집의 형식이 맞지 않습니다');
  }
  let total = 0;
  for (const space of ['yard', 'main']) {
    const area = state.spaces[space];
    if (!isRecord(area) || !isRecord(area.objects)) throw new Error('공유된 집의 방 정보가 잘못되었습니다');
    for (const [key, obj] of Object.entries(area.objects)) {
      total++;
      if (total > MAX_OBJECTS) throw new Error('공유할 가구가 너무 많습니다');
      if (!isRecord(obj) || obj.id !== key || !/^[a-zA-Z0-9_-]{1,48}$/.test(key) ||
          ['__proto__', 'prototype', 'constructor'].includes(key) ||
          typeof obj.part !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(obj.part) ||
          ['__proto__', 'prototype', 'constructor'].includes(obj.part)) {
        throw new Error('공유된 집의 가구 정보가 잘못되었습니다');
      }
    }
  }
}

function base64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('공유 링크의 글자가 잘못되었습니다');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readLimited(stream) {
  const reader = stream.getReader();
  const pieces = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_TEXT_BYTES) throw new Error('공유된 집 데이터가 너무 큽니다');
      pieces.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
  return bytes;
}

// 파일을 서버에 올리지 않고 현재 배치의 스냅샷을 링크에 담는다.
export async function makeShareLink(state, address) {
  checkState(state);
  const raw = encoder.encode(JSON.stringify({ v: 1, state }));
  if (raw.length > MAX_TEXT_BYTES) throw new Error('공유할 집의 데이터가 너무 큽니다');
  let mode = 'j';
  let bytes = raw;
  if (typeof CompressionStream === 'function') {
    const zipped = new Uint8Array(await new Response(new Blob([raw]).stream()
      .pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    if (zipped.length < raw.length) { mode = 'g'; bytes = zipped; }
  }
  const url = new URL(address);
  url.hash = `home=${mode}${base64url(bytes)}`;
  if (url.hash.length > MAX_HASH_LENGTH) throw new Error('집이 커서 링크가 너무 깁니다. 가구를 줄인 뒤 다시 시도해 주세요');
  return url.href;
}

// 공유 링크가 없으면 null. 있으면 데이터 형식을 검사하고 상태만 돌려준다.
// 게임 규칙에 따른 배치 검증은 호출자가 save.parse()를 통해 추가로 한다.
export async function readShareHash(hash) {
  if (!hash.startsWith('#home=')) return null;
  if (hash.length > MAX_HASH_LENGTH) throw new Error('공유 링크가 너무 깁니다');
  const match = /^#home=([gj])([A-Za-z0-9_-]+)$/.exec(hash);
  if (!match) throw new Error('공유 링크가 손상되었습니다');
  const [, mode, encoded] = match;
  let bytes;
  try {
    bytes = fromBase64url(encoded);
    if (mode === 'g') {
      if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 압축된 집 공유를 지원하지 않습니다');
      bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    }
    if (bytes.length > MAX_TEXT_BYTES) throw new Error('공유된 집 데이터가 너무 큽니다');
    const payload = JSON.parse(decoder.decode(bytes));
    if (!isRecord(payload) || payload.v !== 1) throw new Error('지원하지 않는 집 공유 형식입니다');
    checkState(payload.state);
    return payload.state;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof DOMException) throw new Error('공유 링크를 읽을 수 없습니다');
    throw error;
  }
}
