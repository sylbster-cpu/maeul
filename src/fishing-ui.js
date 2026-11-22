// 낚시 기록 창과 낚은 순간의 카드. 기록 창은 잡아 본 물고기만 보여 주고, 아직 못 본 물고기는 수만 알린다.
import { FISH, FISH_ORDER } from './fishing.js';

const dayText = (day) => { const [, m, d] = day.split('-').map(Number); return `${m}월 ${d}일`; };

export function createFishingUI({ fishing }) {
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
      more.textContent = `${entry.count}마리 · 처음 잡은 날 ${dayText(entry.first)}`;
      row.append(name, best, more);
      list.append(row);
    }
    const left = FISH_ORDER.length - caught.length;
    $('fish-summary').textContent = !caught.length
      ? '아직 잡은 물고기가 없습니다. 마당 옆 연못의 물을 눌러 보세요.'
      : left ? `이 연못에는 아직 잡아 보지 못한 물고기가 ${left}종 더 있습니다.` : '이 연못의 물고기를 모두 잡아 보았습니다.';
    $('fish-today').textContent = `${fishing.todayText()} 한국 날짜로 날마다 바뀝니다.`;
  }
  function open() { render(); layer.hidden = false; $('fish-close').focus(); }
  function close() { layer.hidden = true; button.focus(); }
  button.addEventListener('click', open);
  $('fish-close').addEventListener('click', close);
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  });
  // 창을 연 채 다른 탭에서 낚아도 바로 보이게 한다
  fishing.store.subscribe(() => { if (!layer.hidden) render(); });
  return { open, close };
}

// 낚은 순간 화면 가운데에 크게 뜨는 카드. 누르는 것을 막지 않는다
export function createCatchCard() {
  const $ = (id) => document.getElementById(id);
  const card = $('catch-card');
  const dock = document.querySelector('.dock');
  const hint = $('hint');
  return {
    show({ label, size, note }) {
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
    hide() { card.hidden = true; hint.style.visibility = ''; },
  };
}
