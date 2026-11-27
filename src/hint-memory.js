// 조작 안내를 처음 몇 번만 보이기 위한 기억 (6단계 HUD A, 2026-11-27 사용자 결정).
// 걷기·드나들기·앉기처럼 한 번 익히면 되는 안내는 그 안내가 나온 접속이 HINT_LIMIT 번이 될 때까지만 보인다.
// 한 접속 안에서는 처음 나올 때 정한 것을 끝까지 지킨다(같은 화면에서 안내가 뜨다 말다 하지 않는다).
// 집 저장·낚시 기록·채집 기록과 섞지 않는 화면 설정이다. 잃어도 안내가 다시 뜰 뿐이라 판 번호를 두지 않는다
// (이슈 #4 글 147, GPT 글 7210344502). 저장소를 쓸 수 없으면 접속할 때마다 처음처럼 보인다.
// 규칙 코드처럼 three.js 를 불러오지 않는다
export const HINT_KEY = 'maeul.hints';
export const HINT_LIMIT = 3;

function read(storage) {
  try {
    const data = JSON.parse(storage?.getItem(HINT_KEY) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, n]) => Number.isInteger(n) && n >= 0));
  } catch { return {}; }
}
function write(storage, counts) {
  try { storage?.setItem(HINT_KEY, JSON.stringify(counts)); } catch { /* 못 쓰면 다음 접속에 다시 보일 뿐이다 */ }
}

export function createHintMemory(storage, { limit = HINT_LIMIT } = {}) {
  let counts = read(storage);
  const thisVisit = new Map(); // 안내 → 이번 접속에서 보일지
  return {
    // 이번 접속에서 이 안내를 보일지. 이번 접속에서 처음 나올 때 한 번만 센다
    shows(key) {
      if (!thisVisit.has(key)) {
        const n = counts[key] || 0;
        thisVisit.set(key, n < limit);
        if (n < limit) { counts = { ...counts, [key]: n + 1 }; write(storage, counts); }
      }
      return thisVisit.get(key);
    },
    // "처음 안내 다시 보기": 센 것을 모두 지운다. 이번 접속부터 다시 보인다
    reset() {
      counts = {};
      thisVisit.clear();
      write(storage, counts);
    },
    get counts() { return { ...counts }; }, // 자동 시험이 읽는다
  };
}
