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
