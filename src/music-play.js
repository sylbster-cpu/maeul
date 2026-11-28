// 실제 연주 화면. 공유 링크는 검증한 뒤 듣기만 하며 자동으로 보관하지 않는다.
import { NOTES,MAX_TIME,MAX_NOTES,MAX_SONGS,createRecorder,validTitle,musicLink,readMusicLink } from './music-state.js';
import { createMusicLibrary } from './music-store.js';
import { createKalimbaAudio } from './music-audio.js';
const $=id=>document.getElementById(id);
const storage=()=>{try{return window.localStorage;}catch{return null;}};
const library=createMusicLibrary(storage()),audio=createKalimbaAudio();
let view=null,recorder=null,draft=null,selected=null,selectedId=null,recordStart=0,recordTimer=0,playTicket=0,playing=false,friend=null;
const keyTimers=[],buttons=[];
let bubbleTimer=0;
const message=text=>{$('status').textContent=text;};
const focusBack=button=>{try{button?.focus({preventScroll:true});}catch{button?.focus();}};
function showNote(n){
  const b=buttons[n];if(!b)return;
  b.classList.add('active');clearTimeout(keyTimers[n]);keyTimers[n]=setTimeout(()=>b.classList.remove('active'),150);
  $('note-bubble').textContent='♪ '+NOTES[n].label;$('note-bubble').classList.add('show');
  clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>$('note-bubble').classList.remove('show'),330);view?.pulse(n);
}
function title(){return $('title').value.trim();}
function currentDraft(){
  if(!draft)return null;
  const name=title();
  if(!validTitle(name))throw new Error('곡 제목을 1~32자로 적어 주세요');
  return {...draft,title:name};
}
function update(){
  $('record').setAttribute('aria-pressed',String(!!recorder));
  $('record').textContent=recorder?'■ 녹음 끝':'● 녹음';
  $('play').disabled=!!recorder||(!playing&&!draft&&!selected);
  $('play').textContent=playing?'■ 정지':'▶ 재생';
  $('library').disabled=!!recorder;
  $('draft').hidden=!draft||!!recorder;
  $('save').disabled=!!library.locked;
  $('draft-warning').hidden=!library.locked;
  $('draft-warning').textContent=library.locked?'곡을 저장할 수 없습니다. 이 화면을 닫거나 새로고침하기 전에 제목을 붙이고 공유 주소를 복사해 따로 보관하세요. 공유 주소로 곡을 다시 들을 수 있습니다.':'';
  $('stage-tag').textContent=recorder?'녹음 중':playing?'감상 중':'자유 연주';
}
function stopPlayback(){
  playTicket++;playing=false;audio.stop();update();
}
async function playSong(song){
  if(!song||recorder)return;
  stopPlayback();const ticket=playTicket;playing=true;update();message(song.title+' · 재생 중');
  const ok=await audio.play(song.notes,{onNote:showNote,onEnd:()=>{
    if(ticket!==playTicket)return;playing=false;update();message(song.title+' · 재생을 마쳤습니다');
  }});
  if(ticket===playTicket&&!ok){playing=false;update();message('소리를 시작할 수 없습니다. 소리를 켜고 다시 눌러 주세요');}
}
function finishRecord(){
  if(!recorder)return;
  clearInterval(recordTimer);const notes=recorder.finish();recorder=null;
  if(notes.length){
    const n=Object.keys(library.state.songs).length+1;
    draft={title:'작은 곡 '+n,notes,createdAt:Date.now()};
    $('title').value=draft.title;$('record-time').textContent=' · '+notes.length+'음';
    message('녹음을 마쳤습니다. 재생하거나 제목을 붙여 저장하세요.');
  }else message('아직 연주한 음이 없습니다. 다시 녹음해 보세요.');
  update();
}
function beginRecord(){
  if(recorder){finishRecord();return;}
  if(draft&&!window.confirm('저장하지 않은 녹음을 대신해 새 곡을 녹음할까요?'))return;
  stopPlayback();draft=null;recordStart=performance.now();recorder=createRecorder(recordStart);
  recordTimer=setInterval(()=>{
    if(!recorder)return;
    const elapsed=performance.now()-recordStart;
    if(elapsed>=MAX_TIME){finishRecord();return;}
    message('녹음 중 · '+recorder.count+'/'+MAX_NOTES+'음 · '+Math.ceil((MAX_TIME-elapsed)/1000)+'초');
  },180);
  message('녹음 중 · 건반을 자유롭게 눌러 보세요');update();
}
function sound(n){
  audio.note(n).then(ok=>{if(!ok&&!document.hidden&&!recorder&&audio.state!=='running')message('소리를 시작하지 못했습니다. 다시 눌러 주세요');});
}
function tap(n,{audible=true}={}){
  if(playing)stopPlayback();
  showNote(n);
  if(audible)sound(n);
  if(recorder){
    if(!recorder.add(n,performance.now())||recorder.full)finishRecord();
  }
}
for(const [n,note] of NOTES.entries()){
  const b=document.createElement('button');b.type='button';b.id='note-'+n;b.className='key'+(n>=4?' high':'');
  const tine=document.createElement('span');tine.className='tine';tine.setAttribute('aria-hidden','true');tine.style.height=(25-n*1.5)+'px';
  const label=document.createElement('span');label.className='label';label.textContent=note.label;
  b.append(tine,label);b.setAttribute('aria-label',note.label);buttons.push(b);$('keys').append(b);
  const waiting=new Set();
  b.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();
    // 첫 손가락 입력은 pointerup이 브라우저의 실제 활성화 시점일 수 있다.
    // 누르는 즉시 건반과 녹음은 반응하고, 아직 잠긴 소리만 손을 뗄 때 시작한다.
    const locked=audio.state!=='running'&&event.pointerType!=='mouse';
    if(locked)waiting.add(event.pointerId);
    tap(n,{audible:!locked});
  });
  b.addEventListener('pointerup',event=>{if(waiting.delete(event.pointerId))sound(n);});
  b.addEventListener('pointercancel',event=>waiting.delete(event.pointerId));
  // 키보드·접근성 도구의 실제 클릭만 받는다. 손가락 클릭을 두 번 울리지 않는다.
  b.addEventListener('click',event=>{if(event.detail===0&&event.pointerType!=='touch'&&event.pointerType!=='pen')tap(n);});
}
$('record').addEventListener('click',beginRecord);
$('play').addEventListener('click',()=>{
  if(playing){stopPlayback();message('재생을 멈췄습니다');return;}
  // 재생은 제목을 정하기 전에도 가능하다. 제목 검증은 저장과 공유에서만 한다.
  const name=title();
  playSong(draft?{...draft,title:validTitle(name)?name:draft.title}:selected);
});
$('mute').addEventListener('click',()=>{
  audio.setMuted(!audio.muted);$('mute').textContent=audio.muted?'소리 꺼짐':'소리 켜짐';
  $('mute').setAttribute('aria-pressed',String(audio.muted));
});
function makeId(){
  const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
}
function share(song,returnTo){
  try{
    const url=musicLink(song);$('share-url').value=url;$('share-status').textContent='';
    $('library-layer').hidden=true;$('share-layer').hidden=false;
    shareReturn=returnTo;focusBack($('share-url'));$('share-url').select();
  }catch(error){message(error.message);}
}
let shareReturn=null;
$('copy-share').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('share-url').value);$('share-status').textContent='주소를 복사했습니다';}
  catch{focusBack($('share-url'));$('share-url').select();$('share-status').textContent='선택된 주소를 길게 눌러 복사해 주세요';}
});
$('close-share').addEventListener('click',()=>{
  $('share-layer').hidden=true;
  if(shareReturn==='library')openLibrary();else focusBack($('share-draft'));
});
$('save').addEventListener('click',()=>{
  try{
    const song=currentDraft();let id=makeId();while(library.state.songs[id])id=makeId();
    library.commit({type:'setSong',id,song});selected=song;selectedId=id;draft=null;
    message('「'+song.title+'」을 이 브라우저에 저장했습니다');update();
  }catch(error){message(error.message);update();}
});
$('share-draft').addEventListener('click',()=>{try{share(currentDraft(),'draft');}catch(error){message(error.message);}});
$('discard').addEventListener('click',()=>{
  if(!draft||!window.confirm('저장하지 않은 녹음을 지울까요?'))return;
  stopPlayback();draft=null;message('녹음을 지웠습니다');update();
});
const button=(label,fn,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;b.addEventListener('click',fn);return b;};
function openLibrary(){
  $('library-layer').hidden=false;$('songs').replaceChildren();
  const entries=Object.entries(library.state.songs).sort((a,b)=>b[1].createdAt-a[1].createdAt||a[0].localeCompare(b[0]));
  $('library-status').textContent=library.locked|| (entries.length?entries.length+'/'+MAX_SONGS+'곡 · 이 브라우저에 보관':'아직 저장한 곡이 없습니다');
  for(const [id,song] of entries){
    const row=document.createElement('div');row.className='song';row.dataset.id=id;
    const input=document.createElement('input');input.value=song.title;input.maxLength=32;input.setAttribute('aria-label','곡 제목');
    const bar=document.createElement('div');bar.className='bar';
    bar.append(button('듣기',()=>{selected=song;selectedId=id;$('library-layer').hidden=true;playSong(song);}),
      button('이름 저장',()=>{
        try{const name=input.value.trim();if(!validTitle(name))throw new Error('곡 제목을 1~32자로 적어 주세요');
          const renamed={...song,title:name};library.commit({type:'setSong',id,song:renamed});if(selectedId===id)selected=renamed;openLibrary();}
        catch(error){$('library-status').textContent=error.message;}
      },!!library.locked),
      button('공유',()=>share(song,'library')),
      button('삭제',()=>{
        if(!window.confirm('「'+song.title+'」을 보관함에서 지울까요?'))return;
        try{library.commit({type:'setSong',id,song:null});if(selectedId===id){stopPlayback();selected=null;selectedId=null;update();}openLibrary();}
        catch(error){$('library-status').textContent=error.message;}
      },!!library.locked));
    row.append(input,bar);$('songs').append(row);
  }
  focusBack($('close-library'));
}
$('library').addEventListener('click',openLibrary);
$('close-library').addEventListener('click',()=>{$('library-layer').hidden=true;focusBack($('library'));});
$('close-listen').addEventListener('click',()=>{$('listen-layer').hidden=true;focusBack(buttons[0]);});
$('listen').addEventListener('click',()=>{$('listen-layer').hidden=true;selected=friend;selectedId=null;playSong(friend);});
$('back').addEventListener('click',event=>{
  if((draft||recorder)&&!window.confirm('저장하지 않은 연주가 있습니다. 마을로 돌아갈까요?')){event.preventDefault();return;}
  stopPlayback();
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(recorder)finishRecord();stopPlayback();}
});
window.addEventListener('pagehide',()=>{audio.stop();clearInterval(recordTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('hashchange',()=>location.reload());
try{
  friend=readMusicLink(location.hash);
  if(friend){selected=friend;selectedId=null;$('friend-title').textContent='「'+friend.title+'」 · '+friend.notes.length+'음';$('listen-layer').hidden=false;}
}catch(error){message(error.message);}
if(library.locked&&!location.hash)message(library.locked+' · 자유 연주는 계속 할 수 있습니다.');
update();
// WebGL이나 CDN에 문제가 있어도 실제 악기 연주는 사용할 수 있다.
import('./music-view.js').then(({createMusicView})=>{
  $('music-canvas').hidden=false;
  try{view=createMusicView($('music-canvas'));$('fallback').hidden=true;}
  catch{ $('music-canvas').hidden=true; }
}).catch(()=>{});
window.__music={get state(){return library.state;},get draft(){return draft?{...draft,notes:draft.notes.map(n=>n.slice())}:null;},
  get recording(){return !!recorder;},get playing(){return playing;},get hasScene(){return !!view;},audio};
window.__ready=true;
