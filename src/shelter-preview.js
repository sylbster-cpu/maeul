import { createShelter, apply } from './shelter-state.js';
import { mountShelter } from './shelter-play.js';
export async function startPreview(){
  const uid='previewOwner01',friend='previewFriend01';
  const place=(slot,kind,cell)=>({type:'place',mark:'wind',slot,piece:{kind,cell,rot:0}});
  let state=apply(createShelter(uid),friend,{type:'join',mark:'wind'});
  state=apply(state,friend,place('0','stool','2_5'));
  state=apply(state,friend,place('1','lamp','5_5'));
  const previous=state;
  state=apply(state,friend,place('2','plant','5_6'));
  return mountShelter({uid,initial:state,previous});
}
