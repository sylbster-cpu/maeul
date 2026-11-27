import { readShelter, validate, memberMark } from './shelter-state.js';
import { withOnlineTimeout } from './online-data.js';
const READ_LIMIT=20000;

// 화면은 이 세션이 넘기는 서버 확인 상태만 사용한다. 개인 저장과 무관하다.
export function createShelterSession({ service, id, initial, onState = () => {}, onStatus = () => {} }) {
  let state = readShelter(initial), busy = false, connected = true, active = true;
  let deferred = null, closed = false, unsubscribe = null;
  function notify() { onStatus({ busy, connected }); }
  function accept(value, origin) {
    if (closed) return;
    const next = readShelter(value);
    if (next.revision <= state.revision) return;
    state = next; onState(state, origin);
  }
  function flush() {
    if (!active || busy || !deferred) return;
    const next = deferred; deferred = null; accept(next, 'remote');
  }
  function receive(value) {
    if (closed) return;
    const next = readShelter(value);
    if (next.revision <= state.revision) return;
    if (busy || !active) {
      if (!deferred || deferred.revision < next.revision) deferred = next;
    } else accept(next, 'remote');
  }
  function status(ok) { if (!closed) { connected = ok; notify(); } }
  return {
    get state() { return state; }, get busy() { return busy; }, get connected() { return connected; },
    start() {
      if (!closed && !unsubscribe) unsubscribe = service.watch(id, receive, status);
    },
    setActive(value) { active = value; flush(); },
    async command(cmd) {
      if (closed || busy) throw new Error('쉼터 저장을 확인하는 중입니다');
      if (!connected) throw new Error('연결이 돌아온 뒤 다시 꾸며 주세요');
      const check = validate(state, service.uid, cmd);
      if (!check.ok) throw new Error(check.reason);
      busy = true; notify();
      try {
        const next = await service.command(id, cmd);
        accept(next, 'own');
        return true;
      } catch (error) {
        // 거절된 배치를 낙관적으로 표시하지 않는다. 최신 판을 읽어 다음 조작에 반영한다.
        try { const fresh = await withOnlineTimeout(service.get(id),READ_LIMIT); receive(fresh); status(true); }
        catch { status(false); }
        throw error;
      } finally { busy = false; flush(); notify(); }
    },
    async refresh() {
      if (closed || busy) return false;
      busy = true; notify();
      try {
        // 다시 연결할 때 이전의 감시를 종료하고 새 감시를 시작한다.
        const next = await withOnlineTimeout(service.get(id),READ_LIMIT);
        receive(next); status(true);
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        if (!closed) unsubscribe = service.watch(id, receive, status);
        return !!memberMark(next, service.uid);
      } catch (error) { status(false); throw error; }
      finally { busy = false; flush(); notify(); }
    },
    close() { closed = true; unsubscribe?.(); unsubscribe = null; deferred = null; },
  };
}
