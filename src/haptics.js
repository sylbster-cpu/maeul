// 진동. 소리와 같은 순간에 손끝으로도 알린다(docs/GAME_PRINCIPLES.md 1-1). 진동에만 기대지 않는다.
// - 안드로이드 등: 웹 표준 navigator.vibrate.
// - 아이폰(사파리): 웹 표준 진동이 없다. 켜고 끄는 스위치(<input type="checkbox" switch>, iOS 17.4 부터)가
//   바뀔 때 나는 진동을 빌린다. iOS 26.5 부터는 프로그램이 혼자 바꾸면 울리지 않고 사람이 누른 직후에만 울린다는
//   보고가 있다(애플의 공식 확인은 없다). 그래서 손가락이 닿아 있거나 떼는 중에 생긴 진동은 모아 두었다가
//   손가락을 뗄 때(touchend, click) 울린다. 찌가 잠길 때처럼 사람이 누르지 않은 순간에는 아이폰에서 울리지 않을 수 있다.
// 소리 버튼으로 소리와 함께 끄고 켠다(main.js).
export function createHaptics({ win = window } = {}) {
  const nav = win.navigator;
  const canVibrate = typeof nav?.vibrate === 'function';
  let tick = null;
  let switchInput = null;
  if (!canVibrate) {
    const input = win.document.createElement('input');
    if ('switch' in input) {
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      const label = win.document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      label.appendChild(input);
      win.document.body.appendChild(label);
      switchInput = input;
      tick = () => label.click();
    }
  }

  let enabled = true;
  let pressing = false; // 손가락(또는 마우스)이 닿아 있는 동안
  let releasing = false; // 막 뗀 뒤 잠깐. 이때 생긴 진동도 뗀 동작에 붙여 울린다
  let pending = 0; // 뗄 때 울릴 횟수
  let fallback = 0;
  const fire = (n) => { if (!tick || n <= 0) return; tick(); for (let i = 1; i < n; i++) win.setTimeout(tick, i * 90); };
  const flush = () => { const n = pending; pending = 0; fire(n); };
  if (tick) {
    win.addEventListener('pointerdown', () => { pressing = true; }, true);
    win.addEventListener('pointercancel', () => { pressing = false; releasing = false; pending = 0; }, true);
    win.addEventListener('pointerup', () => {
      pressing = false;
      releasing = true;
      win.clearTimeout(fallback);
      // touchend 나 click 이 오지 않는 경우(마우스 등)를 위한 마지막 기회
      fallback = win.setTimeout(() => { releasing = false; flush(); }, 400);
    }, true);
    // 아이폰에서 손가락을 뗄 때의 사건들. 사람이 누른 직후로 인정되는 때다
    win.addEventListener('touchend', () => { releasing = false; flush(); }, true);
    win.addEventListener('click', () => { releasing = false; flush(); }, true);
  }

  return {
    // 'vibrate'(안드로이드 등), 'switch'(아이폰 사파리), 'none'
    kind: canVibrate ? 'vibrate' : tick ? 'switch' : 'none',
    switchInput, // 자동 시험이 읽는다
    get enabled() { return enabled; },
    setEnabled(value) { enabled = !!value; if (!enabled) pending = 0; },
    // pattern: navigator.vibrate 의 형식(밀리초, 또는 [울림, 쉼, 울림 …]).
    // ticks: 아이폰에서 울릴 횟수(스위치 진동은 세기와 길이를 고를 수 없어 횟수로만 나눈다)
    pulse(pattern, { ticks = 1 } = {}) {
      if (!enabled) return;
      if (canVibrate) { try { nav.vibrate(pattern); } catch { /* 진동을 막은 기기 */ } return; }
      if (!tick) return;
      if (pressing || releasing) pending = Math.max(pending, ticks);
      else fire(ticks);
    },
  };
}
