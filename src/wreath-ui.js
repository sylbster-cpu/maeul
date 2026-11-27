// 화환 만들기 창 (5단계 작은 만들기, 2026-11-26 사용자 결정).
// 재료(숲에서 주운 것 셋, 또는 빼기)를 고르고 고리의 칸을 누르면 꽂힌다. 같은 칸을 같은 재료로 다시 누르면 뺀다. 리본도 고른다.
// 창 안에서 고치는 동안에는 집 상태를 바꾸지 않는다. "다 됐어요"를 눌렀을 때만 onDone 으로 모양 하나를 넘긴다(GPT 검토).
// 미리 보기는 SVG 와 목록 그림이다. WebGL 판을 따로 만들지 않는다(GPT 검토). 결과는 벽에 걸린 것을 3D 로 본다
import { WREATH_SLOTS, WREATH_FILLS, WREATH_RIBBONS, DEFAULT_WREATH, FOUND_PARTS, PARTS } from './parts.js';

export function createWreathUI({ thumbs = {} } = {}) {
  const $ = (id) => document.getElementById(id);
  const layer = $('wreath-layer');
  const ring = $('wreath-ring');
  const label = (kind) => PARTS[FOUND_PARTS[kind]].label;
  const icon = (kind) => {
    const src = thumbs[FOUND_PARTS[kind]];
    if (!src) return null;
    const img = new Image(); img.src = src; img.alt = '';
    return img;
  };
  let look = null; // 고치는 중인 모양
  let tool = WREATH_FILLS[0]; // 고른 재료 (null 이면 빼기)
  let handlers = null;

  // 고리의 칸 여섯. 오른쪽 위(60도)에서 시작해 시계 방향 (3D 화환의 칸 순서와 같다, wreath-model.js slotAngle).
  // 맨 아래를 비워 리본이 보인다. 고리(SVG 반지름 64/200)의 둘레에 놓는다. 화면은 아래가 +y 라서 sin 의 부호를 바꾼다
  const slotRatio = (k) => { const a = Math.PI / 3 - (k * 2 * Math.PI) / WREATH_SLOTS; return [0.32 * Math.cos(a), -0.32 * Math.sin(a)]; };
  const slots = [];
  for (let k = 0; k < WREATH_SLOTS; k++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wreath-slot';
    b.dataset.slot = String(k);
    const [x, y] = slotRatio(k);
    b.style.left = `${50 + x * 100}%`;
    b.style.top = `${50 + y * 100}%`;
    b.addEventListener('click', () => {
      const now = look.slots[k];
      look.slots[k] = tool === null || now === tool ? null : tool;
      render();
    });
    ring.appendChild(b);
    slots.push(b);
  }
  // 재료 줄: 주운 것 셋과 빼기
  const fills = new Map();
  for (const kind of [...WREATH_FILLS, null]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.fill = kind || 'none';
    const pic = kind ? icon(kind) : null;
    if (pic) b.appendChild(pic);
    const text = document.createElement('span');
    text.textContent = kind ? label(kind) : '빼기';
    b.appendChild(text);
    b.addEventListener('click', () => { tool = kind; render(); });
    $('wreath-fills').appendChild(b);
    fills.set(kind, b);
  }
  // 리본 줄: 없음과 네 가지 색. 색만으로 알리지 않고 이름을 함께 적는다
  const ribbons = new Map();
  for (const key of [null, ...Object.keys(WREATH_RIBBONS)]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.ribbon = key || 'none';
    const sw = document.createElement('span');
    sw.className = `wreath-swatch${key ? '' : ' none'}`;
    if (key) sw.style.background = WREATH_RIBBONS[key].color;
    const text = document.createElement('span');
    text.textContent = key ? WREATH_RIBBONS[key].label : '없음';
    b.append(sw, text);
    b.addEventListener('click', () => { look.ribbon = key; render(); });
    $('wreath-ribbons').appendChild(b);
    ribbons.set(key, b);
  }

  function render() {
    slots.forEach((b, k) => {
      const kind = look.slots[k];
      b.replaceChildren();
      b.classList.toggle('filled', !!kind);
      const pic = kind ? icon(kind) : null;
      if (pic) b.appendChild(pic);
      else if (kind) b.textContent = label(kind).slice(0, 2);
      b.setAttribute('aria-label', `칸 ${k + 1}: ${kind ? label(kind) : '비었음'}`);
    });
    for (const [kind, b] of fills) b.setAttribute('aria-pressed', String(kind === tool));
    for (const [key, b] of ribbons) b.setAttribute('aria-pressed', String(key === look.ribbon));
    ring.style.setProperty('--wreath-ribbon', look.ribbon ? WREATH_RIBBONS[look.ribbon].color : 'transparent');
  }

  function close(result) {
    if (layer.hidden) return;
    layer.hidden = true;
    const h = handlers;
    handlers = null;
    if (result) h?.onDone?.(result); else h?.onCancel?.();
  }
  $('wreath-done').addEventListener('click', () => close({ slots: [...look.slots], ribbon: look.ribbon }));
  $('wreath-cancel').addEventListener('click', () => close(null));
  layer.addEventListener('click', (event) => { if (event.target === layer) close(null); });
  // 다른 곳의 Esc(꾸미기 그만두기 등)보다 먼저 받는다
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(null); }
  }, true);

  return {
    // look: 처음 보일 모양. onDone(모양) 은 "다 됐어요"에서만, onCancel 은 그만둘 때 부른다
    open({ look: start = DEFAULT_WREATH, title = '화환 만들기', onDone, onCancel } = {}) {
      look = { slots: [...start.slots], ribbon: start.ribbon };
      handlers = { onDone, onCancel };
      $('wreath-title').textContent = title;
      render();
      layer.hidden = false;
      $('wreath-done').focus();
    },
    cancel() { close(null); },
    get isOpen() { return !layer.hidden; }, // 자동 시험이 읽는다
    get look() { return look ? { slots: [...look.slots], ribbon: look.ribbon } : null; },
  };
}
