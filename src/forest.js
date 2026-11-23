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
export function todaysDiscovery(now = new Date()) {
  return discoveryForDay(koreaDay(now));
}
