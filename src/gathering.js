// 숲에서 줍기 (4단계 채집 실험, 2026-11-24 사용자 결정. 질문: 주운 것을 집에 두고 싶어 하는가).
// 3시간마다(한국 시각 0·3·6…21시) 숲의 12곳 가운데 6곳에 주울 거리가 새로 놓이고(2026-11-25 사용자 결정 "같은 날 다시 놓이게"),
// 금빛 고리의 "오늘의 발견"은 하루에 하나 주울 수 있다. 놓이는 자리·종류·크기는 날짜와 시간대만으로 정하므로
// 모두에게 같다(docs/GAME_PRINCIPLES.md 1-11). 하루에 주울 수는 제한하지 않는다.
// 기록을 바꾸는 것은 모두 명령을 거친다: validate → apply, 그리고 되돌리는 명령(inverseOf) (AGENTS.md 규칙 4).
// 기록은 집 저장·공유 링크·Firebase 와 섞지 않고 따로 둔다. 집에 놓기는 이번에 넣지 않는다.
// three.js 를 부르지 않는다.
import { FOREST_DISCOVERIES, GATHER_SPOTS, discoveryForDay, discoverySiteForDay, seededRandom } from './forest.js';
import { PARTS } from './parts.js';
import { validate as houseValidate, apply as houseApply, derive as houseDerive } from './state.js'; // 집 규칙

// 크기(cm). 같은 것이라도 크기가 달라, 더 큰 것을 찾으러 다닐 이유가 된다(2026-11-24 사용자 결정)
export const GATHER = Object.freeze({
  pinecone: Object.freeze({ label: '솔방울', min: 3, max: 12, unit: '개' }),
  mushroom: Object.freeze({ label: '작은 버섯', min: 2, max: 8, unit: '개' }),
  feather: Object.freeze({ label: '새 깃털', min: 6, max: 24, unit: '개' }),
});
export const GATHER_ORDER = FOREST_DISCOVERIES.map((d) => d.id);
export const DAILY_FINDS = 6; // 한 시간대에 놓이는 보통 주울 거리 수
// 다시 놓이는 간격(시간). 하루를 이만큼씩 나눈 시간대마다 새로 놓인다. 바꾸면 이 값 하나만 바꾼다
export const SLOT_HOURS = 3;
export const SLOTS = 24 / SLOT_HOURS;
export const SPECIAL_ID = 'special';
const SPECIAL_FROM = 0.85; // 보통 것은 크기 범위의 이만큼까지, 오늘의 발견은 그 위
// 이만큼 가까이 가면 줍는다. 오늘의 발견은 지금까지처럼 조금 더 멀리서(숲 연출의 발견하는 순간)
export const PICK_RADIUS = 0.8;
export const SPECIAL_RADIUS = 1.3;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// 달력에 있는 날짜인가 (2026-13-01, 2026-02-30 은 아니다). 모양만 보면 뒤에서 예외가 난다(PR #41 GPT 검토 3)
export const validDay = (day) => typeof day === 'string' && DAY.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
  new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000);
const round1 = (v) => Math.round(v * 10) / 10;

// 한국 시각으로 몇째 날, 몇째 시간대인가. 한국은 서머타임이 없어 9시간을 더하면 된다
export function kstSlot(date = new Date()) {
  const t = new Date(date.getTime() + 9 * 3600 * 1000);
  return { day: t.toISOString().slice(0, 10), slot: Math.floor(t.getUTCHours() / SLOT_HOURS) };
}
// 다음 시간대가 시작하는 한국 시각(시). 마지막 시간대 다음은 0(자정)
export const nextSlotHour = (slot) => ((slot + 1) * SLOT_HOURS) % 24;
const validSlot = (slot) => Number.isInteger(slot) && slot >= 0 && slot < SLOTS;

// 오늘의 발견: 금빛 고리 자리. 하루 내내 같고, 언제나 그날 같은 종류의 보통 것보다 크다(크기 범위의 위쪽 15%)
const specials = new Map();
export function specialForDay(day) {
  if (!validDay(day)) throw new TypeError('YYYY-MM-DD 날짜가 필요합니다');
  if (specials.has(day)) return specials.get(day);
  const rand = seededRandom((dayNumber(day) * 2654435761 + 0x5eed) >>> 0);
  const kind = discoveryForDay(day).id;
  const { min, max } = GATHER[kind];
  const site = discoverySiteForDay(day);
  const out = Object.freeze({ id: SPECIAL_ID, x: site.x, z: site.z, kind, size: round1(min + (max - min) * (SPECIAL_FROM + 0.01 + (0.99 - SPECIAL_FROM) * rand())), special: true });
  specials.set(day, out);
  return out;
}

