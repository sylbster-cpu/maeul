// 부품과 선택지 목록. 화면 코드와 규칙 코드가 함께 쓰는 자료다. three.js 를 불러오지 않는다.
// 새 가구를 넣으려면: assets-src/ 에 모델을 두고, PARTS 에 한 줄을 더한 뒤 `npm run pack` 을 실행한다.

export const CELL = 1; // 격자 한 칸의 한 변 (모델 단위). 의자 하나가 한 칸이다
export const WALL_HEIGHT = 3.4;

// 마당과 집의 자리
export const YARD = { w: 24, h: 24 };
export const HOUSE_CENTER_X = 12;
export const HOUSE_BACK_Z = 5;
export const MAT_X = 2; // 방 안 현관 깔개가 놓이는 칸 (서쪽 벽에서부터). 두 칸 너비
export const WINDOW_X = 3; // 북쪽 벽의 창문이 차지하는 칸 (서쪽 벽에서부터). 두 칸 너비

// 마당 밖으로 걸어 나갈 수 있는 칸 수. 연못가도 이 둘레 안에 있다
export const YARD_MARGIN = 3;
// 마당 동쪽 밖의 연못 (낚시터). 물은 가운데 (x, z), 반지름 rx, rz 인 타원이고 걸을 수 없다.
// 마당 칸과 겹치지 않으므로 저장된 가구와 부딪치지 않는다. 먼 쪽 물가는 걸을 수 있는 둘레 밖이다
export const POND = { x: 27.5, z: 18, rx: 2.6, rz: 3.1 };
// 마당 남쪽의 바닷가 (2026-11-22 사용자 결정: 따로 된 장면이 아니라 바깥을 넓혀 걸어서 간다).
// 풀밭은 sand 에서 끝나고 모래사장이 이어진다. 물가선(shoreZ) 너머는 바다라 걸을 수 없다.
// 물가선은 조금 굽이친다. 마당 칸과 겹치지 않으므로 저장된 가구와 부딪치지 않는다
export const BEACH = { sand: 26.5, shore: 31.5, wave: 0.6 };
export const shoreZ = (x) => BEACH.shore + BEACH.wave * Math.sin(x * 0.27);
// 마당 둘레의 나무 [x, z]. 걸을 수 있는 범위 안에 있고, 줄기(TREE_RADIUS)는 지나갈 수 없다.
// 마당 칸과 연못, 바닷가에 겹치지 않는다. 화면(view.js)과 걷기(character.js)가 함께 쓴다
export const TREES = [[-7, -6], [-9, 5], [-8, 15], [-6.5, 23.5], [4, -8], [15, -9], [27, -7], [31, 2], [33, 14], [31.5, 23.5], [-11.5, 20], [36, 21], [12, -12.5], [-11, -11], [35, -10]];
export const TREE_RADIUS = 0.5;
// 마당 밖까지 걸을 수 있는 범위. 남쪽은 바닷가까지(물에 들어가는 것은 따로 막는다),
// 나머지 세 쪽은 둘레의 나무 곁까지 넓혔다 (2026-11-22 사용자 결정: "나무로는 못 가네요" → 걷는 범위 넓히기)
export const OUTDOOR = { x0: -14, z0: -15, x1: 38.5, z1: BEACH.shore + BEACH.wave };

// 집의 단계. room 은 방의 칸 수 [가로, 세로], house 는 밖에서 보이는 집의 크기
export const LEVELS = {
  1: { label: '작은 집', room: [6, 6], house: { w: 6, d: 4, h: 2.7 } },
  2: { label: '넓은 집', room: [8, 8], house: { w: 8, d: 5, h: 2.9 } },
  3: { label: '큰 집', room: [10, 10], house: { w: 10, d: 6, h: 3.1 } },
};
export const MAX_LEVEL = 3;

