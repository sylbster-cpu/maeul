// 숲의 하루 발견물. 한국 날짜만 사용하며 저장이나 접속 보상을 만들지 않는다.
// Three.js와 무관한 규칙: 브라우저와 기기에 관계없이 같은 날 같은 발견이다.
export const FOREST_DISCOVERIES = Object.freeze([
  { id: 'pinecone', name: '솔방울', description: '바람에 떨어진 솔방울이 숲길에 놓여 있습니다.' },
  { id: 'mushroom', name: '작은 버섯', description: '나무 그늘에서 작은 버섯을 발견했습니다.' },
  { id: 'feather', name: '새 깃털', description: '새가 지나간 자리에 깃털 하나가 남았습니다.' },
]);

export function koreaDay(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('올바른 날짜가 필요합니다');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// 3일 단위 순환. 발견은 수집하거나 소비하지 않고, 바라보고 확인하는 경험이다.
export function discoveryForDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new TypeError('YYYY-MM-DD 날짜가 필요합니다');
  const index = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
  if (!Number.isFinite(index)) throw new TypeError('올바른 날짜가 필요합니다');
  return FOREST_DISCOVERIES[((index % FOREST_DISCOVERIES.length) + FOREST_DISCOVERIES.length) % FOREST_DISCOVERIES.length];
}
// 매일 다른 위치. 길의 중앙에서 벗어나 캐릭터가 발견물 위에 서지 않도록 한다.
export const FOREST_SITES = Object.freeze([
  Object.freeze({ x: -9.1, z: -5.0 }),
  Object.freeze({ x: -8.0, z: -10.0 }),
  Object.freeze({ x: -5.6, z: -8.1 }),
]);
export function discoverySiteForDay(day) {
  const item = discoveryForDay(day);
  return FOREST_SITES[FOREST_DISCOVERIES.findIndex(entry => entry.id === item.id)];
}
export function todaysDiscoverySite(now = new Date()) {
  return discoverySiteForDay(koreaDay(now));
}
export function todaysDiscovery(now = new Date()) {
  return discoveryForDay(koreaDay(now));
}

// 카메라 쪽에 서면 발견물이 몸 뒤로 가린다. 카메라 반대쪽 관찰 지점을 계산한다.
// view.basis().forward는 카메라에서 멀어지는 세계 방향이다.
export function forestViewingPoint(site, forward, distance = 1.15) {
  if (![site?.x, site?.z, forward?.x, forward?.z, distance].every(Number.isFinite) || distance <= 0) {
    throw new TypeError('올바른 발견 위치와 카메라 방향이 필요합니다');
  }
  const length = Math.hypot(forward.x, forward.z);
  if (length < 1e-6) throw new TypeError('카메라 방향이 필요합니다');
  return { x: site.x + forward.x / length * distance, z: site.z + forward.z / length * distance };
}