// 그 날 그 시간대에 숲에 놓이는 것들. [{ id, x, z, kind, size, special }]. 보통 것 6개와 오늘의 발견.
// 보통 것의 id 는 "시간대:s자리"라서 시간대마다 다르다. 같은 날·시간대면 늘 같은 답이다
const cache = new Map();
export function findsForDay(day, slot) {
  if (!validDay(day)) throw new TypeError('YYYY-MM-DD 날짜가 필요합니다');
  if (!validSlot(slot)) throw new TypeError('시간대가 맞지 않습니다');
  const key = `${day}#${slot}`;
  if (cache.has(key)) return cache.get(key);
  const rand = seededRandom(((dayNumber(day) * SLOTS + slot) * 2654435761 + 0x9a7e) >>> 0);
  const order = GATHER_SPOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const finds = order.slice(0, DAILY_FINDS).sort((a, b) => a - b).map((i) => {
    const kind = GATHER_ORDER[Math.floor(rand() * GATHER_ORDER.length)];
    const { min, max } = GATHER[kind];
    // 작은 것이 흔하고 큰 것은 드물다. 보통 것은 크기 범위의 85%까지만 나온다(그 위는 오늘의 발견)
    const size = round1(min + (max - min) * SPECIAL_FROM * rand() ** 1.6);
    return Object.freeze({ id: `${slot}:s${i}`, ...GATHER_SPOTS[i], kind, size, special: false });
  });
  finds.push(specialForDay(day));
  const out = Object.freeze(finds);
  cache.set(key, out);
  return out;
}
// id 로 그날의 주울 거리를 찾는다. 오늘의 발견이거나 "시간대:s자리" 꼴이어야 한다
export function findById(day, id) {
  if (!validDay(day) || typeof id !== 'string') return null;
  if (id === SPECIAL_ID) return specialForDay(day);
  const m = /^(\d+):s\d+$/.exec(id);
  const slot = m ? Number(m[1]) : -1;
  return validSlot(slot) ? findsForDay(day, slot).find((f) => f.id === id) || null : null;
}

// ---- 채집 기록 ----
// state = { version, log: { 종류: { best, first, count } }, day: 주운 자리를 적은 날 | null, picked: [그날 주운 것의 id] }
// picked 는 날이 바뀌면 비운 것으로 본다(pickedOn). 시간대가 바뀌면 id 가 달라 새로 놓인 것은 주운 적이 없는 셈이다
// 2판(2026-11-25): 시간대마다 다시 놓이면서 보통 것의 id 가 "s자리"에서 "시간대:s자리"로 바뀌었다
export const GATHER_VERSION = 2;
export function createGatherState() { return { version: GATHER_VERSION, log: {}, day: null, picked: [] }; }
export const pickedOn = (state, day) => (state.day === day ? state.picked : []);

const knownKind = (kind) => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(GATHER, kind);
const sizeFits = (kind, size) => Number.isFinite(size) && size >= GATHER[kind].min && size <= GATHER[kind].max;
function entryFits(kind, entry) {
  return !!entry && typeof entry === 'object' && sizeFits(kind, entry.best) &&
    validDay(entry.first) && Number.isInteger(entry.count) && entry.count >= 1;
}
function pickedFits(day, picked) {
  if (day === null) return Array.isArray(picked) && picked.length === 0;
  if (!validDay(day) || !Array.isArray(picked)) return false;
  return new Set(picked).size === picked.length && picked.every((id) => findById(day, id));
}

