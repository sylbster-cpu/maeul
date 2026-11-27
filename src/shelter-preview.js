// 조작 체험 전용 진입점. 운영 Firebase·집·localStorage에 접근하지 않는다.
import { loadAssets } from './assets.js';
import { createShelterView } from './shelter-view.js';
import { createShelter, apply, validate, changedFriendPieces, MARK_LABELS, SHELTER_KINDS, SLOTS, validCell } from './shelter-state.js';
import { PARTS } from './parts.js';

const $=id=>document.getElementById(id);
const uid='previewOwner01',friend='previewFriend01',mark='tree';
const place=(m,slot,kind,cell,rot=0)=>({type:'place',mark:m,slot,piece:{kind,cell,rot}});
let state=apply(createShelter(uid),friend,{type:'join',mark:'wind'});
state=apply(state,friend,place('wind','0','stool','2_5'));
state=apply(state,friend,place('wind','1','lamp','5_5'));
const previous=state;
state=apply(state,friend,place('wind','2','plant','5_6'));
let view, mode='walk',tool=null,rot=0,selected=null,sheet=false;
const message=text=>{$('message').textContent=text;};
const used=()=>Object.keys(state.items[mark]).length;
const ownPiece=()=>selected&&state.items[mark][selected.slot];
const label=kind=>PARTS[kind].label;
const button=(id,text,fn,{primary=false,disabled=false}={})=>{
  const b=document.createElement('button');b.type='button';b.id=id;b.textContent=text;b.disabled=disabled;
  if(primary)b.classList.add('primary');
  b.addEventListener('click',fn);return b;
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
  if(mode==='walk'){view.character.stop();setMode('place');}
  showSheet(true);
}
function command(cmd){
  const check=validate(state,uid,cmd);
  if(!check.ok){message(check.reason);return false;}
  state=apply(state,uid,cmd);view.sync(state);renderBar();return true;
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
  $('owned').textContent=MARK_LABELS[mark]+' '+used()+'/6';
  const bar=$('actions');bar.replaceChildren();
  const add=(...args)=>bar.append(button(...args));
  if(mode==='walk'){
    add('build','꾸미기',openCatalog,{primary:true});
  }else if(mode==='place'){
    add('catalog',tool?label(tool)+' ▴':'가구 ▴',openCatalog);
    add('rotate','돌리기',()=>{rot=(rot+1)%4;message('놓을 방향을 돌렸습니다');},{disabled:!tool});
    add('done','완료',finish,{primary:true});
  }else if(mode==='edit'){
    add('catalog','가구 ▴',openCatalog);
    add('move','옮기기',()=>{setMode('move');message('옮길 빈 칸을 누르세요');});
    add('rotate','돌리기',()=>{
      const p=ownPiece();if(!p)return;
      if(command({type:'rotate',mark,slot:selected.slot,expect:p,piece:{...p,rot:(p.rot+1)%4}}))message('가구를 돌렸습니다');
    });
    add('remove','치우기',()=>{
      const p=ownPiece();if(!p)return;
      if(command({type:'remove',mark,slot:selected.slot,expect:p})){
        clearSelection();setMode('place');message('내 가구를 치웠습니다');
      }
    });
    add('done','완료',finish,{primary:true});
  }else if(mode==='move'){
    add('cancel-move','그만두기',cancelMove);
  }
}
function handleHit(hit){
  if(!hit)return;
  const cell=hit.cell;
  if(mode==='walk'){
    if(hit.item){
      const p=state.items[hit.item.mark]?.[hit.item.slot];if(!p)return;
      message(MARK_LABELS[hit.item.mark]+'의 '+label(p.kind));
    }else if(cell){
      const [x,z]=cell.split('_').map(Number);view.character.goTo(x+0.5,z+0.5);message('빈 곳을 누르면 걸어갑니다');
    }
    return;
  }
  if(mode==='move'){
    const p=ownPiece();if(!p){finish();return;}
    if(hit.item||!validCell(cell)||state.cells[cell]){message('옮길 수 있는 빈 칸을 골라 주세요');return;}
    if(command({type:'move',mark,slot:selected.slot,expect:p,piece:{...p,cell}})){
      setMode('edit');message('내 가구를 옮겼습니다');
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
  if(command(place(mark,slot,tool,cell,rot)))message(label(tool)+'을 놓았습니다 · 이어 놓거나 완료하세요');
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
    renderBar();$('loading').hidden=true;
    window.__shelterPreview={get state(){return state;},get mode(){return mode;},get sheet(){return sheet;},view};
    window.__ready=true;
  }catch(error){$('loading').textContent='쉼터를 불러오지 못했습니다. 마을로 돌아가 다시 열어 주세요.';console.error(error);}
}
start();
