import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicState,readMusic,validate,apply,inverseOf,createRecorder,validNotes,validTitle,musicLink,readMusicLink,MUSIC_KEY,MAX_NOTES } from '../src/music-state.js';
import { createMusicLibrary } from '../src/music-store.js';
const ID='abcdef0123456789',SECOND='0123456789abcdef';
const song={title:'숲의 작은 곡',notes:[[0,0],[155,2],[490,4]],createdAt:1};
const cmd={type:'setSong',id:ID,song};
function storage(initial={}){
  const map=new Map(Object.entries(initial));
  return {map,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v)};
}
test('곡 추가, 이름 바꾸기, 삭제의 역명령과 입력 원본 보존',()=>{
  let s=createMusicState();
  for(const c of [cmd,{...cmd,song:{...song,title:'새 이름'}},{...cmd,song:null}]){
    const prior=readMusic(s),undo=inverseOf(s,c),next=apply(s,c);
    assert.deepEqual(s,prior);assert.deepEqual(apply(next,undo),prior);s=next;
  }
  assert.deepEqual(s,createMusicState());
});
test('시간·음·제목·곡 수 제한과 손상 데이터 거부',()=>{
  for(const n of [[],[[1,0]],[[0,8]],[[0,1],[5,0],[4,0]],[[0,0],[30000,1]],Array.from({length:65},()=>[0,0])])assert.equal(validNotes(n),false);
  assert.equal(validTitle(' '),false);assert.equal(validTitle('a\nb'),false);
  assert.equal(validate(createMusicState(),{...cmd,id:'bad'}).ok,false);
  assert.throws(()=>readMusic({version:2,songs:{}}));
  assert.throws(()=>readMusic({version:1,songs:{[ID]:{...song,notes:[[0,8]]}}}));
  let s=createMusicState();
  for(let i=0;i<24;i++)s=apply(s,{...cmd,id:i.toString(16).padStart(16,'0')});
  assert.equal(validate(s,{...cmd,id:SECOND}).ok,false);
});
test('녹음은 첫 음부터의 실제 박자를 유지하고 64음/30초에서 멈춘다',()=>{
  const r=createRecorder(1000);assert.ok(r.add(1,1234));assert.ok(r.add(6,1500));assert.ok(r.add(4,1810));
  assert.equal(r.add(0,31000),false);assert.deepEqual(r.finish(),[[0,1],[266,6],[576,4]]);assert.equal(r.add(2,1900),false);
  const limit=createRecorder(0);for(let i=0;i<MAX_NOTES;i++)assert.ok(limit.add(i%8,i*10));
  assert.ok(limit.full);assert.equal(limit.add(1,999),false);assert.equal(limit.finish().length,64);
});
test('한국어 제목과 실제 박자 링크 왕복, 악성/잘못된 주소 거부',()=>{
  const link=musicLink(song);assert.ok(link.startsWith('https://sylbster-cpu.github.io/maeul/music.html#melody='));
  assert.deepEqual(readMusicLink(new URL(link).hash),{title:song.title,notes:song.notes});
  for(const hash of ['#home=abc','#melody=???','#melody='+ 'A'.repeat(5000),'#melody='+btoa(JSON.stringify({v:2,title:'bad',notes:[[0,0]]}))])assert.throws(()=>readMusicLink(hash));
  assert.equal(readMusicLink(''),null);
});
test('저장은 음악 키만 쓰고 새로고침 뒤 같은 곡을 읽는다',()=>{
  const s=storage({'house-lab-web:save':'house','house-lab-web:fishing':'fish','maeul:gathering':'gather'});
  const lib=createMusicLibrary(s);lib.commit(cmd);assert.deepEqual(createMusicLibrary(s).state.songs[ID],song);
  assert.equal(s.map.get('house-lab-web:save'),'house');assert.equal(s.map.get('house-lab-web:fishing'),'fish');assert.equal(s.map.get('maeul:gathering'),'gather');
});
test('새 판·손상 원문·다른 탭 변경·저장 공간 오류 보호',()=>{
  for(const raw of ['{broken',JSON.stringify({version:2,songs:{}})]){
    const s=storage({[MUSIC_KEY]:raw}),lib=createMusicLibrary(s);
    assert.ok(lib.locked);assert.throws(()=>lib.commit(cmd));assert.equal(s.map.get(MUSIC_KEY),raw);
  }
  const s=storage(),a=createMusicLibrary(s),b=createMusicLibrary(s);a.commit(cmd);
  assert.throws(()=>b.commit({...cmd,id:SECOND}),/다른 화면/);assert.deepEqual(createMusicLibrary(s).state.songs,{[ID]:song});
  const fail=createMusicLibrary({getItem:()=>null,setItem:()=>{throw new Error('full');}});
  assert.throws(()=>fail.commit(cmd),/저장하지 못했습니다/);assert.deepEqual(fail.state,createMusicState());
});
