// 공동 쉼터의 순수 규칙. 집 저장·three.js·Firebase SDK와 섞지 않는다.
export const SHELTER_VERSION = 1;
export const MARKS = Object.freeze(['tree', 'wind', 'star', 'moon']);
export const MARK_LABELS = Object.freeze({ tree: '나무', wind: '바람', star: '별', moon: '달' });
export const SLOTS = Object.freeze(['0', '1', '2', '3', '4', '5']);
export const SHELTER_KINDS = Object.freeze(['stool', 'side_table', 'plant', 'lamp']);
export const ENTRANCE = Object.freeze(['3_0', '4_0', '3_1', '4_1']);
// 오래된 모바일 브라우저에서도 순수 데이터 복사를 할 수 있도록 structuredClone에 기대지 않는다.
export const cloneShelterData = value => Array.isArray(value) ? value.map(cloneShelterData)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,cloneShelterData(v)])) : value;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const map = (v) => !!v && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const keys = (v, names) => map(v) && Object.keys(v).length === names.length && names.every(k => own(v, k));
const uidFits = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(v);
export const validShelterId = (v) => typeof v === 'string' && /^[A-Za-z0-9]{20}$/.test(v);
export const validCell = (v) => typeof v === 'string' && /^[0-7]_[0-7]$/.test(v) && !ENTRANCE.includes(v);
const markFits = (v) => MARKS.includes(v);
const slotFits = (v) => SLOTS.includes(v);
const validPiece = (p) => keys(p, ['kind', 'cell', 'rot']) && SHELTER_KINDS.includes(p.kind) &&
  validCell(p.cell) && Number.isInteger(p.rot) && p.rot >= 0 && p.rot < 4;
const samePiece = (a, b) => validPiece(a) && validPiece(b) && a.kind === b.kind && a.cell === b.cell && a.rot === b.rot;
const change = (type, mark, slot = '', from = '', to = '') => ({ type, mark, slot, from, to });
const failed = (reason) => ({ ok: false, reason });
const passed = () => ({ ok: true });
export const memberMark = (state, uid) => MARKS.find(mark => state.members[mark] === uid) || null;

export function createShelter(ownerUid) {
  if (!uidFits(ownerUid)) throw new Error('쉼터 사용자 정보가 올바르지 않습니다');
  return { version: SHELTER_VERSION, ownerUid, members: { tree: ownerUid }, items: { tree: {} },
    cells: {}, revision: 0, change: change('create', 'tree') };
}

// 서버에서 읽은 상태를 검증한다. 잘못된 상태를 비우거나 고쳐 써서 덮지 않는다.
export function readShelter(data) {
  if (!map(data)) throw new Error('쉼터 정보를 읽을 수 없습니다');
  const { updatedAt, ...s } = data;
  const bad = () => { throw new Error('쉼터 정보가 맞지 않습니다'); };
  if (!keys(s, ['version','ownerUid','members','items','cells','revision','change']) ||
      s.version !== SHELTER_VERSION || !uidFits(s.ownerUid) ||
      !map(s.members) || !map(s.items) || !map(s.cells) ||
      !Number.isSafeInteger(s.revision) || s.revision < 0 ||
      s.members.tree !== s.ownerUid) bad();
  const marks = Object.keys(s.members);
  if (!marks.every(markFits) || !keys(s.items, marks) ||
      !Object.values(s.members).every(uidFits) ||
      new Set(Object.values(s.members)).size !== marks.length) bad();
  const cells = new Set();
  for (const mark of marks) {
    if (!map(s.items[mark])) bad();
    for (const [slot, p] of Object.entries(s.items[mark])) {
      if (!slotFits(slot) || !validPiece(p) || cells.has(p.cell)) bad();
      const pointer = s.cells[p.cell];
      if (!keys(pointer, ['mark','slot']) || pointer.mark !== mark || pointer.slot !== slot) bad();
      cells.add(p.cell);
    }
  }
  if (Object.keys(s.cells).length !== cells.size) bad();
  const c = s.change;
  if (!keys(c, ['type','mark','slot','from','to']) || !markFits(c.mark) ||
      !['create','join','leave','place','move','rotate','remove'].includes(c.type)) bad();
  if (['create','join','leave'].includes(c.type)) {
    if (c.slot !== '' || c.from !== '' || c.to !== '') bad();
  } else if (!slotFits(c.slot) ||
      (c.type === 'place' ? c.from !== '' : !validCell(c.from)) ||
      (c.type === 'remove' ? c.to !== '' : !validCell(c.to))) bad();
  return cloneShelterData(s);
}

