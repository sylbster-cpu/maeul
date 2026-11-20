// 같은 탭에서 URL #home=만 바뀌면 브라우저는 자동으로 페이지를 다시 로드하지 않는다.
// 보기 전용 집과 본래 집이 섞이지 않도록 공유 상태로 들어가거나 나올 때 앱을 다시 시작한다.
export function watchShareHash(win) {
  let wasShared = win.location.hash.startsWith('#home=');
  win.addEventListener('hashchange', () => {
    const isShared = win.location.hash.startsWith('#home=');
    if (wasShared || isShared) win.location.reload();
    wasShared = isShared;
  });
}
