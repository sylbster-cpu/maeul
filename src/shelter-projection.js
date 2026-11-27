// 공동 쉼터 상태에서 캐릭터가 읽는 충돌 자료만 만든다. 개인 집 저장으로는 전달하지 않는다.
export function shelterProjection(shelter) {
  const objects = {}, furniture = new Map();
  for (const [mark, slots] of Object.entries(shelter.items)) {
    for (const [slot, item] of Object.entries(slots)) {
      const [x, y] = item.cell.split('_').map(Number);
      const id = mark + '-' + slot;
      objects[id] = { id, part: item.kind, x, y, rot: item.rot };
      furniture.set(x + ',' + y, id);
    }
  }
  return { state: { house: { level: 2 }, spaces: { main: { objects } } },
    derived: { occ: { main: { furniture } } } };
}

// 친구가 내가 서 있던 칸에 배치했을 때 가까운 빈 칸으로 피한다. 통로는 항상 비어 있다.
export function freeShelterCell(state, x, z) {
  const cx = Math.max(0, Math.min(7, Math.floor(x))), cz = Math.max(0, Math.min(7, Math.floor(z)));
  if (!state.cells[cx + '_' + cz]) return null;
  let best = null, distance = Infinity;
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
    if (state.cells[a + '_' + b]) continue;
    const d = Math.hypot(a + 0.5 - x, b + 0.5 - z);
    if (d < distance) { best = [a + 0.5, b + 0.5]; distance = d; }
  }
  return best;
}