export function validate(state, cmd) {
  switch (cmd?.type) {
    case 'pick': {
      // 명령에는 날짜와 자리만 있다. 종류와 크기는 규칙이 날짜로 정하므로 지어낼 수 없다
      if (!validDay(cmd.day)) return { ok: false, reason: '날짜가 맞지 않습니다' };
      if (!findById(cmd.day, cmd.id)) return { ok: false, reason: '그날 그 자리에는 주울 것이 없습니다' };
      if (pickedOn(state, cmd.day).includes(cmd.id)) return { ok: false, reason: '이미 주웠습니다' };
      return { ok: true };
    }
    case 'setGatherEntry':
      if (!knownKind(cmd.kind)) return { ok: false, reason: '모르는 것입니다' };
      if (cmd.entry !== null && !entryFits(cmd.kind, cmd.entry)) return { ok: false, reason: '기록이 맞지 않습니다' };
      if ('day' in cmd && !pickedFits(cmd.day, cmd.picked)) return { ok: false, reason: '주운 자리 기록이 맞지 않습니다' };
      return { ok: true };
    case 'setPicked':
      if (!pickedFits(cmd.day, cmd.picked)) return { ok: false, reason: '주운 자리 기록이 맞지 않습니다' };
      return { ok: true };
    default:
      return { ok: false, reason: '모르는 명령입니다' };
  }
}

// 명령을 적용한 새 상태를 돌려준다. 받은 상태는 고치지 않는다
export function apply(state, cmd) {
  const log = { ...state.log };
  let { day, picked } = state;
  if (cmd.type === 'pick') {
    const find = findById(cmd.day, cmd.id);
    const was = log[find.kind];
    log[find.kind] = was
      ? { best: Math.max(was.best, find.size), first: was.first, count: was.count + 1 }
      : { best: find.size, first: cmd.day, count: 1 };
    picked = [...pickedOn(state, cmd.day), cmd.id];
    day = cmd.day;
  } else if (cmd.type === 'setGatherEntry') {
    if (cmd.entry) log[cmd.kind] = { ...cmd.entry }; else delete log[cmd.kind];
    if ('day' in cmd) { day = cmd.day; picked = [...cmd.picked]; }
  } else if (cmd.type === 'setPicked') {
    day = cmd.day; picked = [...cmd.picked];
  }
  return { ...state, log, day, picked };
}

// 명령을 되돌리는 명령. 적용하기 전의 상태로 구한다
export function inverseOf(state, cmd) {
  if (cmd.type === 'pick') {
    const kind = findById(cmd.day, cmd.id).kind;
    const was = state.log[kind];
    return { type: 'setGatherEntry', kind, entry: was ? { ...was } : null, day: state.day, picked: [...state.picked] };
  }
  if (cmd.type === 'setGatherEntry') {
    const was = state.log[cmd.kind];
    const back = { type: 'setGatherEntry', kind: cmd.kind, entry: was ? { ...was } : null };
    return 'day' in cmd ? { ...back, day: state.day, picked: [...state.picked] } : back;
  }
  return { type: 'setPicked', day: state.day, picked: [...state.picked] };
}

export function createGatherStore(initial = createGatherState()) {
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
export const GATHER_KEY = 'maeul:gathering';
// 형식을 바꾸면 GATHER_VERSION 을 올리고 여기에 변환을 더한다. MIGRATIONS[1] 은 1판을 2판으로 바꾼다
const MIGRATIONS = {
  // 1판은 미리 보기(Claude 게시 주소 판 35·36)에만 있었다. 종류별 기록은 그대로 두고, 그날 주운 자리는 id 꼴이 달라 비운다
  1: (data) => ({ ...data, version: 2, day: null, picked: [] }),
};

export function serializeGather(state) {
  return JSON.stringify({ format: 'gather-log', version: GATHER_VERSION, log: state.log, day: state.day, picked: state.picked });
}

// 글자를 기록으로 되읽는다. 지금 규칙에 맞지 않는 항목은 명령으로 다시 넣어 보며 걸러 낸다
export function parseGather(text) {
  // 어떤 글자가 와도 예외로 끝나지 않는다. 읽지 못하면 실패를 돌려주고, 저장소가 손상본을 옆에 남긴다
  try { return readGather(text); } catch { return { ok: false, reason: '채집 기록을 읽을 수 없습니다' }; }
}
function readGather(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: '채집 기록을 읽을 수 없습니다' }; }
  if (!data || data.format !== 'gather-log' || typeof data.log !== 'object' || data.log === null) {
    return { ok: false, reason: '채집 기록의 형식이 다릅니다' };
  }
  let version = Number(data.version) || 0;
  if (version > GATHER_VERSION) return { ok: false, newer: true, reason: '더 새로운 판에서 저장한 채집 기록이라 읽을 수 없습니다' };
  while (version < GATHER_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, reason: `${version}판 채집 기록을 바꾸는 방법이 없습니다` };
    data = step(data);
    version++;
  }
  const store = createGatherStore();
  let dropped = 0;
  for (const [kind, entry] of Object.entries(data.log)) {
    if (!store.dispatch({ type: 'setGatherEntry', kind, entry }).ok) dropped++;
  }
  // 주운 자리가 맞지 않으면 그날 것만 비운다. 종류별 기록은 남는다
  if (data.day !== undefined && data.day !== null && !store.dispatch({ type: 'setPicked', day: data.day, picked: data.picked }).ok) dropped++;
  return { ok: true, state: store.state, dropped };
}

