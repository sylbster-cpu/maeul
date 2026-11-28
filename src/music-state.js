// 연주와 보관함의 순수 규칙. 집·낚시·채집·three.js와 관계없다.
export const MUSIC_VERSION=1;
export const MUSIC_KEY='maeul:music';
export const NOTES=Object.freeze([
  {label:'도',midi:60},{label:'레',midi:62},{label:'미',midi:64},{label:'솔',midi:67},
  {label:'라',midi:69},{label:'높은 도',midi:72},{label:'높은 레',midi:74},{label:'높은 미',midi:76},
].map(Object.freeze));
export const MAX_TIME=30000,MAX_NOTES=64,MAX_SONGS=24;
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));
const bad=reason=>({ok:false,reason});
const good=()=>({ok:true});
export const validId=id=>typeof id==='string'&&/^[a-f0-9]{16}$/.test(id);
export const validNote=n=>Number.isInteger(n)&&n>=0&&n<NOTES.length;
export function validTitle(title){
  return typeof title==='string'&&title===title.trim()&&[...title].length>=1&&[...title].length<=32&&!/[\u0000-\u001f\u007f-\u009f]/.test(title);
}
export function validNotes(notes){
  if(!Array.isArray(notes)||notes.length<1||notes.length>MAX_NOTES)return false;
  let last=0;
  for(let i=0;i<notes.length;i++){
    const e=notes[i];
    if(!Array.isArray(e)||e.length!==2||!Number.isInteger(e[0])||e[0]<last||e[0]>=MAX_TIME||
      !validNote(e[1])||(i===0&&e[0]!==0))return false;
    last=e[0];
  }
  return true;
}
export function validSong(song){
  return exact(song,['title','notes','createdAt'])&&validTitle(song.title)&&validNotes(song.notes)&&
    Number.isSafeInteger(song.createdAt)&&song.createdAt>=0;
}
const copySong=s=>({title:s.title,notes:s.notes.map(e=>e.slice()),createdAt:s.createdAt});
export function createMusicState(){return {version:MUSIC_VERSION,songs:{}};}
export function readMusic(data){
  if(!exact(data,['version','songs'])||data.version!==MUSIC_VERSION||!plain(data.songs)||
    Object.keys(data.songs).length>MAX_SONGS||
    !Object.entries(data.songs).every(([id,s])=>validId(id)&&validSong(s)))throw new Error('연주 기록의 형식이 올바르지 않습니다');
  return {version:MUSIC_VERSION,songs:Object.fromEntries(Object.entries(data.songs).map(([id,s])=>[id,copySong(s)]))};
}
// 한 명령은 한 곡만 추가·교체·제거한다. 다른 곡은 건드리지 않는다.
export function validate(state,cmd){
  if(!cmd||cmd.type!=='setSong'||!validId(cmd.id))return bad('곡을 고를 수 없습니다');
  if(cmd.song===null)return own(state.songs,cmd.id)?good():bad('이미 없는 곡입니다');
  if(!validSong(cmd.song))return bad('곡의 제목이나 음이 올바르지 않습니다');
  if(!own(state.songs,cmd.id)&&Object.keys(state.songs).length>=MAX_SONGS)return bad('곡은 24개까지 보관할 수 있습니다');
  return good();
}
export function apply(state,cmd){
  const check=validate(state,cmd);if(!check.ok)throw new Error(check.reason);
  const songs={...state.songs};
  if(cmd.song===null)delete songs[cmd.id];else songs[cmd.id]=copySong(cmd.song);
  return {version:MUSIC_VERSION,songs};
}
export function inverseOf(state,cmd){
  const check=validate(state,cmd);if(!check.ok)throw new Error(check.reason);
  const previous=state.songs[cmd.id];
  return {type:'setSong',id:cmd.id,song:previous?copySong(previous):null};
}
export function createRecorder(start){
  if(!Number.isFinite(start))throw new Error('녹음 시각 오류');
  let first=null,last=start,notes=[],finished=false;
  return {
    get count(){return notes.length;},
    get full(){return notes.length>=MAX_NOTES;},
    add(note,now){
      if(finished||!validNote(note)||!Number.isFinite(now)||now<last||now-start>=MAX_TIME||notes.length>=MAX_NOTES)return false;
      if(first===null)first=now;
      notes.push([Math.min(MAX_TIME-1,Math.round(now-first)),note]);last=now;return true;
    },
    finish(){finished=true;return notes.map(n=>n.slice());},
  };
}
const ROOT='https://sylbster-cpu.github.io/maeul/music.html';
const PREFIX='#melody=';
export function musicLink(song){
  if(!validTitle(song.title)||!validNotes(song.notes))throw new Error('공유할 곡이 올바르지 않습니다');
  const bytes=new TextEncoder().encode(JSON.stringify({v:MUSIC_VERSION,title:song.title,notes:song.notes}));
  const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return ROOT+PREFIX+token;
}
export function readMusicLink(hash){
  if(!hash)return null;
  if(typeof hash!=='string'||!hash.startsWith(PREFIX)||hash.length>4096)throw new Error('연주 초대 주소가 올바르지 않습니다');
  try{
    const token=hash.slice(PREFIX.length);
    if(!/^[A-Za-z0-9_-]+$/.test(token))throw new Error('주소');
    const bytes=Uint8Array.from(atob(token.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!exact(data,['v','title','notes'])||data.v!==MUSIC_VERSION||!validTitle(data.title)||!validNotes(data.notes))throw new Error('곡');
    return {title:data.title,notes:data.notes.map(e=>e.slice())};
  }catch{throw new Error('연주 초대 주소를 읽을 수 없습니다');}
}