// 놓는 물건. 모델의 앞면은 +Z 를 본다. layer 가 놓이는 자리를 정한다.
//   (없음)  바닥에 놓는 가구.  size 는 차지하는 칸 수 [가로, 세로]
//   'rug'   가구 아래에 깔리는 것
//   'top'   탁자나 수납장 위에 올려놓는 소품. 받치는 가구에는 surface (윗면 높이) 가 있어야 한다
//   'wall'  방의 벽에 거는 것.  span 은 벽을 따라 차지하는 칸 수, hang 은 거는 높이
// offset 은 모델을 옮기는 값 [x, y, z], scale 은 크기 배율
// seat 가 있는 가구에는 앉을 수 있다. h 는 앉는 면의 높이, z 는 앉는 자리가 가운데에서 앞으로 나온 거리,
//   x 는 앉는 자리들의 좌우 위치 (없으면 가운데 한 자리). 모두 모델 단위다
export const PARTS = {
  chair: { label: '의자', size: [1, 1], model: 'furniture/chair_A', seat: { h: 0.5 } },
  stool: { label: '스툴', size: [1, 1], model: 'furniture/chair_stool', seat: { h: 0.5 } },
  table: { label: '탁자', size: [2, 2], model: 'furniture/table_medium', scale: 0.92, surface: 1 },
  side_table: { label: '작은 탁자', size: [1, 1], model: 'furniture/table_small', scale: 0.9, surface: 1 },
  low_table: { label: '낮은 탁자', size: [3, 2], model: 'furniture/table_low', scale: 1.08, surface: 0.5 },
  bed: { label: '침대', size: [2, 3], model: 'furniture/bed_single_A' },
  double_bed: { label: '큰 침대', size: [3, 3], model: 'furniture/bed_double_A', scale: 0.95 },
  couch: { label: '소파', size: [3, 2], model: 'furniture/couch_pillows', scale: 0.97, offset: [0, 0, -0.1], seat: { h: 0.5, z: 0.22, x: [-0.8, 0, 0.8] } },
  armchair: { label: '안락의자', size: [2, 2], model: 'furniture/armchair_pillows', offset: [0, 0, -0.05], seat: { h: 0.5, z: 0.22 } },
  cabinet: { label: '수납장', size: [2, 1], model: 'furniture/cabinet_medium', scale: 0.95, surface: 1 },
  drawer: { label: '서랍장', size: [1, 1], model: 'furniture/cabinet_small', scale: 0.92, surface: 1 },
  lamp: { label: '스탠드', size: [1, 1], model: 'furniture/lamp_standing' },
  plant: { label: '화분', size: [1, 1], model: 'furniture/cactus_medium_A' },
  rug: { label: '러그', size: [3, 2], model: 'furniture/rug_rectangle_A', layer: 'rug' },
  round_rug: { label: '둥근 러그', size: [3, 2], model: 'furniture/rug_oval_A', layer: 'rug' },
  // 올려놓는 소품
  books: { label: '책', size: [1, 1], model: 'furniture/book_set', layer: 'top', offset: [0, 0.25, 0] },
  table_lamp: { label: '탁상 스탠드', size: [1, 1], model: 'furniture/lamp_table', layer: 'top', scale: 0.72 },
  small_plant: { label: '작은 화분', size: [1, 1], model: 'furniture/cactus_small_A', layer: 'top' },
  photo: { label: '사진 액자', size: [1, 1], model: 'furniture/pictureframe_standing_A', layer: 'top' },
  photo_wide: { label: '넓은 사진', size: [1, 1], model: 'furniture/pictureframe_standing_B', layer: 'top' },
  // 벽에 거는 것
  frame: { label: '큰 액자', span: 1, hang: 2.05, model: 'furniture/pictureframe_large_A', layer: 'wall' },
  frame_wide: { label: '넓은 액자', span: 2, hang: 2.05, model: 'furniture/pictureframe_large_B', layer: 'wall' },
  frame_medium: { label: '액자', span: 1, hang: 2.05, model: 'furniture/pictureframe_medium', layer: 'wall' },
  frame_small: { label: '작은 액자', span: 1, hang: 2.1, model: 'furniture/pictureframe_small_A', layer: 'wall' },
  shelf: { label: '선반', span: 2, hang: 1.75, model: 'furniture/shelf_B_large_decorated', layer: 'wall' },
  shelf_small: { label: '작은 선반', span: 1, hang: 1.75, model: 'furniture/shelf_B_small_decorated', layer: 'wall' },
};
export const EXTRA_MODELS = [];

// 방 바닥재
export const FLOORS = {
  wood: { label: '밝은 나무', pattern: 'planks', colors: ['#d2a06a', '#c99660', '#d8a974', '#c48f58'] },
  walnut: { label: '짙은 나무', pattern: 'planks', colors: ['#8a5f41', '#7d5438', '#93684a', '#74502f'] },
  checker: { label: '체크 타일', pattern: 'checker', colors: ['#f1efe6', '#44525a'] },
  carpet: { label: '파란 카펫', pattern: 'plain', colors: ['#7fa7c4'] },
  moss: { label: '초록 카펫', pattern: 'plain', colors: ['#86b58a'] },
};

// 방 벽지. bottom 은 아래쪽 띠, stripe 는 세로 줄무늬
export const WALLPAPERS = {
  sage: { label: '초록 띠', top: '#efe3c8', bottom: '#2f9a78' },
  cream: { label: '크림', top: '#f4ead2', bottom: '#e0cba0' },
  sky: { label: '하늘 줄무늬', top: '#dcebf3', stripe: '#bcd8e8', bottom: '#8fb7cf' },
  rose: { label: '장미 줄무늬', top: '#f6e1df', stripe: '#eec6c4', bottom: '#cf8f8f' },
  navy: { label: '남색', top: '#3f5878', bottom: '#2a3d57' },
};

// 집 겉모습
export const ROOFS = {
  terracotta: { label: '적갈색', color: '#b85c44' },
  slate: { label: '청회색', color: '#5d6f85' },
  moss: { label: '이끼색', color: '#5f8a5b' },
  plum: { label: '자주색', color: '#8a5278' },
};
export const SIDINGS = {
  cream: { label: '크림', color: '#f1e3c4' },
  white: { label: '흰색', color: '#f7f5ef' },
  sky: { label: '하늘색', color: '#cfe3ee' },
  sage: { label: '연두색', color: '#cfe0c3' },
  peach: { label: '살구색', color: '#f3cfb8' },
};
export const DOORS = {
  green: { label: '초록', color: '#2f8f6f' },
  red: { label: '빨강', color: '#c0503f' },
  navy: { label: '남색', color: '#3b5878' },
  wood: { label: '나무', color: '#9a6a44' },
};