function isNewerRecord(text) {
  try { const data = JSON.parse(text); return data?.format === 'gather-log' && Number(data.version) > GATHER_VERSION; } catch { return false; }
}

// 저장소 하나에 읽고 쓴다. 낚시 기록(fishing.js createFishingSaver)과 같은 규칙이다.
// 읽지 못한 기록은 지우지 않고 옆(:broken)에 남긴다. 더 새로운 판의 기록은 읽지도 덮어쓰지도 않는다
export function createGatherSaver(storage, key = GATHER_KEY) {
  return {
    available: !!storage,
    load() {
      if (!storage) return null;
      let text = null;
      try { text = storage.getItem(key); } catch { return null; }
      if (text === null) return { ok: true, state: createGatherState(), dropped: 0 };
      const result = parseGather(text);
      if (!result.ok && !result.newer) {
        try { if (storage.getItem(`${key}:broken`) === null) storage.setItem(`${key}:broken`, text); } catch { /* 남기지 못해도 계속한다 */ }
      }
      return result;
    },
    save(state) {
      if (!storage) return false;
      try {
        const now = storage.getItem(key);
        if (now !== null && isNewerRecord(now)) return false;
        storage.setItem(key, serializeGather(state));
        return true;
      } catch { return false; }
    },
    newerStored() {
      if (!storage) return false;
      try { const now = storage.getItem(key); return now !== null && isNewerRecord(now); } catch { return false; }
    },
  };
}

// ---- 집에 놓기 (4단계, 2026-11-25 사용자 결정) ----
// 가진 수는 채집 기록의 종류별 count(주운 수)다. 놓을 수 있는 수는 "가진 수 − 집에 놓인 수"로 센다(GPT 제안, 이슈 #4 글 107).
// 놓아도 채집 기록은 줄지 않는다. 치우면 다시 놓을 수 있다. 두 저장(집, 채집 기록)을 따로 늘리고 줄이지 않는다.
// 이 제한은 놓는 사람의 새 조작(history.js guard)에서만 본다. 되돌리기·다시 하기는 이미 있었던 상태로 돌아가므로 막지 않는다. 집 규칙(state.js)에 두면 불러오기·공유 링크·친구 집 구경에서
// 이미 놓인 것이 지워진다. 그래서 가진 것보다 많이 놓인 집(가져온 친구 집 등)은 그대로 두고, 더 놓지만 못하게 한다
const foundKind = (part) => (typeof part === 'string' && Object.prototype.hasOwnProperty.call(PARTS, part) ? PARTS[part].found || null : null);
const zeroCounts = () => Object.fromEntries(GATHER_ORDER.map((k) => [k, 0]));