// 명령에는 현재 본 가구(expect)가 들어간다. 다른 탭이 바꾼 가구를 오래된 명령으로 덮지 않는다.
export function validate(state, uid, cmd) {
  if (!uidFits(uid) || !cmd || !markFits(cmd.mark)) return failed('쉼터 사용자 정보가 맞지 않습니다');
  const mark = cmd.mark;
  if (cmd.type === 'join') {
    if (memberMark(state, uid)) return failed('이미 이 쉼터에 참여하고 있습니다');
    if (own(state.members, mark)) return failed('이미 누군가 사용 중인 표식입니다');
    return passed();
  }
  if (state.members[mark] !== uid) return failed('내 표식으로만 가구를 바꿀 수 있습니다');
  if (cmd.type === 'leave') {
    if (uid === state.ownerUid) return failed('개설자 표식은 비울 수 없습니다');
    return Object.keys(state.items[mark]).length ? failed('내 가구를 모두 치운 뒤 나갈 수 있습니다') : passed();
  }
  if (!slotFits(cmd.slot)) return failed('가구는 한 사람당 6개까지 놓을 수 있습니다');
  const was = state.items[mark][cmd.slot];
  if (cmd.type === 'place') {
    if (was) return failed('이미 사용 중인 가구 자리입니다');
    if (!validPiece(cmd.piece)) return failed('놓을 수 없는 가구 또는 칸입니다');
    if (own(state.cells, cmd.piece.cell)) return failed('친구가 먼저 놓았거나 이미 가구가 있는 칸입니다');
    return passed();
  }
  if (!['move','rotate','remove'].includes(cmd.type)) return failed('모르는 명령입니다');
  if (!samePiece(was, cmd.expect)) return failed('가구가 이미 바뀌었습니다. 다시 보고 골라 주세요');
  if (cmd.type === 'remove') return passed();
  if (!validPiece(cmd.piece) || cmd.piece.kind !== was.kind) return failed('가구 종류는 바꿀 수 없습니다');
  if (cmd.type === 'rotate') {
    return cmd.piece.cell === was.cell && cmd.piece.rot !== was.rot ? passed() : failed('돌리는 방향이 맞지 않습니다');
  }
  if (cmd.piece.cell === was.cell || own(state.cells, cmd.piece.cell)) return failed('빈 칸을 골라 주세요');
  return passed();
}

export function apply(state, uid, cmd) {
  const check = validate(state, uid, cmd);
  if (!check.ok) throw new Error(check.reason);
  const next = cloneShelterData(state);
  const { type, mark, slot } = cmd;
  if (type === 'join') {
    next.members[mark] = uid;
    next.items[mark] = {};
    next.change = change(type, mark);
  } else if (type === 'leave') {
    delete next.members[mark];
    delete next.items[mark];
    next.change = change(type, mark);
  } else {
    const was = next.items[mark][slot];
    const from = was?.cell || '';
    const to = type === 'remove' ? '' : cmd.piece.cell;
    if (from && from !== to) delete next.cells[from];
    if (type === 'remove') delete next.items[mark][slot];
    else {
      next.items[mark][slot] = { ...cmd.piece };
      next.cells[to] = { mark, slot };
    }
    next.change = change(type, mark, slot, from, to);
  }
  next.revision += 1;
  return next;
}

// 반대 명령도 일반 명령처럼 최신 상태에서 다시 검증해야 한다. 다른 사람의 새 배치를 덮지 않는다.
export function inverseOf(state, uid, cmd) {
  const check = validate(state, uid, cmd);
  if (!check.ok) throw new Error(check.reason);
  const { type, mark, slot, piece } = cmd;
  if (type === 'join' || type === 'leave') return { type: type === 'join' ? 'leave' : 'join', mark };
  if (type === 'place') return { type: 'remove', mark, slot, expect: { ...piece } };
  const was = { ...state.items[mark][slot] };
  if (type === 'remove') return { type: 'place', mark, slot, piece: was };
  return { type, mark, slot, expect: { ...piece }, piece: was };
}

// 지난번에 실제로 본 배치와 비교한다. 처음 방문·내 가구·사라진 가구는 강조하지 않는다.
export function changedFriendPieces(previous, current, uid) {
  if (!previous) return [];
  const result = [];
  for (const mark of Object.keys(current.members)) {
    if (current.members[mark] === uid) continue;
    for (const [slot, piece] of Object.entries(current.items[mark])) {
      if (previous.members[mark] !== current.members[mark] || !samePiece(previous.items[mark]?.[slot], piece))
        result.push({ mark, slot });
    }
  }
  return result;
}
