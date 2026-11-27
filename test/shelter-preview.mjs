// 실제 서버를 사용하지 않는 독립 조작 체험. 기존 집 저장을 건드리지 않는지 확인한다.
// TOUCH=1 node tools/shot.mjs /shelter.html shots/shelter-preview 360 640 test/shelter-preview.mjs
import assert from 'node:assert/strict';
export default async function shelterPreview(page,{out,logs}){
  const g=fn=>page.evaluate(fn);
  const say=(text,condition,info='')=>{logs.push((condition?'통과  ':'실패  ')+text+' '+info);assert.ok(condition,text);};
  const tap=async cell=>{
    const p=await page.evaluate(c=>window.__shelterPreview.view.projectCell(c),cell);
    await page.touchscreen.tap(p.x,p.y);
  };
  const item=async (mark,slot)=>{
    const p=await page.evaluate(([m,s])=>window.__shelterPreview.view.projectItem(m,s),[mark,slot]);
    assert.ok(p);await page.touchscreen.tap(p.x,p.y);
  };
  const read=()=>g(()=>({mode:window.__shelterPreview.mode,state:window.__shelterPreview.state,sheet:window.__shelterPreview.sheet}));
  const before=await g(()=>({keys:Object.keys(localStorage),width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,stage:document.getElementById('stage').getBoundingClientRect().height}));
  say('한 화면, 걷는 장면 75% 이상',before.width<=360&&before.height<=640&&before.stage/640>=0.75,JSON.stringify(before));
  const initial=await read();say('친구 가구와 내 빈 슬롯이 보인다',Object.keys(initial.state.items.wind).length===3&&Object.keys(initial.state.items.tree).length===0);
  await page.screenshot({path:out+'-1-walk.png'});
  await page.tap('#build');
  say('꾸미기 목록 열림',(await read()).sheet);
  await page.tap('#sheet-backdrop',{position:{x:12,y:15}});
  say('목록 바깥은 접기만 한다',!(await read()).sheet&&Object.keys((await read()).state.items.tree).length===0);
  await page.tap('#catalog');await page.tap('#kind-stool');
  await tap('0_0');await tap('6_0');await tap('7_1');
  const placed=await read();
  say('가구 3개 이어 놓기',Object.keys(placed.state.items.tree).length===3,JSON.stringify(placed.state.items.tree));
  await page.screenshot({path:out+'-2-build.png'});
  await item('wind','1');
  say('친구 가구는 변경하지 않고 표식을 알린다',JSON.stringify((await read()).state.items.wind)===JSON.stringify(initial.state.items.wind)&&await g(()=>document.getElementById('message').textContent.includes('친구 가구')));
  await item('tree','0');
  say('내 가구 편집 버튼이 보인다',(await read()).mode==='edit');
  await page.tap('#rotate');say('회전 성공',(await read()).state.items.tree['0'].rot===1);
  await page.tap('#move');await tap('0_1');
  say('이동 성공',(await read()).state.items.tree['0'].cell==='0_1');
  await page.tap('#move');await page.tap('#cancel-move');
  say('옮기기 그만두면 원래 자리 유지',(await read()).state.items.tree['0'].cell==='0_1');
  await page.tap('#remove');
  say('내 가구만 치우기',!(await read()).state.items.tree['0']&&Object.keys((await read()).state.items.wind).length===3);
  await page.tap('#done');
  say('완료하면 걷기',(await read()).mode==='walk');
  await tap('4_1');
  await page.waitForTimeout(1600);
  const pos=await g(()=>({...window.__shelterPreview.view.character.pos}));
  say('캐릭터가 빈 칸으로 이동',Math.hypot(pos.x-4.5,pos.z-1.5)<0.3,JSON.stringify(pos));
  const after=await g(()=>Object.keys(localStorage));
  say('집과 채집·낚시를 포함한 브라우저 저장 미변경',JSON.stringify(after)===JSON.stringify(before.keys));
  await page.screenshot({path:out+'-3-complete.png'});
}
