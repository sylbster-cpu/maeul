// 낚시 규칙. 물고기 표, 입질 계획, 누른 때의 판정, 낚시 기록과 그 저장.
// 집의 상태(state.js)와 따로 둔다. 낚시 기록은 집 저장, 공유 링크, Firebase 에 섞지 않는다.
// 기록을 바꾸는 것은 모두 명령을 거친다: validate → apply, 그리고 되돌리는 명령(inverseOf).
// three.js 와 브라우저를 불러오지 않는다. 우연(rng)과 저장소(storage)는 밖에서 넘겨받는다.
import { POND } from './parts.js';

// 물고기. weight 는 나오는 비율, min·max 는 크기(cm), pattern 은 입질 모양, shadow 는 물속 그림자 크기.
// 드문 물고기는 나오는 비율과 그림자로만 구분하고, 누르는 시간 창은 모두 같다
export const FISH = {
  medaka: { label: '송사리', min: 3, max: 6, weight: 30, pattern: 'steady', shadow: 0.32, color: 0xa7bcae },
  crucian: { label: '붕어', min: 12, max: 32, weight: 40, pattern: 'steady', shadow: 0.55, color: 0x9a8a52 },
  carp: { label: '잉어', min: 35, max: 75, weight: 22, pattern: 'tricky', shadow: 0.9, color: 0xd98a3a },
  catfish: { label: '메기', min: 40, max: 90, weight: 8, pattern: 'tricky', shadow: 1.1, color: 0x4f4a42 },
};
export const FISH_ORDER = Object.keys(FISH);

// 찌가 완전히 잠긴 뒤 누를 수 있는 시간(초). 느린 휴대폰과 사람에게도 넉넉하게 둔다.
// 2026-11-22 사용자 결정(여유 쪽 제안)으로 1.0 에서 1.3 으로 늘렸다
export const BITE_WINDOW = 1.3;
// 진짜로 물기 직전의 잠잠한 시간(초). 이때 물고기 그림자가 흔들림을 멈추고 살짝 물러난다.
// 진짜로 물기 전에만 오므로 속이는 신호가 아니다. 마지막으로 건드린 뒤 찌가 다 떠오른 다음에 시작하게
// 마지막 건드림과 무는 때 사이를 HUSH_GAP 만큼은 띄운다
export const HUSH = 0.4;
export const HUSH_GAP = 0.75;

// 물 위인지. pad 만큼 넓히거나(+) 좁힌(-) 타원으로 본다
export function inWater(x, z, pad = 0) {
  const dx = (x - POND.x) / (POND.rx + pad), dz = (z - POND.z) / (POND.rz + pad);
  return dx * dx + dz * dz < 1;
}

// 어떤 물고기가 올지. rng 는 0 이상 1 미만의 수를 돌려주는 함수
export function rollFish(rng) {
  const total = FISH_ORDER.reduce((sum, id) => sum + FISH[id].weight, 0);
  let r = rng() * total;
  for (const id of FISH_ORDER) { r -= FISH[id].weight; if (r < 0) return id; }
  return FISH_ORDER[FISH_ORDER.length - 1];
}
// 크기(cm, 소수 한 자리). 작은 쪽이 흔하고 큰 것은 드물다
export function rollSize(fish, rng) {
  const { min, max } = FISH[fish];
  return Math.round((min + (max - min) * Math.pow(rng(), 1.6)) * 10) / 10;
}

// 입질 계획(초, 찌가 물에 닿은 때부터). 물고기가 다가오고(approach), 찌를 몇 번 건드린 뒤(nibbles),
// 찌를 완전히 끌고 들어간다(bite). steady 는 한두 번 느긋하게, tricky 는 여러 번 잦게 건드린다.
// 마지막 건드림과 무는 때 사이는 잠잠한 시간(HUSH)이 들어가도록 HUSH_GAP 이상 띄운다
export function planBite(fish, rng) {
  const tricky = FISH[fish].pattern === 'tricky';
  const approach = 1.2 + rng() * 1.8;
  const count = tricky ? 2 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2);
  const gap = () => (tricky ? 0.4 + rng() * 0.5 : 0.7 + rng() * 0.5);
  const nibbles = [];
  let t = approach;
  for (let i = 0; i < count; i++) { nibbles.push(t); const g = gap(); t += i === count - 1 ? Math.max(HUSH_GAP, g) : g; }
  return { fish, approach, nibbles, bite: t, window: BITE_WINDOW };
}

