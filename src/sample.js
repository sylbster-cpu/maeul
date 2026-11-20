// 처음 보이는 방. 화면 조작과 똑같은 명령의 목록으로 만든다.
export function sampleCommands(store) {
  const cmds = [];
  const add = (space, part, where) => cmds.push({ type: 'placeObject', space, id: store.nextId(), part, ...where, by: store.playerId });
  const thing = (space, part, x, y, rot = 0) => add(space, part, { x, y, rot });
  const hang = (part, wall, i) => add('main', part, { wall, i });
  // 방 (6 x 6 칸). 현관 깔개는 아래쪽 (2,5) (3,5), 창문은 북쪽 벽의 3~4번 칸
  thing('main', 'bed', 0, 0, 0);
  thing('main', 'lamp', 2, 0, 0);
  thing('main', 'cabinet', 4, 0, 0);
  thing('main', 'rug', 2, 2, 0);
  thing('main', 'table', 3, 2, 0);
  thing('main', 'chair', 2, 2, 1);
  // 오른쪽 의자는 탁자 앞에 둔다. 옆 통로(x=5)를 열어 탁자 뒤편까지 걸을 수 있게 한다.
  thing('main', 'chair', 4, 4, 2);
  thing('main', 'plant', 0, 5, 0);
  // 올려놓은 소품과 벽에 건 것
  thing('main', 'small_plant', 4, 0, 0);
  thing('main', 'photo', 5, 0, 0);
  thing('main', 'books', 4, 3, 0);
  hang('shelf', 'N', 0);
  hang('frame', 'W', 3);
  // 마당
  thing('yard', 'plant', 5, 12, 0);
  thing('yard', 'stool', 18, 13, 0);
  return cmds;
}
