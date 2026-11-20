// Firebase 온라인 집과 방명록 UI. 화면 위의 창으로 열어 게임 한 화면의 크기를 바꾸지 않는다.
// 서버 기능은 버튼을 누를 때 불러오며, 기존 localStorage/명령 상태를 직접 고치지 않는다.
import { getOnlineService, isOnlineConfigured, ONLINE_TIMEOUT_MS } from './online.js';
import { MAX_NOTE_LENGTH, normalizeVisitNote, onlineErrorText, withOnlineTimeout } from './online-data.js';

export function createOnlineUI({ store, visitorUid = null, readOnly = false, openShare, toast }) {
  const $ = (id) => document.getElementById(id);
  const button = $('online-action');
  const layer = $('online-layer');
  const isVisitor = !!visitorUid;
  const enabled = isOnlineConfigured() && (!readOnly || isVisitor);
  button.hidden = !enabled;
  if (!enabled) return;

  button.textContent = isVisitor ? '방문 인사' : '온라인';
  const title = $('online-title');
  const explanation = $('online-description');
  const status = $('online-status');
  const list = $('online-notes-list');
  const noteBox = $('online-note-text');
  const ownerControls = $('online-owner-controls');
  const visitorControls = $('online-visitor-controls');
  const buttons = ['online-publish', 'online-list', 'online-unpublish', 'online-submit', 'online-close']
    .map($);
  let busy = false;
  let submitted = false;
  let run = 0; // 요청마다 번호를 매긴다. 기다리던 창을 닫으면 번호를 넘겨, 늦게 온 응답이 화면을 바꾸지 않게 한다

  function report(message) { status.textContent = message; }
  function hide() {
    layer.hidden = true;
    button.focus();
  }
  // 닫기는 서버 응답을 기다리는 중에도 된다. 그때는 기다리던 요청의 결과를 버린다
  function close() {
    if (busy) { run++; setBusy(false); report(''); }
    hide();
  }
  function setBusy(on) {
    busy = on;
    buttons.forEach((b) => { b.disabled = b.id !== 'online-close' && (on || (b.id === 'online-submit' && submitted)); });
    if (on) report('서버에 연결하는 중입니다…');
  }
  async function task(fn, onSuccess = () => {}) {
    if (busy) return;
    const mine = ++run;
    setBusy(true);
    try {
      // 연결과 요청을 합쳐 한도를 둔다. 한도를 넘으면 실패로 알리고 버튼을 다시 쓸 수 있게 한다
      const answer = await withOnlineTimeout((async () => fn(await getOnlineService()))(), ONLINE_TIMEOUT_MS);
      if (mine !== run) return;
      report('');
      onSuccess(answer);
    } catch (error) {
      if (mine !== run) return;
      const message = onlineErrorText(error);
      report(message);
      toast(message, 'error');
    } finally { if (mine === run) setBusy(false); }
  }
  function open() {
    layer.hidden = false;
    ownerControls.hidden = isVisitor;
    visitorControls.hidden = !isVisitor;
    list.hidden = true;
    list.replaceChildren();
    report('');
    if (isVisitor) {
      title.textContent = '친구 집에 인사 남기기';
      explanation.textContent = '한 번 남긴 인사는 집주인이 다음에 접속했을 때 확인합니다. 집은 수정할 수 없습니다.';
    } else {
      title.textContent = '온라인 집 공유';
      explanation.textContent = '버튼을 누른 시점의 집을 서버에 게시합니다. 친구는 짧은 링크로 방문해 인사를 남길 수 있습니다.';
    }
    $('online-close').focus();
  }
  button.addEventListener('click', open);
  $('online-close').addEventListener('click', close);
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  // 공유창을 닫듯 게임 뒤편 단축키가 실행되지 않도록 한다.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  });

  $('online-publish').addEventListener('click', () => task(
    (service) => service.publish(store.state),
    (link) => {
      hide();
      toast('온라인 집 게시가 완료됐습니다');
      openShare(link, {
        title: '온라인 방문 링크',
        description: '친구가 이 주소로 방문하면 서버에 게시한 집을 구경하고 인사말을 남길 수 있습니다.',
        footnote: '이후 꾸민 모습은 다시 온라인 게시를 눌러야 반영됩니다. 계정이 익명이므로 브라우저 데이터를 지우면 수정 권한을 잃을 수 있습니다.',
      });
    }));

  function renderNotes(notes, service) {
    list.hidden = false;
    list.replaceChildren();
    if (!notes.length) {
      const empty = document.createElement('p');
      empty.textContent = '아직 방문 인사가 없습니다.';
      list.append(empty);
      return;
    }
    for (const note of notes) {
      const row = document.createElement('div');
      row.className = 'online-note-row';
      const body = document.createElement('p');
      // 방문자의 내용은 HTML로 해석하지 않는다.
      body.textContent = note.body;
      const meta = document.createElement('small');
      meta.textContent = note.date instanceof Date && !Number.isNaN(note.date.valueOf())
        ? note.date.toLocaleString('ko-KR') : '방문 인사';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '삭제';
      remove.addEventListener('click', async () => {
        if (!confirm('이 방문 인사를 삭제할까요?')) return;
        await task(() => service.removeNote(note.uid), () => {
          row.remove();
          report('방문 인사를 삭제했습니다.');
        });
      });
      row.append(body, meta, remove);
      list.append(row);
    }
  }
  $('online-list').addEventListener('click', () => task(
    (service) => service.getNotes().then((notes) => ({ notes, service })),
    ({ notes, service }) => { renderNotes(notes, service); report(`방문 인사 ${notes.length}개를 불러왔습니다`); }));

  $('online-unpublish').addEventListener('click', () => {
    if (!confirm('온라인에 게시된 집을 비공개로 바꿀까요? 친구의 링크에서 더는 열리지 않습니다.')) return;
    task((service) => service.unpublish(), () => report('집을 비공개로 바꿨습니다. 기존 로컬 집은 그대로입니다.'));
  });

  noteBox.maxLength = MAX_NOTE_LENGTH;
  $('online-submit').addEventListener('click', () => {
    let body;
    try { body = normalizeVisitNote(noteBox.value); }
    catch (error) { report(error.message); return; }
    task((service) => service.leaveNote(visitorUid, body), () => {
      noteBox.value = '';
      submitted = true;
      noteBox.disabled = true;
      $('online-submit').disabled = true;
      report('방문 인사를 남겼습니다. 집주인이 다음에 접속하면 볼 수 있습니다.');
    });
  });
  // 브라우저로 불러온 뒤에는 쓰기 버튼을 계속 눌러 중복 요청하지 않도록 한다.
  noteBox.addEventListener('input', () => { if (!busy && !submitted) $('online-submit').disabled = false; });
}
