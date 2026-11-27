// 별도 주소에서 쉼터를 시작한다. 링크를 열었다는 이유만으로 회원 자리를 차지하지 않는다.
import { mountShelter } from './shelter-play.js';
import { startPreview } from './shelter-preview.js';
import { getShelterService } from './shelter-online.js';
import { createShelterMemory, shelterRoomId, shelterLink } from './shelter-memory.js';
import { memberMark, MARK_LABELS } from './shelter-state.js';
import { withOnlineTimeout } from './online-data.js';
const $=id=>document.getElementById(id);
const controls=['create-room','resume-room','join-room','retry-room'];
let service,memory,busy=false,pending=null;
const status=text=>{$('lobby-status').textContent=text;};
function buttons(...ids){ for(const id of controls){$(id).hidden=!ids.includes(id);$(id).disabled=busy;} }
function errorText(error){
  if(error?.code==='permission-denied')return '쉼터를 열 권한이 없습니다. 서버 보안 규칙이 아직 적용되지 않았거나 주소가 맞지 않을 수 있습니다.';
  if(error?.code==='unavailable'||error?.code==='auth/network-request-failed')return '인터넷 연결을 확인하고 다시 시도해 주세요.';
  return error?.message||'쉼터 연결을 확인하지 못했습니다.';
}
function browserStorage(){try{return window.localStorage;}catch{return null;}}
function invite(id){
  const url=$('invite-url');url.value=shelterLink(id);
  $('invite-status').textContent='';$('invite-layer').hidden=false;url.focus();url.select();
}
$('copy-invite').addEventListener('click',async()=>{
  const url=$('invite-url');
  try{await navigator.clipboard.writeText(url.value);$('invite-status').textContent='주소를 복사했습니다';}
  catch{url.focus();url.select();$('invite-status').textContent='선택된 주소를 길게 눌러 복사해 주세요';}
});
$('close-invite').addEventListener('click',()=>{$('invite-layer').hidden=true;$('invite')?.focus();});
window.addEventListener('hashchange',()=>location.reload());
function address(id){history.replaceState(null,'',location.pathname+location.search+'#room='+id);}
async function enter(id,state){
  if(!memberMark(state,service.uid))throw new Error('쉼터에 먼저 참여해 주세요');
  const previous=memory.seen(id);
  address(id);
  const kept=memory.complete(id);
  $('loading').textContent='쉼터 풍경을 불러오는 중입니다';$('loading').hidden=false;
  const game=await mountShelter({uid:service.uid,initial:state,previous,service,id,memory,invite:()=>invite(id)});
  if(!kept)$('message').textContent='이 브라우저에 주소를 기억하지 못했습니다. 초대 주소를 따로 보관해 주세요.';
  return game;
}
async function run(action){
  if(busy)return;
  busy=true;for(const id of controls)$(id).disabled=true;
  // 쓰기를 임의로 타임아웃 처리하지 않는다. 늦게 성공하는 요청을 두 번 만들지 않게 한다.
  const slow=setTimeout(()=>status('서버 응답을 기다리고 있습니다. 이미 한 요청을 다시 보내지 않습니다.'),8000);
  try{await action();}
  catch(error){
    $('loading').hidden=true;$('lobby').hidden=false;status(errorText(error));
    if(pending){$('create-room').textContent='쉼터 만들기 이어서';buttons('create-room','retry-room');}
    else buttons('retry-room');
  }finally{clearTimeout(slow);busy=false;for(const id of controls)$(id).disabled=false;}
}
async function readRoom(id){
  status('쉼터를 확인하는 중입니다');
  const state=await withOnlineTimeout(service.get(id),20000);
  if(memberMark(state,service.uid))return enter(id,state);
  const count=Object.keys(state.members).length;
  if(count>=4){status('이 쉼터에는 네 사람이 모두 참여하고 있습니다.');buttons('retry-room');return;}
  status('현재 '+count+'명이 함께합니다. 참여하면 내 표식을 받습니다.');
  buttons('join-room','retry-room');
  $('join-room').onclick=()=>run(async()=>{
    status('쉼터에 참여하는 중입니다');
    await enter(id,await service.join(id));
  });
}
async function connect(){
  $('loading').hidden=true;$('lobby').hidden=false;buttons();status('온라인 연결을 확인하는 중입니다');
  service=await getShelterService();memory=createShelterMemory(browserStorage(),service.uid);
  pending=memory.pending();
  const requested=shelterRoomId(location.hash);
  if(requested){
    if(pending===requested){
      $('create-room').textContent='쉼터 만들기 이어서';status('이 브라우저에서 만들던 쉼터입니다. 같은 주소로 이어서 만듭니다.');
      buttons('create-room','retry-room');
    }else{pending=null;await readRoom(requested);}
    return;
  }
  const recent=memory.recent();
  $('create-room').textContent=pending?'쉼터 만들기 이어서':'새 쉼터 만들기';
  status(pending?'만들던 쉼터가 있습니다. 이어서 확인할 수 있습니다.':'새 쉼터를 만들거나 지난 쉼터로 돌아갈 수 있습니다.');
  buttons('create-room',...(recent?['resume-room']:[]));
  $('resume-room').onclick=()=>run(async()=>{pending=null;await readRoom(recent);});
}
$('create-room').addEventListener('click',()=>run(async()=>{
  if(!service||!memory)throw new Error('온라인 연결을 먼저 확인해 주세요');
  pending=pending||service.newId();
  memory.reserve(pending);address(pending);
  status('새 쉼터를 만드는 중입니다');
  const created=await service.create(pending);
  pending=null;
  await enter(created.id,created.state);
}));
$('retry-room').addEventListener('click',()=>run(connect));
async function start(){
  if(new URLSearchParams(location.search).get('preview')==='1'){
    await startPreview();return;
  }
  window.__ready=true;
  await run(connect);
}
start().catch(error=>{console.error(error);$('loading').textContent='쉼터를 열지 못했습니다';});
