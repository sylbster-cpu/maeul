// 모의 서버로 온라인 화면 흐름을 검증한다. 운영 Firebase를 호출하지 않는다.
import assert from 'node:assert/strict';
export default async function onlineShelter(page,{out,logs}){
  const ID='AbCdEf0123456789GhIj';
  const mock=`
    import {createShelter,apply} from './shelter-state.js';
    const A='ownerAa123456789',B='guestBb987654321',ID='AbCdEf0123456789GhIj';
    const key='test:shelter:server';
    const uid=location.search.includes('friend=1')?B:A;
    let receiver=null, status=null;
    const get=()=>{const value=localStorage.getItem(key);if(!value)throw new Error('쉼터를 찾을 수 없습니다');return JSON.parse(value);};
    const save=s=>{localStorage.setItem(key,JSON.stringify(s));receiver?.(s);return s;};
    window.__mockShelter={
      friendPlace(){const s=get();return save(apply(s,B,{type:'place',mark:'wind',slot:'1',piece:{kind:'plant',cell:'5_6',rot:0}}));},
      friendMove(cell){const s=get(),p=s.items.wind['1'];return save(apply(s,B,{type:'move',mark:'wind',slot:'1',expect:p,piece:{...p,cell}}));},
      offline(){status?.(false);},online(){status?.(true);}
    };
    export async function getShelterService(){return {
      uid,newId:()=>ID,async create(id){return {id,state:localStorage.getItem(key)?get():save(createShelter(A))};},
      async get(){return get();},async join(){const s=get();return Object.values(s.members).includes(uid)?s:save(apply(s,uid,{type:'join',mark:'wind'}));},
      async command(id,cmd){await new Promise(r=>setTimeout(r,30));return save(apply(get(),uid,cmd));},
      watch(id,cb,cs){receiver=cb;status=cs;cs(true);return()=>{receiver=null;status=null;};}
    };}
  `;
  await page.context().route('**/src/shelter-online.js',route=>route.fulfill({body:mock,contentType:'text/javascript'}));
  const origin=new URL(page.url()).origin;
  const go=async path=>{await page.goto(origin+path);await page.waitForFunction(()=>window.__ready===true);};
  const waitGame=()=>page.waitForFunction(()=>window.__shelter&&!window.__shelter.busy);
  const say=(text,value)=>{logs.push((value?'통과  ':'실패  ')+text);assert.ok(value,text);};
  await go('/');
  await page.evaluate(()=>window.__game.saveNow());
  await page.tap('#menu-toggle');
  await Promise.all([page.waitForURL('**/shelter.html'),page.tap('#shelter-action')]);
  await page.waitForFunction(()=>window.__ready===true);
  const originalHouse=await page.evaluate(()=>localStorage.getItem('house-lab-web:save'));
  say('마을 메뉴에서 내 집을 저장하고 쉼터 진입',!!originalHouse);
  await page.locator('#create-room').waitFor({state:'visible'});
  await page.tap('#create-room');await waitGame();
  say('새 쉼터 개설 및 주소 유지',page.url().endsWith('#room='+ID));
  await page.tap('#invite');
  say('친구에게 정식 초대 주소 표시',await page.inputValue('#invite-url')==='https://sylbster-cpu.github.io/maeul/shelter.html#room='+ID);
  await page.tap('#close-invite');
  await page.tap('#build');await page.tap('#kind-stool');
  async function place(cell){
    const p=await page.evaluate(c=>window.__shelter.view.projectCell(c),cell);await page.touchscreen.tap(p.x,p.y);
    await waitGame();
  }
  await place('0_0');await page.waitForFunction(()=>!!window.__shelter.state.items.tree['0']);
  await page.tap('#done');
  await go('/shelter.html?friend=1#room='+ID);
  await page.locator('#join-room').waitFor({state:'visible'});
  say('초대 주소만 열어서는 회원이 늘지 않는다',await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('test:shelter:server')).members).length===1));
  await page.tap('#join-room');await waitGame();
  say('친구 참여 시 별도 표식과 기존 배치 유지',await page.evaluate(()=>window.__shelter.state.members.wind==='guestBb987654321'&&!!window.__shelter.state.items.tree['0']));
  await page.tap('#build');await page.tap('#kind-lamp');await place('5_5');
  await page.waitForFunction(()=>!!window.__shelter.state.items.wind['0']);await page.tap('#done');
  await page.waitForTimeout(250);
  await go('/shelter.html#room='+ID);await waitGame();
  say('개설자 재접속 시 친구 가구 유지',await page.evaluate(()=>!!window.__shelter.state.items.wind['0']));
  say('지난 방문 이후 변화 표시',await page.evaluate(()=>window.__shelter.view.highlighted>0));
  await page.evaluate(()=>window.__mockShelter.offline());
  say('연결이 끊기면 꾸미기 차단',await page.locator('#build').isDisabled());
  await page.evaluate(()=>window.__mockShelter.online());
  say('다시 연결되면 꾸미기 가능',!(await page.locator('#build').isDisabled()));
  const received=await page.evaluate(()=>{
    window.__shelter.view.walkTo(7.5,0.5);
    window.__mockShelter.friendPlace();
    return {piece:!!window.__shelter.state.items.wind['1'],walking:window.__shelter.view.character.walking,
      keys:window.__shelter.view.highlightedKeys};
  });
  say('서버의 친구 배치 반영',received.piece);
  say('친구 배치가 바뀌어도 걷던 목적지로 다시 길 찾음',received.walking);
  say('보는 중 받은 친구 배치도 표시',received.keys.includes('wind-1'));
  // 앞의 표시가 사라진 뒤, 탭을 숨긴 사이 친구가 옮긴 것을 돌아와 받는다.
  await page.waitForFunction(()=>window.__shelter.view.highlighted===0,null,{timeout:20000});
  const hidden=await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
    window.__mockShelter.friendMove('6_6');
    const before=window.__shelter.state.items.wind['1'].cell;
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    return {before,after:window.__shelter.state.items.wind['1'].cell,keys:window.__shelter.view.highlightedKeys};
  });
  say('숨긴 동안 받은 친구 변경은 돌아온 뒤 반영',hidden.before==='5_6'&&hidden.after==='6_6');
  say('숨겼다 돌아와 받은 친구 변경도 표시',hidden.keys.includes('wind-1'));
  say('개인 집 저장 내용 유지',(await page.evaluate(()=>localStorage.getItem('house-lab-web:save')))===originalHouse);
  await page.screenshot({path:out+'-rejoin.png'});
}
