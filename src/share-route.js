// 같은 탭에서 URL 공유 해시(#home=, #visit=)만 바뀌면 페이지가 자동 갱신되지 않는다.
// 보기 전용 집과 본래 집이 섞이지 않도록 공유 상태로 들어가거나 나올 때 앱을 다시 시작한다.
export function isSharedHash(hash) {
  return hash.startsWith('#home=') || hash.startsWith('#visit=');
}
export function watchShareHash(win) {
  let wasShared = isSharedHash(win.location.hash);
  win.addEventListener('hashchange', () => {
    const isShared = isSharedHash(win.location.hash);
    if (wasShared || isShared) win.location.reload();
    wasShared = isShared;
  });
}
