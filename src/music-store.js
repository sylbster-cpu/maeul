// 저장이 실패하거나 새 판/다른 탭의 자료가 있으면 기존 원문을 덮어쓰지 않는다.
import { MUSIC_KEY,MUSIC_VERSION,createMusicState,readMusic,apply } from './music-state.js';
export function createMusicLibrary(storage){
  let raw=null,state=createMusicState(),locked='';
  try{
    if(!storage)throw new Error('이 브라우저에서는 곡을 저장할 수 없습니다');
    raw=storage.getItem(MUSIC_KEY);
    if(raw!==null){
      const data=JSON.parse(raw);
      if(data?.version>MUSIC_VERSION)throw new Error('더 새 판에서 저장한 곡입니다. 원래 기록을 그대로 둡니다');
      state=readMusic(data);
    }
  }catch(error){locked=error instanceof SyntaxError?'곡 기록을 읽지 못했습니다. 원래 기록을 그대로 둡니다':error.message;}
  return {
    get state(){return readMusic(state);},
    get locked(){return locked;},
    commit(cmd){
      if(locked)throw new Error(locked);
      const next=apply(state,cmd);
      const encoded=JSON.stringify(next);
      try{
        if(storage.getItem(MUSIC_KEY)!==raw){
          locked='다른 화면에서 곡이 바뀌었습니다. 새로고침 뒤 저장해 주세요';throw new Error(locked);
        }
        storage.setItem(MUSIC_KEY,encoded);
        if(storage.getItem(MUSIC_KEY)!==encoded){
          locked='곡의 저장을 확인하지 못했습니다. 새로고침 뒤 확인해 주세요';throw new Error(locked);
        }
      }catch(error){throw new Error(locked||'곡을 저장하지 못했습니다. 녹음은 화면에 남아 있습니다');}
      state=next;raw=encoded;return readMusic(state);
    },
  };
}
