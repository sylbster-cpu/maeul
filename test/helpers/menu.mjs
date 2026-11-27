// ☰ 메뉴 안의 버튼(집 공유·온라인·화면 크기·조작법·소리)을 다루는 도우미 (6단계 HUD A).
// 메뉴가 닫혀 있으면 사람처럼 ☰ 를 눌러 연 뒤에 누른다
export async function openMenu(page) {
  if (await page.locator('#menu').isHidden()) await page.click('#menu-toggle');
}
export async function closeMenu(page) {
  if (await page.locator('#menu').isVisible()) await page.click('#menu-toggle');
}
export async function menuClick(page, selector) {
  await openMenu(page);
  await page.click(selector);
}
// 메뉴를 열어 그 버튼이 보이는지 보고 다시 닫는다
export async function menuVisible(page, selector) {
  await openMenu(page);
  const visible = await page.locator(selector).isVisible();
  await closeMenu(page);
  return visible;
}

// 꾸미기 목록(시트) 안의 버튼(도구·가구·탭·바닥재·벽지·겉모습·집 키우기)을 다루는 도우미 (6단계 HUD B).
// 목록이 닫혀 있으면 사람처럼 연다: 걷기면 꾸미기 버튼(들어가며 목록이 열린다), 꾸미기면 고른 것 버튼.
// tap: 누르는 방법(기본은 page.click, 터치 시험은 손가락 누름을 넘긴다)
export const IN_SHEET = /^#(tool-|tab-|floor-|wall-|roof-|siding-|door-|upgrade)/;
export async function openCatalog(page, tap = (sel) => page.click(sel)) {
  if (await page.locator('#sheet').isVisible()) return;
  if (await page.locator('#mode-build').isVisible()) await tap('#mode-build');
  else await tap('#open-catalog');
}
// 목록 안의 버튼이면 목록을 연 뒤에, 아니면 그대로 누른다
export async function uiClick(page, selector, tap = (sel) => page.click(sel)) {
  if (IN_SHEET.test(selector) && !(await page.locator(selector).isVisible())) await openCatalog(page, tap);
  await tap(selector);
}
