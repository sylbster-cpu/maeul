// 되돌리기와 다시 하기. 플레이어 한 명이 한 번 접속해 있는 동안의 기록이다.
// 기록하는 것은 명령이다: 앞으로 가는 명령(forward)과 그것을 되돌리는 명령(backward).
// 되돌릴 때는 반대 명령을 보통 명령처럼 다시 검증한다. 그사이 상태가 바뀌어 맞지 않으면
// 아무것도 바꾸지 않고 거절하며, 그 기록은 버린다. (나중에 공동 마을에서도 같은 규칙을 쓴다)
// guard(cmds) 를 주면 새 조작(run)을 보내기 전에 한 번 더 본다. 집 규칙 밖의 제한(가진 만큼만 놓는 주운 것, gathering.js)이다.
// 되돌리기·다시 하기에는 걸지 않는다. 이번 접속에서 이미 있었던 상태로만 돌아가므로 새로 늘어나는 것이 없고,
// 가져온 친구 집처럼 처음부터 가진 것보다 많이 놓인 집도 치운 뒤 원래대로 되돌릴 수 있어야 하기 때문이다(PR #42 GPT 검토 2).
// three.js 를 불러오지 않는다.

export function createHistory(store, { limit = 100, guard = null } = {}) {
  const undoStack = [];
  const redoStack = [];
  let open = null; // 끌기처럼 여러 번에 걸친 조작을 한 묶음으로 모으는 중
  const listeners = new Set();

  const blank = () => ({ forward: [], backward: [] });
  const notify = () => { const st = api.status(); for (const fn of listeners) fn(st); };
  function push(entry) {
    undoStack.push(entry);
    if (undoStack.length > limit) undoStack.shift();
    redoStack.length = 0; // 새 조작을 하면 다시 하기 기록은 사라진다
    notify();
  }

  // 집터 전체를 갈아 끼우면 (불러오기 등) 기록이 맞지 않으므로 비운다
  store.subscribe((cmd) => {
    if (cmd.type !== 'replace') return;
    undoStack.length = 0;
    redoStack.length = 0;
    open = null;
    notify();
  });

  const api = {
    // 명령들을 보내고 하나의 기록으로 남긴다. 통과하지 못한 명령은 건너뛴다.
    run(cmds) {
      const g = guard?.(cmds);
      if (g && !g.ok) return { ok: false, done: 0, reason: g.reason };
      const entry = open || blank();
      let done = 0;
      let failure = null;
      cmds.forEach((cmd, i) => {
        const r = store.dispatch(cmd, { batch: cmds.length > 1, last: i === cmds.length - 1 });
        if (!r.ok) { failure ||= r; return; }
        done++;
        entry.forward.push(cmd);
        entry.backward.unshift(...r.inverse);
      });
      if (!open && done) push(entry);
      return done ? { ok: true, done } : { ok: false, done: 0, reason: failure?.reason };
    },
    begin() { if (!open) open = blank(); },
    end() {
      const entry = open;
      open = null;
      if (entry && entry.forward.length) push(entry);
    },
    undo() {
      api.end();
      const entry = undoStack.pop();
      if (!entry) return { ok: false, reason: '되돌릴 것이 없습니다' };
      const r = store.transact(entry.backward, { history: 'undo' });
      if (!r.ok) { notify(); return { ok: false, reason: '그사이 바뀐 것이 있어 되돌리지 못했습니다' }; }
      redoStack.push(entry);
      notify();
      return { ok: true };
    },
    redo() {
      api.end();
      const entry = redoStack.pop();
      if (!entry) return { ok: false, reason: '다시 할 것이 없습니다' };
      const r = store.transact(entry.forward, { history: 'redo' });
      if (!r.ok) { notify(); return { ok: false, reason: '그사이 바뀐 것이 있어 다시 하지 못했습니다' }; }
      undoStack.push(entry);
      notify();
      return { ok: true };
    },
    status: () => ({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }),
    // 보내기 전에 guard 로만 본다 (미리보기의 색)
    check: (cmds) => guard?.(cmds) || { ok: true },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