// 집 전체(마당과 방)에 놓인 주운 것의 수
export function placedFound(house) {
  const out = zeroCounts();
  for (const space of Object.values(house?.spaces || {})) {
    for (const obj of Object.values(space?.objects || {})) { const k = foundKind(obj?.part); if (k) out[k]++; }
  }
  return out;
}
// 가진 수 (지금까지 주운 수)
export function ownedFound(gather) {
  const out = zeroCounts();
  for (const k of GATHER_ORDER) out[k] = gather?.log?.[k]?.count || 0;
  return out;
}
// 더 놓을 수 있는 수
export function availableFound(house, gather) {
  const placed = placedFound(house), owned = ownedFound(gather);
  return Object.fromEntries(GATHER_ORDER.map((k) => [k, Math.max(0, owned[k] - placed[k])]));
}
// 종류마다 가진 수·놓인 수·더 놓을 수 있는 수. 꾸미기 목록과 안내 줄이 함께 쓴다
export function foundCounts(house, gather) {
  const placed = placedFound(house), owned = ownedFound(gather);
  return Object.fromEntries(GATHER_ORDER.map((k) => [k, { owned: owned[k], placed: placed[k], available: Math.max(0, owned[k] - placed[k]) }]));
}
// 꾸미기 목록의 버튼 아래 줄. 휴대폰에서는 마우스를 올려 보는 설명(title)이 뜨지 않으므로 버튼에 바로 적는다.
// 0 은 "아직 주운 적 없음"과 "모두 놓음"을 가른다(PR #42 GPT 사용성 제안 1, 2026-11-26 사용자 결정 "가진 수 고쳐요")
export function foundShort({ owned, available }) {
  if (owned === 0) return '아직 없음';
  return available === 0 ? '다 놓음' : `남은 ${available}개`;
}
// 그 버튼을 골랐을 때 안내 줄. 가진 수·놓인 수·더 놓을 수 있는 수를 모두 적는다
export function foundHint(kind, { owned, placed, available }) {
  const label = GATHER[kind].label;
  if (owned === 0) {
    return placed === 0 ? `아직 주운 ${label}이 없습니다. 숲에서 주워 오면 놓을 수 있습니다.`
      : `이 집에 ${label} ${placed}개가 놓여 있지만 주운 것은 없습니다. 숲에서 주워 오면 더 놓을 수 있습니다.`;
  }
  if (placed === 0) return `가진 ${label} ${owned}개를 놓을 수 있습니다.`;
  if (placed > owned) return `놓인 ${label} ${placed}개가 가진 ${owned}개보다 많습니다. 더 놓으려면 숲에서 더 주워 와야 합니다.`;
  if (available === 0) return `가진 ${label} ${owned}개를 모두 놓았습니다. 놓인 것을 치우면 다시 놓을 수 있습니다.`;
  return `가진 ${label} ${owned}개 가운데 ${placed}개를 놓았습니다. ${available}개 더 놓을 수 있습니다.`;
}
// 새 조작으로 보낼 명령들이 가진 것보다 많이 놓게 되지 않는가. 집의 복사본에 명령을 차례대로 집 규칙(state.js validate → apply)으로
// 적용해 보고, 그 결과를 센다(PR #42 GPT 검토·재검토). 집 규칙에 막히는 명령은 건너뛴다. history.run 이 하는 것과 같으므로
// 같은 것을 두 번 치우거나, 실패한 놓기와 같은 id 로 다시 놓는 묶음도 실제로 놓일 수만큼 센다.
// 처음부터 가진 것보다 많이 놓인 집(가져온 친구 집 등)은 그보다 늘리지만 않으면 된다
export function checkFoundCommands(house, gather, cmds) {
  const list = Array.isArray(cmds) ? cmds : [];
  if (!house?.spaces) return { ok: true };
  // 주운 것을 놓거나 무엇을 치우는 명령이 없으면 셀 것이 없다(가구만 놓고 옮기는 조작은 그대로 보낸다)
  if (!list.some((c) => c?.type === 'removeObject' || (c?.type === 'placeObject' && foundKind(c.part)))) return { ok: true };
  const owned = ownedFound(gather);
  const start = placedFound(house);
  const trial = JSON.parse(JSON.stringify(house)); // 집 상태는 글자로 저장되는 데이터뿐이다
  let derived = houseDerive(trial);
  for (const cmd of list) {
    if (!houseValidate(trial, derived, cmd).ok) continue;
    houseApply(trial, derived, cmd);
    derived = houseDerive(trial);
  }
  const count = placedFound(trial);
  for (const k of GATHER_ORDER) {
    if (count[k] <= owned[k] || count[k] <= start[k]) continue;
    const label = GATHER[k].label;
    return {
      ok: false,
      reason: owned[k] === 0 ? `${label}을 아직 주운 적이 없습니다. 숲에서 주워 오세요`
        : `${label}을 더 놓으려면 숲에서 더 주워 와야 합니다 (가진 것 ${owned[k]}개, 놓인 것 ${start[k]}개)`,
    };
  }
  return { ok: true };
}
