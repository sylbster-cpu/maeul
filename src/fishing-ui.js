// 수첩(가진 것·낚시·채집 세 칸)과 낚은 순간의 카드.
// 낚시·채집 칸은 2026-11-24 사용자 결정의 기록 창이다. 6단계(2026-11-27 사용자 결정)에서 수첩으로 이름을 바꾸고
// 가진 것 칸을 더했으며, 걷기와 꾸미기 어디서나 한 번에 연다. 잡아 보거나 주워 본 것만 보여 준다.
import { FISH, FISH_ORDER, WATERS, WATER_ORDER } from './fishing.js';
import { GATHER, GATHER_ORDER, foundCounts } from './gathering.js';

const dayText = (day) => { const [, m, d] = day.split('-').map(Number); return `${m}월 ${d}일`; };

// store: 집 상태(가진 것 칸이 놓인 수를 센다). guest: 친구 집을 구경하는 중이면 그 집에 놓인 수는 세지 않는다.
// toast: 낚시하는 동안 수첩을 누르면 왜 안 되는지 알린다
export function createFishingUI({ fishing, gathering = null, store = null, guest = false, toast = () => {} }) {
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
    // 아직 잡아 보지 못한 물고기가 몇 종인지는 알리지 않는다. 종류가 모두 몇 가지인지 드러나기 때문이다
    // (2026-11-26 사용자 결정 "①만 빼기". 오늘 잘 잡히는 물고기는 그대로 둔다. 못 잡은 것은 이름 대신 "아직 잡아 보지 못한 물고기")
    const summary = $('fish-summary');
    summary.textContent = caught.length ? '' : '아직 잡은 물고기가 없습니다. 마당 옆 연못이나 남쪽 바닷가의 물을 눌러 보세요.';
    summary.hidden = caught.length > 0;
    $('fish-today').textContent = `오늘 잘 잡히는 물고기는 ${WATER_ORDER.map((w) => `${WATERS[w].label}에서 ${fishing.todayLabel(w)}`).join(', ')}입니다. 한국 날짜로 날마다 바뀝니다.`;
  }
  // 가진 것 칸 (6단계). 숲에서 주운 것마다 가진 수, 집에 놓은 수, 더 놓을 수 있는 수를 나눠 적는다.
  // 주워 본 것(또는 집에 놓여 있는 것)만 적는다. 아직 모르는 종류는 드러내지 않는다(2026-11-26 사용자 결정과 같다)
  function renderOwned() {
    const olist = $('owned-list');
    olist.replaceChildren();
    const counts = gathering && store ? foundCounts(store.state, gathering.store.state) : {};
    const shown = GATHER_ORDER.filter((id) => counts[id] && (counts[id].owned > 0 || (!guest && counts[id].placed > 0)));
    for (const id of shown) {
      const c = counts[id];
      const unit = GATHER[id].unit;
      const row = document.createElement('li');
      row.dataset.kind = id;
      const name = document.createElement('strong');
      name.textContent = GATHER[id].label;
      const owned = document.createElement('span');
      owned.textContent = `가진 것 ${c.owned}${unit}`;
      const more = document.createElement('small');
      more.textContent = guest ? '친구 집을 구경하는 동안에는 내 집에 놓은 수를 세지 않습니다'
        : `집에 놓은 것 ${c.placed}${unit} · 더 놓을 수 있는 것 ${c.available}${unit}`;
      row.append(name, owned, more);
      olist.append(row);
    }
    const summary = $('owned-summary');
    summary.textContent = shown.length ? '숲에서 주운 것은 꾸미기의 소품 칸에서 놓고, 화환에 꽂을 수 있습니다.' : '아직 가진 것이 없습니다. 숲에서 주운 것이 여기에 모입니다.';
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
    // 내가 주운 기록만 보인다. 종류가 모두 몇 가지인지, 숲에 몇 개 남았는지, 언제 새로 놓이는지,
    // 금빛 고리가 무엇인지는 알려 주지 않는다. 찾아가며 알게 한다
    // (2026-11-26 사용자: "너무 다 가르쳐주면 재미 없어요". 전에는 이 넷을 모두 적었다)
    const summary = $('gather-summary');
    summary.textContent = found.length ? '' : '아직 주운 것이 없습니다.';
    summary.hidden = found.length > 0;
    $('gather-today').textContent = '';
    $('gather-today').hidden = true;
  }
  // 처음에는 가진 것 칸을 열고, 그 뒤로는 마지막에 본 칸을 연다(이 접속 동안)
  const TABS = ['owned', 'fish', 'gather'];
  let tab = 'owned';
  function showTab(next) {
    tab = next;
    for (const name of TABS) {
      $(`log-tab-${name}`).setAttribute('aria-pressed', String(tab === name));
      $(`log-${name}`).hidden = tab !== name;
    }
    if (tab === 'gather') renderGather(); else if (tab === 'owned') renderOwned(); else render();
  }
  for (const name of TABS) $(`log-tab-${name}`).addEventListener('click', () => showTab(name));
  // 낚시하는 동안(물가로 걸어가는 때부터 결과를 보일 때까지)에는 열지 않는다. 열면 찌를 못 보고 놓친다.
  // 버튼은 없애지 않고 흐리게 둔 채, 누르면 왜 안 되는지 알린다(GPT 글 7210344502). 수첩을 닫아도 낚시는 그대로다
  const busy = () => fishing.phase !== 'idle';
  function sync() { button.setAttribute('aria-disabled', String(busy())); }
  function open() {
    if (busy()) { toast('낚시가 끝나면 수첩을 열 수 있습니다'); return; }
    render(); renderGather(); renderOwned(); showTab(tab);
    layer.hidden = false;
    $('fish-close').focus();
  }
  function close() { layer.hidden = true; button.focus(); }
  button.addEventListener('click', open);
  $('fish-close').addEventListener('click', close);
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  });
  // 창을 연 채 다른 탭에서 낚아도 바로 보이게 한다
  fishing.store.subscribe(() => { if (!layer.hidden) render(); });
  gathering?.subscribe(() => { if (!layer.hidden) { renderGather(); renderOwned(); } }); // 주웠을 때, 그리고 3시간마다 새로 놓일 때
  store?.subscribe(() => { if (!layer.hidden) renderOwned(); });
  sync();
  return { open, close, showTab, sync, get tab() { return tab; }, get isOpen() { return !layer.hidden; } };
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
