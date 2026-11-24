// 기록 창(낚시·채집 두 칸, 2026-11-24 사용자 결정)과 낚은 순간의 카드.
// 기록 창은 잡아 보거나 주워 본 것만 보여 주고, 아직 못 본 것은 수만 알린다.
import { FISH, FISH_ORDER, WATERS, WATER_ORDER, fishIn } from './fishing.js';
import { GATHER, GATHER_ORDER } from './gathering.js';

const dayText = (day) => { const [, m, d] = day.split('-').map(Number); return `${m}월 ${d}일`; };

export function createFishingUI({ fishing, gathering = null }) {
  const $ = (id) => document.getElementById(id);
  const layer = $('fish-layer');
  const list = $('fish-list');
  const button = $('fish-log');

  function render() {
    const log = fishing.store.state.log;
    const caught = FISH_ORDER.filter((id) => log[id]);
    list.replaceChildren();
    for (const id of caught) {
      const entry = log[id];
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = FISH[id].label;
      const best = document.createElement('span');
      best.textContent = `가장 큰 것 ${entry.best}cm`;
      const more = document.createElement('small');
      more.textContent = `${WATERS[FISH[id].water].label} · ${entry.count}마리 · 처음 잡은 날 ${dayText(entry.first)}`;
      row.append(name, best, more);
      list.append(row);
    }
    // 아직 잡아 보지 못한 물고기는 물마다 수만 알린다
    const left = WATER_ORDER.map((w) => [w, fishIn(w).filter((id) => !log[id]).length]).filter(([, n]) => n > 0);
    $('fish-summary').textContent = !caught.length
      ? '아직 잡은 물고기가 없습니다. 마당 옆 연못이나 남쪽 바닷가의 물을 눌러 보세요.'
      : left.length ? `아직 잡아 보지 못한 물고기가 ${left.map(([w, n]) => `${WATERS[w].label}에 ${n}종`).join(', ')} 더 있습니다.`
        : '연못과 바다의 물고기를 모두 잡아 보았습니다.';
    $('fish-today').textContent = `오늘 잘 잡히는 물고기는 ${WATER_ORDER.map((w) => `${WATERS[w].label}에서 ${fishing.todayLabel(w)}`).join(', ')}입니다. 한국 날짜로 날마다 바뀝니다.`;
  }
  // 채집 칸 (4단계 채집 실험)
  function renderGather() {
    if (!gathering) return;
    const log = gathering.store.state.log;
    const found = GATHER_ORDER.filter((id) => log[id]);
    const glist = $('gather-list');
    glist.replaceChildren();
    for (const id of found) {
      const entry = log[id];
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = GATHER[id].label;
      const best = document.createElement('span');
      best.textContent = `가장 큰 것 ${entry.best}cm`;
      const more = document.createElement('small');
      more.textContent = `숲 · ${entry.count}${GATHER[id].unit} · 처음 주운 날 ${dayText(entry.first)}`;
      row.append(name, best, more);
      glist.append(row);
    }
    const missing = GATHER_ORDER.length - found.length;
    $('gather-summary').textContent = !found.length
      ? '아직 주운 것이 없습니다. 집 왼편 숲길로 가서 땅에 놓인 것을 눌러 보세요.'
      : missing ? `아직 주워 보지 못한 것이 ${missing}종 더 있습니다.` : '숲의 세 가지를 모두 주워 보았습니다.';
    const left = gathering.left;
    const special = left.some((f) => f.special);
    $('gather-today').textContent = left.length
      ? `오늘 숲에 주울 것이 ${left.length}개 남았습니다${special ? '. 금빛 고리 안의 것은 오늘의 발견으로, 같은 종류 가운데 그날 가장 큽니다' : ''}. 한국 날짜로 날마다 새로 놓입니다.`
      : '오늘 숲의 것은 모두 주웠습니다. 한국 날짜로 내일 새로 놓입니다.';
  }
  let tab = 'fish';
  function showTab(next) {
    tab = next;
    $('log-tab-fish').setAttribute('aria-pressed', String(tab === 'fish'));
    $('log-tab-gather').setAttribute('aria-pressed', String(tab === 'gather'));
    $('log-fish').hidden = tab !== 'fish';
    $('log-gather').hidden = tab !== 'gather';
    if (tab === 'gather') renderGather(); else render();
  }
  $('log-tab-fish').addEventListener('click', () => showTab('fish'));
  $('log-tab-gather').addEventListener('click', () => showTab('gather'));
  function open() { render(); renderGather(); layer.hidden = false; $('fish-close').focus(); }
  function close() { layer.hidden = true; button.focus(); }
  button.addEventListener('click', open);
  $('fish-close').addEventListener('click', close);
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  });
  // 창을 연 채 다른 탭에서 낚아도 바로 보이게 한다
  fishing.store.subscribe(() => { if (!layer.hidden) render(); });
  gathering?.store.subscribe(() => { if (!layer.hidden) renderGather(); });
  return { open, close, showTab };
}

// 낚은 순간 화면 가운데에 크게 뜨는 카드. 누르는 것을 막지 않는다
export function createCatchCard() {
  const $ = (id) => document.getElementById(id);
  const card = $('catch-card');
  const dock = document.querySelector('.dock');
  const hint = $('hint');
  const dim = $('rare-dim');
  return {
    // rare: 가장 드문 물고기를 처음 낚았을 때. 주변을 약하게 어둡게 하고 이름을 강조한다(2026-11-23 사용자 결정, 큰 흔들림은 없음)
    show({ label, size, note, rare = false }) {
      card.classList.toggle('rare', rare);
      dim.classList.toggle('on', rare);
      $('catch-name').textContent = label;
      $('catch-size').textContent = `${size}cm`;
      $('catch-note').textContent = note || '낚았습니다!';
      $('catch-note').dataset.kind = note ? 'record' : 'plain';
      card.style.bottom = `${dock.offsetHeight + 8}px`; // 쟁반 바로 위, 안내 문구 자리
      card.hidden = false;
      hint.style.visibility = 'hidden'; // 카드 양옆으로 안내가 비치지 않게 한다. 자리는 그대로 둔다
      card.classList.remove('pop');
      void card.offsetWidth; // 다시 뜰 때도 처음부터 움직이게 한다
      card.classList.add('pop');
    },
    hide() { card.hidden = true; hint.style.visibility = ''; dim.classList.remove('on'); },
    get rare() { return dim.classList.contains('on'); }, // 자동 시험이 읽는다
  };
}
