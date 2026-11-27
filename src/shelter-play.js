// 조작 체험과 실제 쉼터에서 공통으로 사용하는 터치 화면.
import { loadAssets } from './assets.js';
import { createShelterView } from './shelter-view.js';
import { apply, validate, changedFriendPieces, memberMark, MARK_LABELS, SHELTER_KINDS, SLOTS, validCell } from './shelter-state.js';
import { createShelterSession } from './shelter-session.js';
import { PARTS } from './parts.js';

const $=id=>document.getElementById(id);
export async function mountShelter({ uid, initial, previous = null, service = null, id = null, memory = null, invite = null }) {
const place=(m,slot,kind,cell,rot=0)=>({type:'place',mark:m,slot,piece:{kind,cell,rot}});
let state=initial,mark=memberMark(initial,uid);
if(!mark)throw new Error('쉼터에 먼저 참여해 주세요');
let view, session=null, mode='walk',tool=null,rot=0,selected=null,sheet=false,busy=false,connected=true;
let rememberFrame=0,slowTimer=0;
const canEdit=()=>!!mark&&connected&&!busy;
const message=text=>{$('message').textContent=text;};
const used=()=>Object.keys(state.items[mark]||{}).length;
const ownPiece=()=>selected&&state.items[mark]?.[selected.slot];
const label=kind=>PARTS[kind].label;
const button=(id,text,fn,{primary=false,disabled=false}={})=>{
  const b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;b.disabled=disabled;
  if(primary)b.classList.add('primary');
  b.addEventListener('click',()=>{if(!busy)fn();});return b;
};
function showSheet(show){
  sheet=show;$('sheet').hidden=!show;$('sheet-backdrop').hidden=!show;
}
function setMode(next){
  mode=next;view.buildMode(next!=='walk');view.select(selected);renderBar();
}
function clearSelection(){selected=null;view.select(null);}
function finish(){
  showSheet(false);clearSelection();tool=null;setMode('walk');message('빈 곳을 누르면 걸어갑니다');
}
function pickTool(kind){
  tool=kind;rot=0;clearSelection();showSheet(false);setMode('place');
  message(label(kind)+'을 놓을 빈 칸을 누르세요');
}
function openCatalog(){
  if(!canEdit())return;
  if(mode==='walk'){view.character.stop();setMode('place');}
  showSheet(true);
}
function remember(){
  if(!memory||!id||document.hidden)return;
  cancelAnimationFrame(rememberFrame);
  // 실제 장면이 그려질 기회를 준 뒤, 보이는 동안의 판만 기억한다.
  rememberFrame=requestAnimationFrame(()=>{
    rememberFrame=requestAnimationFrame(()=>{
      if(!document.hidden)memory.remember(id,state);
    });
  });
}
function setState(next,origin){
  const old=ownPiece();
  state=next;mark=memberMark(state,uid);
  if(origin==='remote'&&selected){
    const fresh=ownPiece();
    if(!fresh||!old||fresh.cell!==old.cell||fresh.rot!==old.rot||fresh.kind!==old.kind){
      clearSelection();mode='place';message('내 가구가 다른 화면에서 바뀌었습니다. 다시 골라 주세요');
    }
  }
  if(!mark){showSheet(false);clearSelection();mode='walk';message('이 쉼터의 참여 정보가 바뀌었습니다. 다시 접속해 주세요');}
  view.sync(state,{preserveWalk:origin==='remote'&&mode==='walk'});view.buildMode(mode!=='walk');renderBar();remember();
}
async function command(cmd){
  if(!canEdit())return false;
  const check=validate(state,uid,cmd);
  if(!check.ok){message(check.reason);return false;}
  if(!session){setState(apply(state,uid,cmd),'own');return true;}
  try {
    await session.command(cmd);
    return true;
  }catch(error){
    message(error?.code==='permission-denied'?'저장 권한을 확인할 수 없습니다. 연결과 내 표식을 확인해 주세요':
      error?.code==='unavailable'?'연결이 끊겼습니다. 다시 읽은 뒤 꾸며 주세요':
      (error?.message||'쉼터 변경을 확인하지 못했습니다'));
    return false;
  }
}
function cancelMove(){
  setMode('edit');message('옮기기를 그만두었습니다');
}
function choose(item){
  const p=state.items[item.mark]?.[item.slot];if(!p)return;
  if(item.mark!==mark){
    clearSelection();
    if(mode==='edit')setMode('place');
    message(MARK_LABELS[item.mark]+'의 '+label(p.kind)+' · 친구 가구는 바꿀 수 없습니다');
    return;
  }
  selected=item;view.select(selected);setMode('edit');message('내 '+label(p.kind)+' · 옮기거나 돌릴 수 있습니다');
}
function renderBar(){
  $('owned').textContent=mark?MARK_LABELS[mark]+' '+used()+'/6':'참여 미확인';
  $('sub').textContent=service?(busy?'저장 확인 중':connected?'공동 쉼터 · 연결됨':'공동 쉼터 · 연결 확인 필요'):'조작 체험 · 실제 서버 미연결';
  const bar=$('actions');bar.replaceChildren();
  const add=(id,text,fn,opts={})=>bar.append(button(id,text,fn,{...opts,disabled:!!opts.disabled||busy}));
  if(mode==='walk'){
    add('build','꾸미기',openCatalog,{primary:true,disabled:!canEdit()});
    if(service){
      add('refresh-room','다시 읽기',async()=>{try{await session.refresh();message('쉼터를 다시 읽었습니다');}catch{message('서버를 읽지 못했습니다. 연결을 확인해 주세요');}});
      add('invite','친구 초대',invite);
    }
  }else if(mode==='place'){
    add('catalog',tool?label(tool)+' ▴':'가구 ▴',openCatalog,{disabled:!canEdit()});
    add('rotate','돌리기',()=>{rot=(rot+1)%4;message('놓을 방향을 돌렸습니다');},{disabled:!tool});
    add('done','완료',finish,{primary:true});
  }else if(mode==='edit'){
    add('catalog','가구 ▴',openCatalog,{disabled:!canEdit()});
    add('move','옮기기',()=>{setMode('move');message('옮길 빈 칸을 누르세요');},{disabled:!canEdit()});
    add('rotate','돌리기',async()=>{
      const p=ownPiece();if(!p)return;
      if(await command({type:'rotate',mark,slot:selected.slot,expect:p,piece:{...p,rot:(p.rot+1)%4}}))message('가구를 돌렸습니다');
    },{disabled:!canEdit()});
    add('remove','치우기',async()=>{
      const p=ownPiece();if(!p)return;
      if(await command({type:'remove',mark,slot:selected.slot,expect:p})){
        clearSelection();setMode('place');message('내 가구를 치웠습니다');
      }
    },{disabled:!canEdit()});
    add('done','완료',finish,{primary:true});
  }else if(mode==='move'){
    add('cancel-move','그만두기',cancelMove);
  }
}
async function handleHit(hit){
  if(!hit||busy)return;
  const cell=hit.cell;
  if(mode==='walk'){
    if(hit.item){
      const p=state.items[hit.item.mark]?.[hit.item.slot];if(!p)return;
      message(MARK_LABELS[hit.item.mark]+'의 '+label(p.kind));
    }else if(cell){
      const [x,z]=cell.split('_').map(Number);view.walkTo(x+0.5,z+0.5);message('빈 곳을 누르면 걸어갑니다');
    }
    return;
  }
  if(!canEdit()){message('연결을 확인한 뒤 꾸며 주세요');return;}
  if(mode==='move'){
    const p=ownPiece();if(!p){finish();return;}
    if(hit.item||!validCell(cell)||state.cells[cell]){message('옮길 수 있는 빈 칸을 골라 주세요');return;}
    const [x,z]=cell.split('_').map(Number);
    if(Math.floor(view.character.pos.x)===x&&Math.floor(view.character.pos.z)===z){
      message('내가 서 있는 칸에는 놓을 수 없습니다');return;
    }
    if(await command({type:'move',mark,slot:selected.slot,expect:p,piece:{...p,cell}})){
      if(selected&&canEdit())setMode('edit');message('내 가구를 옮겼습니다');
    }
    return;
  }
  if(hit.item||state.cells[cell]){choose(hit.item||state.cells[cell]);return;}
  if(mode==='edit'){clearSelection();setMode('place');}
  if(!tool){showSheet(true);return;}
  if(!validCell(cell)){message('입구는 비워 둡니다');return;}
  const slot=SLOTS.find(s=>!state.items[mark][s]);
  if(slot===undefined){message('한 사람은 가구를 6개까지 놓을 수 있습니다');return;}
  const [x,z]=cell.split('_').map(Number);
  if(Math.floor(view.character.pos.x)===x&&Math.floor(view.character.pos.z)===z){
    message('내가 서 있는 칸에는 놓을 수 없습니다');return;
  }
  if(await command(place(mark,slot,tool,cell,rot)))message(label(tool)+'을 놓았습니다 · 이어 놓거나 완료하세요');
}
async function start(){
  try {
    const assets=await loadAssets();view=createShelterView({canvas:$('shelter-canvas'),assets,initial:state});
    view.setHighlights(changedFriendPieces(previous,state,uid));
    $('choices').replaceChildren(...SHELTER_KINDS.map(kind=>button('kind-'+kind,label(kind),()=>pickTool(kind))));
    $('sheet-close').addEventListener('click',()=>showSheet(false));
    $('sheet-backdrop').addEventListener('click',()=>showSheet(false));
    const canvas=$('shelter-canvas');let down=null;
    canvas.addEventListener('pointerdown',e=>{
      if(!e.isPrimary)return;down={id:e.pointerId,x:e.clientX,y:e.clientY};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointercancel',()=>{down=null;});
    canvas.addEventListener('pointerup',e=>{
      const old=down;down=null;
      if(!old||old.id!==e.pointerId||Math.hypot(e.clientX-old.x,e.clientY-old.y)>12||sheet)return;
      handleHit(view.hit(e.clientX,e.clientY));
    });
    if(service){
      session=createShelterSession({service,id,initial:state,onState:setState,onStatus:status=>{
        if(status.busy&&!busy){slowTimer=setTimeout(()=>message('서버의 저장 응답을 기다리고 있습니다. 같은 조작을 다시 보내지 않습니다.'),8000);}
        if(!status.busy){clearTimeout(slowTimer);slowTimer=0;}
        busy=status.busy;connected=status.connected;
        if(!connected&&!busy){showSheet(false);clearSelection();mode='walk';view.buildMode(false);}
        renderBar();
      }});
      document.addEventListener('visibilitychange',()=>{
        session.setActive(!document.hidden);
        if(!document.hidden)remember();
      });
      window.addEventListener('pagehide',()=>session.close(),{once:true});
      // 페이지가 브라우저 뒤로가기 캐시에 들어갔다 돌아오면 연결을 새로 만든다.
      window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
      session.start();
    }
    $('lobby').hidden=true;$('owned').hidden=false;$('actions').hidden=false;
    renderBar();$('loading').hidden=true;remember();
    const debug={get state(){return state;},get mode(){return mode;},get sheet(){return sheet;},get busy(){return busy;},view};
    if(!service)window.__shelterPreview=debug;
    else window.__shelter=debug;
    window.__ready=true;
    return debug;
  }catch(error){$('loading').hidden=false;$('loading').textContent='쉼터를 불러오지 못했습니다. 새로고침하거나 마을로 돌아가 주세요.';console.error(error);throw error;}
}
return await start();
}