// 낚은 물고기의 무게감(0~1). 연출의 크기를 여기에 맞춘다: 크고 드문 물고기일수록 크게.
// 크기는 송사리 3cm 에서 메기 90cm 까지 로그로 재고, 드문 정도를 조금 더한다. 판정과 기록에는 쓰지 않는다
export function catchWeight(fish, size) {
  const most = Math.max(...FISH_ORDER.map((id) => FISH[id].weight));
  const bySize = Math.log(Math.max(size, 3) / 3) / Math.log(30);
  const rarity = 1 - FISH[fish].weight / most;
  return Math.min(1, Math.max(0, bySize * 0.8 + rarity * 0.2));
}

// t 초에 눌렀을 때. 'reeled' 물고기가 오기 전에 거둠, 'early' 건드릴 때 당김, 'caught' 낚음, 'late' 놓침
export function judge(plan, t) {
  if (t < plan.nibbles[0]) return 'reeled';
  if (t < plan.bite) return 'early';
  if (t <= plan.bite + plan.window) return 'caught';
  return 'late';
}

// 한국 날짜 (YYYY-MM-DD). 기기의 시간대와 상관없이 모두에게 같은 날이 되게 한다
export function kstDay(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---- 낚시 기록 ----
// state = { version, log: { 물고기: { best: 가장 큰 크기, first: 처음 잡은 날, count: 잡은 수 } } }
export const FISHING_VERSION = 1;
export function createFishingState() { return { version: FISHING_VERSION, log: {} }; }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const knownFish = (fish) => typeof fish === 'string' && Object.hasOwn(FISH, fish);
const sizeFits = (fish, size) => Number.isFinite(size) && size >= FISH[fish].min && size <= FISH[fish].max;
function entryFits(fish, entry) {
  return !!entry && typeof entry === 'object' && sizeFits(fish, entry.best) &&
    typeof entry.first === 'string' && DAY.test(entry.first) && Number.isInteger(entry.count) && entry.count >= 1;
}

export function validate(state, cmd) {
  switch (cmd?.type) {
    case 'recordCatch':
      if (!knownFish(cmd.fish)) return { ok: false, reason: '모르는 물고기입니다' };
      if (!sizeFits(cmd.fish, cmd.size)) return { ok: false, reason: '물고기 크기가 맞지 않습니다' };
      if (typeof cmd.day !== 'string' || !DAY.test(cmd.day)) return { ok: false, reason: '날짜가 맞지 않습니다' };
      return { ok: true };
    case 'setLogEntry':
      if (!knownFish(cmd.fish)) return { ok: false, reason: '모르는 물고기입니다' };
      if (cmd.entry !== null && !entryFits(cmd.fish, cmd.entry)) return { ok: false, reason: '기록이 맞지 않습니다' };
      return { ok: true };
    default:
      return { ok: false, reason: '모르는 명령입니다' };
  }
}

// 명령을 적용한 새 상태를 돌려준다. 받은 상태는 고치지 않는다
export function apply(state, cmd) {
  const log = { ...state.log };
  if (cmd.type === 'recordCatch') {
    const was = log[cmd.fish];
    log[cmd.fish] = was
      ? { best: Math.max(was.best, cmd.size), first: was.first, count: was.count + 1 }
      : { best: cmd.size, first: cmd.day, count: 1 };
  } else if (cmd.type === 'setLogEntry') {
    if (cmd.entry) log[cmd.fish] = { ...cmd.entry }; else delete log[cmd.fish];
  }
  return { ...state, log };
}

// 명령을 되돌리는 명령. 적용하기 전의 상태로 구한다
export function inverseOf(state, cmd) {
  const was = state.log[cmd.fish];
  return { type: 'setLogEntry', fish: cmd.fish, entry: was ? { ...was } : null };
}

export function createFishingStore(initial = createFishingState()) {
  let state = initial;
  const listeners = new Set();
  return {
    get state() { return state; },
    can: (cmd) => validate(state, cmd),
    // 검증하고 적용한다. 통과하면 되돌리는 명령(inverse)도 돌려준다
    dispatch(cmd) {
      const result = validate(state, cmd);
      if (!result.ok) return result;
      const inverse = inverseOf(state, cmd);
      state = apply(state, cmd);
      for (const fn of listeners) fn(cmd);
      return { ok: true, inverse };
    },
    // 다른 탭이 저장한 기록으로 바꾼다
    replace(next) { state = next; for (const fn of listeners) fn({ type: 'replace' }); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

// ---- 저장 ----
export const FISHING_KEY = 'house-lab-web:fishing';
// 형식을 바꾸면 FISHING_VERSION 을 올리고 여기에 변환을 더한다. MIGRATIONS[1] 은 1판을 2판으로 바꾼다
const MIGRATIONS = {};

export function serializeFishing(state) {
  return JSON.stringify({ format: 'fishing-log', version: FISHING_VERSION, log: state.log });
}

// 글자를 기록으로 되읽는다. 지금 규칙에 맞지 않는 항목은 명령으로 다시 넣어 보며 걸러 낸다
export function parseFishing(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: '낚시 기록을 읽을 수 없습니다' }; }
  if (!data || data.format !== 'fishing-log' || typeof data.log !== 'object' || data.log === null) {
    return { ok: false, reason: '낚시 기록의 형식이 다릅니다' };
  }
  let version = Number(data.version) || 0;
  if (version > FISHING_VERSION) return { ok: false, newer: true, reason: '더 새로운 판에서 저장한 낚시 기록이라 읽을 수 없습니다' };
  while (version < FISHING_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, reason: `${version}판 낚시 기록을 바꾸는 방법이 없습니다` };
    data = step(data);
    version++;
  }
  const store = createFishingStore();
  let dropped = 0;
  for (const [fish, entry] of Object.entries(data.log)) {
    if (!store.dispatch({ type: 'setLogEntry', fish, entry }).ok) dropped++;
  }
  return { ok: true, state: store.state, dropped };
}

// 더 새로운 판(이 화면보다 나중에 나온 게임)에서 저장한 기록인지. 그런 기록은 읽지도 덮어쓰지도 않는다
function isNewerRecord(text) {
  try { const data = JSON.parse(text); return data?.format === 'fishing-log' && Number(data.version) > FISHING_VERSION; } catch { return false; }
}

// 저장소 하나에 읽고 쓴다. 저장소가 없거나 막혀 있으면 조용히 실패한다.
// 읽지 못한 기록은 지우지 않고 옆(:broken)에 남겨 둔다. 이미 남겨 둔 것이 있으면 덮어쓰지 않는다.
// 더 새로운 판의 기록은 망가진 것이 아니므로 옆에 옮기지 않고, 그 위에 쓰지도 않는다(그대로 남는다)
export function createFishingSaver(storage, key = FISHING_KEY) {
  return {
    available: !!storage,
    load() {
      if (!storage) return null;
      let text = null;
      try { text = storage.getItem(key); } catch { return null; }
      if (text === null) return { ok: true, state: createFishingState(), dropped: 0 };
      const result = parseFishing(text);
      if (!result.ok && !result.newer) {
        try { if (storage.getItem(`${key}:broken`) === null) storage.setItem(`${key}:broken`, text); } catch { /* 남기지 못해도 계속한다 */ }
      }
      return result;
    },
    save(state) {
      if (!storage) return false;
      try {
        const now = storage.getItem(key);
        if (now !== null && isNewerRecord(now)) return false; // 더 새 판의 기록을 1판으로 덮어쓰지 않는다
        storage.setItem(key, serializeFishing(state));
        return true;
      } catch { return false; }
    },
    // 지금 저장소에 더 새 판의 기록이 있는지 (저장하지 못한 까닭을 알리는 데 쓴다)
    newerStored() {
      if (!storage) return false;
      try { const now = storage.getItem(key); return now !== null && isNewerRecord(now); } catch { return false; }
    },
  };
}
